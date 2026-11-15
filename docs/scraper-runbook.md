# Scraper provisioning runbook

This runbook lists the accounts, secrets and checks that the hardware scraper needs. The design is in `docs/scraper-design.md`, and the coded defaults are in `docs/scraper-implementation-defaults.md`. You complete the steps that need your own accounts. The code is already in the repository.

## What exists now

| Item | Where | State on 2026-11-15 |
| --- | --- | --- |
| Worker | `https://sdk2.solarsizer.workers.dev` | Running the current scraper code, deployed by hand as version `b7b450b1`. |
| D1 database | `solar-sizer-sdk2`, id `5abe0992-246a-43a9-aaf1-06c89c3d5872` | Migrations `0001` to `0012` applied on 2026-11-15. |
| `scraper-alert` label | `oraekene/Solar_Sizer_SDK2` | Created. |
| Kapso command line tool | This machine | Installed, not logged in. |
| Fly.io account and Machine | Fly.io | Not created. |
| GitHub Actions secrets | `oraekene/Solar_Sizer_SDK2` | `WORKER_URL` and `ADMIN_PASSWORD` are set. `CLOUDFLARE_API_TOKEN` is invalid. `CLOUDFLARE_ACCOUNT_ID` is missing. |
| Worker secrets | Cloudflare | `ADMIN_PASSWORD` holds the owner's value. The four Kapso values are missing. |

## What blocks the first live run

1. The Cloudflare token fails with `Invalid access token [code: 9109]` and `Authentication error [code: 10000]`. Replace it, and store the account id beside it.
2. The four Kapso values are missing, so the WhatsApp alert cannot send.
3. No always-on host exists yet. The sweep and discovery can run without it, but image enrichment waits until the host is running.

## Secret inventory

| Secret | Lives in | Used by | Notes |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Worker, GitHub Actions, host | Scraper, drainer, watchdog | One value in all three places. The Worker checks it against the `x-admin-key` header. |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions | Deploy workflow | Needs account-level Workers Scripts edit and D1 edit. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions | Deploy workflow | The account id from the Cloudflare dashboard or `npx wrangler whoami`. |
| `WORKER_URL` | GitHub Actions, host | Scraper, drainer | `https://sdk2.solarsizer.workers.dev`. Already set in Actions. |
| `ENCRYPTION_KEY` | Host | FreeLLMAPI gateway | 32 random bytes as hex. Encrypts the provider keys at rest. It never leaves the host. |
| `FREEAPI_CONFIG_JSON` | Host | FreeLLMAPI gateway | Provider keys, routing and the dashboard account. It holds plain secrets. |
| `KAPSO_API_KEY` | Worker | Alert route | Sends the WhatsApp alert. |
| `KAPSO_PHONE_NUMBER_ID` | Worker | Alert route | The WhatsApp number that sends the alert. |
| `KAPSO_ALERT_TO` | Worker | Alert route | The owner number in international format, for example `2348012345678`. |
| `KAPSO_TEMPLATE_NAME` | Worker | Alert route | An approved Meta template with one named body parameter, `message`. |

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

Done on 2026-11-15. The migrations were applied with the local Wrangler login and the Worker was deployed by hand, so the live Worker serves the current code. The deploy workflow will do the same work on the next push once the token works.

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

5. Write `fly.toml` at the repository root with this content.

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

6. Generate the encryption key.

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

7. Write the gateway configuration to a file named `freellmapi.config.json`. Keep it out of the repository.

   ```json
   {
     "admin": { "email": "you@example.com", "password": "a password of at least 8 characters" },
     "keys": [ { "platform": "groq", "key": "gsk_...", "label": "main" } ],
     "routing": { "strategy": "balanced" }
   }
   ```

   Add one entry in `keys` for every provider you use. Write the file as one line of JSON.

8. Store the host secrets. `WORKER_URL` is `https://sdk2.solarsizer.workers.dev`, and `ADMIN_PASSWORD` is the value from Step 1.

   ```powershell
   @"
   ENCRYPTION_KEY=$env:ENCRYPTION_KEY
   FREEAPI_CONFIG_JSON=$(Get-Content -Raw freellmapi.config.json)
   ADMIN_PASSWORD=$env:ADMIN_PASSWORD
   WORKER_URL=$env:WORKER_URL
   "@ | fly secrets import -a solar-sizer-gateway
   ```

9. Deploy and check the Machine.

   ```powershell
   fly deploy
   fly scale count app=1 --region jnb
   fly status -a solar-sizer-gateway
   fly logs -a solar-sizer-gateway
   ```

   The Machine must show as `running`, and the logs must show the gateway and the drainer starting.

10. Remove the local configuration file.

    ```powershell
    Remove-Item freellmapi.config.json
    ```

11. Check that the gateway holds a unified key.

    ```powershell
    fly ssh console -a solar-sizer-gateway -C "node /app/print-unified-key.mjs"
    ```

    The command prints the key. The drainer reads the same value at startup, so this is a check rather than a setup step.

12. Confirm the drainer loop. The Worker queue is drained every 30 seconds. A queued image gets a result, or an error that names the gateway call. If the gateway rejects the unified key, the drainer refreshes it once.

## Step 6: Connect WhatsApp through Kapso

1. Log in and start the setup.

   ```powershell
   kapso login
   kapso setup
   ```

2. List the connected numbers and keep the `phone_number_id` of the number that sends the alert.

   ```powershell
   kapso whatsapp numbers list --output json
   ```

3. Create a WhatsApp template with the `UTILITY` category and one named body parameter, `message`. The Worker sends `parameter_name: "message"`, so a template with two parameters will be refused.

4. Store the four Worker secrets.

   ```powershell
   npx wrangler secret put KAPSO_API_KEY
   npx wrangler secret put KAPSO_PHONE_NUMBER_ID
   npx wrangler secret put KAPSO_ALERT_TO
   npx wrangler secret put KAPSO_TEMPLATE_NAME
   ```

5. Send a test through the Worker route. The route returns `{ "success": true }` when Kapso accepts the message.

   ```powershell
   curl.exe -sS -X POST `
     -H "x-admin-key: $env:ADMIN_PASSWORD" `
     -H "content-type: application/json" `
     -d '{"message":"Solar Sizer scraper test"}' `
     "https://sdk2.solarsizer.workers.dev/api/scraper/alert"
   ```

   If the route answers `503`, a Kapso value is missing. If it answers `502`, Kapso refused the message; the response detail carries the first part of the reason.

6. The message arrives only when the owner number has an open conversation with the Kapso number, or when the approved template is used. The Worker always uses the template.

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
| The WhatsApp alert does not arrive | Check the four Worker secrets, the template name and the one `message` body parameter. A `502` carries Kapso's reason. |
