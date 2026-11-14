# Scraping decisions audit

**Date:** 2026-11-14. **Scope:** every open item that the design sessions listed, checked against `docs/scraper-design.md`, `docs/scraper-runbook.md`, `docs/scraper-watchlist.json` and the code in `scraper/`, `worker/` and `src/`.

This file answers one question for each item: is the decision written down, is the code built, and is anything still waiting on the owner.

## How to read the status column

| Status | Meaning |
| --- | --- |
| Built | The decision is written down and the code exists. |
| Settled | The decision is written down. The code will come when the phase needs it. |
| Deferred | The decision is written down and the work belongs to a later phase. |
| Open | The decision needs the owner, a paid account or a live check that only the owner can do. |

---

## 1. The twelve major decisions

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| Where the scrapers run | GitHub Actions runs the scrape. The Worker stores the data and serves the admin routes. The always-on host only enriches images, and it pulls from the Worker. | Design 3.1 and 5.1 | Built. The three workflows exist in `.github/workflows/`. The workflows have never run on a runner, because the stored Cloudflare token is invalid. |
| Extraction method | Plain HTTP fetches with HTML and JSON parsing. No headless browser, because the three phase-one sites send server-rendered pages. | Design 3.1 | Built. `scraper/http.ts` and the three adapters under `scraper/adapters/`. Jiji reads its JSON feed. |
| Discovery | Category crawls on Jumia and SolarShopNigeria, the category feed on Jiji, brand paths for the branded panels and batteries, and the blocked paths listed so the crawler never asks for them. | Design 5.3 stage 1, `docs/scraper-watchlist.json` | Partly built. The runner reads `discovery_paths`, `aliases` and `manual_rows`. The `brand_paths`, `excluded_paths` and `search_terms` blocks are data only, so the runner does not crawl them yet and does not yet check the blocked paths. |
| Approval workflow | One admin works in the Hardware DB tab. The admin approves, rejects, marks duplicates, merges, edits and publishes. The admin is never a robot. | Design 6.2 | Built. `src/components/ScraperReview.tsx` and the route `/api/scraper/candidates/review`. The browser check passed locally. |
| Schedule and refresh | The sweep runs every day at 02:00 West Africa time. The discovery crawl runs on Sunday at 03:00. Each run waits up to 15 minutes at random. The sweep checks at most 500 offers and the crawl at most 200 pages. | Design 3.2 and 3.3 | Built. The cron entries, the random delay and the ceilings live in the two runners. |
| Legal, robots and rate limits | The crawler names itself and gives a contact address. The site blocks in robots.txt are never requested. One request per second. A throttle pauses that listing with a jittered backoff. | Design 3.2 | Partly built. The user agent, the one request per second and the jittered backoff on a 429 or a 503 are in `scraper/http.ts`. A soft budget per source and the pause of one source for the rest of the run are not built. |
| Raw storage and its limits | No full HTML page is ever stored. The page JSON stays for 90 days. Images keep only a hash and a small thumbnail. No R2 bucket is needed. | Design 9 | Partly built. The page JSON is stored in D1 and no bucket exists. The 90-day purge, the image hash and the thumbnail are not built. |
| Price history retention | Every published price and every offer price change is appended to one table, and the rows stay. | Design 2.5 and 9 | Built. `price_history` grows on publish and on an offer change. The rows are plain rows, so a long run will grow the table without a rollup. |
| Failure handling and observability | A run writes a report. The watchdog opens or comments the `scraper-alert` issue. Kapso sends the WhatsApp alert. One source failing does not fail the run. | Design 8 | Built except for the live check. The `run_report` table, the `/api/scraper/runs` route, the watchdog workflow and the `/api/scraper/alert` route exist. The Kapso call has never reached the live API. |
| Admin UI for the candidates | The queue sits in the Database tab with the offers behind each price. | Design 6.2 | Built. The list, the detail modal, the risk flags and the actions are in `src/components/ScraperReview.tsx`. |
| VAT and margin | The price stays as the shelf price. No VAT is added or removed, because the calculator ranks on the shelf price. | Design 3.4 and section 11 | Deferred on purpose. No VAT field exists in the offers table, and the phase-two work will settle it. |

---

