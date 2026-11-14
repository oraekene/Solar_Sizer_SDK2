// The Jumia adapter. Jumia renders the category pages and the product pages on
// the server, and every product page carries a JSON-LD Product block with the
// price, the stock, the condition and the seller.

import { fetchText } from '../http.ts';
import { identitySpecsMissing, parseTitleSpecs, productTypeFromTitle } from '../specs.ts';
import type { DiscoveredListing, InStock, PageResult, ScraperOffer, SourceAdapter, TrustTier } from './types.ts';

const SITE = 'https://www.jumia.com.ng';
const SOURCE = 'jumia';

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
  return out.replace(/\s+/g, ' ').trim();
};

const numberFrom = (value: string) => Number(value.replace(/[^0-9.]/g, ''));

// The listing id is the number at the end of the product address. The slug
// before it can carry letters, so the trailing digits are the id.
export function listingIdFromUrl(url: string): string {
  const match = url.match(/(\d{6,})\.html(?:$|\?)/);
  return match ? match[1] : url;
}

// The category page holds one card per product. The card has the address, the
// name, the price and the review rating.
export function parseCategoryPage(html: string): DiscoveredListing[] {
  const listings: DiscoveredListing[] = [];
  const seen = new Set<string>();

  const cards = html.split('<article class="prd').slice(1);
  for (const card of cards) {
    const href =
      card.match(/<a href="(\/[^"]+)" class="core"/)?.[1] ??
      card.match(/<a href="(\/[^"]+-\d{6,}\.html)"/)?.[1];
    if (!href || seen.has(href)) continue;

    const name = decode(card.match(/<h3 class="name">([\s\S]*?)<\/h3>/)?.[1] ?? '');
    if (!name) continue;

    const priceText = decode(card.match(/<div class="prc[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '');
    const price = priceText ? numberFrom(priceText) : null;
    const rating = Number(card.match(/class="rv-avg">\s*([\d.]+)/)?.[1] ?? 0);
    const reviews = Number(card.match(/class="rv-cnt">\s*\((\d+)\)/)?.[1] ?? 0);

    seen.add(href);
    listings.push({
      source_site: SOURCE,
      source_listing_id: listingIdFromUrl(href),
      source_url: `${SITE}${href}`,
      title: name,
      price,
      currency: 'NGN',
      stock_text: null,
      spec_line: `${rating} from ${reviews} reviews`,
      pack_count: null,
      has_datasheet: false,
    });
  }

  return listings;
}

type JsonLdProduct = {
  name?: string;
  brand?: { name?: string } | string;
  sku?: string;
  url?: string;
  category?: string;
  offers?: {
    availability?: string;
    price?: string | number;
    priceCurrency?: string;
    itemCondition?: string;
    seller?: { name?: string; '@id'?: string; url?: string };
  };
  aggregateRating?: { ratingValue?: number; ratingCount?: number };
  additionalProperty?: Array<{ name?: string; value?: string }>;
};

export function parseJsonLd(html: string): JsonLdProduct | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const graph = (parsed as { '@graph'?: unknown[] })['@graph'] ?? [parsed];
    for (const node of graph) {
      const product = node as JsonLdProduct;
      if (product['@type'] === 'Product' || (product as { '@type'?: string })['@type'] === undefined) {
        if (product.offers || product.name) return product;
      }
    }
  }
  return null;
}

function conditionFrom(itemCondition: string | undefined): string {
  if (!itemCondition) return 'unknown';
  if (/new/i.test(itemCondition)) return 'new';
  if (/refurb/i.test(itemCondition)) return 'refurbished';
  if (/used/i.test(itemCondition)) return 'used';
  return 'unknown';
}

function stockFrom(availability: string | undefined): InStock {
  if (!availability) return 'unknown';
  if (/instock/i.test(availability)) return 'true';
  if (/outofstock|soldout|discontinued/i.test(availability)) return 'false';
  return 'unknown';
}

function brandName(brand: JsonLdProduct['brand']): string | null {
  if (!brand) return null;
  if (typeof brand === 'string') return brand.trim() || null;
  return brand.name?.trim() || null;
}

// Jumia gives the seller a score and a follower count. The review score of
// the product stands in for the seller rating, because Jumia shows no seller
// rating on the product page.
function trustTier(product: JsonLdProduct, sellerUrl: string | null): TrustTier {
  if (sellerUrl && /marketplace-vendor|mlp-/.test(sellerUrl)) return 'verified';
  const rating = product.aggregateRating?.ratingValue ?? 0;
  const reviews = product.aggregateRating?.ratingCount ?? 0;
  if (rating >= 4 && reviews >= 10) return 'established';
  return 'unknown';
}

export function buildOffer(product: JsonLdProduct, url: string, now = new Date().toISOString()): ScraperOffer {
  const offer = product.offers ?? {};
  const title = (product.name ?? '').trim();
  const brand = brandName(product.brand);
  const specs = parseTitleSpecs(title);
  const productType = productTypeFromTitle(title);
  const missing = productType ? identitySpecsMissing(productType, specs) : ['watts'];
  const price = offer.price === undefined ? null : Number(offer.price);
  const condition = conditionFrom(offer.itemCondition);
  const seller = offer.seller ?? {};
  const sellerKey = seller['@id'] ?? seller.url ?? seller.name ?? 'unknown';

  const notHardware = productType === null;

  // A used listing is archived with its label and never quoted.
  const usedReason =
    condition === 'used' ? 'used' : condition === 'foreign_used' ? 'foreign_used' : condition === 'refurbished' ? 'refurbished' : null;

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
    source_listing_id: listingIdFromUrl(url),
    source_url: url,
    seller_id: `jumia:seller:${sellerKey}`,
    seller_name: seller.name ?? 'Unknown seller',
    price,
    currency: offer.priceCurrency ?? 'NGN',
    price_kind: 'cash',
    unit_basis: 'piece',
    unit_quantity: null,
    condition,
    in_stock: stockFrom(offer.availability),
    trust_tier: trustTier(product, seller.url ?? null),
    stated_specs: { ...specs, brand, name: title, sku: product.sku, category: product.category },
    trading_signals: {
      spec_source: 'model_parse',
      product_type: productType,
      missing_specs: missing,
      rating: product.aggregateRating?.ratingValue ?? null,
      review_count: product.aggregateRating?.ratingCount ?? null,
    },
    raw_payload: {
      title,
      brand,
      sku: product.sku,
      seller_url: seller.url ?? null,
      additional_properties: product.additionalProperty ?? [],
    },
    status,
    reason_code: reason,
    last_checked: now,
    scraped_at: now,
  };
}

export async function crawlCategory(url: string): Promise<PageResult<DiscoveredListing[]>> {
  const response = await fetchText(url);
  if (response.status !== 200) {
    return { value: null, status: response.status, error: response.error ?? `status ${response.status}` };
  }
  return { value: parseCategoryPage(response.html), status: response.status };
}

export async function crawlProduct(url: string): Promise<PageResult<ScraperOffer>> {
  const response = await fetchText(url);
  if (response.status !== 200) {
    return { value: null, status: response.status, error: response.error ?? `status ${response.status}` };
  }
  const product = parseJsonLd(response.html);
  if (!product) return { value: null, status: response.status, error: 'the page has no JSON-LD product' };
  return { value: buildOffer(product, url), status: response.status };
}

export const jumia: SourceAdapter = {
  site: SOURCE,
  crawlProduct,
  crawlCategory,
};
