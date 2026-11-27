import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_STATUSES,
  OFFER_STATUSES,
  REASON_CODES,
  TRUST_TIERS,
  buildDescription,
  candidateUnchanged,
  candidateValues,
  handleScraperRoute,
  isCandidateStatus,
  isOfferStatus,
  isReasonCode,
  isTrustTier,
  isQualifiedPublishSupport,
  medianPrice,
  offerId,
  validateEnrichmentResult,
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

test('a candidate that did not change is not written again', () => {
  const candidate = {
    id: 'candidate:one',
    canonical_id: 'canonical:one',
    bucket_key: 'bucket:one',
    current_hardware_row: 'panel:one',
    product_type: 'panel',
    status: 'new',
    proposed_data: { watts: 450 },
    proposed_price: 75015,
    current_price: 70000,
    offer_ids: ['jumia:1'],
    source_urls: ['https://www.jumia.com.ng/one.html'],
    provenance: [{ kind: 'page' }],
    risk_flags: [],
  };
  const values = candidateValues(candidate);

  // A row that does not exist yet must be written.
  assert.equal(candidateUnchanged(null, values), false);

  // The same values as the stored row need no write.
  const stored = { id: 'candidate:one', ...values };
  assert.equal(candidateUnchanged(stored, values), true);

  // A changed price needs a write.
  assert.equal(candidateUnchanged({ ...stored, proposed_price: 70000 }, values), false);

  // A decision that a human made is kept, so the same values need no write.
  assert.equal(candidateUnchanged({ ...stored, status: 'rejected' }, values), true);
  assert.equal(
    candidateUnchanged(
      { ...stored, status: 'rejected' },
      candidateValues({ ...candidate, proposed_price: 70000 }),
    ),
    false,
  );
});

test('the row description states the seller count, the price and the sites', () => {
  const description = buildDescription(3, '2026-11-13', 120000, ['jiji', 'jumia']);
  assert.equal(description, 'Aggregated from 3 sellers, last checked 2026-11-13. Median ₦120,000. Sources: jiji, jumia');
});

test('the WhatsApp alert refuses to run without its settings', async () => {
  const request = new Request('https://worker.test/api/scraper/alert', {
    method: 'POST',
    body: JSON.stringify({ message: 'the sweep did not run' }),
  });

  const response = await handleScraperRoute(
    request,
    { DB: {} } as any,
    '/api/scraper/alert',
    'POST',
  );

  assert.ok(response);
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /not configured/);
});

test('the WhatsApp alert sends text without a template and a template with one', async () => {
  const calls: { url: string; body: any }[] = [];
  let deliveryStatus = 'delivered';
  const original = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    if (init?.method === 'POST') {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        kapso: {
          status: deliveryStatus,
          statuses: [{ errors: [{ message: 'Re-engagement message' }] }],
        },
      }),
      { status: 200 },
    );
  };

  const env = {
    KAPSO_API_KEY: 'key',
    KAPSO_PHONE_NUMBER_ID: '597907523413541',
    KAPSO_ALERT_TO: '2348000000000',
    DB: {},
  } as any;

  const alert = (message: string, routeEnv: any = env) =>
    handleScraperRoute(
      new Request('https://worker.test/api/scraper/alert', {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
      routeEnv,
      '/api/scraper/alert',
      'POST',
    );

  try {
    const textResponse = await alert('the sweep did not run');
    assert.equal(textResponse?.status, 200);
    assert.equal(calls[0].url, 'https://api.kapso.ai/meta/whatsapp/v23.0/597907523413541/messages');
    assert.equal(calls[0].body.type, 'text');
    assert.equal(calls[0].body.text.body, 'the sweep did not run');
    assert.equal(calls[0].body.to, '2348000000000');
    const textBody = (await textResponse?.json()) as { delivery: string };
    assert.equal(textBody.delivery, 'delivered');

    const templateResponse = await alert(
      'the sweep did not run',
      { ...env, KAPSO_TEMPLATE_NAME: 'solar_sizer_alert' },
    );
    assert.equal(templateResponse?.status, 200);
    assert.equal(calls[1].body.type, 'template');
    assert.equal(calls[1].body.template.name, 'solar_sizer_alert');
    assert.equal(calls[1].body.template.language.code, 'en');
    assert.equal(calls[1].body.template.components[0].parameters[0].parameter_name, 'message');

    deliveryStatus = 'failed';
    const rejected = await alert('the sweep did not run');
    assert.equal(rejected?.status, 502);
    const rejectedBody = (await rejected?.json()) as { error: string; detail: string };
    assert.match(rejectedBody.detail, /Re-engagement message/);
  } finally {
    (globalThis as any).fetch = original;
  }
});

