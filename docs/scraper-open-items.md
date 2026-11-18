# Open and partially complete items

This file lists every item in the Solar Sizer scraper work that is open, partly built, blocked or deliberately deferred. Its source is the full export of the requirements session at `C:\Users\rotim\Desktop\solar-hardware-scraper-requirements-3.json`, which holds 3,091 messages from 2026-11-16 to 2026-11-17 and was read from the first message to the last. Every line was then checked against the code and the live database at `origin/main` commit `c662821` on 2026-11-18. The rows that changed on that day carry the new date, and the rows that did not change keep the date from the day they were last checked.

The live database holds 1,860 offers, 544 candidates, 1,857 queued images with 1,497 pending, 16 run reports, 40 hardware rows that are all manual, and 2 price history rows. The first backfill batch ran on 2026-11-18 and added 1,037 new listings, and the drainer is still reading their images.

## 1. What blocks the pipeline today

| Blocker | What it stops | Who closes it | State on 2026-11-18 |
| --- | --- | --- | --- |
| The D1 daily write cap | Every write from the scraper and the drainer | The `modelmap` sync must write less than the account budget | Fixed and measured. The `modelmap` Worker cron changed from every four hours to once a day, so its daily rows fell from about 130,000 to about 43,000. The cap reset at 00:00 UTC on 2026-11-18 and the first backfill batch ran without a cap error. |
| The Jiji crawl runs on this PC | Jiji offers stop when the PC is off or the user is signed out | The owner, or a paid host | Open by choice. Jiji refuses the GitHub runner address, so the crawl runs from the `Solar Sizer Jiji Scrape` task. |
| The Kapso alert window | WhatsApp alerts only arrive for 24 hours after the owner replies to the Sandbox number | The owner | Open. The Sandbox number cannot have a template because it needs a production number and the Facebook login fails. The GitHub issue always works. The backfill alert on 2026-11-18 was refused with `Re-engagement message`. |
| The backfill | The full list of about 87,000 Jiji adverts is not in the database | The owner decides the batch size | The first batch ran on 2026-11-18 and added 1,037 new listings. The next batch waits for the drainer to empty the queue, because the daily cap covers the crawl and the images together. |
| The SolarShopNigeria brand slugs | The brand filter covers only one brand | The owner confirms the slugs on the first crawl | Measured on 2026-11-18. The shop holds 13 products and every one of them is already in the pool, so the brand paths add nothing today. |
| The Jiji feed page limit | One path cannot be walked past 1,000 pages, so 20,000 of the 66,220 adverts on the wide path are unreachable by the feed | Nobody yet | Open and measured. The two battery paths hold fewer than 20,000 adverts each, so they are fully reachable. |

## 2. The open items in section 12 of the design document

| Open item | State on 2026-11-17 |
| --- | --- |
| Create the Fly.io account, the `jnb` Machine with its 1 GB volume, and the host secrets. | Closed. The owner cannot pay for a plan, so the host is this machine. The task `Solar Sizer Enrichment Drainer` runs the drainer and the gateway already runs on `127.0.0.1:3001`. Fly.io stays in the runbook as the paid choice. |
| Store the remaining secrets: the Worker `ADMIN_PASSWORD`, the GitHub Actions copies of `ADMIN_PASSWORD`, `WORKER_URL` and `FX_RATE_URL`, and the Kapso values for the alert. | Closed. The Worker and the Actions hold the same `ADMIN_PASSWORD`, the Actions hold `WORKER_URL`, the Cloudflare token and the account id, and the Worker holds `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID` and `KAPSO_ALERT_TO`. `FX_RATE_URL` is no longer read, because the code fetches the rate from NairaDaily first and open.er-api.com second. |
| Apply the remote migrations `0010` to `0012`. | Closed on 2026-11-15. The deploy workflow applies any pending migration before it deploys. |
| Redeploy the Worker with the current code. | Closed. Every push to `main` deploys it. |
| Confirm the SolarShopNigeria brand filter slugs on the first crawl. | Measured on 2026-11-18. The first crawl read the shop and found 13 products, and every one of them was already in the pool, so no slug is missing. The brand paths add nothing while the shop holds 13 products. |
| Confirm that a GitHub Actions runner can read the full Jumia page. | Closed. The live crawl stored 142 Jumia offers from the runner, and the first backfill batch stored 170 more from this machine. |
| Read Jiji from the GitHub runner. | Closed by a different route. Jiji answers every path from the runner with a Cloudflare challenge, so the crawl moved to this machine and the runner keeps Jumia and SolarShopNigeria. |

## 3. The items that were settled but not built when the session ended

