# Scraper provisioning runbook

This runbook lists the accounts, secrets and checks that the hardware scraper needs. The design is in `docs/scraper-design.md`, and the coded defaults are in `docs/scraper-implementation-defaults.md`. You complete the steps that need your own accounts. The code is already in the repository.

## What exists now

| Item | Where | State on 2026-11-16 |
| --- | --- | --- |
| Worker | `https://sdk2.solarsizer.workers.dev` | Running the current scraper code. Every push to `main` deploys it. The last code change was PR #24, the runner source split. |
| D1 database | `solar-sizer-sdk2`, id `5abe0992-246a-43a9-aaf1-06c89c3d5872` | Migrations `0001` to `0012` applied on 2026-11-15. It holds 1,860 offers, 544 candidates, 1,857 queued images and the 40 manual rows. |
| `scraper-alert` label | `oraekene/Solar_Sizer_SDK2` | Created. |
| Kapso command line tool | This machine | Installed, not logged in. |
| FreeLLMAPI gateway | This machine | Running on `127.0.0.1:3001`. The task `FreeLLMAPI Router` starts it at every logon. The drainer reads the images through it. |
| Fly.io command line tool | This machine | Installed at `C:\Users\rotim\.fly\bin\flyctl.exe`. Not used. The owner cannot pay for a plan, so the host is this machine. |
| `fly.toml` | Repository root | Written and committed. It holds the app name, the region, the volume and the process. It is only for a future paid plan. |
| `Solar Sizer Jiji Scrape` task | This machine | Runs every day at 23:30 local time. It crawls Jiji and writes to the Worker. |
| `Solar Sizer Enrichment Drainer` task | This machine | Runs the image drainer at every logon. It reads the gateway key from the local gateway database and writes the result back to the Worker. |
| Host secrets file | `C:\Users\rotim\AppData\Local\Temp\opencode\host-secrets.env` | Prepared on 2026-11-16 with `ENCRYPTION_KEY`, `FREEAPI_CONFIG_JSON`, `ADMIN_PASSWORD` and `WORKER_URL`. It stays outside the repository. |
| GitHub Actions secrets | `oraekene/Solar_Sizer_SDK2` | `WORKER_URL`, `ADMIN_PASSWORD`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set. The deploy workflow passed on 2026-11-15. |
| Worker secrets | Cloudflare | `ADMIN_PASSWORD` holds the owner's value. `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID` and `KAPSO_ALERT_TO` are set. `KAPSO_TEMPLATE_NAME` is optional. |

## What is open now

1. The WhatsApp alert can only reach the owner inside the 24 hour window that a reply to the Sandbox number opens. The GitHub issue always works. See Step 6.
2. The host is this machine. The task `Solar Sizer Enrichment Drainer` starts the drainer at every logon, and it calls the local gateway on `127.0.0.1:3001`. See Step 5.
3. The free D1 plan allows 100,000 rows written a day for the whole account, and `modelmap` alone used 130,564 rows in 18 hours on 2026-11-17. Its cron now runs once a day, so the scraper can write again after 00:00 UTC. The cap reset on 2026-11-18 and the first backfill batch ran without a cap error. See the daily row budget below.
4. Jiji answers the GitHub runner with a Cloudflare challenge on every path, so the runner holds no Jiji offer. This machine reaches Jiji, so the Jiji crawl runs here. See Step 4b.
5. The full list of open and partly built items is in `docs/scraper-open-items.md`.

## The first live crawl

The live state on 2026-11-16: three GitHub discovery runs and one sweep passed, then a Jiji only run from this machine added 57 offers and a second added 291. The database held 533 offers, 139 candidates and 537 queued images. Nothing was published and the 40 manual rows are untouched. Every write then failed because the account used its daily D1 rows, so the drainer logged a queue error every 30 seconds and kept running.

## The first backfill batch

The first backfill batch ran on 2026-11-18 from this machine, because the Jiji paths refuse the GitHub runner. The script is `C:\Users\rotim\.local\solar-sizer-scraper\run-backfill.ps1` and the log is `C:\Users\rotim\.local\solar-sizer-scraper\backfill.log`. It runs one leg per source and each leg has its own request budget.

