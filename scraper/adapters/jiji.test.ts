// The golden-page tests for the Jiji adapter. They read the saved pages and
// never touch the network, so the adapter rules are checked on every run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildOffer,
  conditionFromAttrs,
  parseCategoryFeed,
  parseFeed,
  parseProductPage,
  trustTier,
} from './jiji.ts';

const fixture = (name: string) => fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const PRODUCT_URL =
  'https://jiji.ng/maitama/power-equipments/dawnice-358-4v-100kva-high-voltage-280ah-solar-battery-HsaXSvMaf3xwWzodz57VCkT.html';

test('the feed gives the listings of one category page', () => {
  const feed = parseFeed(JSON.parse(fixture('jiji-feed.json')));

  assert.equal(feed.adverts.length, 5);
  assert.equal(feed.total, 10837);

  const listings = parseCategoryFeed(JSON.parse(fixture('jiji-feed.json')));
  assert.equal(listings.length, 5);

  const first = listings[0];
  assert.equal(first.title, 'Dawnice 358.4V 100KVA High Voltage 280ah Solar Battery');
  assert.equal(first.price, 23512499);
  assert.equal(first.currency, 'NGN');
  assert.equal(first.source_listing_id, 'HsaXSvMaf3xwWzodz57VCkT');
  assert.equal(first.source_url, PRODUCT_URL);
});

test('the condition comes from the attributes of the advert', () => {
  assert.equal(conditionFromAttrs([{ name: 'Condition', value: 'Brand New' }]), 'new');
  assert.equal(conditionFromAttrs([{ name: 'Condition', value: 'Used' }]), 'used');
  assert.equal(conditionFromAttrs([{ name: 'Condition', value: 'Foreign Used' }]), 'foreign_used');
  assert.equal(conditionFromAttrs([{ name: 'Condition', value: 'Refurbished' }]), 'refurbished');
  assert.equal(conditionFromAttrs(undefined), 'unknown');
});

test('the product page carries the price, the condition, the stock and the seller', () => {
  const facts = parseProductPage(fixture('jiji-product.html'));

  assert.ok(facts);
  assert.equal(facts.title, 'Dawnice 358.4V 100KVA High Voltage 280ah Solar Battery');
  assert.equal(facts.price, 23512499);
  assert.equal(facts.condition, 'new');
  assert.equal(facts.in_stock, 'true');
  assert.equal(facts.seller_name, 'Dawnice Solar Battery');
  assert.deepEqual(facts.seller_badges, ['1+ years on Jiji']);
  assert.equal(facts.attributes.Brand, 'Dawnice');
  assert.equal(facts.attributes['Battery Capacity'], '280aH');
});

test('the seller badges decide the trust tier', () => {
  const facts = parseProductPage(fixture('jiji-product.html'));
  assert.ok(facts);

  // One year on the platform is not enough.
  assert.equal(trustTier(facts), 'unknown');
  assert.equal(trustTier({ ...facts, seller_badges: ['Verified ID'] }), 'verified');
  assert.equal(trustTier({ ...facts, seller_badges: ['2+ years on Jiji'] }), 'established');
});

test('a battery offer carries the stated capacity and the title voltage', () => {
  const facts = parseProductPage(fixture('jiji-product.html'));
  assert.ok(facts);

  const offer = buildOffer(facts, PRODUCT_URL, 'HsaXSvMaf3xwWzodz57VCkT', '2026-11-14T02:00:00.000Z');

  assert.equal(offer.source_site, 'jiji');
  assert.equal(offer.status, 'qualified');
  assert.equal(offer.price, 23512499);
  assert.equal(offer.price_kind, 'cash');
  assert.equal(offer.condition, 'new');
  assert.equal(offer.in_stock, 'true');
  assert.equal(offer.trust_tier, 'unknown');
  assert.equal(offer.stated_specs.brand, 'Dawnice');
  assert.equal(offer.stated_specs.capacity_ah, 280);
  assert.equal(offer.stated_specs.capacity_kwh, 100);
  assert.equal(offer.stated_specs.voltage_v, 358.4);
});

test('a used listing is archived with its label', () => {
  const facts = parseProductPage(fixture('jiji-product.html'));
  assert.ok(facts);

  const offer = buildOffer(
    { ...facts, condition: 'used' },
    PRODUCT_URL,
    'HsaXSvMaf3xwWzodz57VCkT',
    '2026-11-14T02:00:00.000Z',
  );

  assert.equal(offer.status, 'excluded');
  assert.equal(offer.reason_code, 'used');
});

test('a battery without a capacity waits for a human', () => {
  const facts = parseProductPage(fixture('jiji-product.html'));
  assert.ok(facts);

  const offer = buildOffer(
    { ...facts, title: 'Dawnice Lifepo4 48v 15kva Wall Mounted Solar Batteries', attributes: {} },
    PRODUCT_URL,
    'ppuROpVFZoKGLh3kiYDoRJIx',
    '2026-11-14T02:00:00.000Z',
  );

  assert.equal(offer.status, 'review_required');
  assert.equal(offer.reason_code, 'missing_required_spec');
  assert.deepEqual(offer.trading_signals.missing_specs, ['capacity_ah']);
});

test('a listing that is not solar hardware is archived', () => {
  const facts = parseProductPage(fixture('jiji-product.html'));
  assert.ok(facts);

  const offer = buildOffer(
    { ...facts, title: 'Sunshine 100W 12V Mono Crystal Solar Panel', attributes: {} },
    PRODUCT_URL,
    'HsaXSvMaf3xwWzodz57VCkT',
    '2026-11-14T02:00:00.000Z',
  );

  // A panel is solar hardware, so this one stays in the pool.
  assert.equal(offer.status, 'qualified');

  const bag = buildOffer(
    { ...facts, title: 'Canvas Bag For Laptop', attributes: {} },
    PRODUCT_URL,
    'HsaXSvMaf3xwWzodz57VCkT',
    '2026-11-14T02:00:00.000Z',
  );
  assert.equal(bag.status, 'excluded');
  assert.equal(bag.reason_code, 'not_solar_hardware');
});
