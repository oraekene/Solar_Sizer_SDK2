// Tests for the identity rules and the candidate proposal. They use plain
// objects, so they never touch the network.

import assert from 'node:assert/strict';
import test from 'node:test';
import { brandKey, canonicalId, compareIdentity, identityOf, modelFromName } from './identity.ts';
import { proposeCandidates } from './merge.ts';
import type { MergeOffer } from './merge.ts';
import { applyFxRate } from './fx.ts';
import { applyCrossPostSignals } from './run-common.ts';
import type { OfferPayload } from './run-common.ts';

const aliases = {
  '9solar': ['9solar', 'nine solar', 'nine solar energy', '9 solar'],
  cworth: ['cworth', 'cworth energy'],
  jinko: ['jinko', 'jinko solar', 'jinkosolar'],
  generic: ['generic', 'general', 'unbranded', 'no name', 'noname'],
};

const panel = (overrides: Partial<MergeOffer> = {}): MergeOffer => ({
  id: 'jumia:1',
  source_site: 'jumia',
  source_url: 'https://jumia/1',
  price: 100_000,
  status: 'qualified',
  in_stock: 'true',
  trust_tier: 'verified',
  seller_id: 'jumia:seller:a',
  unit_basis: 'piece',
  unit_quantity: null,
  condition: 'new',
  stated_specs: {
    name: '9Solar 550W Mono Panel',
    brand: '9Solar',
    watts: 550,
    voc: 49.9,
    isc: 14,
  },
  last_checked: '2026-11-13T02:00:00.000Z',
  ...overrides,
});

test('the brand folds the alias spellings', () => {
  assert.deepEqual(brandKey('Nine Solar Energy', aliases), { brand: '9solar', kind: 'manufacturer' });
  assert.deepEqual(brandKey('Cworth Energy', aliases), { brand: 'cworth', kind: 'manufacturer' });
  assert.deepEqual(brandKey('Generic', aliases), { brand: 'generic', kind: 'generic' });
  assert.deepEqual(brandKey('', aliases), { brand: 'unbranded', kind: 'unbranded' });
});

test('a dollar price is converted with the stored daily rate', () => {
  const rate = { rate: 1400, date: '2026-11-14T08:45:01.000Z', source: 'nairadaily.net' };
  const dollar = applyFxRate(
    {
      price: 100,
      currency: 'USD',
      status: 'qualified',
      reason_code: null,
    },
    rate,
  );
  assert.equal(dollar.status, 'qualified');
  assert.equal(dollar.price_ngn, 140_000);
  assert.equal(dollar.price_ngn_rounded, 140_000);
  assert.equal(dollar.fx_source, 'nairadaily.net');
});

test('the model drops the brand and the electrical tokens', () => {
  assert.equal(modelFromName('9Solar 550W Mono Panel', '9solar'), 'mono');
  assert.equal(modelFromName('Jinko Tiger Neo 625W N-type Bifacial Solar Panel', 'jinko'), 'tiger neo n type bifacial');
});

test('a pack listing keeps the model of the single product', () => {
  assert.equal(
    modelFromName('Jinko Solar Eagle 535W Bifacial Solar Module Full Pallet 27 Pieces', 'jinko'),
    'eagle bifacial',
  );
});

test('two listings of the same product share an identity key', () => {
  const left = identityOf('panel', panel().stated_specs, '9Solar 550W Mono Panel', aliases);
  const right = identityOf(
    'panel',
    { ...panel().stated_specs, brand: 'Nine Solar Energy' },
    'Nine Solar Energy 550W Mono',
    aliases,
  );

  assert.equal(left.key, right.key);
  assert.equal(compareIdentity(left, right), 'same');
  assert.equal(canonicalId(left), canonicalId(right));
});

test('a different model with the same wattage is a possible duplicate', () => {
  const left = identityOf('panel', panel().stated_specs, '9Solar 550W Mono Panel', aliases);
  const right = identityOf(
    'panel',
    { ...panel().stated_specs, name: '9Solar 550W Half Cut Panel' },
    '9Solar 550W Half Cut Panel',
    aliases,
  );

  assert.equal(compareIdentity(left, right), 'possible_duplicate');
});

test('a different brand is a different product', () => {
  const left = identityOf('panel', panel().stated_specs, '9Solar 550W Mono Panel', aliases);
  const right = identityOf(
    'panel',
    { ...panel().stated_specs, brand: 'Cworth' },
    'Cworth 550W Mono Panel',
    aliases,
  );

  assert.equal(compareIdentity(left, right), 'different');
});