| Item | State on 2026-11-17 |
| --- | --- |
| The per-source request budget | Built. `scraper/http.ts` holds a per-source budget and pauses a source that reaches it. |
| The runner reading of the blocked and brand paths | Built. Paths in the robots rules are refused and the brand paths are alternated with the wide category pages. |
| Rounding of the naira median | Built. The median is rounded to the nearest hundred naira. |
| The open box and swap conditions | Built. Both are treated as used and archived with their label. |
| The datasheet lookup | Partly built. The SolarShopNigeria adapter records that a datasheet exists and its path, and the merge code carries a `datasheet` provenance kind, but no code fetches the PDF or reads the voltage and current from it. |
| The image hash with its duplicate collapse | Partly built. The exact content hash collapses identical files. The perceptual hash and the thumbnail are not built, so a re-encoded copy of one photo is not collapsed and the review screen shows no small image. |
| The 90-day purge of the page data | Built. The route `/api/scraper/offers/purge` empties the raw payload after 90 days. |

## 4. The items that remain unbuilt, ranked by the risk they carry

| Gap | Why it matters | Smallest fix | State on 2026-11-17 |
| --- | --- | --- | --- |
| The trust thresholds are code constants | A threshold change needs a deploy and a test run | Move the rating and review numbers into the settings table | Open. `scraper/adapters/jumia.ts` holds `rating >= 4 && reviews >= 10` and `scraper/adapters/jiji.ts` holds `years >= 2`. |
| No thumbnail and no perceptual hash | A re-encoded copy of one photo is not collapsed | Decode the image, store a small thumbnail, and add a perceptual hash behind the same collapse rule | Open. |
| No acceptance dashboard or audit sampler | The four-week gates cannot be measured without a manual query | Add a read-only report route that counts products with two offers, freshness and approvals without edits | Open. The four-week report depends on it. |
| No archive promotion action | An excluded offer needs a new fetch before it can become a candidate | Add an admin action that copies the archived offer into a `pending_review` candidate | Open. |
| No estimated-specs marker in the quote | The design says the quote line marks an estimated row | Read the row tag in the quote line and render the provenance in the review modal | Open. The tag is written at publish and the raw provenance is shown in the admin, but the quote line and the per-field list are not built. |
| Empty run report fields | Trust distribution, approval counts and model calls are not recorded | Fill them when the review and enrichment paths are live | Open. The 16 stored reports carry the counts the runner knows and leave the rest empty. |
| D1 table sizes are unmeasured | 500 checks a day could grow the tables past the plan | Measure after the first four weeks | Partly closed. The database was 1.7 MB before the first backfill batch and 5.8 MB after it, against the 500 MB free limit. The daily row cost is measured at about 15 rows for a new listing and about 29 rows over its life. |
| Local gateway vision calls fail upstream | The drainer cannot return a spec from an image | Fix the provider route or use another model | Closed. A spec table image was read correctly with status 200, and five parallel image requests answered in 34 seconds. |
| The host is not provisioned | Image enrichment never runs | Run the drainer on this machine | Closed. The task `Solar Sizer Enrichment Drainer` runs it at every logon. |

## 5. The export checklist items that are still partial

| Item | State on 2026-11-17 |
| --- | --- |
| The spot-check sampling method for the 30-offer audit | Written but not built. The sampler route does not exist, so the week-four audit needs a manual query. |
| The estimated-specs warning in end-user quotes | Written but not built. The quote marker and the per-field list are missing. |
| The Kapso message rate | Built and unverified live, because the 24 hour window has not been open since the last alert. |
| The watchdog on a live schedule | Built, but the scheduled watchdog has never run on time on its own. It has been run by hand. |
| The Konga and CDcare phase band | Corrected in the design document. Both start after the four-week report passes. |
| The Nigerian retailer inventory | Done. `docs/sources-inventory.md` holds every shop that was checked with its verdict and its evidence. |
| The two small reliability items the audit left open, the queue claim race and the watchdog treating a partial sweep as healthy | Closed. The claim and the read are one statement, and a partial sweep raises the alert issue. |

## 6. The deferred register

The design document section 11 holds fourteen rows that were consciously postponed: inverters, powerstations, charge controllers, wiring and accessories to phase two, the `products` table and kits to phase two, the Konga and CDcare adapters to phase 1b, AliExpress and Temu to phase three, social sources out of scope, CDcare installment prices to 1b, the used-price series, the reliability badge, seller rating and dispute history, true external reverse image search, full visual anti-counterfeit beyond price and trust and sticker OCR, VAT and landed-cost normalisation, and automatic kit promotion to phase two. None of them is unfinished work.

