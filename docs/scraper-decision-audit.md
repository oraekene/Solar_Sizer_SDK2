# Scraping decisions audit

**Date:** 2026-11-14, updated on 2026-11-17. **Scope:** every open item that the design sessions listed, checked against `docs/scraper-design.md`, `docs/scraper-runbook.md`, `docs/scraper-watchlist.json` and the code in `scraper/`, `worker/` and `src/`.

This file answers one question for each item: is the decision written down, is the code built, and is anything still waiting on the owner.

## How to read the status column

| Status | Meaning |
| --- | --- |
| Built | The decision is written down and the code exists. |
| Written | The decision is written down. Phase one needs the code, and it is not built yet. |
| Settled | The decision is written down. The code will come when the phase needs it. |
| Deferred | The decision is written down and the work belongs to a later phase. |
| Open | The decision needs the owner, a paid account or a live check that only the owner can do. |

---

## 1. The twelve major decisions

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| Where the scrapers run | GitHub Actions runs the scrape. The Worker stores the data and serves the admin routes. The always-on host only enriches images, and it pulls from the Worker. | Design 3.1 and 5.1 | Built. The three workflows exist in `.github/workflows/` and all of them have run on a runner. The deploy workflow passed on 2026-11-15 with the new Cloudflare token. |
| Extraction method | Plain HTTP fetches with HTML and JSON parsing. No headless browser, because the three phase-one sites send server-rendered pages. | Design 3.1 | Built. `scraper/http.ts` and the three adapters under `scraper/adapters/`. Jiji reads its JSON feed. |
| Discovery | Category crawls on Jumia and SolarShopNigeria, the category feed on Jiji, brand paths for the branded panels and batteries, and the blocked paths listed so the crawler never asks for them. | Design 5.3 stage 1, `docs/scraper-watchlist.json` | Built. The runner reads `discovery_paths`, `brand_paths`, `excluded_paths`, `aliases` and `manual_rows`. Jumia brand paths join the crawl, and only the confirmed SolarShopNigeria slug `jinko-solar` is used. `search_terms` is still data only. |
| Approval workflow | One admin works in the Hardware DB tab. The admin approves, rejects, marks duplicates, merges, edits and publishes. The admin is never a robot. | Design 6.2 | Built. `src/components/ScraperReview.tsx` and the route `/api/scraper/candidates/review`. The browser check passed locally. |
| Schedule and refresh | The sweep runs every day at 02:00 West Africa time. The discovery crawl runs on Sunday at 03:00. Each run waits up to 15 minutes at random. The sweep checks at most 500 offers and the crawl at most 200 pages. | Design 3.2 and 3.3 | Built. The cron entries, the random delay and the ceilings live in the two runners. |
| Legal, robots and rate limits | The crawler names itself and gives a contact address. The site blocks in robots.txt are never requested. One request per second. A throttle pauses that listing with a jittered backoff. | Design 3.2 | Built. The user agent, the one request per second, the jittered backoff, the per-source soft budget and the mid-run source pause live in `scraper/http.ts`. The blocked paths are refused before a request in both runners. |
| Raw storage and its limits | No full HTML page is ever stored. The page JSON stays for 90 days. Images keep only a hash and a small thumbnail. No R2 bucket is needed. | Design 9 | Built. The page JSON, the purge, the SHA-256 hash, the difference hash and the 96 by 96 thumbnail all exist. Only the hash and the thumbnail are stored, never the image file. |
| Price history retention | Every published price and every offer price change is appended to one table, and the rows stay. | Design 2.5 and 9 | Built. `price_history` grows on publish and on an offer change, and now carries the currency. A very long run will still grow the table without a rollup. |
| Failure handling and observability | A run writes a report. The watchdog opens or comments the `scraper-alert` issue. Kapso sends the WhatsApp alert. One source failing does not fail the run. | Design 8 | Built except for the live check. The `run_report` table, the `/api/scraper/runs` route, the heartbeat, the watchdog workflow and the `/api/scraper/alert` route exist. The Kapso call has never reached the live API. |
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
| USD price | One daily NGN/USD rate, NairaDaily first and open.er-api.com second, and a rate younger than seven days. The raw price, the currency, the rate, the rate date and the source stay beside the converted value. | Design 3.4, `scraper/fx.ts` | Built. A foreign offer with no fresh rate is held with `usd_rate_unavailable` and never enters a median. `FX_RATE_URL` is no longer read. |
| Offer identity | The offer key is the site and the listing id. A re-check updates the same row and appends the price change to the history. | Design 2.6 | Built. |
| Identical ads from one seller | Two ads from the same seller on the same platform with the same price and the same photo count once. A different price is a different offer. | Design 2.6 | Built. The SHA-256 content hash supplies the photo half, and the difference hash catches a re-encoded copy of the same photo. |
| Seller identity | The seller id is normalised per platform. Two platforms share a seller only when a phone number or a store handle agrees. | Design 2.6 | Built. |
| Images | No image is stored. A hash and a thumbnail are the plan. | Design 4.5 and 9 | Built. The drainer runs on the host, the difference hash and the thumbnail are computed there, and the review screen shows the thumbnail beside each offer. |
| Raw page storage | The page JSON goes into the offer row. | Design 9 | Built. The 90-day purge empties the payload and keeps the offer. |
| Rate limits, user agent and contact | The crawler sends `SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)`. | Design 3.2, `scraper/adapters/types.ts` | Built. |
| Schedule and jitter | The cron times are fixed and each run waits up to 15 minutes at random. | Design 3.2 | Built. |
| Alert channels | The GitHub issue is the record and the WhatsApp message is the wake-up call. Email was never chosen. | Design 8.1 | Built and live on 2026-11-16. The route sends a template when `KAPSO_TEMPLATE_NAME` is set and plain text when it is not, because the Kapso Sandbox number cannot send templates. The route reads the delivery status, because the Sandbox text path only delivers inside the 24 hour window that a reply opens. |
| Secrets | One admin password for the Worker, GitHub Actions and the host. The gateway key never leaves the host. | Runbook secret inventory | Open. The admin password, the Cloudflare token and the account id are stored in the Worker and in Actions. `KAPSO_API_KEY` and `KAPSO_PHONE_NUMBER_ID` are stored in the Worker. `KAPSO_ALERT_TO` and the host values are missing. |
| Backfill | The first crawl reads the existing hardware rows and the seeded watchlist. It never changes a manual row. | Design 3.1 | Built inside the normal discovery run. There is no separate backfill command. |
| Test plan | The tests use saved fixtures and never touch the network. | Design 5.2 | Built. The three adapters have fixtures and the suite has 33 Worker tests plus 63 scraper tests. |
| Acceptance criteria | After four weeks, 150 products with two offers, a 30-offer audit at 90 percent, 95 percent of prices fresh within 48 hours and 80 percent of candidates approved without edits. | Design 1.4 | Settled. The dashboard route counts the gates and draws the audit sample. |
| Cost | The Worker and the Actions are free. The host is the owner's own machine, so it costs nothing. | Design 5.1 | Settled on 2026-11-16. The owner cannot pay for a hosting plan, so the drainer runs on this machine. |
| The first publish and the old seed prices | A manual row keeps its price and shows the scraped median beside it. The admin accepts the median, which then flips the row to `scraped`. A bulk conversion of many rows is a phase-one decision without a button. | Design 6.1 | Built except for the bulk button. |

