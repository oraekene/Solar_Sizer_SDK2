# Scraper implementation defaults

**Date:** 2026-11-14. **Purpose:** list every number, fallback and implicit choice that the code makes but `docs/scraper-design.md` does not spell out. Read this before changing a limit, because most of these values live in one constant and have no runtime setting.

The design remains the source of truth for behaviour. This file only records the defaults that implement it.

## 1. Requests, pacing and budgets

| Default | Value | Where | How to change |
| --- | --- | --- | --- |
| Global gap between requests | 1000 ms across all sources | `scraper/http.ts`, `MIN_GAP_MS` and `lastRequestAt` | Edit the constant. The gap is shared, so two sources never request at the same instant. |
| Text request timeout | 30 seconds | `scraper/http.ts` | Edit `REQUEST_TIMEOUT_MS`. |
| Text attempts | 3 | `fetchText` | Pass `attempts`, or edit the default. |
| Image attempts and timeout | 2 attempts, 30 seconds each | `fetchBinary` | Pass `attempts`, or edit the default. |
| Backoff on a 429 or 503 | 2 seconds times the attempt, plus 0 to 1 second of random jitter | `fetchText` and `fetchBinary` | Edit the sleep expression. |
| Backoff on a network error | 1 second times the attempt | `fetchText` and `fetchBinary` | Edit the sleep expression. |
| A 403 answer | Pauses the source for the rest of the run, with no retry | `fetchText` and `fetchBinary` | The pause is deliberate. Remove only with a new decision. |
| A final 429 or 503 answer | Pauses the source for the rest of the run | `fetchText` and `fetchBinary` | Same. |
| Budget exhaustion | Pauses the source for the rest of the run | `takeRequestSlot` | Same. |
| Sweep budgets | Jiji 300, Jumia 250, SolarShopNigeria 100 | `docs/scraper-watchlist.json`, `source_budgets.sweep` | Edit the watchlist. Product pages and image downloads both count. |
| Discovery budgets | Jiji 120, Jumia 100, SolarShopNigeria 40 | `docs/scraper-watchlist.json`, `source_budgets.discovery` | Edit the watchlist. |
| One budget for every source | Overrides the watchlist when set | `SCRAPER_SOURCE_REQUEST_BUDGET` | Use only for a test or a one-off run. |
| Daily sweep ceiling | 500 offer checks | `scraper/run-sweep.ts`, `CHECK_CEILING` | `SCRAPER_MAX_CHECKS`. |
| Weekly discovery page ceiling | 200 pages | `scraper/run-discovery.ts`, `PAGE_CEILING` | `SCRAPER_PAGE_BUDGET`. Category and product pages both count. |
| Start delay | A random wait from 0 to 15 minutes | Both runners | `SCRAPER_START_DELAY_MS`. Set `0` for a manual run. |
| FX fetch | 15 second timeout, no pacing, no source budget | `scraper/fx.ts` | The FX call is a direct fetch outside the shared client. Edit the timeout in `fetchRate`. |
| Crawler user agent | `SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)` | `scraper/adapters/types.ts`, `CRAWLER_UA` | Edit the constant. The contact address must stay real. |

The run report carries `requests.requests`, `requests.budgets`, `requests.paused_sources` and `requests.pause_reasons`. The pause reason names the source and why it stopped, for example `the jiji request budget was spent`.

## 2. Scheduling and what a run touches

| Default | Value | Where |
| --- | --- | --- |
| Sweep schedule | Every day at 01:00 UTC, which is 02:00 West Africa time | `.github/workflows/scraper-sweep.yml` |
| Discovery schedule | Sunday at 02:00 UTC, which is 03:00 West Africa time | `.github/workflows/scraper-discovery.yml` |
| Watchdog schedule | Every day at 05:00 UTC, which is 06:00 West Africa time | `.github/workflows/scraper-watchdog.yml` |
| Sweep eligibility | A last check at least 24 hours old | `isDue` in `scraper/run-sweep.ts` |
| Sweep selection | Round robin across sources, so one large source cannot spend the whole ceiling | `takeDue` |
| Excluded offers | Skipped by the sweep, except `usd_rate_unavailable`, which is retried so a recovered rate can qualify it | `scraper/run-sweep.ts` |
| Blocked paths | Skipped before any request, and the skip appears in the report | `isBlocked` in `scraper/watchlist.ts` |
| Known discovery URLs | Skipped by exact `source_url` | `run-discovery.ts` |
| Discovery path order | Category and brand paths alternate, priority brand paths first among the brands, then the confirmed SolarShopNigeria slugs | `allDiscoveryPaths` |
| Alert threshold | No complete sweep for 26 hours (`93600` seconds), or a partial sweep newer than the last complete one | `scraper-watchdog.yml` |
| Alert success test | Only a run with status `ok` counts as a complete sweep | `run_report` write in `worker/scraper.ts` |