| Leg | Requests | Pages | New listings | Run status |
| --- | --- | --- | --- | --- |
| Jiji | 1,800 | 941 | 867 | partial, because the request budget ran out |
| Jumia | 358 | 188 | 170 | ok |
| SolarShopNigeria | 4 | 4 | 0 | ok, because the shop holds 13 products and every one of them was already in the pool |
| Total | | | 1,037 | |

The database holds 1,860 offers after the batch, with 544 candidates, 1,857 queued images and the 40 manual rows untouched.

The drainer reads about 3.6 images a minute, so a batch of 1,000 listings needs about 7 hours to drain fully. About 7 percent of the attempts fail. The failures are upstream gateway timeouts and rate limits, and a few results that the Worker refuses with status 400 because the model sent a field the validator does not allow. A failed row is tried again up to three times.

Run the next batch only when the queue holds no pending rows. The drain costs more rows than the crawl, so a batch that runs while the queue is full spends the day on images.

## A manual backfill run

The owner wants every new listing, not a sample. The weekly crawl keeps its normal ceilings, and a manual run raises them for one run. The run resumes where the last one stopped, because a listing that is already known is skipped by its exact URL.

```powershell
gh workflow run scraper-discovery.yml `
  -f source_request_budget=8000 `
  -f page_budget=8000 `
  -f products_per_path=8000 `
  -f start_delay_ms=0
```

One request per second still applies, so 8000 requests per source takes about 2 hours 15 minutes. The job may run up to 350 minutes.

### The daily row budget

The free D1 plan allows 100,000 rows written a day for the whole account. The cap is shared by every database on the account, so `hermes`, `x-automation` and `modelmap` take part of it. Cloudflare counts one row for the table and one row for every index that the write touches. The index counts below were measured on the live schema.

| Write | Rows written |
| --- | --- |
| `hardware_offers` upsert | 10, which is 1 row and 9 index rows |
| `scraper_queue` insert | 4, which is 1 row and 3 index rows |
| `hardware_candidates` insert | 5, which is 1 row and 4 index rows, for about one candidate in four listings |
| `price_history` insert | 4, which is 1 row and 3 index rows, only when the price moved |
| Draining one queued image | 14, which is 4 for the queue row and 10 for the offer row |

So one new listing costs about 15 rows written, and about 29 rows over its life when the drainer reads the image.

The number of batches per day does not raise the coverage. The daily row budget is the limit, so a day with three batches covers the same listings as a day with one. Three smaller batches waste less when one of them fails, so use three batches once the daily ceiling is known.

### What the Jiji feed gives

The feed serves 20 adverts per page and answers at most 1,000 pages for one path, so one path gives at most 20,000 adverts. The `solar-energy-products` path holds 66,220 adverts, so the feed alone cannot reach all of them. The two battery paths hold 9,979 and 10,830 adverts, so the feed reaches all of them.

The feed answers with the sort order the Jiji web page uses. The adapter asks for `sort=new`, so the newest adverts are on the first pages and a new advert is always found there. Without that parameter the feed answers with the relevance order, which moves between requests.

### The batch settings

One batch of 1,500 listings costs about 22,500 rows for the crawl and the same again for the images, which leaves room for the sweep, the drainer and the other three databases.

```powershell
$env:SCRAPER_SOURCE_REQUEST_BUDGET = "3200"
$env:SCRAPER_PAGE_BUDGET = "1600"
$env:SCRAPER_PRODUCTS_PER_PATH = "1600"
```

The request budget must be twice the page budget, because every listing needs a product page and an image download.

The daily cap covers the crawl and the images together. After `modelmap` takes about 43,000 rows and the daily Jiji job and sweep take about 9,000 more, about 48,000 rows are left, which is about 1,650 listings a day. The drainer must empty the queue in the same day because the cap resets at 00:00 UTC.

### Who uses the daily rows

The other databases were measured on 2026-11-17 with `npx wrangler d1 insights <name> --time-period 18h`, which counts the rows written by every query in that window.

| Database | Rows written in 18 hours | What writes them |
| --- | --- | --- |
| `modelmap` | 130,564 | Its sync runs every four hours and re-inserts the whole model catalog each time. The `offerings` table alone took 116,403 rows across 40,500 insert statements. |
| `hermes` | 0 | Nothing. |
| `x-automation` | 0 | Nothing. |
| `solar-sizer-sdk2` | 0 | Every write failed because the account had already used its daily rows. |