## 2. The next branches

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| Approval UI and where the admin works | The Hardware DB tab holds the queue. One call can approve up to 50 candidates, and the screen asks first when the selection spans more than one product. | Design 6.2 | Built. |
| What publish writes | The row id is a slug with the `sc-` prefix. The row carries the typed data, the tags `scraped` and the type, a `representative` or `estimated-specs` tag when it applies, one neutral description line, and `price_source` set to `scraped`. | Design 2.1, `worker/scraper.ts` publish route | Built. |
| Missing required values | A row with a blank calculator field never publishes. The route names the missing fields and the edit form fills them in. No default is invented. | Design 4.1, `scraper/rules.ts` | Built. A panel needs watts, Voc and Isc. A battery needs voltage, capacity, type, the parallel limit and the C-rate. |
| Unit normalization | A qualified offer must be per piece. A pallet price is divided by the count the seller states. A range, a quantity-dependent price, a bundle, a multi-variant ad and an installation price are archived with a reason code. | Design 3.4 and 3.6 | Built. |
| Negotiable price | The flag is read and kept in the trading signals. The number is used as written. | `scraper/adapters/jiji.ts` | Built. |
| USD price | Phase one has no rate source, so the runner archives every price that is not in naira with the reason code `usd_rate_unavailable`. The rate endpoint is documented for the day a source quotes in dollars. | Design 3.4 | Built today. The secret `FX_RATE_URL` was removed from the workflows because no code read it. |
| Offer identity | The offer key is the site and the listing id. A re-check updates the same row and appends the price change to the history. | Design 2.6 | Built. |
| Identical ads from one seller | Two ads from the same seller on the same platform with the same price and the same photo count once. A different price is a different offer. | Design 2.6 | Settled, not built. The rule needs the image hash, which does not exist yet. |
| Seller identity | The seller id is normalised per platform. Two platforms share a seller only when a phone number or a store handle agrees. | Design 2.6 | Built. |
| Images | No image is stored. A hash and a thumbnail are the plan. | Design 4.5 and 9 | Settled, not built. The queue table and the drainer exist, but the runner never enqueues an image and nothing computes a hash. |
| Raw page storage | The page JSON goes into the offer row. | Design 9 | Built. |
| Rate limits, user agent and contact | The crawler sends `SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)`. | Design 3.2, `scraper/adapters/types.ts` | Built. |
| Schedule and jitter | The cron times are fixed and each run waits up to 15 minutes at random. | Design 3.2 | Built. |
| Alert channels | The GitHub issue is the record and the WhatsApp message is the wake-up call. Email was never chosen. | Design 8.1 | Built, with the Kapso call unverified. |
| Secrets | One admin password for the Worker, GitHub Actions and the host. The gateway key never leaves the host. | Runbook secret inventory | Open. The Worker holds the password, the Actions copy is missing, and the Kapso values are missing. |
| Backfill | The first crawl reads the existing hardware rows and the seeded watchlist. It never changes a manual row. | Design 3.1 | Built inside the normal discovery run. There is no separate backfill command. |
| Test plan | The tests use saved fixtures and never touch the network. | Design 5.2 | Built. The three adapters have fixtures and 71 tests pass. |
| Acceptance criteria | After four weeks, 150 products with two offers, a 30-offer audit at 90 percent, 95 percent of prices fresh within 48 hours and 80 percent of candidates approved without edits. | Design 1.4 | Settled. The audit sampling tool is not built. |
| Cost | The Worker and the Actions are free. The host costs about $3.84 a month on Fly.io. | Design 5.1 | Settled. The host is not reserved yet. |
| The first publish and the old seed prices | A manual row keeps its price and shows the scraped median beside it. The admin accepts the median, which then flips the row to `scraped`. A bulk conversion of many rows is a phase-one decision without a button. | Design 6.1 | Built except for the bulk button. |

---

## 3. The remaining big items

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| Offer identity and duplicate ads | The listing id is the key. A cross-posted ad with a different photo count as one offer only when the photo matches. | Design 2.6 | Settled, not built for the photo half. A weaker identity match becomes a review item instead of a merge, so the variant risk is contained. |
| Trust and seller scoring | Verified means an official store or a platform badge. Established means a rating of 4.0 with at least 10 reviews, or a seller known for the brand. Everything else is unknown. | Design 3.5, the three adapters | Built. The thresholds live in the code, so they are not tunable at runtime. |
| Spec conflicts between sellers | The most trusted seller that states a value wins. The datasheet value would override it. | Design 4.1 and 4.4 | Partly built. The trusted seller's value wins, but no datasheet lookup runs and no conflict flag appears when two sellers state different Voc values. |
| Seller with many ads | Each ad stays in the archive, and the trust score belongs to the seller. | Design 2.6 | Built for the trust side. The ad collapse still needs the image hash. |
| Money rounding | Converted prices are rounded to the nearest hundred naira and keep the raw value. | Design 3.4 | Partly built. A naira median is not rounded, so a published price can carry kobo, for example 28499.05. |
| The hardware row shape | See the publish row in section 2. | Design 2.1 | Built. |
| Admin review UI | The queue lives in the Database tab with the offers and the actions. | Design 6.2 | Built. |
| Alerts | The issue plus the WhatsApp message. | Design 8.1 | Built, with the Kapso call unverified. |
| Schedule | The daily sweep, the Sunday crawl and the daily watchdog. | Design 3.2 and 3.3 | Built. |
| Rate limits, user agent and robots | The crawler identifies itself, keeps one request per second and never asks for a blocked path. | Design 3.2 | Partly built. The blocked paths and the brand paths are data only, so the runner cannot check them yet. |
| Raw HTML and image storage | No full HTML. The page JSON for 90 days. A hash and a thumbnail for images. | Design 9 | Partly built. The purge and the image work are missing. |
| Backfill and the first run | The first run reads the existing rows and the watchlist and protects the manual rows. | Design 3.1 and 6.1 | Built inside the normal run. |
| Security | The admin routes use the existing `x-admin-key` header, the `ADMIN_PASSWORD` secret, a timing-safe compare and a failed-attempt lockout. No new key exists. | Design 3.1 | Built. The runner can only reach the scraper routes, because every other write route needs the same key. |
| Testing and acceptance | Fixtures, no live network in the tests, and the four-week gates. | Design 1.4 and 5.2 | Built for the tests. The gates have no dashboard. |
| Success measure | The four-week gates and the two kill criteria. | Design 1.4 | Settled. |

