// The identity rules. A canonical product is only merged when the key matches
// after normalisation. A weaker match becomes a reviewed possible duplicate,
// never an automatic merge. See docs/scraper-design.md section 2.4.

export type AliasTable = Record<string, string[]>;

export type BrandKind = 'manufacturer' | 'generic' | 'unbranded';
export type ProductType = 'panel' | 'battery';

export type Identity = {
  key: string;
  family_key: string;
  brand: string;
  brand_kind: BrandKind;
  model: string | null;
  facts: Record<string, string>;
  product_type: ProductType;
};

const GENERIC_WORDS = /^(generic|general|unbranded|no name|noname|unbranded product)$/;

export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const slug = (value: string) => value.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The alias table maps a canonical brand slug to the spellings the platforms
// use. The first exact match wins, then the longest variant that starts the
// raw brand wins.
export function brandKey(raw: string | null | undefined, aliases: AliasTable): { brand: string; kind: BrandKind } {
  const text = normalizeText(raw);
  if (!text) return { brand: 'unbranded', kind: 'unbranded' };
  if (GENERIC_WORDS.test(text)) return { brand: 'generic', kind: 'generic' };

  const variants = new Map<string, string>();
  for (const [canonical, list] of Object.entries(aliases)) {
    for (const variant of list) variants.set(normalizeText(variant), canonical);
  }

  if (variants.has(text)) return { brand: variants.get(text) as string, kind: 'manufacturer' };

  let best: { canonical: string; length: number } | null = null;
  for (const [variant, canonical] of variants) {
    if (!variant) continue;
    if (text.startsWith(`${variant} `) || text === variant) {
      if (!best || variant.length > best.length) best = { canonical, length: variant.length };
    }
  }
  if (best) return { brand: best.canonical, kind: 'manufacturer' };

  return { brand: slug(text), kind: 'manufacturer' };
}

// The model comes from the listing title. The brand and the electrical tokens
// are removed, so "Jinko Tiger Neo 625W N-type Bifacial Solar Panel" leaves
// "tiger neo n type bifacial". The qualifiers such as mono and half cut stay,
// because they tell two models of the same wattage apart.
export function modelFromName(
  name: string | null | undefined,
  brand: string,
  aliases: AliasTable = {},
): string | null {
  let text = normalizeText(name);
  if (!text) return null;

  // Every spelling of the brand can start the title, so all of them are cut.
  const variants = new Set<string>([normalizeText(brand)]);
  for (const [canonical, list] of Object.entries(aliases)) {
    if (canonical !== brand) continue;
    for (const variant of list) variants.add(normalizeText(variant));
  }
  for (const variant of [...variants].filter(Boolean).sort((a, b) => b.length - a.length)) {
    if (text === variant) {
      text = '';
      break;
    }
    if (text.startsWith(`${variant} `)) {
      text = text.slice(variant.length).trim();
      break;
    }
  }

  text = text
    .replace(/\b\d+(?:\.\d+)?\s*(?:wp|w|v|ah|wh|kwh)\b/g, ' ')
    .replace(/\b(?:solar panel|solar module|solar battery|panel|module|battery|solar)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text || null;
}

const panelFacts = (specs: Record<string, unknown>): Record<string, string> => {
  const facts: Record<string, string> = {};
  if (typeof specs.watts === 'number') facts.watts = String(specs.watts);
  if (typeof specs.cell_type === 'string' && specs.cell_type.trim()) facts.cell_type = normalizeText(specs.cell_type);
  if (typeof specs.form_factor === 'string' && specs.form_factor.trim()) facts.form_factor = normalizeText(specs.form_factor);
  return facts;
};

const batteryFacts = (specs: Record<string, unknown>): Record<string, string> => {
  const facts: Record<string, string> = {};
  if (typeof specs.battery_type === 'string' && specs.battery_type.trim()) facts.chemistry = normalizeText(specs.battery_type);
  if (typeof specs.voltage_v === 'number') facts.voltage = String(specs.voltage_v);
  if (typeof specs.capacity_ah === 'number') facts.capacity_ah = String(specs.capacity_ah);
  return facts;
};

const factString = (facts: Record<string, string>) =>
  Object.keys(facts)
    .sort()
    .map((field) => `${field}=${facts[field]}`)
    .join(';');

// The primary facts decide the family. A panel is the same family when the
// wattage matches. A battery is the same family when the voltage and the
// capacity match.
function familyFacts(productType: ProductType, facts: Record<string, string>): Record<string, string> {
  if (productType === 'panel') return facts.watts ? { watts: facts.watts } : {};
  const family: Record<string, string> = {};
  if (facts.voltage) family.voltage = facts.voltage;
  if (facts.capacity_ah) family.capacity_ah = facts.capacity_ah;
  return family;
}

export function identityOf(
  productType: ProductType,
  specs: Record<string, unknown>,
  name: string | null | undefined,
  aliases: AliasTable,
): Identity {
  const { brand, kind } = brandKey(typeof specs.brand === 'string' ? specs.brand : null, aliases);
  const facts = productType === 'panel' ? panelFacts(specs) : batteryFacts(specs);
  const model = modelFromName(name, brand, aliases);
  const family = familyFacts(productType, facts);
  const familyKey = `${brand}|${factString(family)}`;
  const key = `${brand}:${model ?? '*'}|${factString(facts)}`;

  return { key, family_key: familyKey, brand, brand_kind: kind, model, facts, product_type: productType };
}

export type Match = 'same' | 'possible_duplicate' | 'different';

export function compareIdentity(a: Identity, b: Identity): Match {
  if (a.product_type !== b.product_type) return 'different';
  if (a.brand !== b.brand) return 'different';
  if (a.key === b.key) return 'same';

  // One side has no model, so the electrical facts decide.
  if (!a.model || !b.model) {
    return a.family_key === b.family_key ? 'same' : 'different';
  }

  // Same brand and either the same model or the same family means a human
  // decides.
  if (a.model === b.model || a.family_key === b.family_key) return 'possible_duplicate';
  return 'different';
}

// The row id for a new canonical product.
export function canonicalId(identity: Identity): string {
  const parts = [identity.brand, identity.model ?? identity.family_key.replace(/\|/g, '-')];
  return `sc-${slug(parts.filter(Boolean).join('-'))}`.slice(0, 80);
}