So `modelmap` uses more than the whole daily budget by itself. No batch size works until its writes come down.

The first fix is already done. The `modelmap` Worker cron changed from every four hours to once a day, so its daily rows fell from about 130,000 to about 43,000 and the scraper can write again after 00:00 UTC.

```powershell
$token = (Select-String -Path "$env:USERPROFILE\.wrangler\config\default.toml" -Pattern 'oauth_token = "(.+)"').Matches[0].Groups[1].Value
$account = 'baadb8542499ad04ed9e0432215f3fb6'
$body = '[{"cron": "0 3 * * *"}]'
Invoke-RestMethod -Method Put -Uri "https://api.cloudflare.com/client/v4/accounts/$account/workers/scripts/modelmap/schedules" -Headers @{ Authorization = "Bearer $token"; 'content-type' = 'application/json' } -Body $body
```

The body must be a bare JSON array. Use `[{"cron": "0 */4 * * *"}]` to put the old schedule back and `[]` to turn the sync off.

Two fixes remain for the owner.

1. Make the `modelmap` sync write only the rows that changed. A row that is inserted with the same values still counts as a write. The sync can read the current value first and skip the write when it matches. This needs the `modelmap` source, which is not on this machine.
2. Move the `modelmap` database to another Cloudflare account. Each account has its own daily rows, so the two projects never compete. The steps for that move are below.

Then check the result with the same command. The other three databases must stay below 30,000 rows a day, or the batch size must shrink.

```powershell
npx wrangler d1 insights modelmap --time-period 18h
```

### Move this project to a second Cloudflare account

The owner can create a second account at `dash.cloudflare.com` and put this project there. Every account has its own 100,000 rows a day, so the scraper never competes with `modelmap` again. The steps below move the Solar Sizer database and Worker to the new account.

1. Create the account. Open `dash.cloudflare.com`, sign up with a different email address, and confirm the address.

2. Create an API token in the new account. Open My Profile, then API Tokens, then Create Token, then Create Custom Token. Give it the account permissions `Workers Scripts Edit`, `D1 Edit` and `Account Settings Read`. Copy the token it shows.

3. Copy the database. Run the export from the old account and the import into the new one.

   ```powershell
   $env:CLOUDFLARE_ACCOUNT_ID = 'baadb8542499ad04ed9e0432215f3fb6'
   npx wrangler d1 export solar-sizer-sdk2 --remote --output solar-sizer-sdk2.sql
   $env:CLOUDFLARE_ACCOUNT_ID = '<the new account id>'
   npx wrangler d1 create solar-sizer-sdk2
   npx wrangler d1 execute solar-sizer-sdk2 --remote --file solar-sizer-sdk2.sql
   ```

4. Put the new database id in `wrangler.jsonc` in place of `5abe0992-246a-43a9-aaf1-06c89c3d5872`.

5. Store the new values in GitHub Actions.

   ```powershell
   gh secret set CLOUDFLARE_ACCOUNT_ID --repo oraekene/Solar_Sizer_SDK2
   gh secret set CLOUDFLARE_API_TOKEN --repo oraekene/Solar_Sizer_SDK2
   ```

6. Apply the migrations on the new database and push a commit, which deploys the Worker to the new account.

   ```powershell
   npx wrangler d1 migrations apply solar-sizer-sdk2 --remote
   ```

7. Update `WORKER_URL` in GitHub Actions and in `C:\Users\rotim\.local\solar-sizer-scraper\secrets.env` to the new Worker address, and update the `Solar Sizer Jiji Scrape` and `Solar Sizer Enrichment Drainer` tasks if the new address differs.

8. Leave the old database alone for a week, then delete it from the old account.

## Secret inventory