---

## 4. The remaining critical decisions

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| Where the gateway lives | Fly.io in Johannesburg with one shared CPU Machine, 512 MB of memory and a 1 GB volume. Hetzner CX23 is the second choice. The gateway binds to the loopback address and the Machine has no public HTTP service. | Design 5.1 | Open. The owner must pick and fund it. The Fly command line tool is not installed on this machine. |
| Image and page retention and the storage limits | No R2 bucket. The page JSON for 90 days. The hash and the thumbnail stay. | Design 9 | Settled, not built. The D1 table sizes have not been measured against 500 checks a day. |
| Seller identity and the rating thresholds | The thresholds in section 3. | Design 3.5 | Built. |
| Duplicate detection between offers | The photo rule in section 2.6. | Design 2.6 | Settled, not built. |
| Backfill size | The existing catalogue and the watchlist, with the four-week target of 150 products with two offers. | Design 1.4 and 3.1 | Built inside the normal run. |
| Definition of done | The four-week gates. | Design 1.4 | Settled. |
| Success metrics | The same gates, with the kill criteria of an accuracy below 80 percent or more than one wrong merge in 1,000 offers. | Design 1.4 | Settled. |
| Condition names | New, used, foreign used, refurbished and unknown. Refurbished and open box share one code. | Design 2.2 and 8.3 | Partly built. The adapters map foreign used, refurbished, used and new. Open box and swap fall to unknown, so they can still qualify, and "slightly used" reads as used. |
| Unbranded panels | They stay in a generic bucket, never merge into a branded product, and take the highest Voc and the lowest Isc from the branded peers of the same wattage. | Design 3.7 | Built. |
| VAT | Shelf price only. | Design 3.4 | Deferred to phase two. |

---

## 5. The items the sessions called "not yet decided"

| Item | Decision | Status |
| --- | --- | --- |
| Where the gateway lives and who deploys it | Fly.io is the recommendation, and the runbook holds the steps. | Open. The owner funds it. |
| Image and page retention, R2 or D1 | No R2. The page JSON and the hash live in D1. | Settled, not built. |
| Seller identity and the rating thresholds | Rating of 4.0 with 10 reviews or a brand store, else unknown. | Built. |
| Duplicate detection between offers | Count the same seller, photo and price once. | Settled, not built. |
| Backfill size | The existing catalogue plus the watchlist, with the target of 150 products with two offers in four weeks. | Built inside the normal run. |
| The success measure | The four-week gates. | Settled. |
| The products table and the internet devices | Out of scope for phase one. | Written in design sections 10 and 11. |
| Legal | Robots rules, a named crawler with a contact, no login-walled sites and no social sources. | Settled and followed by the adapters. |
| Testing | Fixtures, no live network in the tests. | Built. |
| The secrets | The unified key, the admin key and the Kapso key. | The inventory is in the runbook. The values are not all stored yet. |
| The message rate for the alerts | The watchdog sends at most one alert a day and reuses one issue. | Built. |

---

