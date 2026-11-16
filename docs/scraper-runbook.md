# Scraper provisioning runbook

This runbook lists the accounts, secrets and checks that the hardware scraper needs. The design is in `docs/scraper-design.md`, and the coded defaults are in `docs/scraper-implementation-defaults.md`. You complete the steps that need your own accounts. The code is already in the repository.

## What exists now

| Item | Where | State on 2026-11-16 |
| --- | --- | --- |
| Worker | `https://sdk2.solarsizer.workers.dev` | Running the current scraper code. Every push to `main` deploys it. The last code change was PR #19, the WhatsApp delivery status check. |
| D1 database | `solar-sizer-sdk2`, id `5abe0992-246a-43a9-aaf1-06c89c3d5872` | Migrations `0001` to `0012` applied on 2026-11-15. It holds 212 offers, 79 candidates and 191 queued images. |
| `scraper-alert` label | `oraekene/Solar_Sizer_SDK2` | Created. |
| Kapso command line tool | This machine | Installed, not logged in. |
| Fly.io command line tool | This machine | Installed at `C:\Users\rotim\.fly\bin\flyctl.exe`. The account is not created yet. |
| `fly.toml` | Repository root | Written and committed. It holds the app name, the region, the volume and the process. |
| Host secrets file | `C:\Users\rotim\AppData\Local\Temp\opencode\host-secrets.env` | Prepared on 2026-11-16 with `ENCRYPTION_KEY`, `FREEAPI_CONFIG_JSON`, `ADMIN_PASSWORD` and `WORKER_URL`. It stays outside the repository. |
| GitHub Actions secrets | `oraekene/Solar_Sizer_SDK2` | `WORKER_URL`, `ADMIN_PASSWORD`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set. The deploy workflow passed on 2026-11-15. |
| Worker secrets | Cloudflare | `ADMIN_PASSWORD` holds the owner's value. `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID` and `KAPSO_ALERT_TO` are set. `KAPSO_TEMPLATE_NAME` is optional. |

## What blocks the first live run

1. The WhatsApp alert can only reach the owner inside the 24 hour window that a reply to the Sandbox number opens. The GitHub issue always works. See Step 6.
2. No always-on host exists yet. The sweep and discovery can run without it, but image enrichment waits until the host is running.
3. Jiji answers the GitHub runner with a Cloudflare challenge on every path, so the runner holds no Jiji offer. This machine reaches Jiji, so the Jiji crawl runs here. See Step 4b.

## The first live crawl

The live state on 2026-11-16: three GitHub discovery runs and one sweep passed, then a Jiji only run from this machine added 57 offers. The database holds 212 offers, 79 candidates and 191 queued images. Nothing was published and the 40 manual rows are untouched.

## A manual backfill run

The owner wants every new listing, not a sample. The weekly crawl keeps its normal ceilings, and a manual run raises them for one run. The run resumes where the last one stopped, because a listing that is already known is skipped by its exact URL.

```powershell
gh workflow run scraper-discovery.yml `
  -f source_request_budget=8000 `
  -f page_budget=8000 `
  -f products_per_path=8000 `
  -f start_delay_ms=0
```

One request per second still applies, so 8000 requests per source takes about 2 hours 15 minutes. The job may run up to 350 minutes. The free D1 plan writes 100,000 rows a day, so a backfill of about 23,000 listings needs the paid plan or two or three daily batches.

## Secret inventory

| Secret | Lives in | Used by | Notes |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Worker, GitHub Actions, host | Scraper, drainer, watchdog | One value in all three places. The Worker checks it against the `x-admin-key` header. |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | Deploy workflow | Needs account-level Workers Scripts edit and D1 edit. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Deploy workflow | The account id from the Cloudflare dashboard or `npx wrangler whoami`. |
| `WORKER_URL` | GitHub Actions, host | Scraper, drainer | `https://sdk2.solarsizer.workers.dev`. Already set in Actions. |
| `ENCRYPTION_KEY` | Host | FreeLLMAPI gateway | 32 random bytes as hex. Encrypts the provider keys at rest. It never leaves the host. |
| `FREEAPI_CONFIG_JSON` | Host | FreeLLMAPI gateway | Provider keys, routing and the dashboard account. It holds plain secrets. |
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
   | `C:\Users\rotim\.local\solar-sizer-scraper\jiji-scrape.log` | The run log. |

4. The task runs at 23:30 local time, which is 22:30 UTC, so it finishes before the 01:00 UTC GitHub sweep. It runs as the signed in user, so it needs no administrator rights. It runs only while that user is logged on.

   ```powershell
   Get-ScheduledTask -TaskName "Solar Sizer Jiji Scrape"
   Start-ScheduledTask -TaskName "Solar Sizer Jiji Scrape"
   Get-Content "C:\Users\rotim\.local\solar-sizer-scraper\jiji-scrape.log" -Tail 40
   ```

   The Jiji category feed serves 20 adverts per page, and the runner walks the pages until the path product cap, the page budget or the end of the category stops it. A daily run with a 600 request budget reads about 30 feed pages per path, so it sees roughly 600 adverts on each Jiji path.

## Step 5: Create the always-on host

The host runs the FreeLLMAPI gateway and the enrichment drainer. It pulls work from the Worker over HTTPS, so it needs no tunnel and no public service.

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
| The queue never drains | Check `fly logs`. The drainer needs `WORKER_URL`, `ADMIN_PASSWORD` and a unified key in the gateway database. |
| The WhatsApp alert does not arrive | Check `KAPSO_ALERT_TO` and the Sandbox session for that number. A `502` carries Kapso's reason. `Re-engagement message` means the 24 hour window is closed. |