| Secret | Lives in | Used by | Notes |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Worker, GitHub Actions, host | Scraper, drainer, watchdog | One value in all three places. The Worker checks it against the `x-admin-key` header. |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | Deploy workflow | Needs account-level Workers Scripts edit and D1 edit. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Deploy workflow | The account id from the Cloudflare dashboard or `npx wrangler whoami`. |
| `WORKER_URL` | GitHub Actions, host | Scraper, drainer | `https://sdk2.solarsizer.workers.dev`. Already set in Actions. |
| `ENCRYPTION_KEY` | Fly.io Machine | FreeLLMAPI gateway | 32 random bytes as hex. Encrypts the provider keys at rest. It never leaves the host. The local gateway holds its own copy in `C:\Users\rotim\.local\freellmapi-data`. |
| `FREEAPI_CONFIG_JSON` | Fly.io Machine | FreeLLMAPI gateway | Provider keys, routing and the dashboard account. It holds plain secrets. The local gateway reads its own file. |
| `KAPSO_API_KEY` | Worker | Alert route | Sends the WhatsApp alert. Set on 2026-11-15. |
| `KAPSO_PHONE_NUMBER_ID` | Worker | Alert route | The WhatsApp number that sends the alert. Set on 2026-11-15 to the Sandbox number `597907523413541`. |
| `KAPSO_ALERT_TO` | Worker | Alert route | The owner number in international format, for example `2348012345678`. Set on 2026-11-16. |
| `KAPSO_TEMPLATE_NAME` | Worker | Alert route | An approved Meta template with one named body parameter, `message`. Optional. Without it the Worker sends plain text, which the Sandbox number supports. |

`FX_RATE_URL` is no longer read. The rate order is fixed in `scraper/fx.ts`: NairaDaily first, then open.er-api.com.

The unified FreeLLMAPI key never leaves the host. The drainer reads it from the gateway database at startup.

## Step 1: Rotate the Worker admin password

Done on 2026-11-15. The value the owner chose is stored in the Worker and in GitHub Actions. The host still needs the same value in Step 5.

The existing value cannot be read back, so replace it with a value you keep.