---

## 3. The remaining big items

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| Offer identity and duplicate ads | The listing id is the key. A cross-posted ad with a different photo counts as one offer only when the photo matches. | Design 2.6 | Built. The SHA-256 hash gives an exact match and the difference hash gives a near match, and a weaker match becomes a review item instead of a merge, so the variant risk is contained. |
| Trust and seller scoring | Verified means an official store or a platform badge. Established means a rating of 4.0 with at least 10 reviews, or a seller known for the brand. Everything else is unknown. Jumia exposes no verified-seller flag, so only Jumia's own store is verified there and a marketplace vendor page is not a badge; Jiji uses its badge or two or more years on the platform. | Design 3.5, the three adapters | Built. The trust and review numbers are stored in the settings table, so the owner changes them without a deploy. |
| Spec conflicts between sellers | The most trusted seller that states a value wins. The datasheet value overrides it. | Design 4.1 and 4.4 | Built. The SolarShopNigeria page for an official brand counts as `datasheet`, and a numeric disagreement over 1 percent adds `sellers disagree on <field>` and waits for a human. |
| Seller with many ads | Each ad stays in the archive, and the trust score belongs to the seller. | Design 2.6 | Built. The collapsed ads stay in the archive and the offers route reports the collapsed count. |
| Money rounding | Converted prices are rounded to the nearest hundred naira and keep the raw value. | Design 3.4 | Built. The final naira median is rounded too, so a published price cannot carry kobo. |
| The hardware row shape | See the publish row in section 2. | Design 2.1 | Built. |
| Admin review UI | The queue lives in the Database tab with the offers and the actions. | Design 6.2 | Built. |
| Alerts | The issue plus the WhatsApp message. | Design 8.1 | Built, with the Kapso call unverified. |
| Schedule | The daily sweep, the Sunday crawl and the daily watchdog. | Design 3.2 and 3.3 | Built. |
| Rate limits, user agent and robots | The crawler identifies itself, keeps one request per second and never asks for a blocked path. | Design 3.2 | Built. The blocked paths are checked before each request, and a spent budget or a refusal pauses only that source. |
| Raw HTML and image storage | No full HTML. The page JSON for 90 days. A hash for images. | Design 9 | Built. The page JSON, the content hash, the difference hash and the thumbnail all exist, and no image file is stored. |
| Backfill and the first run | The first run reads the existing rows and the watchlist and protects the manual rows. | Design 3.1 and 6.1 | Built inside the normal run. |
| Coverage target | Every new listing on the three phase-one sources is scraped, not a sample. The first backfill is heavy and the later runs only add what is new. | Owner intent, 2026-11-15 | Built for the code. The discovery workflow takes a budget, a page ceiling and a products-per-path value for a manual backfill run, the job may run 350 minutes and the offer list pages through the whole pool. The D1 free plan writes 100,000 rows a day, so the owner decided on 2026-11-17 to cover the catalogue with two or three daily batches. A backfill of about 23,000 listings needs the paid plan. |
| Jiji on the GitHub runner | Jiji stays paused while the runner is refused. The refusal is a Cloudflare challenge on every path, so the runner cannot reach Jiji at all. | Live probe, run 43678772693 on 2026-11-15 | Closed by decision on 2026-11-17. The owner chose a crawl from this machine, where the challenge passes. The runner keeps Jumia and SolarShopNigeria. |
| Security | The admin routes use the existing `x-admin-key` header, the `ADMIN_PASSWORD` secret, a timing-safe compare and a failed-attempt lockout. No new key exists. | Design 3.1 | Built. The runner can only reach the scraper routes, because every other write route needs the same key. |
| Testing and acceptance | Fixtures, no live network in the tests, and the four-week gates. | Design 1.4 and 5.2 | Built for the tests. The dashboard route counts the four-week gates. |
| Success measure | The four-week gates and the two kill criteria. | Design 1.4 | Settled. |

