// The Solar Shop Nigeria adapter. It is the phase-one specialist retailer.
// The site is a Next.js app that renders the product list and the product
// page on the server, so plain fetch is enough. No browser is used.

import { fetchText } from '../http.ts';
import { normalizeSpecs, parseSpecLine } from '../specs.ts';
import type { InStock, ScraperOffer, TrustTier } from './types.ts';

const SITE = 'https://solarshopnigeria.com';
const SOURCE = 'solarshopnigeria';
const SELLER_ID = 'solarshopnigeria:seller:the-solar-shop';
const SELLER_NAME = 'The Solar Shop Limited';

// The shop is the official distributor for these brands, so its offers count
// as verified. Every other brand it stocks counts as established.
const OFFICIAL_BRANDS = new Set([
  'jinko solar',
  'jinko',
  'victron energy',
  'victron',
  'phocos',
  'schneider',
  'schneider electric',
  'sma solar',
  'sma',
  'huawei',
]);

export type DiscoveredListing = {
  source_site: string;
  source_listing_id: string;
  source_url: string;
  title: string;
  price: number | null;
  currency: string;
  stock_text: string | null;
  spec_line: string | null;
  pack_count: number | null;
  has_datasheet: boolean;
};

const stripComments = (html: string) => html.replace(/<!--.*?-->/gs, ' ');

// The entity names are built from the ampersand so the source file stays
// readable.
const AMP = '&';
const ENTITIES: Record<string, string> = {
  [`${AMP}amp;`]: AMP,
  [`${AMP}lt;`]: '<',
  [`${AMP}gt;`]: '>',
  [`${AMP}quot;`]: '"',
  [`${AMP}#x27;`]: "'",
  [`${AMP}nbsp;`]: ' ',
};

const decode = (value: string) => {
  let out = value;
  for (const [entity, character] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(character);
  }
  return out.trim();
};

const amount = (value: string): number => Number(value.replace(/,/g, ''));

const firstAmount = (html: string): number | null => {
  const match = html.match(/₦\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);
  return match ? amount(match[1]) : null;
};

function stockState(text: string | null): InStock {
  if (!text) return 'unknown';
  if (/^in stock/i.test(text)) return 'true';
  if (/lead time applies|pre-?order|out of stock|sold out/i.test(text)) return 'false';
  return 'unknown';
}

function trustTier(brand: string | null): TrustTier {
  if (!brand) return 'unknown';
  return OFFICIAL_BRANDS.has(brand.trim().toLowerCase()) ? 'verified' : 'established';
}