1. Generate a value locally. Do not paste it into the repository.

   ```powershell
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

2. Store it in the Worker. The command reads the value from standard input.

   ```powershell
   npx wrangler secret put ADMIN_PASSWORD
   ```

3. Store the same value in GitHub Actions.

   ```powershell
   gh secret set ADMIN_PASSWORD --repo oraekene/Solar_Sizer_SDK2
   ```

4. Keep the value in your password manager. The host needs it in Step 5.

## Step 2: Replace the Cloudflare token

Done on 2026-11-15. The new token and the account id are stored in GitHub Actions, and the deploy workflow passed with them.

1. Open `dash.cloudflare.com/profile/api-tokens` and create a token with these account permissions:
   - Workers Scripts: Edit.
   - D1: Edit.
   - Account Settings: Read, so the account id can be checked.

   No zone permission is needed, because the Worker uses the `workers.dev` address.

2. Copy the account id from the dashboard, or run:

   ```powershell
   npx wrangler whoami
   ```

3. Store both values in GitHub Actions.

   ```powershell
   gh secret set CLOUDFLARE_API_TOKEN --repo oraekene/Solar_Sizer_SDK2
   gh secret set CLOUDFLARE_ACCOUNT_ID --repo oraekene/Solar_Sizer_SDK2
   ```

4. Confirm the names. Values are never printed.

   ```powershell
   gh secret list --repo oraekene/Solar_Sizer_SDK2
   ```

The deploy workflow applies remote D1 migrations before it deploys the Worker, so a working token fixes both the migration gap and the Worker code in one run.

## Step 3: Apply the migrations and deploy the Worker

Done on 2026-11-15. The migrations were applied with the local Wrangler login, and the deploy workflow now applies them and deploys the Worker on every push to main with the stored token. The last deploy published the alert path from PR #16.

```powershell
npx wrangler d1 migrations apply solar-sizer-sdk2 --remote
npm run build
npx wrangler deploy
```

The three pending migrations are:

| Migration | What it adds |
| --- | --- |
| `0010_scraper_fx.sql` | `price_ngn`, `price_ngn_rounded`, `fx_rate`, `fx_rate_date` and `fx_source` on `hardware_offers`. |
| `0011_scraper_payload_retention.sql` | `raw_payload_at`, backfilled from `scraped_at` or `created_at`. |
| `0012_scraper_price_currency.sql` | A currency column on `price_history`, so an offer change keeps its quoted currency. |

If the deploy workflow runs first, skip this step. The workflow does the same work.

## Step 4: Verify the Worker and run the scrapers

1. Check that the Worker answers.

   ```powershell
   curl.exe -i "https://sdk2.solarsizer.workers.dev/healthz"
   ```

   Expect `200`.

2. Check that the scraper route refuses a request without the key, then accepts it with the key.

   ```powershell
   curl.exe -i "https://sdk2.solarsizer.workers.dev/api/scraper/offers?limit=1"
   curl.exe -i -H "x-admin-key: $env:ADMIN_PASSWORD" "https://sdk2.solarsizer.workers.dev/api/scraper/offers?limit=1"
   ```

   The first call answers `401`. The second answers `200`.

3. Run one sweep by hand. Use `SCRAPER_START_DELAY_MS=0` so it starts at once.

   ```powershell
   $env:WORKER_URL = "https://sdk2.solarsizer.workers.dev"
   $env:ADMIN_PASSWORD = "<the value from Step 1>"
   $env:SCRAPER_START_DELAY_MS = "0"
   npm run scraper:sweep
   ```

4. Run one discovery crawl by hand after the sweep.

   ```powershell
   $env:SCRAPER_START_DELAY_MS = "0"
   npm run scraper:discovery
   ```

5. Read the run reports. The report shows pages, found offers, skips, candidates, publishes, exclusions, cross-posts, the FX rate, request counts per source, paused sources and their reasons, the number of purged payloads and any publish errors.

   ```powershell
   curl.exe -sS -H "x-admin-key: $env:ADMIN_PASSWORD" "https://sdk2.solarsizer.workers.dev/api/scraper/runs?limit=5"
   ```

6. Once the by-hand runs pass, start the workflows. They use the same secrets.

   ```powershell
   gh workflow run scraper-sweep.yml --repo oraekene/Solar_Sizer_SDK2
   gh workflow run scraper-discovery.yml --repo oraekene/Solar_Sizer_SDK2
   gh run list --repo oraekene/Solar_Sizer_SDK2 --limit 5
   ```

The first sweep checks nothing if the database has no offers yet. Run discovery first when the offers table is empty.

## Step 4b: Crawl Jiji from this machine

Jiji answers the GitHub runner with a Cloudflare challenge on every path, including `robots.txt`, so the runner holds no Jiji offer. This machine reaches Jiji, so the Jiji paths run here. The runner keeps Jumia and SolarShopNigeria.

The split holds in three places. The runner workflows set `SCRAPER_SOURCES` to `jumia,solarshopnigeria`. The Windows task sets it to `jiji`. The watchdog reads the `sources` field of a run report and watches only the runner sweeps, so the Jiji job on this machine can neither hide a failed runner sweep nor raise a false alert.

1. Set the source filter. `SCRAPER_SOURCES` names the sites to crawl, separated by commas, for example `jiji`. An empty value means every site.

   ```powershell
   $env:SCRAPER_SOURCES = "jiji"
   ```

2. Run one Jiji crawl by hand.

   ```powershell
   $env:WORKER_URL = "https://sdk2.solarsizer.workers.dev"
   $env:ADMIN_PASSWORD = "<the value from Step 1>"
   $env:SCRAPER_SOURCES = "jiji"
   $env:SCRAPER_START_DELAY_MS = "0"
   $env:SCRAPER_SOURCE_REQUEST_BUDGET = "600"
   $env:SCRAPER_PAGE_BUDGET = "600"
   $env:SCRAPER_PRODUCTS_PER_PATH = "100"
   node --experimental-strip-types scraper/run-discovery.ts
   ```

3. The daily task runs the same crawl from this machine. The script and its secret file stay outside the repository.

   | File | Purpose |
   | --- | --- |
   | `C:\Users\rotim\.local\solar-sizer-scraper\run-jiji.ps1` | Runs discovery, then the sweep, then writes the log. It sends the Worker alert when a run fails. |
   | `C:\Users\rotim\.local\solar-sizer-scraper\secrets.env` | Holds `WORKER_URL` and `ADMIN_PASSWORD`. |
   | `C:\Users\rotim\.local\solar-sizer-scraper\worktree` | A Git worktree that holds the scraper code. The task moves it to the latest `main` before each run, so the job never runs a half finished branch from the development checkout. |
   | `C:\Users\rotim\.local\solar-sizer-scraper\jiji-scrape.log` | The run log. |

4. The task runs at 23:30 local time, which is 22:30 UTC, so it finishes before the 01:00 UTC GitHub sweep. It runs as the signed in user, so it needs no administrator rights. It runs only while that user is logged on.

   ```powershell
   Get-ScheduledTask -TaskName "Solar Sizer Jiji Scrape"
   Start-ScheduledTask -TaskName "Solar Sizer Jiji Scrape"
   Get-Content "C:\Users\rotim\.local\solar-sizer-scraper\jiji-scrape.log" -Tail 40
   ```

   The Jiji category feed serves 20 adverts per page, and the runner walks the pages until the path product cap, the page budget or the end of the category stops it. A daily run with a 600 request budget reads about 30 feed pages per path, so it sees roughly 600 adverts on each Jiji path.

## Step 5: Run the always-on host on this machine

The host runs the enrichment drainer. It pulls work from the Worker over HTTPS, so it needs no tunnel and no public service. The FreeLLMAPI gateway already runs on this machine on `127.0.0.1:3001`, so the drainer has a vision model that reads the images. The owner cannot pay for a hosting plan, so this machine is the host.

1. The files live outside the repository.

   | File | Purpose |
   | --- | --- |
   | `C:\Users\rotim\.local\solar-sizer-scraper\run-drainer.ps1` | Reads the secret file, points the drainer at the local gateway and writes the log. |
   | `C:\Users\rotim\.local\solar-sizer-scraper\start-drainer-hidden.vbs` | Starts the script without a console window. |
   | `C:\Users\rotim\.local\solar-sizer-scraper\secrets.env` | Holds `WORKER_URL` and `ADMIN_PASSWORD`. |
   | `C:\Users\rotim\.local\solar-sizer-scraper\drainer-worktree` | A Git worktree with the drainer code. The task moves it to the latest `main` before it starts. |
   | `C:\Users\rotim\.local\solar-sizer-scraper\drainer.log` | The run log. |

2. The task starts the drainer at every logon and restarts it when it stops.

   ```powershell
   Get-ScheduledTask -TaskName "Solar Sizer Enrichment Drainer"
   Start-ScheduledTask -TaskName "Solar Sizer Enrichment Drainer"
   Get-Content "C:\Users\rotim\.local\solar-sizer-scraper\drainer.log" -Tail 20
   ```

   The task runs as the signed in user, so it needs no administrator rights. It runs only while that user is logged on.

3. The drainer needs the gateway. The task `FreeLLMAPI Router` starts it at every logon on the same loopback port.

   ```powershell
   Get-NetTCPConnection -LocalPort 3001 -State Listen
   ```

4. Confirm the drainer loop. The Worker queue is drained every 30 seconds, and the five images of one poll are read at the same time. A queued image gets a result, or an error that names the gateway call. If the gateway rejects the unified key, the drainer refreshes it once.

### The paid alternative

Fly.io runs the same two programs on a small Machine. It is only worth it when the owner can pay for a plan.

1. Create the account at `fly.io/app/sign-up` and add a card. A personal organisation does not pay a bill under $5.

2. Install the Fly command line tool.

   ```powershell
   iwr https://fly.io/install.ps1 | iex
   ```

3. Log in.

   ```powershell
   fly auth login
   ```

4. Create the app and the volume from the repository root. The Dockerfile is `scraper/host/Dockerfile`.

   ```powershell
   fly launch --no-deploy --name solar-sizer-gateway --region jnb --dockerfile scraper/host/Dockerfile
   fly volumes create freellmapi_data --size 1 --region jnb
   ```

5. Check `fly.toml` at the repository root. It is committed with this content, so `fly launch` writes the same file.

   ```toml
   app = "solar-sizer-gateway"
   primary_region = "jnb"

   [build]
     dockerfile = "scraper/host/Dockerfile"

   [env]
     PORT = "3001"
     HOST = "127.0.0.1"

   [mounts]
     source = "freellmapi_data"
     destination = "/app/server/data"

   [[vm]]
     size = "shared-cpu-1x"
     memory = "512mb"

   [processes]
     app = "node /app/start.mjs"

   [deploy]
     strategy = "rolling"
   ```

   Do not add an `http_service` section. The gateway binds to the loopback interface.

6. The secrets file is already prepared on this machine at `C:\Users\rotim\AppData\Local\Temp\opencode\host-secrets.env`. It holds `ENCRYPTION_KEY`, `FREEAPI_CONFIG_JSON`, `ADMIN_PASSWORD` and `WORKER_URL`. It stays outside the repository.

   ```powershell
   fly secrets import -a solar-sizer-gateway -f "C:\Users\rotim\AppData\Local\Temp\opencode\host-secrets.env"
   ```

   To build the same file by hand, generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, write the gateway configuration to `freellmapi.config.json` as one line of JSON with one `keys` entry for every provider, and import it.

   ```powershell
   @"
   ENCRYPTION_KEY=$env:ENCRYPTION_KEY
   FREEAPI_CONFIG_JSON=$(Get-Content -Raw freellmapi.config.json)
   ADMIN_PASSWORD=$env:ADMIN_PASSWORD
   WORKER_URL=$env:WORKER_URL
   "@ | fly secrets import -a solar-sizer-gateway
   ```

7. Deploy and check the Machine.

   ```powershell
   fly deploy
   fly scale count app=1 --region jnb
   fly status -a solar-sizer-gateway
   fly logs -a solar-sizer-gateway
   ```

   The Machine must show as `running`, and the logs must show the gateway and the drainer starting.

8. Remove the local configuration file.

    ```powershell
    Remove-Item freellmapi.config.json
    ```

9. Check that the gateway holds a unified key.

    ```powershell
    fly ssh console -a solar-sizer-gateway -C "node /app/print-unified-key.mjs"
    ```

    The command prints the key. The drainer reads the same value at startup, so this is a check rather than a setup step.

10. Confirm the drainer loop. The Worker queue is drained every 30 seconds. A queued image gets a result, or an error that names the gateway call. If the gateway rejects the unified key, the drainer refreshes it once.

## Step 6: Connect WhatsApp through Kapso

The project `opportunities whatsapp` has one number. It is the Kapso Sandbox number `597907523413541`, and the API key, that number id and the owner number are stored as Worker secrets. Kapso does not issue `KAPSO_ALERT_TO`. That value is the owner number in international format, with the country code and no plus sign or spaces, for example `2348012345678`.

The Sandbox number cannot send templates. Kapso refuses every template endpoint on it with `Sandbox WhatsApp configurations only support messaging endpoints`. It can send plain text, but only to a number that has an active Sandbox session. Use one of the two paths below.

### Path A: Sandbox text, works today

1. In the Kapso dashboard open `WhatsApp` then `Sandbox` in the project, press `Add Test Number`, enter the owner WhatsApp number and press `Create`.
2. Send the six character activation code to the Sandbox number `+56 9 2040 3095` from that same WhatsApp number. The code expires after 15 minutes, so create a new session if it lapses.
3. Store the owner number as `KAPSO_ALERT_TO` and leave `KAPSO_TEMPLATE_NAME` unset.

   ```powershell
   npx wrangler secret put KAPSO_ALERT_TO
   ```

4. Send the test in step 5 below. The Worker sends plain text when no template name is set.

5. Keep the customer service window open. WhatsApp refuses a text message that the owner did not ask for when the owner has not replied to the Sandbox number in the last 24 hours. The refusal is error `131047`, called `Re-engagement message`. A reply to the Sandbox number opens the window again for 24 hours. A production number with an approved template does not have this limit, because Path B sends outside the window.

### Path B: Production number with a template

1. Connect a production number in Kapso with `Set up number` or `Manual setup` on the `Phone numbers` page.
2. Create the template with these values.

   | Field | Value |
   | --- | --- |
   | Name | `solar_sizer_alert` |
   | Category | `UTILITY` |
   | Language | `en`, the code the Worker sends |
   | Parameter format | `NAMED` |
   | Body | `Solar Sizer alert: {{message}}` |
   | Header, footer, buttons | None |

3. Wait for Meta to approve the template, then store the two remaining secrets.

   ```powershell
   npx wrangler secret put KAPSO_ALERT_TO
   npx wrangler secret put KAPSO_TEMPLATE_NAME
   ```

4. Send the test in step 5 below. The Worker sends the template with one named body parameter, `message`, so a template with two parameters will be refused.

### Step 5: Send a test

The route returns `{ "success": true }` when Kapso accepts the message.

```powershell
curl.exe -sS -X POST `
  -H "x-admin-key: $env:ADMIN_PASSWORD" `
  -H "content-type: application/json" `
  -d '{"message":"Solar Sizer scraper test"}' `
  "https://sdk2.solarsizer.workers.dev/api/scraper/alert"