---

## 4. The remaining critical decisions

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| Where the gateway lives | The owner's own machine. The FreeLLMAPI gateway listens on `127.0.0.1:3001` and the enrichment drainer runs beside it in the task `Solar Sizer Enrichment Drainer`. Fly.io stays the paid alternative. | Design 5.1 | Settled on 2026-11-16. The gateway and the drainer both run on this machine. |
| Image and page retention and the storage limits | No R2 bucket. The page JSON for 90 days. The hash persists. | Design 9 | Built. The table sizes were measured on 2026-11-17 and are listed in section 8.1. |
| Seller identity and the rating thresholds | The thresholds in section 3. | Design 3.5 | Built. |
| Duplicate detection between offers | The photo rule in section 2.6. | Design 2.6 | Built. The content hash gives the exact match and the difference hash gives the near match. |
| Backfill size | The existing catalogue and the watchlist, with the four-week target of 150 products with two offers. | Design 1.4 and 3.1 | Built inside the normal run. |
| Definition of done | The four-week gates. | Design 1.4 | Settled. |
| Success metrics | The same gates, with the kill criteria of an accuracy below 80 percent or more than one wrong merge in 1,000 offers. | Design 1.4 | Settled. |
| Condition names | New, used, foreign used, refurbished and unknown. Refurbished and open box share one code. | Design 2.2 and 8.3 | Built. Open box becomes `refurbished`, a swap becomes `used`, and "slightly used" becomes `used`, so none of them can quote a new product. |
| Unbranded panels | They stay in a generic bucket, never merge into a branded product, and take the highest Voc and the lowest Isc from the branded peers of the same wattage. | Design 3.7 | Built. |
| VAT | Shelf price only. | Design 3.4 | Deferred to phase two. |

