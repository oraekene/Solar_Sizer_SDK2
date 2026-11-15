import assert from 'node:assert/strict';
import test from 'node:test';
import { medianPrice, roundPrice } from './rules.ts';

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
