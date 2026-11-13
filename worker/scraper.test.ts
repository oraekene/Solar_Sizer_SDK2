import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_STATUSES,
  OFFER_STATUSES,
  REASON_CODES,
  TRUST_TIERS,
  buildDescription,
  isCandidateStatus,
  isOfferStatus,
  isReasonCode,
  isTrustTier,
  medianPrice,
  offerId,
  withinBand,
} from './scraper.ts';

const offer = (overrides: Record<string, unknown> = {}) => ({
  price: 100_000,
  status: 'qualified',
  in_stock: 'true',
  trust_tier: 'verified',
  seller_id: 'seller-1',
  ...overrides,
});

test('the reason code set is closed at 21 codes', () => {
  assert.equal(REASON_CODES.length, 21);
  assert.ok(isReasonCode('used'));
  assert.ok(isReasonCode('superseded'));
  assert.ok(!isReasonCode('made_up_code'));
  assert.ok(!isReasonCode(undefined));
});

test('every status and trust tier has a definition', () => {
  assert.equal(OFFER_STATUSES.length, 3);
  assert.equal(CANDIDATE_STATUSES.length, 8);
  assert.equal(TRUST_TIERS.length, 3);
  assert.ok(isOfferStatus('qualified'));
  assert.ok(!isOfferStatus('archived'));
  assert.ok(isCandidateStatus('pending_review'));
  assert.ok(!isCandidateStatus('suggested_by_nobody'));
  assert.ok(isTrustTier('established'));
  assert.ok(!isTrustTier('gold'));
});

test('the median comes from verified and established offers', () => {
  const result = medianPrice([
    offer({ price: 90_000, trust_tier: 'verified' }),
    offer({ price: 100_000, trust_tier: 'established', seller_id: 'seller-2' }),
    offer({ price: 10_000, trust_tier: 'unknown', seller_id: 'seller-3' }),
  ]);

  assert.equal(result.price, 95_000);
  assert.equal(result.confidence, 'high');
  assert.equal(result.low_confidence, false);
  assert.equal(result.offer_count, 2);
  assert.equal(result.seller_count, 2);
});

test('the median falls back to unknown sellers with a low confidence flag', () => {
  const result = medianPrice([
    offer({ price: 80_000, trust_tier: 'unknown' }),
    offer({ price: 120_000, trust_tier: 'unknown', seller_id: 'seller-2' }),
  ]);

  assert.equal(result.price, 100_000);
  assert.equal(result.confidence, 'low');
  assert.equal(result.low_confidence, true);
});

test('out of stock and unknown stock offers do not set the median', () => {
  const result = medianPrice([
    offer({ price: 90_000 }),
    offer({ price: 10_000, in_stock: 'false' }),
    offer({ price: 10_000, in_stock: 'unknown', seller_id: 'seller-3' }),
  ]);

  assert.equal(result.price, 90_000);
  assert.equal(result.offer_count, 1);
});

test('excluded and review required offers do not set the median', () => {
  const result = medianPrice([
    offer({ price: 90_000 }),
    offer({ price: 10_000, status: 'excluded', seller_id: 'seller-2' }),
    offer({ price: 11_000, status: 'review_required', seller_id: 'seller-3' }),
  ]);

  assert.equal(result.price, 90_000);
  assert.equal(result.offer_count, 1);
});

test('an empty pool has no price', () => {
  const result = medianPrice([]);
  assert.equal(result.price, null);
  assert.equal(result.confidence, 'none');
  assert.equal(result.low_confidence, false);
});

test('a price inside 15 percent publishes itself', () => {
  assert.ok(withinBand(115_000, 100_000));
  assert.ok(withinBand(85_000, 100_000));
  assert.ok(withinBand(100_000, 100_000));
  assert.ok(!withinBand(116_000, 100_000));
  assert.ok(!withinBand(84_000, 100_000));
  assert.ok(!withinBand(100_000, 0));
});

test('an offer id carries the source site', () => {
  assert.equal(offerId('jumia', 'L-123'), 'jumia:L-123');
});

test('the row description states the seller count, the price and the sites', () => {
  const description = buildDescription(3, '2026-11-13', 120000, ['jiji', 'jumia']);
  assert.equal(description, 'Aggregated from 3 sellers, last checked 2026-11-13. Median ₦120,000. Sources: jiji, jumia');
});