---

## 5. The items the sessions called "not yet decided"

| Item | Decision | Status |
| --- | --- | --- |
| Where the gateway lives and who deploys it | The owner's own machine. The task `Solar Sizer Enrichment Drainer` starts the drainer at every logon, and the task `FreeLLMAPI Router` starts the gateway beside it. | Settled on 2026-11-16. Fly.io stays the paid alternative and the runbook holds its steps. |
| Image and page retention, R2 or D1 | No R2. The page JSON, the content hash, the difference hash and the thumbnail live in D1. | Built. |
| Seller identity and the rating thresholds | Rating of 4.0 with 10 reviews or a brand store, else unknown. | Built. |
| Duplicate detection between offers | Count the same seller, photo and price once. | Built. |
| Backfill size | The existing catalogue plus the watchlist, with the target of 150 products with two offers in four weeks. | Built inside the normal run. |
| The success measure | The four-week gates. | Settled. |
| The products table and the internet devices | Out of scope for phase one. | Written in design sections 10 and 11. |
| Legal | Robots rules, a named crawler with a contact, no login-walled sites and no social sources. | Settled and followed by the adapters. |
| Testing | Fixtures, no live network in the tests. | Built. |
| The secrets | The unified key, the admin key, the Cloudflare token and the Kapso key. | The inventory is in the runbook. The values are not all stored yet. |
| The message rate for the alerts | The watchdog sends at most one alert a day and reuses one issue. | Built. |

---

## 6. The items a second pass said were missing from the document

| Item | Decision | Where | Status |
| --- | --- | --- | --- |
| The per-run and per-source budgets | 500 checks a day, 200 pages a week, one request per second, and a soft budget per source below the global ceiling. | Design 3.2 and 3.4 | Built. The global ceilings, the pacing, the per-source budgets and the source pause are in the runners and `scraper/http.ts`. |
| The seller-level duplicate rule | The identical-offer collapse in design 2.6. | Design 2.6 | Built. |
| The offer identity and the history | The site and listing id key, with a price change appended to the history. | Design 2.6 | Built. |
| The backoff and jitter on a throttle | A jittered backoff on a 429 or a 503 with three attempts, and the source paused and reported when the site keeps blocking. | Design 3.4, `scraper/http.ts` | Built. |
| The rate source | NairaDaily first, open.er-api.com second, a rate younger than seven days, and a fixed order in code. | Design 3.4 | Built. |
| The admin endpoint contract | One authenticated route set, the `x-admin-key` header, a small JSON status, and any non-200 answer means the run failed. | Design 3.1 | Built. |
| The exact endpoint shape | The routes are `/api/scraper/offers`, `/api/scraper/candidates`, `/api/scraper/candidates/review`, `/api/scraper/candidates/{id}/publish`, `/api/scraper/queue`, `/api/scraper/run`, `/api/scraper/runs`, `/api/scraper/alert` and `/api/scraper/offers/purge`. | `worker/scraper.ts` | Built. |
| The test strategy | Saved fixtures, no live network, and a check that every reason code and status has a definition. | Design 5.2 | Built. The closed reason code set has its own test. |
| The first-run backfill | The first run reads the existing rows and the watchlist only, never changes a manual row, and writes a heartbeat after the first success. | Design 3.1 | Built. The heartbeat lands with the first run report. |
| The run report fields | The report holds the sources, the checks, the changes, the skips, the strikes, the candidates, the published rows, the collapsed offers, the cross-posts, the FX rate, the request counts, the paused sources and the purge result. | Design 8.2, `run_report` | Built. The report also holds the trust spread, the approval counts and the enrichment queue size. |
| The archive promotion path | An archived offer with an ambiguity code can be promoted into a new pending candidate without a new fetch. The disqualifying codes cannot. | Design 8.4 | Built. The route `/api/scraper/offers/promote` does it. |
| The products table | Out of scope for phase one. | Design sections 10 and 11 | Written. |

