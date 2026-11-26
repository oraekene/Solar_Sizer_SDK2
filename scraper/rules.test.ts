import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_THRESHOLDS,
  hashDistance,
  medianPrice,
  readThresholds,
  roundPrice,
} from './rules.ts';

const offer = (price: number) => ({
  price,
  status: 'qualified',
  in_stock: 'true',
  trust_tier: 'verified',
  seller_id: `seller-${price}`,
});

test('a naira median is rounded to the nearest hundred', () => {
  assert.equal(roundPrice(28_499), 28_500);
  assert.equal(roundPrice(28_450), 28_500);
  assert.equal(medianPrice([offer(100_050), offer(100_150)]).price, 100_100);
});

test('the stored thresholds sit over the code defaults', () => {
  const thresholds = readThresholds({ price_band: 0.25, not_found_strikes: 5 });
  assert.equal(thresholds.price_band, 0.25);
  assert.equal(thresholds.not_found_strikes, 5);
  assert.equal(thresholds.price_outlier_share, DEFAULT_THRESHOLDS.price_outlier_share);
});

test('a wrong threshold keeps the default', () => {
  const thresholds = readThresholds({ price_band: 'wide', unverified_after_days: -3 });
  assert.equal(thresholds.price_band, DEFAULT_THRESHOLDS.price_band);
  assert.equal(thresholds.unverified_after_days, DEFAULT_THRESHOLDS.unverified_after_days);
});

test('two image hashes count the bits that differ', () => {
  assert.equal(hashDistance('0000000000000000', '0000000000000000'), 0);
  assert.equal(hashDistance('0000000000000000', '000000000000000f'), 4);
  assert.equal(hashDistance('0000', '00'), Number.POSITIVE_INFINITY);
});