test('a review needs candidate ids and a known status', async () => {
  const env = { DB: {} } as any;

  const noIds = await handleScraperRoute(
    new Request('https://worker.test/api/scraper/candidates/review', {
      method: 'POST',
      body: JSON.stringify({ status: 'approved' }),
    }),
    env,
    '/api/scraper/candidates/review',
    'POST',
  );
  assert.equal(noIds?.status, 400);

  const badStatus = await handleScraperRoute(
    new Request('https://worker.test/api/scraper/candidates/review', {
      method: 'POST',
      body: JSON.stringify({ ids: ['candidate:one'], status: 'weird' }),
    }),
    env,
    '/api/scraper/candidates/review',
    'POST',
  );
  assert.equal(badStatus?.status, 400);
});

test('an enrichment result accepts known fields and drops empty readings', () => {
  assert.deepEqual(
    validateEnrichmentResult({ watts: 550, voc: null, battery_type: 'lithium' }),
    { watts: 550, battery_type: 'lithium' },
  );
  assert.throws(() => validateEnrichmentResult({ watts: -1 }), /positive number/);
  assert.throws(() => validateEnrichmentResult({ invented: 3 }), /unknown field/);
});

test('an enrichment result accepts the battery parallel limit and the C-rate', () => {
  // A battery label carries the parallel limit and the C-rate, so a battery row
  // can publish on a read value instead of waiting forever for a human.
  assert.deepEqual(
    validateEnrichmentResult({
      voltage_v: 51.2,
      capacity_ah: 314,
      battery_type: 'lithium',
      max_parallel_strings: 4,
      min_c_rate: 0.5,
    }),
    {
      voltage_v: 51.2,
      capacity_ah: 314,
      battery_type: 'lithium',
      max_parallel_strings: 4,
      min_c_rate: 0.5,
    },
  );
  // A zero is a hidden value, not a reading, so a zero C-rate is dropped.
  assert.deepEqual(
    validateEnrichmentResult({ voltage_v: 12, min_c_rate: 0 }),
    { voltage_v: 12 },
  );
});

test('an enrichment result drops the zeros that the model reads for a hidden value', () => {
  // The model writes zero for a value it cannot see, so a battery picture
  // comes back with zero watts and zero efficiency. Zero is not a reading.
  assert.deepEqual(
    validateEnrichmentResult({
      watts: 0,
      voc: 0,
      isc: 0,
      voltage_v: 25.6,
      capacity_ah: 176,
      capacity_kwh: 4.5,
      battery_type: 'lithium',
      cell_type: 'LiFePO4',
      efficiency_pct: 0,
    }),
    {
      voltage_v: 25.6,
      capacity_ah: 176,
      capacity_kwh: 4.5,
      battery_type: 'lithium',
      cell_type: 'LiFePO4',
    },
  );
});

test('only a fresh qualified offer can support a published price', () => {
  const now = Date.parse('2026-11-14T00:00:00.000Z');
  const support = {
    status: 'qualified',
    in_stock: 'true',
    unit_basis: 'piece',
    condition: 'new',
    price: 100_000,
    last_checked: '2026-11-13T00:00:00.000Z',
  };
  assert.equal(isQualifiedPublishSupport(support, now), true);
  assert.equal(isQualifiedPublishSupport({ ...support, status: 'review_required' }, now), false);
  assert.equal(isQualifiedPublishSupport({ ...support, last_checked: '2026-10-30T00:00:00.000Z' }, now), false);
});
