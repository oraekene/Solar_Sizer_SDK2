// The Jiji adapter. The category pages load their list with JavaScript, but
// the site has a plain JSON feed for the same list and the product pages are
// rendered on the server. Both are read with plain fetch.
//
// The feed path is /api_web/v1/listing?slug=<category slug>&page=<n>. The
// robots file allows every path except /test, /admin, /crm and the facebook
// auth path.

import { fetchText } from '../http.ts';
import { identitySpecsMissing, parseTitleSpecs, productTypeFromTitle } from '../specs.ts';
import type { DiscoveredListing, InStock, PageResult, ScraperOffer, SourceAdapter, TrustTier } from './types.ts';

const SITE = 'https://jiji.ng';
const SOURCE = 'jiji';

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
  let out = value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '');
  for (const [entity, character] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(character);
  }
  return out.replace(/\s+/g, ' ').trim();
};

// The feed gives the list for one category page.
export function listingFeedUrl(categoryUrl: string, page = 1): string {
  const slug = categoryUrl.split('/').filter(Boolean).pop()?.split('?')[0] ?? '';
  return `${SITE}/api_web/v1/listing?slug=${encodeURIComponent(slug)}&init_page=true&page=${page}&webp=false`;
}

type FeedAdvert = {
  id: number;
  guid: string;
  title: string;
  url: string;
  user_id: number;
  price_obj?: { value?: number; view?: string };
  attrs?: Array<{ name: string; value: string }>;
  labels?: Array<{ type: string; value: string }>;
  is_boost?: string;
  region_name?: string;
};

export type FeedResult = { adverts: FeedAdvert[]; total: number };

export function parseFeed(json: unknown): FeedResult {
  const root = json as { adverts_list?: { adverts?: FeedAdvert[]; count?: number } };
  const list = root.adverts_list?.adverts ?? [];
  return { adverts: list, total: root.adverts_list?.count ?? list.length };
}

// The condition sits in the attributes of the advert.
export function conditionFromAttrs(attrs: FeedAdvert['attrs']): string {
  const value = attrs?.find((attr) => (attr.name ?? '').toLowerCase() === 'condition')?.value ?? '';
  if (/foreign/i.test(value)) return 'foreign_used';
  if (/refurb/i.test(value)) return 'refurbished';
  if (/used/i.test(value)) return 'used';
  if (/new/i.test(value)) return 'new';
  return 'unknown';
}

export function parseCategoryFeed(json: unknown): DiscoveredListing[] {
  const { adverts } = parseFeed(json);
  const listings: DiscoveredListing[] = [];

  for (const advert of adverts) {
    if (!advert.title || !advert.url) continue;
    listings.push({
      source_site: SOURCE,
      source_listing_id: advert.guid || String(advert.id),
      source_url: `${SITE}${advert.url}`,
      title: advert.title,
      price: advert.price_obj?.value ?? null,
      currency: 'NGN',
      stock_text: null,
      spec_line: conditionFromAttrs(advert.attrs),
      pack_count: null,
      has_datasheet: false,
    });
  }

  return listings;
}

// The product page carries the price, the condition, the stock and the seller.
export type ProductFacts = {
  title: string | null;
  price: number | null;
  condition: string;
  in_stock: InStock;
  seller_id: string;
  seller_name: string;
  seller_badges: string[];
  negotiable: boolean;
  attributes: Record<string, string>;
};

// The attribute tiles name the brand, the capacity and the condition.
function parseAttributes(html: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of html.matchAll(
    /<div class="b-advert-attribute__value"[^>]*>([\s\S]*?)<\/div><div class="b-advert-attribute__key">([^<]+)<\/div>/g,
  )) {
    const value = decode(match[1]);
    const key = decode(match[2]);
    if (key && value) attributes[key] = value;
  }
  return attributes;
}