A `partial` sweep leaves a source unfinished, so it raises the alert with the run id of the partial run. The run report holds the pause reason.

## 3. Money, FX and the publish band

| Default | Value | Where |
| --- | --- | --- |
| FX source order | NairaDaily first, then open.er-api.com | `scraper/fx.ts`, `FX_URLS` |
| FX maximum age | 7 days | `MAX_FX_AGE_DAYS` |
| FX plausibility band | 100 to 10,000 naira per dollar. A payload outside the band is refused and the next source is tried. | `MIN_FX_RATE` and `MAX_FX_RATE` |
| FX future tolerance | 24 hours | `isFreshFxRate` |
| Currencies converted | USD only | `applyFxRate` |
| Any other currency with a price | `review_required` with `usd_rate_unavailable`, never a median | `applyFxRate` |
| Naira offer fields | `price_ngn` equals the raw price, `price_ngn_rounded` stays null | `applyFxRate` |
| Converted fields | `price_ngn` exact, `price_ngn_rounded` to the nearest 100, rate, rate date and source stored | `applyFxRate` |
| Median rounding | Nearest 100 naira | `roundPrice` in `scraper/rules.ts` |
| Price outlier share | 60 percent of the median, applied in two passes | `PRICE_OUTLIER_SHARE` and `removePriceOutliers` |
| Auto-publish band | 15 percent of the current price | `withinBand`, default `0.15` |
| A candidate with no catalogue row | `new` | `proposeCandidates` |
| A scraped row inside the band | `suggested`, which publishes itself | `proposeCandidates` |
| A manual row | Always `pending_review`, even inside the band | `proposeCandidates` |
| A scraped row outside the band | `pending_review` with the flag `price outside the 15% band` | `proposeCandidates` |
| Unknown-only price pool | `pending_review` with the flag `low confidence price` | `proposeCandidates` |
| One seller only | A flag, not a block | `proposeCandidates` |
| Numeric seller disagreement | More than 1 percent relative difference adds `sellers disagree on <field>` and forces review | `proposeCandidates` |
| Missing calculator field | Adds `missing <field>` and forces review | `proposeCandidates` |

A price that is exactly on either edge of the band counts as inside it, because the test is `<= 0.15`.

## 4. Trust and condition

| Source | Verified | Established | Everything else |
| --- | --- | --- | --- |
| Jumia | The seller URL matches `marketplace-vendor` or `mlp-` | Product rating at least 4 with at least 10 reviews | `unknown` |
| Jiji | The seller badges include `verified` | A badge of `2+ years` or more | `unknown` |
| SolarShopNigeria | The brand is on the shop's official brand list | Any other brand the shop sells | `unknown` |

The official brand list lives in `scraper/adapters/solarshopnigeria.ts`, `OFFICIAL_BRANDS`. The trust thresholds are constants, so a change needs a deploy.

Condition mapping is shared by the two marketplace adapters. `foreign` becomes `foreign_used`; `refurb` or `open box` becomes `refurbished`; `used`, `swap` or `slightly used` becomes `used`; `new` becomes `new`; anything else is `unknown`. Used, foreign used and refurbished offers are excluded at the adapter, before the median.

## 5. Identity, duplicates and field choice

| Default | Value | Where |
| --- | --- | --- |
| Offer key | `source_site:source_listing_id` | `offerKey` in `scraper/run-common.ts` |
| Identical ad collapse | Same source, same seller, same raw price and currency, same SHA-256 image hash | `collapseIdenticalOffers` |
| Same photo, different price | A cross-post signal on both offers, not a collapse | `collapseIdenticalOffers` |
| Cross-post signal lifetime | Removed when either offer leaves the current pool | `applyCrossPostSignals` |
| Candidate grouping | Family key plus model | `proposeCandidates` |
| Catalogue row match | Exact canonical id first, then a `same` identity match | `proposeCandidates` |
| Weaker catalogue match | A `possible duplicate of <id>` flag and review | `proposeCandidates` |
| Field precedence | `datasheet`, then `stated`, then `pool`, then `model_parse`, then unknown | `fieldValue` |
| Image-enriched field | Adds an `image-enriched <field>` flag and review | `proposeCandidates` |
| Unit basis change | Forces review | `rebuildAndPublish` |
| Unbranded panel peers | Highest Voc and lowest Isc of the branded peers of the same wattage | `peerTable` and `proposeCandidates` |

