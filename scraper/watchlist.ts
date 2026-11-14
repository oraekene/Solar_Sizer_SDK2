// The watchlist loader. The watchlist is the one place that names the sites,
// the paths and the brand spellings, so the runner holds no site list of its
// own.

import { readFile } from 'node:fs/promises';
import type { AliasTable } from './identity.ts';

export type Watchlist = {
  discovery_paths: Array<{ site: string; type: string; url: string; note?: string }>;
  phase_one_plus_paths?: Record<string, Array<{ type: string; url: string }>>;
  aliases: AliasTable;
  manual_rows: Array<Record<string, unknown>>;
};

const WATCHLIST_URL = new URL('../docs/scraper-watchlist.json', import.meta.url);

export async function loadWatchlist(): Promise<Watchlist> {
  const raw = await readFile(WATCHLIST_URL, 'utf8');
  return JSON.parse(raw) as Watchlist;
}
