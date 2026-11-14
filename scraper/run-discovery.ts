// The weekly discovery crawl. It walks the watchlist paths, opens the product
// pages it finds and adds the new offers to the pool.
//
// Run it with: node --experimental-strip-types scraper/run-discovery.ts

import { randomUUID } from 'node:crypto';
import { adapterFor } from './adapters/index.ts';
import { offerKey, rebuildAndPublish, rowToPayload } from './run-common.ts';
import type { OfferPayload } from './run-common.ts';
import { loadWatchlist } from './watchlist.ts';
import { WorkerClient } from './worker-client.ts';

const PAGE_CEILING = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const workerUrl = process.env.WORKER_URL;
  const adminKey = process.env.ADMIN_PASSWORD;
  if (!workerUrl || !adminKey) {
    throw new Error('WORKER_URL and ADMIN_PASSWORD must be set.');
  }

  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const pageBudget = Number(process.env.SCRAPER_PAGE_BUDGET ?? PAGE_CEILING);
  const delayMax = Number(process.env.SCRAPER_START_DELAY_MS ?? 15 * 60 * 1000);

  if (delayMax > 0) await sleep(Math.floor(Math.random() * delayMax));

  const client = new WorkerClient(workerUrl, adminKey);
  const watchlist = await loadWatchlist();
  const previous = await client.listOffers();
  const known = new Set(previous.map((row) => row.source_url));

  const changed: OfferPayload[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let pages = 0;

  for (const path of watchlist.discovery_paths) {
    const adapter = adapterFor(path.site);
    if (!adapter) {
      skipped.push({ id: path.url, reason: `no adapter for ${path.site}` });
      continue;
    }
    if (pages >= pageBudget) {
      skipped.push({ id: path.url, reason: 'the page budget was spent' });
      continue;
    }

    const category = await adapter.crawlCategory(path.url);
    pages += 1;
    if (!category.value) {
      skipped.push({ id: path.url, reason: category.error ?? `status ${category.status}` });
      continue;
    }

    for (const listing of category.value) {
      if (pages >= pageBudget) {
        skipped.push({ id: listing.source_url, reason: 'the page budget was spent' });
        break;
      }
      if (known.has(listing.source_url)) continue;

      const result = await adapter.crawlProduct(listing.source_url);
      pages += 1;
      if (!result.value) {
        skipped.push({ id: listing.source_url, reason: result.error ?? `status ${result.status}` });
        continue;
      }
      known.add(listing.source_url);
      changed.push(result.value);
    }
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
  });

  const report = {
    pages,
    found: changed.length,
    skipped,
    candidates: rebuilt.candidates,
    published: rebuilt.published,
    publish_errors: rebuilt.publish_errors,
  };

  await client.reportRun({
    run_id: runId,
    kind: 'discovery',
    status: skipped.length > 0 || rebuilt.publish_errors.length > 0 ? 'partial' : 'ok',
    sources: [...new Set(watchlist.discovery_paths.map((path) => path.site))],
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