## 6. Publish rules

| Default | Value | Where |
| --- | --- | --- |
| A rejected or duplicate candidate | Cannot publish | `worker/scraper.ts` publish route |
| A candidate with no fresh qualified offer | Refused with `stale-candidate` | Same route |
| A row missing a calculator field | Refused with `missing-specs` and the field list | `missingSpecs` |
| A manual row | Refused unless the request carries `accept_manual: true` | Same route |
| Row id | The current hardware row id when one exists, else the canonical id | Same route |
| Tags | Product type and `scraped`, plus `representative` for a bucket key and `estimated-specs` for a derived field | Same route |
| Description | `Aggregated from N sellers, last checked <date>. Median ₦X. Sources: ...` | `buildDescription` |
| Price history | A `publish` row is appended only when the price changes | Same route |
| Manual conversion | A manual row that publishes becomes `price_source: scraped` | Same route |

`missingSpecs` requires watts, Voc and Isc for a panel, and voltage, capacity, type, parallel limit and C-rate for a battery.

## 7. Retention, queue and admin

| Default | Value | Where |
| --- | --- | --- |
| Page JSON retention | 90 days from `raw_payload_at`, then the payload becomes `{}` | `/api/scraper/offers/purge` |
| Staleness | A qualified offer with no check for 14 days becomes `review_required` with `unverified_stale` | `/api/scraper/offers` |
| Image storage | A SHA-256 hash only; no image and no thumbnail | `scraper/image.ts` |
| Image fetch cache | One process, keyed by image URL | `collectImageFacts` |
| Queue item validation | Offer id, HTTP or HTTPS image URL, 64 character hex hash | `/api/scraper/queue` |
| Queue deduplication | One row per image hash | Same route |
| Queue request size | At most 100 items | Same route |
| Queue claim | The read and the claim are one statement, so two drainers cannot take the same row | Same route |
| Queue retry | A failed row is tried again after 15 minutes, up to 3 attempts | `MAX_QUEUE_ATTEMPTS` and `QUEUE_RETRY_WAIT_MINUTES` |
| Offer save chunk | 12 offers per Worker request | `WorkerClient.saveOffers` |
| Candidate save chunk | 40 candidates per Worker request | `WorkerClient.saveCandidates` |
| Worker client timeout | 30 seconds per request | `WorkerClient.request` |
| Offer list ceiling | 5000 rows | `/api/scraper/offers` |
| Run list default | 10 rows, at most 100 | `/api/scraper/runs` |
| Candidate list default | 100 rows, at most 500 | `/api/scraper/candidates` |
| Drainer poll | 30 seconds | `DRAINER_POLL_MS` |
| Drainer model | `auto` | `DRAINER_MODEL` |
| Gateway address | `http://127.0.0.1:3001` | `GATEWAY_URL` |
| Admin lockout | 5 failed attempts, then 15 minutes | `worker/index.ts` |

## 8. Alerts

| Default | Value | Where |
| --- | --- | --- |
| Kapso endpoint | `https://api.kapso.ai/meta/whatsapp/v23.0/<phone number id>/messages` | `worker/scraper.ts` |
| Template language | `en` | Same route |
| Template body parameters | One named parameter, `message` | Same route |
| Missing Kapso secret | The route answers `503` and the watchdog continues | Same route |
| Kapso refusal | The route answers `502` with the first 300 characters of the answer | Same route |
| Kapso timeout | 15 seconds | Same route |
| Issue behaviour | Open one issue, comment on later failures, never close it automatically | `scraper-watchdog.yml` |

The alert body names the last successful sweep time or says `never`. The watchdog exits with a failure after it raises the alert, so the Actions run also shows red.

## 9. Tests

`npm test` runs 32 Worker tests and 70 scraper tests. The scraper tests cover the three adapters, the merge rules, the closed reason codes, FX, pacing and budgets, the watchlist loader and the image hash. All tests use saved fixtures and never touch the network.
