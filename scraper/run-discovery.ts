// The weekly discovery crawl. It walks the watchlist paths, opens the product
// pages it finds and adds the new offers to the pool.
//
// Run it with: node --experimental-strip-types scraper/run-discovery.ts

import { randomUUID } from 'node:crypto';
import { adapterFor } from './adapters/index.ts';
import { loadFxRate } from './fx.ts';
import { configureRequestBudgets, requestReport, resetRequestState } from './http.ts';
import { offerKey, rebuildAndPublish, rowToPayload } from './run-common.ts';
import type { OfferPayload } from './run-common.ts';
import { allDiscoveryPaths, isBlocked, loadWatchlist } from './watchlist.ts';
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
  const fx = await loadFxRate();
  const overrideBudget = Number(process.env.SCRAPER_SOURCE_REQUEST_BUDGET);
  const fallbackBudget = Number.isFinite(overrideBudget) ? overrideBudget : 100;
  const sourceBudgets = watchlist.source_budgets?.discovery ?? {
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
  const paths = allDiscoveryPaths(watchlist);
  const known = new Set(previous.map((row) => row.source_url));

  const changed: OfferPayload[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  let pages = 0;

  for (const path of paths) {
    if (isBlocked(watchlist, path.site, path.url)) {
      skipped.push({ id: path.url, reason: 'the path is blocked by the site rules' });
      continue;
    }
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
      if (isBlocked(watchlist, listing.source_site, listing.source_url)) {
        skipped.push({ id: listing.source_url, reason: 'the path is blocked by the site rules' });
        continue;
      }

      const result = await adapter.crawlProduct(listing.source_url, { imageUrl: listing.image_url });
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
    fx,
  });

  let purged = 0;
  let purgeError: string | null = null;
  try {
    purged = await client.purgeOldOffers();
  } catch (error) {
    purgeError = error instanceof Error ? error.message : String(error);
  }

  const report = {
    pages,
    found: changed.length,
    skipped,
    candidates: rebuilt.candidates,
    published: rebuilt.published,
    excluded: rebuilt.excluded,
    collapsed: rebuilt.excluded.filter((entry) => entry.reason_code === 'duplicate_of_existing_offer').length,
    cross_posts: rebuilt.cross_posts,
    fx,
    requests: requestReport(),
    purged,
    purge_error: purgeError,
    publish_errors: rebuilt.publish_errors,
  };

  await client.reportRun({
    run_id: runId,
    kind: 'discovery',
    status:
      skipped.length > 0 || rebuilt.publish_errors.length > 0 || purgeError
        ? 'partial'
        : 'ok',
    sources: [...new Set(paths.map((path) => path.site))],
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
