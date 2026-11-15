// Checks the Worker scraper routes against a local D1 database. It proves
// the currency history, the queue claim and the publish support rules.
//
// Start the local Worker first, then run npm run check:local.
// The runbook has the exact commands. See docs/scraper-runbook.md.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const WORKER_URL = (process.env.WORKER_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'local-route-check';

function findLocalDatabase(): string {
  const folder = join(process.cwd(), '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  if (!existsSync(folder)) throw new Error(`No local D1 folder at ${folder}.`);
  const files = readdirSync(folder)
    .filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map((name) => join(folder, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (files.length === 0) throw new Error(`No local D1 database file in ${folder}.`);
  return files[0];
}

const database = new DatabaseSync(process.env.LOCAL_D1_PATH ?? findLocalDatabase());

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const response = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      'x-admin-key': ADMIN_PASSWORD,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const now = new Date().toISOString();
const checks: string[] = [];

function pass(name: string) {
  checks.push(name);
  console.log(`pass: ${name}`);
}

async function main() {
  const health = await fetch(`${WORKER_URL}/healthz`);
  assert.equal(health.status, 200, 'the local Worker must answer /healthz');
  pass('the local Worker answers');

  // A dollar offer keeps its raw price, and the naira value moves with the
  // rate. The move belongs in the price history.
  const usdOffer = {
    source_site: 'jumia',
    source_listing_id: 'route-check-usd',
    source_url: 'https://www.jumia.com.ng/route-check-usd.html',
    seller_id: 'route-check-seller',
    seller_name: 'Route Check Seller',
    price: 100,
    currency: 'USD',
    price_ngn: 140_000,
    price_ngn_rounded: 140_000,
    fx_rate: 1400,
    fx_rate_date: now,
    fx_source: 'nairadaily.net',
    price_kind: 'cash',
    unit_basis: 'piece',
    condition: 'new',
    in_stock: 'true',
    trust_tier: 'verified',
    stated_specs: { name: 'Route Check 550W Panel', brand: 'Route Check', watts: 550 },
    status: 'qualified',
    last_checked: now,
    scraped_at: now,
  };
  const first = await api('/api/scraper/offers', {
    method: 'POST',
    body: JSON.stringify({ offers: [usdOffer] }),
  });
  assert.equal(first.status, 200);
  const second = await api('/api/scraper/offers', {
    method: 'POST',
    body: JSON.stringify({ offers: [{ ...usdOffer, price_ngn: 150_000, price_ngn_rounded: 150_000, fx_rate: 1500 }] }),
  });
  assert.equal(second.status, 200);

  const history = database
    .prepare("SELECT price, reason, currency FROM price_history WHERE offer_id = ? ORDER BY id")
    .all('jumia:route-check-usd') as Array<{ price: number; reason: string; currency: string }>;
  const last = history[history.length - 1];
  assert.ok(last, 'the rate move must land in the price history');
  assert.equal(last.reason, 'fx_change');
  assert.equal(last.price, 150_000);
  assert.equal(last.currency, 'NGN');
  assert.ok(
    !history.some((row) => row.reason === 'offer_change'),
    'the raw price did not change, so no offer change belongs in the history',
  );
  pass('a rate move on an unchanged dollar quote lands in the price history');

  // The queue gives a row to one reader only, and a failed row waits before
  // it is tried again.
  const hash = 'a'.repeat(64);
  // A row from an earlier run must not hide the result of this one.
  database.prepare('DELETE FROM scraper_queue WHERE image_hash = ?').run(hash);
  const queued = await api('/api/scraper/queue', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ offer_id: 'jumia:route-check-usd', image_url: 'https://example.test/panel.jpg', image_hash: hash }],
    }),
  });
  assert.equal(queued.status, 200);

  const claim = await api('/api/scraper/queue?limit=5');
  const claimed = claim.body.find((item: { image_hash: string }) => item.image_hash === hash);
  assert.ok(claimed, 'the queue row must be handed out');
  const secondClaim = await api('/api/scraper/queue?limit=5');
  assert.ok(
    !secondClaim.body.some((item: { image_hash: string }) => item.image_hash === hash),
    'the same row must not be handed out twice',
  );
  pass('the queue hands a row to one reader only');

  const failed = await api(`/api/scraper/queue/${encodeURIComponent(claimed.id)}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'failed', error: 'the gateway refused the image' }),
  });
  assert.equal(failed.status, 200);
  const afterFailure = await api('/api/scraper/queue?limit=5');
  assert.ok(
    !afterFailure.body.some((item: { image_hash: string }) => item.image_hash === hash),
    'a failed row must wait before the next try',
  );
  database
    .prepare("UPDATE scraper_queue SET updated_at = datetime('now', '-20 minutes') WHERE image_hash = ?")
    .run(hash);
  const retry = await api('/api/scraper/queue?limit=5');
  const retried = retry.body.find((item: { image_hash: string }) => item.image_hash === hash);
  assert.ok(retried, 'a failed row must be tried again after the wait');
  assert.equal(retried.attempts, 2);
  pass('a failed queue row is tried again after the wait');

  // A published price comes from the offers that the candidate lists, not
  // from every offer that shares the canonical id.
  const canonical = 'sc-route-check-panel';
  const listed = {
    source_site: 'jumia',
    source_listing_id: 'route-check-listed',
    source_url: 'https://www.jumia.com.ng/route-check-listed.html',
    canonical_id: canonical,
    seller_id: 'route-check-listed-seller',
    seller_name: 'Listed Seller',
    price: 100_000,
    currency: 'NGN',
    price_ngn: 100_000,
    price_ngn_rounded: 100_000,
    price_kind: 'cash',
    unit_basis: 'piece',
    condition: 'new',
    in_stock: 'true',
    trust_tier: 'verified',
    stated_specs: { name: 'Route Check 550W Panel', brand: 'Route Check', watts: 550, voc: 49.9, isc: 13.9 },
    status: 'qualified',
    last_checked: now,
    scraped_at: now,
  };
  const unlisted = {
    ...listed,
    source_site: 'jiji',
    source_listing_id: 'route-check-unlisted',
    source_url: 'https://jiji.ng/route-check-unlisted',
    seller_id: 'route-check-unlisted-seller',
    seller_name: 'Unlisted Seller',
    price: 50_000,
    price_ngn: 50_000,
    price_ngn_rounded: 50_000,
  };
  const saved = await api('/api/scraper/offers', {
    method: 'POST',
    body: JSON.stringify({ offers: [listed, unlisted] }),
  });
  assert.equal(saved.status, 200);

  const candidateId = 'candidate:route-check';
  const candidate = {
    id: candidateId,
    canonical_id: canonical,
    bucket_key: 'route-check|watts=550',
    product_type: 'panel',
    status: 'suggested',
    proposed_data: { name: 'Route Check 550W Panel', brand: 'Route Check', watts: 550, voc: 49.9, isc: 13.9 },
    proposed_price: 100_000,
    offer_ids: ['jumia:route-check-listed'],
    source_urls: [listed.source_url],
    provenance: [],
    risk_flags: [],
  };
  const savedCandidate = await api('/api/scraper/candidates', {
    method: 'POST',
    body: JSON.stringify({ candidates: [candidate] }),
  });
  assert.equal(savedCandidate.status, 200);

  const published = await api(`/api/scraper/candidates/${encodeURIComponent(candidateId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ reviewer: 'route-check' }),
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  const row = database.prepare('SELECT description FROM hardware WHERE id = ?').get(canonical) as {
    description: string;
  };
  assert.match(row.description, /Aggregated from 1 sellers/, row.description);
  assert.ok(!row.description.includes('jiji'), row.description);
  pass('a published price uses only the offers that the candidate lists');

  const emptyCandidate = { ...candidate, id: 'candidate:route-check-empty', offer_ids: [] };
  const savedEmpty = await api('/api/scraper/candidates', {
    method: 'POST',
    body: JSON.stringify({ candidates: [emptyCandidate] }),
  });
  assert.equal(savedEmpty.status, 200);
  const stale = await api('/api/scraper/candidates/candidate%3Aroute-check-empty/publish', {
    method: 'POST',
    body: JSON.stringify({ reviewer: 'route-check' }),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'stale-candidate');
  pass('a candidate without offers cannot publish');

  console.log(`\n${checks.length} checks passed against ${WORKER_URL}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
