import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFxRate, FX_URLS, isFreshFxRate, parseFxPayload } from './fx.ts';

test('nairadaily is the primary source and the exchangerate API is the fallback', () => {
  assert.deepEqual(FX_URLS, [
    'https://nairadaily.net/api/rates?source=USD&target=NGN',
    'https://open.er-api.com/v6/latest/USD',
  ]);
});

test('the nairadaily rate shape is parsed with its date', () => {
  const parsed = parseFxPayload([
    { rate: 1402.55, source: 'USD', target: 'NGN', time: '2026-11-14T08:45:01+0000' },
  ]);
  assert.ok(parsed);
  assert.equal(parsed.rate, 1402.55);
  assert.equal(parsed.date, '2026-11-14T08:45:01.000Z');
});

test('the fallback rate shape is parsed with its date', () => {
  const parsed = parseFxPayload({
    rates: { NGN: 1352.36 },
    time_last_update_utc: 'Sat, 14 Nov 2026 00:02:31 +0000',
  });
  assert.ok(parsed);
  assert.equal(parsed.rate, 1352.36);
});

test('a rate older than seven days is refused', () => {
  assert.equal(
    isFreshFxRate(
      { rate: 1400, date: '2026-11-01T00:00:00.000Z', source: 'test' },
      new Date('2026-11-14T00:00:00.000Z'),
    ),
    false,
  );
  assert.equal(
    isFreshFxRate(
      { rate: 1400, date: '2026-11-07T00:00:00.000Z', source: 'test' },
      new Date('2026-11-14T00:00:00.000Z'),
    ),
    false,
  );
});

test('a dollar offer keeps its raw price and gains the naira values', () => {
  const offer = applyFxRate(
    { price: 99.99, currency: 'USD', status: 'qualified', reason_code: null },
    { rate: 1402.55, date: '2026-11-14T08:45:01.000Z', source: 'nairadaily.net' },
  );
  assert.equal(offer.price, 99.99);
  assert.equal(offer.currency, 'USD');
  assert.equal(offer.price_ngn_rounded, 140_200);
});

test('a dollar offer waits for a rate and recovers when one appears', () => {
  const waiting = applyFxRate(
    { price: 100, currency: 'USD', status: 'qualified', reason_code: null },
    null,
  );
  assert.equal(waiting.status, 'review_required');
  assert.equal(waiting.reason_code, 'usd_rate_unavailable');

  const restored = applyFxRate(waiting, {
    rate: 1400,
    date: '2026-11-14T08:45:01.000Z',
    source: 'nairadaily.net',
  });
  assert.equal(restored.status, 'qualified');
  assert.equal(restored.reason_code, null);
  assert.equal(restored.price_ngn_rounded, 140_000);
});