## 7. The items the session itself flagged as skipped

| Skipped item | State on 2026-11-17 |
| --- | --- |
| The Jiji feed has no resume point | Open. Every daily run walks the feed from page one until the request budget stops it, so the daily job spends its whole budget re-walking known territory. |
| No live WhatsApp delivery was confirmed | Open. The owner must reply to the Sandbox number to open the 24 hour window, then a test message proves the path. |
| The release audit sub-agent died on a rate limit | Closed by hand. The routes, the schema, the workflow steps, the tests, the lint and the build were checked directly. |
| The local gateway provider failure | Closed. The route works now. |
| The promised retailer inventory | Done. |
| The first live crawl never ran | Closed. Three discovery runs and one sweep ran, and the local Jiji job ran twice. |
| The stale local `main` branch | Closed. It now points at `origin/main`, and the old tip is kept on `backup/main-b052e1f`. |

## 8. The branches that `git` still reports as unmerged

`git branch --no-merged origin/main` lists fourteen branches, but only three of them hold work that `main` does not already carry in content.

| Branch | Commits | What they are | Covered by the current code | Can it be merged |
| --- | --- | --- | --- | --- |
| `chore/jiji-probe` | 2 | `6e035f3` adds a GitHub Actions workflow that prints the status code, the Cloudflare headers and the first bytes of each Jiji path from the runner. `07ec0e2` adds the checkout step it needed. | No. The files are not in `main`. The question they answered is answered and recorded: every Jiji path answers the runner with a Cloudflare challenge, so the crawl runs from this machine. | Yes and it is safe, because the workflow only runs on a push to that branch or on a manual dispatch and writes nothing. It has no value now, so the better move is to keep the branch as the record of the probe and delete it later. |
| `fix/migration-parity` | 3 | `f054b80` restores the Worker API parity with the Express server, `310ce346` moves the calculator empty state to the top of the results column, and `626160bd` restores the product title in the light user interface. | Yes, all three by content. `worker/enrich.ts` and `worker/enrich.test.ts` are in `main`, the empty state uses `min-h-[420px]` in `main`, and the `index.html` title in `main` is the same string the branch has. | No. Merging old commits that `main` already carries in content adds duplicate history and would conflict with the uncommitted work in `src/` and `worker/`. Keep the branch as a record. |
| `backup/main-b052e1f` | 1 | `b052e1f` closed the phase-one gaps and added the currency conversion. | Yes in content, and then more. The upstream squash of that work added the currency-aware price history and the offer-scoped publishing. | No. It is the safety copy of the old tip. Keep it. |
| `feat/pc-host-and-jiji-sort` | 2 | `e131a5f` runs the drainer on this machine and sorts the Jiji feed by newest, `79025c8` keeps the drainer alive when the Worker has a bad day. | Yes. The tree of `79025c8` and `origin/main` is identical, because the two commits were squash-merged as `8aa70dd`. | No. The content is already in `main`. |
| `chore/live-state`, `docs/jiji-pc-job`, `docs/live-state-kapso`, `feat/full-coverage`, `feat/jiji-feed-pages`, `feat/source-filter`, `fix/alert-delivery-status`, `fix/kapso-sandbox-alert`, `fix/runner-source-split`, `fix/watchdog-alert` | 18 in total | Documentation and code changes that were squash-merged into `main`. | Yes. `git cherry` reports every commit as patch-equivalent to a commit in `main`. | No. `git branch --no-merged` still lists them because a squash merge changes the commit hash, so the old branch tip is not an ancestor of `main`. The work is in `main`. |

## 9. The D1 write cap recovery steps

The free plan allows 100,000 rows written a day for the whole account, and `modelmap` used 130,564 rows in 18 hours on 2026-11-17. The steps below are in order.

1. Cut the `modelmap` cron to one run a day. This is already done, and the command that did it is:

   ```powershell
   $token = (Select-String -Path "$env:USERPROFILE\.wrangler\config\default.toml" -Pattern 'oauth_token = "(.+)"').Matches[0].Groups[1].Value
   $account = 'baadb8542499ad04ed9e0432215f3fb6'
   $body = '[{"cron": "0 3 * * *"}]'
   Invoke-RestMethod -Method Put -Uri "https://api.cloudflare.com/client/v4/accounts/$account/workers/scripts/modelmap/schedules" -Headers @{ Authorization = "Bearer $token"; 'content-type' = 'application/json' } -Body $body
   ```

   The body must be a bare JSON array. The Cloudflare API rejects a wrapped object with the error `Could not parse request body`.

2. Put it back to every four hours with the same command and the body `[{"cron": "0 */4 * * *"}]`.