---

## 7. The open items in section 12 of the design, with today's status

| Open item | Status on 2026-11-15 |
| --- | --- |
| Create the Fly.io account, the `jnb` Machine with its 1 GB volume, and the host secrets. | Closed on 2026-11-16. The owner cannot pay for a plan, so the host is this machine. The task `Solar Sizer Enrichment Drainer` runs the drainer and the gateway already runs on `127.0.0.1:3001`. The Fly command line tool stays installed and the runbook keeps its steps. |
| Store the remaining secrets. | Done on 2026-11-17. The Worker and the Actions hold the same `ADMIN_PASSWORD`, and the Actions hold `WORKER_URL`, the Cloudflare token and the account id. The Worker holds `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID` and `KAPSO_ALERT_TO`, and `KAPSO_ALERT_TO` is the owner's own WhatsApp number. `KAPSO_TEMPLATE_NAME` is optional. `FX_RATE_URL` is no longer needed. |
| Apply remote migrations `0010` to `0012`. | Done on 2026-11-15. The deploy workflow now applies any pending migration before it deploys. |
| Redeploy the Worker with the current code. | Done on 2026-11-15. The deploy workflow published the alert path from PR #16. The code of 2026-11-17 waits for the D1 write cap to reset, because migration `0013` adds two columns. |
| Confirm the SolarShopNigeria brand filter slugs on the first crawl. Only `jinko-solar` was confirmed. | Open. The runner reads only `jinko-solar`; the other labels stay in the watchlist as unconfirmed. |
| Confirm that a GitHub Actions runner can read the full Jumia page. | Answered on 2026-11-15. The runner reads the pages and the live crawl stored 97 Jumia offers. |
| Read Jiji from the GitHub runner. | Closed by decision on 2026-11-17. The runner still meets a Cloudflare challenge on every path, so the owner chose to crawl Jiji from this machine, where the challenge passes. |

---

## 8. What remains unbuilt, ranked by the risk it carries

The gaps that were open on 2026-11-15 were closed on 2026-11-17.

| Gap | Status on 2026-11-17 |
| --- | --- |
| The trust thresholds are code constants | Closed. The numbers live in the settings table under `scraper_thresholds`. The Worker reads them on `/api/scraper/thresholds`, the runner reads them before a merge, and a wrong value keeps the code default. |
| No thumbnail and no perceptual hash | Closed. `scraper/host/image_hash.py` computes a difference hash and a 96 by 96 JPEG thumbnail on this machine with Pillow. The Worker stores them in `image_phash` and `image_thumb`, and the review screen shows the thumbnail. |
| No acceptance dashboard or audit sampler | Closed. `GET /api/scraper/dashboard` reports coverage, freshness, approval counts and a stratified audit sample. |
| No archive promotion action | Closed. `POST /api/scraper/offers/promote` copies an archived offer into a `pending_review` candidate without a new fetch. |
| No estimated-specs marker in quotes | Closed. The quote line marks a row with estimated specs, and the review modal lists every estimated field with its source. |
| Empty run report fields | Closed. The report carries the trust spread, the approval counts and the enrichment queue size. |
| The host is not provisioned | Closed on 2026-11-16. The host is this machine and the task `Solar Sizer Enrichment Drainer` runs the drainer. |
| D1 table sizes are unmeasured | Closed. The sizes are listed in section 8.1 below. |
| Local gateway vision calls fail upstream | Closed. The gateway on `127.0.0.1:3001` answered a vision request with status 200 on 2026-11-17. |

