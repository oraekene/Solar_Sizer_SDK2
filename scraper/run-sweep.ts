// The daily sweep. It re-checks the known offers, rebuilds the candidates and
// publishes the prices that stay inside the 15% band.
//
// Run it with: node --experimental-strip-types scraper/run-sweep.ts

import { randomUUID } from 'node:crypto';
import { adapterFor } from './adapters/index.ts';
import { loadFxRate } from './fx.ts';
import { configureRequestBudgets, requestReport, resetRequestState } from './http.ts';
import { NOT_FOUND_STRIKES } from './rules.ts';
import { offerKey, rebuildAndPublish, rowToPayload, selectedSources } from './run-common.ts';
import type { OfferPayload } from './run-common.ts';
import { isBlocked, loadWatchlist } from './watchlist.ts';
import { WorkerClient } from './worker-client.ts';
import type { WorkerOfferRow } from './worker-client.ts';

const CHECK_CEILING = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function isDue(lastChecked: string | null, now: number): boolean {
  if (!lastChecked) return true;
  const time = Date.parse(lastChecked);
  if (Number.isNaN(time)) return true;
  return now - time >= DAY_MS;
}

function takeDue(rows: WorkerOfferRow[], max: number): WorkerOfferRow[] {
  const queues = new Map<string, WorkerOfferRow[]>();
  for (const row of rows) {
    const queue = queues.get(row.source_site) ?? [];
    queue.push(row);
    queues.set(row.source_site, queue);
  }
  const indexes = new Map([...queues.keys()].map((source) => [source, 0]));
  const selected: WorkerOfferRow[] = [];
  while (selected.length < max) {
    let added = false;
    for (const [source, queue] of queues) {
      const index = indexes.get(source) ?? 0;
      if (index >= queue.length) continue;
      selected.push(queue[index]);
      indexes.set(source, index + 1);
      added = true;
      if (selected.length >= max) break;
    }
    if (!added) break;
  }
  return selected;
}

async function main(): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const adminKey = process.env.ADMIN_PASSWORD;
  if (!workerUrl || !adminKey) {
    throw new Error('WORKER_URL and ADMIN_PASSWORD must be set.');
  }

  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const sources = selectedSources(process.env.SCRAPER_SOURCES);
  const maxChecks = Number(process.env.SCRAPER_MAX_CHECKS ?? CHECK_CEILING);
  const delayMax = Number(process.env.SCRAPER_START_DELAY_MS ?? 15 * 60 * 1000);

  // The start delay hides the schedule from the sites.
  if (delayMax > 0) await sleep(Math.floor(Math.random() * delayMax));

  const client = new WorkerClient(workerUrl, adminKey);
  const watchlist = await loadWatchlist();
  const previous = await client.listOffers();
  const fx = await loadFxRate();
  const overrideBudget = Number(process.env.SCRAPER_SOURCE_REQUEST_BUDGET);
  const fallbackBudget = Number.isFinite(overrideBudget) ? overrideBudget : 250;
  const sourceBudgets = watchlist.source_budgets?.sweep ?? {
    jumia: fallbackBudget,
    jiji: fallbackBudget,
    solarshopnigeria: fallbackBudget,
  };
  resetRequestState();
  configureRequestBudgets(
    Number.isFinite(overrideBudget)
      ? { jumia: overrideBudget, jiji: overrideBudget, solarshopnigeria: overrideBudget }
      : sourceBudgets,
  );
  const now = Date.now();

  const eligible = previous.filter(
    (row) =>
      (!sources || sources.has(row.source_site)) &&
      (row.status !== 'excluded' || row.reason_code === 'usd_rate_unavailable') &&
      isDue(row.last_checked, now),
  );
  const due = takeDue(
    eligible.filter((row) => !isBlocked(watchlist, row.source_site, row.source_url)),
    maxChecks,
  );

  const changed: OfferPayload[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  for (const row of eligible.filter((entry) => isBlocked(watchlist, entry.source_site, entry.source_url))) {
    skipped.push({ id: row.id, reason: 'the path is blocked by the site rules' });
  }
  const strikes: string[] = [];

  for (const row of due) {
    const adapter = adapterFor(row.source_site);
    if (!adapter) {
      skipped.push({ id: row.id, reason: `no adapter for ${row.source_site}` });
      continue;
    }

    const result = await adapter.crawlProduct(row.source_url, {
      imageUrl: typeof row.trading_signals.image_url === 'string' ? row.trading_signals.image_url : null,
    });
    if (result.status === 404) {
      // A gone listing counts as a strike. A block or a timeout does not.
      const count = row.not_found_strikes + 1;
      changed.push({
        ...rowToPayload(row),
        not_found_strikes: count,
        status: count >= NOT_FOUND_STRIKES ? 'excluded' : 'review_required',
        reason_code: 'listing_not_found',
        last_checked: new Date().toISOString(),
        scraped_at: new Date().toISOString(),
      });
      strikes.push(row.id);
      continue;
    }
    if (!result.value) {
      skipped.push({ id: row.id, reason: result.error ?? `status ${result.status}` });
      continue;
    }
    changed.push(result.value);
  }

  const changedKeys = new Set(changed.map((offer) => offerKey(offer)));
  const pool: OfferPayload[] = [
    ...previous.filter((row) => !changedKeys.has(row.id)).map(rowToPayload),
    ...changed,
  ];

  const rebuilt = await rebuildAndPublish(client, {
    aliases: watchlist.aliases,
    changed,
    pool,
    previous,
    fx,
  });

  const report = {
    checked: due.length,
    changed: changed.length,
    skipped,
    strikes,
    candidates: rebuilt.candidates,
    published: rebuilt.published,
    excluded: rebuilt.excluded,
    collapsed: rebuilt.excluded.filter((entry) => entry.reason_code === 'duplicate_of_existing_offer').length,
    cross_posts: rebuilt.cross_posts,
    fx,
    requests: requestReport(),
    publish_errors: rebuilt.publish_errors,
  };

  await client.reportRun({
    run_id: runId,
    kind: 'sweep',
    status: skipped.length > 0 || rebuilt.publish_errors.length > 0 ? 'partial' : 'ok',
    // The selected sources name the run, even when no offer was due. The
    // watchdog reads this field to tell the runner sweeps from the Jiji
    // sweep on the owner machine.
    sources: sources
      ? [...sources].sort()
      : [...new Set(due.map((row) => row.source_site))].sort(),
    report,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  });

  console.log(JSON.stringify({ run_id: runId, ...report }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
