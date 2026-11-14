// The golden-page tests for the Jumia adapter. They read the saved pages and
// never touch the network, so the adapter rules are checked on every run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildOffer, listingIdFromUrl, parseCategoryPage, parseJsonLd } from './jumia.ts';

const fixture = (name: string) => fs.readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const PANEL_URL = 'https://www.jumia.com.ng/jinko-450w-solar-panel-mono-2436v48v-419404270.html';

test('the category page yields one listing per product card', () => {
  const listings = parseCategoryPage(fixture('jumia-category.html'));

  assert.equal(listings.length, 3);

  const first = listings[0];
  assert.equal(first.title, 'Jinko 450W SOLAR PANEL MONO 24/36V/48V');
  assert.equal(first.price, 75015);
  assert.equal(first.currency, 'NGN');
  assert.equal(first.source_url, PANEL_URL);
  assert.equal(first.source_listing_id, '419404270');

  // The slug of the third card carries letters before the number, so the
  // trailing digits are the listing id.
  const third = listings[2];
  assert.equal(third.title, 'Sunshine 100W 12V Mono Crystal Solar Panel');
  assert.equal(third.source_listing_id, '8254192');
  assert.equal(third.price, 24400);
});

test('the product page carries the price, the stock and the seller', () => {
  const product = parseJsonLd(fixture('jumia-product.html'));

  assert.ok(product);
  assert.equal(product.name, 'Jinko  450W SOLAR PANEL MONO 24/36V/48V');
  assert.equal(product.brand && typeof product.brand === 'object' ? product.brand.name : product.brand, 'Jinko');
  assert.equal(product.offers?.price, '75015.00');
  assert.equal(product.offers?.availability, 'http://schema.org/InStock');
  assert.equal(product.offers?.itemCondition, 'http://schema.org/NewCondition');
  assert.equal(product.offers?.seller?.name, 'Nossolar Energy System');
});

test('a panel offer carries the wattage and the cash price', () => {
  const product = parseJsonLd(fixture('jumia-product.html'));
  assert.ok(product);

  const offer = buildOffer(product, PANEL_URL, '2026-11-14T02:00:00.000Z');

  assert.equal(offer.source_site, 'jumia');
  assert.equal(offer.source_listing_id, '419404270');
  assert.equal(offer.status, 'qualified');
  assert.equal(offer.price, 75015);
  assert.equal(offer.price_kind, 'cash');
  assert.equal(offer.unit_basis, 'piece');
  assert.equal(offer.condition, 'new');
  assert.equal(offer.in_stock, 'true');
  assert.equal(offer.stated_specs.watts, 450);
  assert.equal(offer.stated_specs.brand, 'Jinko');

  // A seller with no badge and a product rating below four is unknown.
  assert.equal(offer.trust_tier, 'unknown');
});

test('a marketplace seller is a verified seller', () => {
  const product = parseJsonLd(fixture('jumia-product.html'));
  assert.ok(product);

  const vendor = {
    ...product,
    offers: {
      ...product.offers,
      seller: { name: 'Jumia Store', '@id': '999', url: '/marketplace-vendor/' },
    },
  };
  assert.equal(buildOffer(vendor, PANEL_URL).trust_tier, 'verified');
});

test('a rated product with ten reviews is an established seller', () => {
  const product = parseJsonLd(fixture('jumia-product.html'));
  assert.ok(product);

  const rated = { ...product, aggregateRating: { ratingValue: 4.4, ratingCount: 12 } };
  assert.equal(buildOffer(rated, PANEL_URL).trust_tier, 'established');
});

test('a listing that is not solar hardware is archived', () => {
  const product = parseJsonLd(fixture('jumia-product.html'));
  assert.ok(product);

  const cable = { ...product, name: 'Generic USB Cable 2m' };
  const offer = buildOffer(cable, 'https://www.jumia.com.ng/cable-123456789.html');

  assert.equal(offer.status, 'excluded');
  assert.equal(offer.reason_code, 'not_solar_hardware');
});

test('a battery without a capacity waits for a human', () => {
  const product = parseJsonLd(fixture('jumia-product.html'));
  assert.ok(product);

  const battery = { ...product, name: 'Dawnice Lifepo4 48v 15kva Wall Mounted Solar Batteries' };
  const offer = buildOffer(battery, 'https://www.jumia.com.ng/battery-123456789.html');

  assert.equal(offer.status, 'review_required');
  assert.equal(offer.reason_code, 'missing_required_spec');
  assert.deepEqual(offer.trading_signals.missing_specs, ['capacity_ah']);
});

test('a used listing is archived with its label', () => {
  const product = parseJsonLd(fixture('jumia-product.html'));
  assert.ok(product);

  const used = {
    ...product,
    offers: { ...product.offers, itemCondition: 'http://schema.org/UsedCondition' },
  };
  const offer = buildOffer(used, PANEL_URL);

  assert.equal(offer.status, 'excluded');
  assert.equal(offer.reason_code, 'used');
  assert.equal(offer.condition, 'used');
});

test('the listing id comes from the trailing digits of the address', () => {
  assert.equal(listingIdFromUrl(PANEL_URL), '419404270');
  assert.equal(listingIdFromUrl('https://www.jumia.com.ng/100w-panel-sunshine-mpg8254192.html'), '8254192');
});