### 8.1 The measured D1 sizes and the free-plan plan

The free plan writes 100,000 rows a day, and that limit is shared across every database of the account. One listing costs about 15 rows, or about 29 rows when its image is drained.

| Table | Rows on 2026-11-17 |
| --- | --- |
| `hardware_offers` | 533 |
| `hardware_candidates` | 139 |
| `price_history` | 0 |
| `scraper_queue` | 537 |
| `run_report` | 12 |
| `hardware` | 40 |
| `products` | 23 |
| `devices_master` | 54 |

The owner decided on 2026-11-17 to cover the catalogue with two or three daily batches inside the free cap instead of buying a paid D1 plan. A full backfill of about 23,000 listings needs the paid plan.

### 8.2 The gaps that stay open

| Gap | Why it matters | Smallest fix |
| --- | --- | --- |
| The remote D1 write cap is exhausted | Migration `0013` and the queue claim both fail with `D1_ERROR: Your account has exceeded D1's free tier daily row write limit`. | Wait for midnight UTC, then apply the migration and restart the drainer. |
| Jiji refuses the GitHub runner | Cloudflare challenges every path, so the runner cannot read Jiji. | The owner decided to crawl Jiji from this machine, where the challenge passes. |
| The four internet prices are business values | They were chosen from the catalogue, not from a confirmed price list. | The owner confirms them in the Hardware DB. |

---

## 9. What needs the owner now

The owner made these decisions on 2026-11-16 and 2026-11-17.

1. The host is this machine. Fly.io and Hetzner stay as the paid alternatives in the runbook.
2. Jiji is crawled from this machine, because the GitHub runner meets a Cloudflare challenge on every path.
3. The catalogue is covered with two or three daily batches inside the free D1 cap. No paid plan is bought.
4. SolarShopNigeria reads only the confirmed slug `jinko-solar`.
5. `KAPSO_ALERT_TO` is stored and points at the owner's own WhatsApp number.

The items that still need the owner are these.

1. Confirm the four internet prices, which were chosen from the catalogue and not from a confirmed price list: Wi-Fi Router `d5` ₦35,000, Cudy LT700 `d17` ₦65,000, Starlink Gen 2 `d20` ₦1,200,000 and Starlink Gen 3 `d21` ₦1,800,000. Each one can be edited in the Hardware DB.
2. Wait for the D1 write cap to reset at midnight UTC, then apply migration `0013` and restart the drainer.
3. Confirm the SolarShopNigeria brand filter slugs when the first crawl reports a gap. Only `jinko-solar` is confirmed today.

---

## 10. The export checklist, item by item

The tables above answer the twelve decisions, the branches, the big items, the critical items, the not-yet-decided items and the second-pass gaps. This section adds the export items that those tables did not name, so the whole checklist is answered in one place.