test('the median uses the qualified offers that are in stock', () => {
  const offers = [
    panel({ id: 'a', price: 100_000, trust_tier: 'verified', seller_id: 's1' }),
    panel({ id: 'b', price: 110_000, trust_tier: 'established', seller_id: 's2' }),
    panel({ id: 'c', price: 10_000, in_stock: 'false', trust_tier: 'verified', seller_id: 's3' }),
    panel({ id: 'd', price: 90_000, trust_tier: 'unknown', seller_id: 's4' }),
  ];

  const { proposals } = proposeCandidates(offers, { aliases, hardware: [] });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].proposed_price, 105_000);
  assert.equal(proposals[0].low_confidence, false);
  assert.equal(proposals[0].status, 'new');
});

test('an offer below 60% of the median is excluded as a price outlier', () => {
  const offers = [
    panel({ id: 'a', price: 100_000, trust_tier: 'verified', seller_id: 's1' }),
    panel({ id: 'b', price: 110_000, trust_tier: 'verified', seller_id: 's2' }),
    panel({ id: 'c', price: 30_000, trust_tier: 'verified', seller_id: 's3' }),
  ];

  const { proposals, excluded } = proposeCandidates(offers, { aliases, hardware: [] });
  assert.deepEqual(excluded, [{ offer_id: 'c', reason_code: 'price_outlier' }]);
  assert.equal(proposals[0].proposed_price, 105_000);
});

test('a manual row keeps its price and waits for a human', () => {
  const offers = [panel({ id: 'a', price: 100_000 })];
  const hardware = [{ id: 'sc-9solar-mono', type: 'panel', price: 95_000, price_source: 'manual' }];

  const { proposals } = proposeCandidates(offers, { aliases, hardware });
  assert.equal(proposals[0].status, 'pending_review');
  assert.equal(proposals[0].current_price, 95_000);
  assert.equal(proposals[0].proposed_price, 100_000);
  assert.ok(proposals[0].risk_flags.includes('manual price'));
});

test('a scraped row inside the 15% band publishes itself', () => {
  const offers = [panel({ id: 'a', price: 100_000 })];
  const hardware = [{ id: 'sc-9solar-mono', type: 'panel', price: 95_000, price_source: 'scraped' }];

  const { proposals } = proposeCandidates(offers, { aliases, hardware });
  assert.equal(proposals[0].status, 'suggested');
});

test('a scraped row outside the band waits for a human', () => {
  const offers = [panel({ id: 'a', price: 100_000 })];
  const hardware = [{ id: 'sc-9solar-mono', type: 'panel', price: 70_000, price_source: 'scraped' }];

  const { proposals } = proposeCandidates(offers, { aliases, hardware });
  assert.equal(proposals[0].status, 'pending_review');
  assert.ok(proposals[0].risk_flags.includes('price outside the 15% band'));
});

test('a price from unknown sellers alone carries the low confidence flag', () => {
  const offers = [panel({ id: 'a', price: 100_000, trust_tier: 'unknown' })];

  const { proposals } = proposeCandidates(offers, { aliases, hardware: [] });
  assert.equal(proposals[0].low_confidence, true);
  assert.ok(proposals[0].risk_flags.includes('low confidence price'));
});

test('a price from unknown sellers alone never auto-publishes a scraped row', () => {
  const offers = [panel({ id: 'a', price: 100_000, trust_tier: 'unknown' })];
  const hardware = [{ id: 'sc-9solar-mono', type: 'panel', price: 95_000, price_source: 'scraped' }];

  const { proposals } = proposeCandidates(offers, { aliases, hardware });
  assert.equal(proposals[0].status, 'pending_review');
  assert.ok(proposals[0].risk_flags.includes('low confidence price'));
});

test('two sources that state different fields still form one candidate', () => {
  const offers = [
    panel({ id: 'a', price: 100_000, trust_tier: 'verified', seller_id: 's1' }),
    panel({
      id: 'b',
      price: 120_000,
      trust_tier: 'established',
      seller_id: 's2',
      stated_specs: { ...panel().stated_specs, cell_type: 'P type Mono-crystalline' },
    }),
  ];

  const { proposals } = proposeCandidates(offers, { aliases, hardware: [] });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].proposed_price, 110_000);
  assert.equal(proposals[0].offer_ids.length, 2);
});

test('an existing catalogue row matches by its facts and keeps its manual price', () => {
  const offers = [panel({ id: 'a', price: 100_000 })];
  const hardware = [
    {
      id: 'p-9',
      type: 'panel',
      price: 103_000,
      price_source: 'manual',
      data: { name: '9Solar 550W Mono', watts: 550, voc: 49.9, isc: 14 },
    },
  ];

  const { proposals } = proposeCandidates(offers, { aliases, hardware });
  assert.equal(proposals[0].current_hardware_row, 'p-9');
  assert.equal(proposals[0].status, 'pending_review');
  assert.ok(proposals[0].risk_flags.includes('manual price'));
});

