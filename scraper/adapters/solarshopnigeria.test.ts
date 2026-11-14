// The golden-page tests. They read the saved HTML and never touch the
// network, so the adapter rules are checked on every run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildOffer,
  detectProductType,
  parseCategoryPage,
  parseProductPage,
} from './solarshopnigeria.ts';

const fixture = (name: string) => fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const PANEL_URL = 'https://solarshopnigeria.com/products/jinko-solar-eagle-535w-bifacial-solar-module';
const BATTERY_URL = 'https://solarshopnigeria.com/products/jinko-solar-jks-b51100-5-12-kwh-lithium-ion-battery';
const PALLET_URL =
  'https://solarshopnigeria.com/products/jinko-solar-eagle-535w-bifacial-solar-module-pallet-of-27';

test('the category page yields one listing per product card', () => {
  const listings = parseCategoryPage(fixture('solarshopnigeria-pv-modules.html'));

  assert.equal(listings.length, 7);
  const first = listings[0];
  assert.equal(first.title, 'Jinko Solar Eagle 535W Bifacial Solar Module');
  assert.equal(first.price, 120400);
  assert.equal(first.source_url, PANEL_URL);
  assert.equal(first.stock_text, 'In stock · Lagos');
  assert.equal(first.spec_line, 'Jinko Solar · 535 Wp · 20.75%');
  assert.equal(first.has_datasheet, true);
  assert.match(first.source_listing_id, /^c[a-z0-9]+$/);
});

test('the category page states the pack count for a bulk card', () => {
  const listings = parseCategoryPage(fixture('solarshopnigeria-pv-modules.html'));
  const pallet = listings.find((listing) => listing.title.includes('Full Pallet'));

  assert.ok(pallet);
  assert.equal(pallet.pack_count, 27);
  assert.equal(pallet.price, 3000000);
  assert.equal(pallet.source_url, PALLET_URL);
});

test('a panel page yields the electrical specification table', () => {
  const facts = parseProductPage(fixture('solarshopnigeria-product.html'), PANEL_URL);

  assert.ok(facts);
  assert.equal(facts.brand, 'Jinko Solar');
  assert.equal(facts.sku, 'TSS-JINKO-SOLAR-EAGLE-535W-BIFACIAL-SOLAR-MODULE');
  assert.equal(facts.price, 120400);
  assert.equal(facts.stock_text, 'In stock at Victoria Island, ready for pickup');
  assert.equal(facts.datasheet_path, '/files/cmu3dqswo00j0ms3gws2z4vp0?download');
  assert.equal(facts.specs['Open-circuit Voltage (Voc)'], '49.42 V');
  assert.equal(facts.specs['Short-circuit Current (Isc)'], '13.79 A');

  const offer = buildOffer(facts, '2026-11-13T02:00:00.000Z');
  assert.equal(offer.status, 'qualified');
  assert.equal(offer.price, 120400);
  assert.equal(offer.unit_basis, 'piece');
  assert.equal(offer.in_stock, 'true');
  assert.equal(offer.trust_tier, 'verified');
  assert.equal(offer.stated_specs.watts, 535);
  assert.equal(offer.stated_specs.voc, 49.42);
  assert.equal(offer.stated_specs.isc, 13.79);
  assert.equal(detectProductType(offer.stated_specs), 'panel');
});

test('a battery page yields the chemistry, the voltage and the capacity', () => {
  const facts = parseProductPage(fixture('solarshopnigeria-battery-product.html'), BATTERY_URL);

  assert.ok(facts);
  const offer = buildOffer(facts, '2026-11-13T02:00:00.000Z');

  assert.equal(offer.price, 1170100);
  assert.equal(offer.stated_specs.voltage_v, 51.2);
  assert.equal(offer.stated_specs.capacity_kwh, 5.12);
  assert.equal(offer.stated_specs.capacity_ah, 100);
  assert.equal(offer.stated_specs.battery_type, 'lithium');
  assert.equal(offer.stated_specs.max_parallel_strings, 16);
  assert.equal(detectProductType(offer.stated_specs), 'battery');
  assert.equal(offer.status, 'qualified');
});

test('a pallet page divides the pack price by the stated count', () => {
  const facts = parseProductPage(fs.readFileSync(new URL('../fixtures/solarshopnigeria-pallet-product.html', import.meta.url), 'utf8'), PALLET_URL);

  assert.ok(facts);
  assert.equal(facts.pack_count, 27);
  assert.equal(facts.price, 3000000);
  assert.equal(facts.per_unit_price, 111111.11);

  const offer = buildOffer(facts, '2026-11-13T02:00:00.000Z');
  assert.equal(offer.unit_basis, 'derived');
  assert.equal(offer.unit_quantity, 27);
  assert.equal(offer.price, 111111.11);
});

test('a missing price sends the offer to review', () => {
  const facts = parseProductPage(fixture('solarshopnigeria-product.html'), PANEL_URL);
  assert.ok(facts);

  const offer = buildOffer({ ...facts, price: null }, '2026-11-13T02:00:00.000Z');
  assert.equal(offer.status, 'review_required');
  assert.equal(offer.reason_code, 'call_for_price');
});

test('a missing electrical value sends the offer to review', () => {
  const facts = parseProductPage(fixture('solarshopnigeria-product.html'), PANEL_URL);
  assert.ok(facts);

  const specs = { ...facts.specs };
  delete specs['Short-circuit Current (Isc)'];
  const offer = buildOffer({ ...facts, specs }, '2026-11-13T02:00:00.000Z');

  assert.equal(offer.status, 'review_required');
  assert.equal(offer.reason_code, 'missing_required_spec');
  assert.deepEqual(offer.trading_signals.missing_specs, ['isc']);
});