3. Turn it off completely with the body `[]`.

4. Measure the result. The window must fall inside one UTC day for the number to match the cap.

   ```powershell
   npx wrangler d1 insights modelmap --time-period 18h
   ```

5. Check that the scraper can write again after 00:00 UTC.

   ```powershell
   curl.exe -sS -H "x-admin-key: $env:ADMIN_PASSWORD" "https://sdk2.solarsizer.workers.dev/api/scraper/queue?limit=1"
   ```

6. Run the backfill before 03:00 UTC, because the `modelmap` run takes its share of the day at 03:00 UTC. The first batch on 2026-11-18 ran from this machine with the script `C:\Users\rotim\.local\solar-sizer-scraper\run-backfill.ps1`, because the Jiji paths refuse the GitHub runner. The runner command is below, and it covers Jumia and SolarShopNigeria only.

   ```powershell
   gh workflow run scraper-discovery.yml `
     -f source_request_budget=3200 `
     -f page_budget=1600 `
     -f products_per_path=1600 `
     -f start_delay_ms=0
   ```

7. If the cap is still hit, the owner can move the `modelmap` database to a second Cloudflare account. Each account has its own daily rows, so the two projects never compete. The steps for that move are in the runbook.

## 10. The measure of success for phase one

The design document sets four gates after four weeks of daily runs: 150 canonical products with two or more qualified offers, 90 percent of a 30-offer spot check correct on brand, model and price, 95 percent of published prices re-checked within 48 hours, and 80 percent of new candidates approved without edits. Two hard stops sit above them: any wrong merge of two different products counts as a defect, and any published panel whose Voc sits below the real datasheet value blocks the release.

None of the gates can be measured yet, because no price has been published and the audit sampler is not built. The backfill has run once, so the pool holds 1,860 offers and 544 candidates, which gives the sampler something to measure when it is built.

## 11. The first backfill batch on 2026-11-18

The batch ran from this machine as the one-off task `Solar Sizer Backfill`, because the Jiji paths refuse the GitHub runner. The script is `C:\Users\rotim\.local\solar-sizer-scraper\run-backfill.ps1` and the log is `C:\Users\rotim\.local\solar-sizer-scraper\backfill.log`. It ran three legs, one per source, and each leg had its own request budget.

| Leg | Requests | Pages | New listings | Run status |
| --- | --- | --- | --- | --- |
| Jiji | 1,800 | 941 | 867 | partial, because the request budget ran out |
| Jumia | 358 | 188 | 170 | ok |
| SolarShopNigeria | 4 | 4 | 0 | ok, because the shop holds 13 products and every one of them was already in the pool |
| Total | | | 1,037 | |

The live database after the batch, measured at 22:30 local time on 2026-11-18:

| Item | Count |
| --- | --- |
| Offers | 1,860, which are 1,535 from Jiji, 312 from Jumia and 13 from SolarShopNigeria |
| Candidates | 544 |
| Queued images | 1,857, which are 354 done, 6 failed and 1,497 pending |
| Run reports | 16 |
| Manual hardware rows | 40, all of them untouched |
| Price history rows | 2 |
| Database size | 5.8 MB of the 500 MB free limit |

The drainer reads about 3.6 images a minute, so the first batch needs about 7 hours to drain fully. About 7 percent of the attempts failed. The failures were upstream gateway timeouts and rate limits, and a few results that the Worker refused with status 400 because the model sent a field the validator does not allow. A failed row is tried again up to three times.

### What the daily cap allows

One new listing costs about 15 rows for the crawl and about 14 more when the drainer reads the image, so 29 rows over its life. The `modelmap` sync takes about 43,000 rows a day, and the daily Jiji job and sweep take about 9,000 more, so about 48,000 rows are left for listings. That is about 1,650 listings a day, and the drainer must empty the queue in the same day because the cap resets at 00:00 UTC.

The Jiji paths hold 87,029 adverts, and the feed reaches 40,809 of them at most because the wide path stops at 1,000 pages. At 1,650 listings a day the reachable adverts need about 24 days, and all of them need about 50 days.

### The daily batch

1. The task `Solar Sizer Backfill` runs every day at 06:00 local time. It waits for the image queue to drain before it crawls, because the drain costs more rows than the crawl and the cap is counted for one day.
2. The batch runs inside one UTC day, and the `modelmap` sync takes its share of that day at 03:00 UTC.
3. The batch numbers are set in the task action, and the script takes them as parameters. The daily batch asks for about 1,050 new listings.
4. The Jiji leg comes first. It gives the most new listings per request, and its feed is sorted by newest, so the newest adverts are always at the front.