```

If the route answers `503`, a Kapso value is missing. If it answers `502`, Kapso refused the message; the response detail carries the first part of the reason. The Sandbox refuses a send with `Active sandbox session required to send messages` when the `to` number has no active session, and with `Re-engagement message` when the 24 hour window is closed. The route reads the delivery status after the send, so it answers `502` when WhatsApp refuses a message that Kapso accepted.

## Step 7: Verify the review path

1. Open the app with `?admin=true`, unlock it with the admin password, open the Hardware DB tab and press `Scraper review`.
2. Open a candidate. The modal shows the offers, the risk flags and the provenance.
3. Approve the candidate, edit a missing field if the screen asks for one, and publish it.
4. Confirm that the published row appears in the hardware table with `price_source: scraped`, that the candidate becomes `published`, and that a price history row exists when the price changed.
5. Confirm that a manual row cannot be replaced until the screen asks you to accept the scraped median.

A candidate with no fresh qualified offer is refused with `stale-candidate`. Run the sweep again before publishing in that case.

## Step 8: Confirm the alert path

1. Run the watchdog by hand while the last sweep is fresh. It must pass without opening an issue.

   ```powershell
   gh workflow run scraper-watchdog.yml --repo oraekene/Solar_Sizer_SDK2
   gh run list --repo oraekene/Solar_Sizer_SDK2 --limit 3
   ```

2. Send the Worker alert once with the test in Step 6. This proves the Kapso path without waiting for a stale sweep.

3. If a real stale sweep happens, the watchdog creates one issue titled `Scraper sweep did not run`, adds a comment on later failures, sends the WhatsApp alert and exits red. It never closes the issue automatically; close it by hand after recovery.

## Rotating a secret

1. Set the new value in every place that holds it.
2. Restart the host when the value belongs to the host.

   ```powershell
   fly machine restart -a solar-sizer-gateway
   ```

3. If you rotate `ENCRYPTION_KEY`, run the rotation tool in the upstream project first. The key encrypts the provider keys at rest, so a plain change makes every provider key unreadable.

## When something fails

| Symptom | Check |
| --- | --- |
| Actions deploy says `Invalid access token [code: 9109]` | The token is revoked or lacks Workers Scripts edit and D1 edit. Create a new token and set both secrets. |
| Migrations still show as pending | Run the manual commands in Step 3. The Workers Builds deployment does not apply migrations. |
| A source is missing from a run | Read `requests.pause_reasons` in the run report. A spent budget, a 403 or a repeated 429 or 503 pauses that source for the rest of the run. |
| Sweep publishes nothing | Check that the offers are qualified, in stock, on a piece basis, new and inside the 15 percent band. A manual row always waits for review. |
| Discovery finds no new offers | Known URLs are skipped by exact `source_url`. Delete a stale offer or wait for the source to publish a new listing. |
| The queue never drains | Check the drainer log. The drainer needs `WORKER_URL`, `ADMIN_PASSWORD` and a unified key in the gateway database. The gateway must listen on `127.0.0.1:3001`. |
| The Worker answers `D1_ERROR: Your account has exceeded D1's free tier daily row write limit` | The account used its 100,000 rows for the day. On 2026-11-17 the `modelmap` sync used them all. The cap resets at 00:00 UTC and is shared by every database on the account. See the daily row budget above. |
| The WhatsApp alert does not arrive | Check `KAPSO_ALERT_TO` and the Sandbox session for that number. A `502` carries Kapso's reason. `Re-engagement message` means the 24 hour window is closed. |