// The category page lists one card per product. A card holds the price, the
// short specification line, the stock text and the product id.
export function parseCategoryPage(html: string): DiscoveredListing[] {
  const listings: DiscoveredListing[] = [];

  for (const chunk of html.split('<article').slice(1)) {
    const href = chunk.match(/href="(\/products\/[^"?#]+)"/);
    if (!href) continue;

    const slug = href[1].replace('/products/', '');
    const title = decode(chunk.match(/<img[^>]*alt="([^"]*)"/)?.[1] ?? '') ||
      decode(chunk.match(/href="\/products\/[^"]+">([^<]+)<\/a>/)?.[1] ?? '');
    if (!title) continue;

    const clean = stripComments(chunk);
    const productId = clean.match(/name="productId" value="([^"]+)"/)?.[1] ?? slug;
    const packCount = clean.match(/Bulk\s*·\s*([0-9]+)\s*pcs/)?.[1] ?? null;
    const specLine = decode(chunk.match(/<p class="line-clamp-1[^"]*">([^<]*)<\/p>/)?.[1] ?? '') || null;
    const stockText =
      decode(chunk.match(/<p class="text-xs text-ok">([^<]*)<\/p>/)?.[1] ?? '') ||
      (clean.includes('Lead time applies') ? 'Lead time applies' : null) ||
      (clean.includes('Pre-order') ? 'Pre-order' : null);

    listings.push({
      source_site: SOURCE,
      source_listing_id: productId,
      source_url: `${SITE}/products/${slug}`,
      title,
      price: firstAmount(clean),
      currency: 'NGN',
      stock_text: stockText,
      spec_line: specLine,
      pack_count: packCount ? Number(packCount) : null,
      has_datasheet: chunk.includes('title="Datasheet available"'),
    });
  }

  return listings;
}

export type ProductFacts = {
  slug: string;
  title: string;
  brand: string | null;
  sku: string | null;
  listing_id: string;
  price: number | null;
  pack_price: number | null;
  was_price: number | null;
  per_unit_price: number | null;
  pack_count: number | null;
  stock_text: string | null;
  datasheet_path: string | null;
  specs: Record<string, string>;
  summary_specs: Record<string, string>;
};

export function parseProductPage(html: string, url: string): ProductFacts | null {
  const clean = stripComments(html);
  // The plain copy carries the sentences that are broken up by tags.
  const plain = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const title = decode(html.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1] ?? '');
  if (!title) return null;

  const slug = url.split('/products/')[1]?.split(/[?#]/)[0] ?? '';
  const brand = decode(html.match(/href="\/products\?brand=[^"]+">([^<]+)<\/a>/)?.[1] ?? '') || null;
  const sku = plain.match(/SKU\s*([A-Z0-9][A-Z0-9-]+)/)?.[1] ?? null;
  const listingId = clean.match(/name="productId" value="([^"]+)"/)?.[1] ?? slug;

  const headline = firstAmount(clean);
  const wasPrice = clean.match(/<s[^>]*>₦\s*([0-9][0-9,]*(?:\.[0-9]+)?)<\/s>/)?.[1];
  const perUnit = plain.match(/Works out to\s*₦\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*per unit/i)?.[1];
  const packCount =
    plain.match(/Bulk pack:\s*([0-9]+)\s*units in one purchase/)?.[1] ??
    title.match(/(\d+)\s*(?:Pieces|Units)/i)?.[1] ??
    null;

  const stockText =
    decode(html.match(/<p class="text-sm text-ok">([^<]*)<\/p>/)?.[1] ?? '') ||
    (clean.includes('Lead time applies') ? 'Lead time applies' : null) ||
    (clean.includes('Pre-order') ? 'Pre-order' : null);

  const datasheetPath = html.match(/<a href="(\/files\/[^"]+)"[^>]*>Download the manufacturer PDF<\/a>/)?.[1] ?? null;

  const specs: Record<string, string> = {};
  for (const pair of clean.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)) {
    specs[decode(pair[1])] = decode(pair[2]);
  }

  const summarySpecs: Record<string, string> = {};
  for (const pair of clean.matchAll(/<span[^>]*>([^<]*):<\/span><span[^>]*>([^<]*)<\/span>/g)) {
    const label = decode(pair[1]);
    if (!label || label.length > 80) continue;
    summarySpecs[label] = decode(pair[2]);
  }

  return {
    slug,
    title,
    brand,
    sku,
    listing_id: listingId,
    price: headline,
    pack_price: packCount ? headline : null,
    was_price: wasPrice ? amount(wasPrice) : null,
    per_unit_price: perUnit ? amount(perUnit) : null,
    pack_count: packCount ? Number(packCount) : null,
    stock_text: stockText,
    datasheet_path: datasheetPath,
    specs,
    summary_specs: summarySpecs,
  };
}

export function detectProductType(specs: Record<string, unknown>): 'panel' | 'battery' | null {
  if (typeof specs.watts === 'number' && typeof specs.voc === 'number') return 'panel';
  if (typeof specs.voltage_v === 'number' && (typeof specs.capacity_ah === 'number' || typeof specs.capacity_kwh === 'number')) {
    return 'battery';
  }
  return null;
}

// A panel needs watts, the open-circuit voltage and the short-circuit current.
// A battery needs the voltage, the amp-hour rating and the chemistry.
export function missingRequiredSpecs(productType: 'panel' | 'battery', specs: Record<string, unknown>): string[] {
  const needed = productType === 'panel' ? ['watts', 'voc', 'isc'] : ['voltage_v', 'capacity_ah', 'battery_type'];
  return needed.filter((field) => specs[field] === undefined || specs[field] === null);
}

export function buildOffer(facts: ProductFacts, now = new Date().toISOString()): ScraperOffer {
  const specs = {
    ...parseSpecLine(Object.values(facts.summary_specs).join(' · ')),
    ...normalizeSpecs(facts.specs),
  };
  const productType = detectProductType(specs);
  const missing = productType ? missingRequiredSpecs(productType, specs) : ['watts', 'voc', 'isc'];

  // A pack price is divided by the count the seller states. The site also
  // prints the per-unit figure, and that figure wins.
  const isPack = facts.pack_count !== null;
  const price = isPack
    ? facts.per_unit_price ?? (facts.price !== null ? facts.price / (facts.pack_count as number) : null)
    : facts.price;

  const status = price === null ? 'review_required' : missing.length > 0 ? 'review_required' : 'qualified';
  const reason = price === null ? 'call_for_price' : missing.length > 0 ? 'missing_required_spec' : null;

  return {
    source_site: SOURCE,
    source_listing_id: facts.listing_id,
    source_url: `${SITE}/products/${facts.slug}`,
    seller_id: SELLER_ID,
    seller_name: SELLER_NAME,
    price,
    currency: 'NGN',
    price_kind: 'cash',
    unit_basis: isPack ? 'derived' : 'piece',
    unit_quantity: facts.pack_count,
    condition: 'new',
    in_stock: stockState(facts.stock_text),
    trust_tier: trustTier(facts.brand),
    stated_specs: { ...specs, brand: facts.brand, model: facts.sku, name: facts.title },
    trading_signals: {
      stock_text: facts.stock_text,
      datasheet_path: facts.datasheet_path,
      was_price: facts.was_price,
      pack_price: facts.pack_price,
      product_type: productType,
      missing_specs: missing,
    },
    raw_payload: {
      title: facts.title,
      brand: facts.brand,
      sku: facts.sku,
      specs: facts.specs,
      summary_specs: facts.summary_specs,
    },
    status,
    reason_code: reason,
    last_checked: now,
    scraped_at: now,
  };
}

export async function crawlCategory(url: string): Promise<{ listings: DiscoveredListing[]; error?: string }> {
  const response = await fetchText(url);
  if (response.status !== 200) return { listings: [], error: response.error ?? `status ${response.status}` };
  return { listings: parseCategoryPage(response.html) };
}

export async function crawlProduct(url: string): Promise<{ offer: ScraperOffer | null; error?: string }> {
  const response = await fetchText(url);
  if (response.status !== 200) return { offer: null, error: response.error ?? `status ${response.status}` };
  const facts = parseProductPage(response.html, url);
  if (!facts) return { offer: null, error: 'the page has no product heading' };
  return { offer: buildOffer(facts) };
}