test('a weaker match with a catalogue row waits for a human', () => {
  const offers = [panel({ id: 'a', price: 100_000 })];
  const hardware = [
    {
      id: 'p-9',
      type: 'panel',
      price: 103_000,
      price_source: 'manual',
      data: { name: '9Solar 550W Half Cut', watts: 550, voc: 49.9, isc: 14 },
    },
  ];

  const { proposals } = proposeCandidates(offers, { aliases, hardware });
  assert.equal(proposals[0].current_hardware_row, null);
  assert.equal(proposals[0].status, 'pending_review');
  assert.ok(proposals[0].risk_flags.includes('possible duplicate of p-9'));
});

test('two ads with the same seller, price and image count once', () => {
  const offers = [
    panel({ id: 'a', seller_id: 'seller-1', price: 100_000, image_hash: 'photo-1' }),
    panel({ id: 'b', seller_id: 'seller-1', price: 100_000, image_hash: 'photo-1' }),
    panel({ id: 'c', seller_id: 'seller-2', price: 100_000, image_hash: 'photo-1' }),
  ];

  const { proposals, excluded } = proposeCandidates(offers, { aliases, hardware: [] });
  assert.deepEqual(excluded, [{ offer_id: 'b', reason_code: 'duplicate_of_existing_offer' }]);
  assert.equal(proposals[0].proposed_price, 100_000);
  assert.equal(proposals[0].low_confidence, false);
});

test('an official product page wins over a seller statement and the conflict is flagged', () => {
  const offers = [
    panel({
      id: 'a',
      seller_id: 'seller-1',
      trust_tier: 'verified',
      stated_specs: { ...panel().stated_specs, voc: 50 },
      trading_signals: { spec_source: 'model_parse' },
    }),
    panel({
      id: 'b',
      seller_id: 'seller-2',
      trust_tier: 'established',
      stated_specs: { ...panel().stated_specs, voc: 49 },
      trading_signals: { spec_source: 'datasheet' },
    }),
  ];

  const { proposals } = proposeCandidates(offers, { aliases, hardware: [] });
  assert.equal(proposals[0].proposed_data.voc, 49);
  assert.equal(proposals[0].provenance.find((entry) => entry.field === 'voc')?.kind, 'datasheet');
  assert.ok(proposals[0].risk_flags.includes('sellers disagree on voc'));
  assert.equal(proposals[0].status, 'pending_review');
});

test('the same photo at a different price records a cross-post signal', () => {
  const offers = [
    panel({ id: 'a', seller_id: 'seller-1', price: 100_000, image_hash: 'photo-1' }),
    panel({ id: 'b', seller_id: 'seller-1', price: 120_000, image_hash: 'photo-1' }),
  ];

  const { proposals, cross_posts } = proposeCandidates(offers, { aliases, hardware: [] });
  assert.equal(proposals[0].proposed_price, 110_000);
  assert.deepEqual(cross_posts, [
    { offer_id: 'b', existing_offer_id: 'a', image_hash: 'photo-1' },
  ]);
});

test('a battery keeps the shape that src/types.ts expects', () => {
  const offers: MergeOffer[] = [
    {
      ...panel({ id: 'b1', source_site: 'solarshopnigeria' }),
      stated_specs: {
        name: 'Cworth 24V 100Ah LiFePO4',
        brand: 'Cworth',
        voltage_v: 24,
        capacity_ah: 100,
        battery_type: 'lithium',
        max_parallel_strings: 16,
        min_c_rate: 0.5,
      },
    },
  ];

  const { proposals } = proposeCandidates(offers, { aliases, hardware: [] });
  const data = proposals[0].proposed_data;
  assert.equal(data.voltage, 24);
  assert.equal(data.capacity_ah, 100);
  assert.equal(data.type, 'lithium');
  assert.equal(data.max_parallel_strings, 16);
  assert.equal(data.min_c_rate, 0.5);
  assert.equal(data.voltage_v, undefined);
});

test('a cross-post signal is removed when the current pool no longer has the pair', () => {
  const offer = (id: string): OfferPayload => ({
    source_site: 'jumia',
    source_listing_id: id,
    source_url: `https://jumia/${id}`,
    seller_id: 'seller-1',
    seller_name: 'Seller One',
    price: 100_000,
    currency: 'NGN',
    price_kind: 'cash',
    unit_basis: 'piece',
    unit_quantity: null,
    condition: 'new',
    in_stock: 'true',
    trust_tier: 'verified',
    stated_specs: { watts: 550 },
    trading_signals: {
      cross_posted_image_hash: 'old-photo',
      cross_posted_offer_ids: ['other'],
    },
    raw_payload: {},
    status: 'qualified',
    reason_code: null,
    last_checked: '2026-11-14T00:00:00.000Z',
    scraped_at: '2026-11-14T00:00:00.000Z',
  });

  const result = applyCrossPostSignals([offer('a'), offer('b')], []);
  assert.deepEqual(result.pool[0].trading_signals, {});
  assert.deepEqual(result.pool[1].trading_signals, {});
  assert.deepEqual([...result.affected].sort(), ['jumia:a', 'jumia:b']);
});