export function parseProductPage(html: string): ProductFacts | null {
  const title = decode(html.match(/class="b-advert-title-inner[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '');
  const priceText = html.match(/itemprop="price" content="([\d.]+)"/)?.[1];
  const availability = html.match(/itemprop="availability" href="([^"]+)"/)?.[1] ?? '';
  const conditionText = decode(
    html.match(/itemprop="itemCondition"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '',
  );
  const sellerName = decode(html.match(/class="b-seller-block__name">([\s\S]*?)<\/div>/)?.[1] ?? '');
  const shopPath = html.match(/href="(\/shop\/[^"]+)"/)?.[1] ?? '';

  // The badges sit in the block that follows the seller name.
  const labelsIndex = html.indexOf('class="b-seller-block__labels"');
  const badgeWindow = labelsIndex >= 0 ? html.slice(labelsIndex, labelsIndex + 1500) : '';
  const sellerBadges = [...badgeWindow.matchAll(/class="b-seller-badge[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((match) => decode(match[1]))
    .filter(Boolean);

  if (!title && !priceText) return null;

  const attributes = parseAttributes(html);

  let condition = 'unknown';
  const conditionSource = conditionText || attributes.Condition || '';
  if (/foreign/i.test(conditionSource)) condition = 'foreign_used';
  else if (/refurb/i.test(conditionSource)) condition = 'refurbished';
  else if (/used/i.test(conditionSource)) condition = 'used';
  else if (/new/i.test(conditionSource)) condition = 'new';

  const inStock: InStock = /instock/i.test(availability)
    ? 'true'
    : /outofstock|soldout/i.test(availability)
      ? 'false'
      : 'unknown';

  const sellerKey = shopPath.replace('/shop/', '') || sellerName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'unknown';

  return {
    title: title || null,
    price: priceText ? Number(priceText) : null,
    condition,
    in_stock: inStock,
    seller_id: `jiji:seller:${sellerKey}`,
    seller_name: sellerName || 'Unknown seller',
    seller_badges: sellerBadges,
    negotiable: /qa-advert-price-view-type[^>]*>\s*Negotiable/i.test(html),
    attributes,
  };
}

// Jiji gives no seller rating. The platform badge and the years on the
// platform stand in for the rating rule.
export function trustTier(facts: ProductFacts): TrustTier {
  const badges = facts.seller_badges.join(' ').toLowerCase();
  if (badges.includes('verified')) return 'verified';
  const years = badges.match(/(\d+)\+\s*years/);
  if (years && Number(years[1]) >= 2) return 'established';
  return 'unknown';
}

export function buildOffer(
  facts: ProductFacts,
  sourceUrl: string,
  sourceListingId: string,
  now = new Date().toISOString(),
): ScraperOffer {
  const title = facts.title ?? '';
  const specs = parseTitleSpecs(title);
  const attributes = facts.attributes;

  // The page states the brand and the capacity, so they win over the title.
  if (attributes.Brand) specs.brand = attributes.Brand;
  const statedAh = attributes['Battery Capacity']?.match(/([\d]+(?:\.\d+)?)\s*ah/i);
  if (statedAh) specs.capacity_ah = Number(statedAh[1]);
  const statedKwh = attributes['Total Battery Energy']?.match(/([\d]+(?:\.\d+)?)\s*kwh/i);
  if (statedKwh) specs.capacity_kwh = Number(statedKwh[1]);

  const productType = productTypeFromTitle(title);
  const missing = productType ? identitySpecsMissing(productType, specs) : ['watts'];
  const price = facts.price;

  // A buyer advert is not a product listing.
  const isBuyerAdvert = /\b(?:buyer|buying|wanted|looking for)\b/i.test(title);
  const notHardware = productType === null || isBuyerAdvert;

  // A used listing is archived with its label and never quoted.
  const usedReason =
    facts.condition === 'used'
      ? 'used'
      : facts.condition === 'foreign_used'
        ? 'foreign_used'
        : facts.condition === 'refurbished'
          ? 'refurbished'
          : null;

  const status = notHardware
    ? 'excluded'
    : usedReason
      ? 'excluded'
      : price === null || missing.length > 0
        ? 'review_required'
        : 'qualified';
  const reason = notHardware
    ? 'not_solar_hardware'
    : usedReason
      ? usedReason
      : price === null
        ? 'call_for_price'
        : missing.length > 0
          ? 'missing_required_spec'
          : null;

  return {
    source_site: SOURCE,
    source_listing_id: sourceListingId,
    source_url: sourceUrl,
    seller_id: facts.seller_id,
    seller_name: facts.seller_name,
    price,
    currency: 'NGN',
    price_kind: 'cash',
    unit_basis: 'piece',
    unit_quantity: null,
    condition: facts.condition,
    in_stock: facts.in_stock,
    trust_tier: trustTier(facts),
    stated_specs: { ...specs, name: title },
    trading_signals: {
      spec_source: 'model_parse',
      product_type: productType,
      missing_specs: missing,
      seller_badges: facts.seller_badges,
      negotiable: facts.negotiable,
    },
    raw_payload: {
      title,
      seller_id: facts.seller_id,
      seller_badges: facts.seller_badges,
      attributes,
    },
    status,
    reason_code: reason,
    last_checked: now,
    scraped_at: now,
  };
}

export async function crawlCategory(url: string): Promise<PageResult<DiscoveredListing[]>> {
  const response = await fetchText(listingFeedUrl(url));
  if (response.status !== 200) {
    return { value: null, status: response.status, error: response.error ?? `status ${response.status}` };
  }
  try {
    return { value: parseCategoryFeed(JSON.parse(response.html)), status: response.status };
  } catch (error) {
    return { value: null, status: response.status, error: `the feed is not JSON. ${String(error)}` };
  }
}

export async function crawlProduct(url: string): Promise<PageResult<ScraperOffer>> {
  const response = await fetchText(url);
  if (response.status !== 200) {
    return { value: null, status: response.status, error: response.error ?? `status ${response.status}` };
  }
  const facts = parseProductPage(response.html);
  if (!facts) return { value: null, status: response.status, error: 'the page has no advert details' };

  const listingId = url.match(/-([A-Za-z0-9_-]{8,})\.html/)?.[1] ?? url;
  return { value: buildOffer(facts, url, listingId), status: response.status };
}

export const jiji: SourceAdapter = {
  site: SOURCE,
  crawlProduct,
  crawlCategory,
};