## 6. The items a second pass said were missing from the document

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| The per-run and per-source budgets | 500 checks a day, 200 pages a week, one request per second, and a soft budget per source below the global ceiling. | Design 3.2 and 3.4 | Partly built. The global numbers and the pacing are built. The per-source soft budget is not. |
| The seller-level duplicate rule | The identical-offer collapse in design 2.6. | Design 2.6 | Settled, not built. |
| The offer identity and the history | The site and listing id key, with a price change appended to the history. | Design 2.6 | Built. |
| The backoff and jitter on a throttle | A jittered backoff on a 429 or a 503 with three attempts, and the listing skipped and reported when the site keeps blocking. | Design 3.4, `scraper/http.ts` | Built. |
| The rate source | No rate source in phase one. Non-naira prices are archived. The endpoint is documented for later. | Design 3.4 | Built today. |
| The admin endpoint contract | One authenticated route set, the `x-admin-key` header, a small JSON status, and any non-200 answer means the run failed. | Design 3.1 | Built. |
| The exact endpoint shape | The routes are `/api/scraper/offers`, `/api/scraper/candidates`, `/api/scraper/candidates/review`, `/api/scraper/candidates/{id}/publish`, `/api/scraper/queue`, `/api/scraper/run` and `/api/scraper/runs`. | `worker/scraper.ts` | Built. |
| The test strategy | Saved fixtures, no live network, and a check that every reason code and status has a definition. | Design 5.2 | Built. The closed reason code set has its own test. |
| The first-run backfill | The first run reads the existing rows and the watchlist only, never changes a manual row, and writes a heartbeat after the first success. | Design 3.1 | The heartbeat lands with the first run report. |
| The run report fields | The report holds the sources, the checks, the changes, the skips, the strikes, the candidates, the published rows and the publish errors. The collapsed offers, the trust distribution, the approval counts and the model calls stay empty until those features exist. | Design 8.2, `run_report` | Partly built. |
| The archive promotion path | An archived offer with an ambiguity code can be promoted into a new pending candidate without a new fetch. The disqualifying codes cannot. | Design 8.4 | Settled, not built as an admin action. |
| The products table | Out of scope for phase one. | Design sections 10 and 11 | Written. |

---

## 7. The open items in section 12 of the design, with today's status

| Open item | Status on 2026-11-14 |
| --- | --- |
| Create the Fly.io account, the `jnb` Machine with its 1 GB volume, and the host secrets. | Open. The owner must add a card and pick the host. The Fly command line tool is not installed on this machine. The host files are ready in `scraper/host/`. |
| Store the remaining secrets: the Worker `ADMIN_PASSWORD`, the GitHub Actions copies of `ADMIN_PASSWORD`, `WORKER_URL` and `FX_RATE_URL`, and the Kapso values. | Partly done. The Worker holds `ADMIN_PASSWORD`. The Actions hold `WORKER_URL`, which was set today. The Actions copy of `ADMIN_PASSWORD` and the four Kapso values are missing. `FX_RATE_URL` is no longer needed, because no code reads it. |
| Confirm the SolarShopNigeria brand filter slugs on the first crawl. Only `jinko-solar` was confirmed. | Open. The brand paths sit in the watchlist as data, and the runner does not read them yet. The first live crawl will confirm the slugs. |
| Confirm that a GitHub Actions runner can read the full Jumia page. | Open. A Node fetch on this machine read the pages and the local crawl found offers, but a hosted runner may see a thinner page. The first workflow run will answer it. |

---

## 8. What is written down but not built, ranked by the risk it carries to the live data

| Gap | Why it matters | Smallest fix |
| --- | --- | --- |
| The per-source soft budget and the source pause | A site that blocks mid-run can cost the whole budget of that source in one run. | Keep a counter per source in the runner and stop that source for the rest of the run. |
| The blocked-path and brand-path data is not read by the runner | The robots rules and the brand paths do not shape a run, so a future path edit can break compliance. | Load `excluded_paths` in `scraper/watchlist.ts` and refuse those URLs, then add the brand paths to `discovery_paths`. |
| The naira median is not rounded | A published price can carry kobo, which looks wrong in a quote. | Round the median to the nearest hundred naira before it reaches the candidate. |
| Open box and swap fall to an unknown condition | Such an ad can set a price for a new product. | Map open box to refurbished and swap to used in the two marketplace adapters. |
| No datasheet lookup and no conflict flag | Two sellers can state different Voc values, and the row takes the more trusted one without a warning. | Fetch the datasheet on the specialist retailer page and flag a disagreement between two stated values. |
| The image hash, the identical-offer collapse and the enrichment queue | The same seller can push the same ad many times, and the OCR path never runs. | Compute the perceptual hash in the adapter, store it on the offer, and enqueue the unknown images for the drainer. |
| The 90-day purge of the page JSON | The offer table grows without bound. | Add a delete of the old `raw_payload` values to the weekly run. |
| No runtime setting for the trust thresholds | A threshold change needs a code change and a deploy. | Move the rating and review numbers into the settings table. |

---

## 9. What needs the owner now

1. The admin password, so the Actions hold it and the first live crawl can run. The Worker already holds the same value.
2. A refreshed Cloudflare API token for the deploy workflow, because the stored token fails with `Invalid access token [code: 9109]`.
3. A funded host, either Fly.io in Johannesburg at about $3.84 a month or Hetzner at €5.99 a month.
4. The four Kapso values for the WhatsApp alert: the API key, the phone number id, the alert number and the approved template name.
5. A decision on the gaps in section 8, which can wait until after the first live crawl shows which one bites first.