| Item | Answer | Where | Status |
| --- | --- | --- | --- |
| Spot-check sampling method | Thirty offers by stratified random draw across every phase-one source and trust tier, scored on brand, model and price against the source page and the canonical row. The sampled ids go into the run report. | Design 5.2 | Built. The dashboard route draws the stratified sample. |
| Outlier distance | An offer below 60 percent of the canonical median is a price outlier, removed in two passes. | Design 3.5, `scraper/merge.ts` | Built, with a test. |
| Brand and model aliases | Aliases live in `docs/scraper-watchlist.json`, so `9Solar`, `9 Solar` and `Nine Solar Energy` share one key. A generic name becomes the `generic` bucket, never a branded key. | Design 3.7, `scraper/identity.ts` | Built, with tests. |
| Canonical id collisions | The row id carries the family facts and an eight-character hash of the full identity key, so a 450 W and a 550 W panel of one brand and a 100 Ah and a 200 Ah battery of one brand never share a row. | Design 2.1, `scraper/identity.ts` | Built, with tests. |
| Admin edits survive a sweep | An existing hardware row is the golden record. A sweep replaces only the price and the id; every other field is copied from the row, so a manual correction is never overwritten by a scraped value. | `scraper/merge.ts` | Built, with a test. |
| FX sanity | A rate outside 100 to 10,000 naira per dollar is refused and the fallback source is tried, so a broken payload cannot convert a dollar offer into a wild naira price. A changed naira value on an unchanged dollar quote still appends to the price history. | `scraper/fx.ts`, `worker/scraper.ts` | Built, with tests. |
| Queue ownership and retry | The queue read and the claim are one statement, so two drainers cannot take the same row. A failed image is tried again after 15 minutes, up to three attempts. | `worker/scraper.ts` | Built, checked against a local D1. |
| Watchdog and partial sweeps | Only a complete sweep counts as healthy. A partial sweep raises the `scraper-alert` issue with the run id, and the run report holds the pause reason. | Design 8.1, `scraper-watchdog.yml` | Built, not yet seen on a live schedule. |
| Estimated-specs warning in quotes | A row with estimated specs stays selectable, the quote line must show a short marker, and the admin must see each estimated field with its source. | Design 4.1 | Built. The quote line marks the row and the review modal lists every estimated field with its source. |
| The seed watchlist after discovery | The watchlist is fixed and curated. Discovered products become offers and candidates, never watchlist rows, and a human adds a brand path when a report shows a gap. | Design 3.1 | Built. Growth is manual on purpose. |
| The Konga and CDcare phase band | They start after the four-week report passes, not on the first day, so the transition band cannot be read as phase one. | Design 1.3 and 11 | Corrected in this pass. |
| Cost cap | The Worker and Actions stay inside their free tiers. The host is the owner's own machine, so it costs nothing. No spend alarm exists. | Design 5.1 | Settled on 2026-11-16. |
| Internet devices in phase two | `products`, internet kits and accessories are out of scope for phase one. | Design 1.1 and 11 | Settled. |
| The Nigerian retailer inventory | Every shop that was checked, with its verdict and its evidence. | `docs/sources-inventory.md` | Done. |
| The Kapso message rate | One issue and at most one alert a day, so the alert channel cannot spam. | Design 8.1 | Built, unverified live. |
| CDcare installment prices | Archived as a separate price kind, not compared to a cash price. | Design 1.3 and 11 | Deferred to 1b by decision. |
| The deferred list from the export | Inverters, products, imports, social, used series, badge, seller history, reverse image search, VAT and kit promotion all sit in phase two or later. | Design 11 | Deferred. |

---

## 11. The four open items, and why the code came first

The four items in the design's section 12 are provisioning steps and live checks, not design inputs. The code was written and tested before they were answered because each one has a defined behaviour while it stays open, and none of them changes a rule that the pipeline depends on:

| Open item | What it gates | What runs without it | If the check fails |
| --- | --- | --- | --- |
| The host on this machine | Image enrichment and sticker OCR only | The scrape, merge, review and publish paths. Unknown specs stay in review. | Images stay unread and unknown specs wait for the admin. No inferred battery publishes. |
| The remaining secrets | The live deploy, the remote migration, admin login and the WhatsApp alert | The code reads the secrets and fails closed: a missing `ADMIN_PASSWORD` answers 403 and never authenticates. | Nothing goes live and no route is exposed. |
| The SolarShopNigeria slugs | Extra brand-filter coverage | The runner reads only `confirmed_slugs`, so `jinko-solar` is the only filter used. The category crawl still finds other brands. | The crawl is narrower, and the report shows fewer offers. |
| The full Jumia page on a runner | Hosted-runner yield | The adapter and its fixture parse the full page, and the local crawl found offers. | A thin page yields fewer offers and a visible drop in the report, not bad data. |

The item that actually stopped the release is not a decision. The remote D1 daily row-write limit blocked migrations `0010` to `0012`, so the new Worker code cannot deploy until the quota resets or the plan changes. The code and the local schema are ready; only the remote write is waiting. On 2026-11-17 the same limit blocked migration `0013`, which adds the two image columns and the four device prices.
