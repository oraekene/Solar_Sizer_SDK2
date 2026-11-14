// The watchlist loader. The watchlist is the one place that names the sites,
// the paths and the brand spellings, so the runner holds no site list of its
// own.

import { readFile } from 'node:fs/promises';
import type { AliasTable } from './identity.ts';

export type DiscoveryPath = { site: string; type: string; url: string; note?: string };
export type BrandPath = { brand: string; path: string; priority?: boolean; reason?: string };
export type ExcludedPath = { path?: string; path_pattern?: string; rule?: string };

export type Watchlist = {
  discovery_paths: DiscoveryPath[];
  phase_one_plus_paths?: Record<string, Array<{ type: string; url: string }>>;
  brand_paths?: {
    jumia_panels?: BrandPath[];
    jumia_batteries?: BrandPath[];
    solarshopnigeria?: { path_template?: string; confirmed_slugs?: string[] };
  };
  excluded_paths?: Record<string, ExcludedPath[]>;
  source_budgets?: {
    sweep?: Record<string, number>;
    discovery?: Record<string, number>;
  };
  aliases: AliasTable;
  manual_rows: Array<Record<string, unknown>>;
};

const WATCHLIST_URL = new URL('../docs/scraper-watchlist.json', import.meta.url);

export async function loadWatchlist(): Promise<Watchlist> {
  const raw = await readFile(WATCHLIST_URL, 'utf8');
  return JSON.parse(raw) as Watchlist;
}

export function allDiscoveryPaths(watchlist: Watchlist): DiscoveryPath[] {
  const paths = [...watchlist.discovery_paths];
  const brands = watchlist.brand_paths ?? {};
  const jumiaPaths = [...(brands.jumia_panels ?? []), ...(brands.jumia_batteries ?? [])].sort(
    (left, right) => Number(right.priority ?? false) - Number(left.priority ?? false),
  );
  for (const brand of jumiaPaths) {
    paths.push({
      site: 'jumia',
      type: brands.jumia_panels?.includes(brand) ? 'panel' : 'battery',
      url: `https://www.jumia.com.ng${brand.path}`,
      note: `${brand.brand} brand path`,
    });
  }

  const template = brands.solarshopnigeria?.path_template;
  for (const slug of brands.solarshopnigeria?.confirmed_slugs ?? []) {
    if (!template) continue;
    paths.push({
      site: 'solarshopnigeria',
      type: 'all',
      url: `https://solarshopnigeria.com${template.replace('{slug}', encodeURIComponent(slug))}`,
      note: `${slug} brand path`,
    });
  }

  return paths.filter((path, index) => paths.findIndex((entry) => entry.url === path.url) === index);
}

function wildcardMatch(pattern: string, value: string): boolean {
  const parts = pattern.split('*');
  if (parts.length === 1) return pattern === value;

  let position = 0;
  if (!value.startsWith(parts[0])) return false;
  position += parts[0].length;

  for (let index = 1; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const found = value.indexOf(part, position);
    if (found < 0) return false;
    position = found + part.length;
  }

  const last = parts[parts.length - 1];
  if (pattern.endsWith('*')) return value.endsWith(last) && value.length - last.length >= position;
  return value.indexOf(last, position) >= 0;
}

export function isBlocked(watchlist: Watchlist, site: string, url: string): boolean {
  const rules = watchlist.excluded_paths?.[site] ?? [];
  const parsed = new URL(url);
  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  return rules.some((rule) => {
    if (rule.path && parsed.pathname === rule.path) return true;
    return Boolean(rule.path_pattern && wildcardMatch(rule.path_pattern, pathAndQuery));
  });
}
