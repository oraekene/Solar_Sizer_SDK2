# Scraper provisioning runbook

This runbook lists the accounts, hosts and secrets that the hardware scraper needs. The design is in `docs/scraper-design.md`. You complete the steps that need your own accounts. The implementation builds the code.

## What exists now

| Item | Where | State |
| --- | --- | --- |
| Worker and D1 database | Cloudflare | Running |
| `scraper-alert` label | GitHub | Created |
| Kapso command line tool | This machine | Installed, not logged in |
| Fly.io account with one Machine in `jnb` | Fly.io | Not created |
| GitHub Actions secrets | GitHub | Not created |
| Worker secrets | Cloudflare Worker | Not created |
| Host secrets | Fly.io Machine | Not created |

## Secret inventory

| Secret | Lives in | Used by | Notes |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Worker environment, GitHub Actions, Fly Machine | Scraper, drainer | Use one value in all three places. The Worker already checks it against the `x-admin-key` header. |
| `ENCRYPTION_KEY` | Fly Machine | Gateway | 32 random bytes as hex. It encrypts the provider keys at rest. It never leaves the host. |
| `FREEAPI_CONFIG_JSON` | Fly Machine | Gateway | The provider keys, the routing strategy and the dashboard account. It holds plain secrets. |
| `WORKER_URL` | Fly Machine, GitHub Actions | Drainer, scraper | The public address of the Worker. |
| `KAPSO_API_KEY` | Worker environment | Alert cron | Sends the WhatsApp alert. |
| `KAPSO_PHONE_NUMBER_ID` | Worker environment | Alert cron | The WhatsApp number that sends the alert. |
| `KAPSO_ALERT_TO` | Worker environment | Alert cron | The owner number in international format, for example `2348012345678`. |
| `KAPSO_TEMPLATE_NAME` | Worker environment | Alert cron | The approved Meta template for the alert text. |
| `FX_RATE_URL` | GitHub Actions | Scraper | The JSON endpoint that returns the daily NGN/USD rate. |

The unified FreeLLMAPI key never leaves the host. The drainer reads it from the gateway database at startup.

## Step 1: Create the Fly.io account

1. Create the account at `fly.io/app/sign-up` and add a card. Fly.io has no free tier, but a personal organisation does not pay a bill under $5.
2. Install the Fly command line tool.

   On Windows:

   ```
   iwr https://fly.io/install.ps1 | iex
   ```

   On macOS or Linux:

   ```
   curl -L https://fly.io/install.sh | sh
   ```

3. Log in.

   ```
   fly auth login
   ```

## Step 2: Create the Machine and the volume

The implementation adds `scraper/host/Dockerfile` to the repo. Run these commands from the repo root after that file exists.

```
fly launch --no-deploy --name solar-sizer-gateway --region jnb --dockerfile scraper/host/Dockerfile
fly volumes create freellmapi_data --size 1 --region jnb
```

Set `fly.toml` to this content:

```toml
app = "solar-sizer-gateway"
primary_region = "jnb"

[build]
  dockerfile = "scraper/host/Dockerfile"

[env]
  PORT = "3001"

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

Do not add an `http_service` section. The gateway binds to the loopback interface, so Fly must not send public traffic to it.

Deploy the Machine and keep one copy in `jnb`:

```
fly deploy
fly scale count app=1 --region jnb
```

Check the state with `fly status`. The Machine must show as `running`.

## Step 3: Store the host secrets

1. Generate the encryption key on your own machine.

   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Write the gateway configuration to a file named `freellmapi.config.json`. Use this shape.

   ```json
   {
     "admin": { "email": "you@example.com", "password": "a password of at least 8 characters" },
     "keys": [ { "platform": "groq", "key": "gsk_...", "label": "main" } ],
     "routing": { "strategy": "balanced" }
   }
   ```

   Add one entry in `keys` for every free model provider that you use. The file holds plain secrets. Keep it out of the repo. Write it as one line of JSON.

3. Set the host secrets. The command reads the pairs from standard input.

   On Windows PowerShell:

   ```powershell
   @"
   ENCRYPTION_KEY=$env:ENCRYPTION_KEY
   FREEAPI_CONFIG_JSON=$(Get-Content -Raw freellmapi.config.json)
   ADMIN_PASSWORD=$env:ADMIN_PASSWORD
   WORKER_URL=$env:WORKER_URL
   "@ | fly secrets import -a solar-sizer-gateway
   ```

   On macOS or Linux:

   ```bash
   printf 'ENCRYPTION_KEY=%s\nFREEAPI_CONFIG_JSON=%s\nADMIN_PASSWORD=%s\nWORKER_URL=%s\n' \
     "$ENCRYPTION_KEY" "$(cat freellmapi.config.json)" "$ADMIN_PASSWORD" "$WORKER_URL" \
     | fly secrets import -a solar-sizer-gateway
   ```

4. Remove the local copy of the configuration file after the secrets are stored.

   ```
   Remove-Item freellmapi.config.json
   ```

## Step 4: Set the GitHub Actions secrets

The `gh` command line tool reads each value from standard input.

```
gh secret set ADMIN_PASSWORD --repo oraekene/Solar_Sizer_SDK2
gh secret set WORKER_URL --repo oraekene/Solar_Sizer_SDK2
gh secret set FX_RATE_URL --repo oraekene/Solar_Sizer_SDK2
```

Use this value for `FX_RATE_URL`:

```
https://open.er-api.com/v6/latest/USD
```

The response holds the rate in `rates.NGN` and the update time in `time_last_update_utc`. The scraper stores both with every converted price.

## Step 5: Set the Worker secrets

Run these commands from the repo root.

```
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put KAPSO_API_KEY
npx wrangler secret put KAPSO_PHONE_NUMBER_ID
npx wrangler secret put KAPSO_ALERT_TO
npx wrangler secret put KAPSO_TEMPLATE_NAME
```

The command reads each value from standard input. The `ADMIN_PASSWORD` value must match the value on the host and in GitHub Actions.

## Step 6: Connect WhatsApp through Kapso

1. Log in.

   ```
   kapso login
   ```

2. Start the setup and follow the hosted link.

   ```
   kapso setup
   ```

3. List the connected numbers and keep the `phone_number_id` of the number that sends the alert.

   ```
   kapso whatsapp numbers list --output json
   ```

4. Create a WhatsApp template for the alert text. Use the `create-template.mjs` script from the `integrate-whatsapp` skill. The template needs the `UTILITY` category and two named parameters, `{{reason}}` and `{{details}}`. Meta must approve the template before the alert can use it.

5. Store the template name in the Worker as `KAPSO_TEMPLATE_NAME`.

## Step 7: Confirm the alert path

Send a test message from the Kapso command line tool.

```
kapso whatsapp messages send --phone-number-id <PHONE_NUMBER_ID> --to <OWNER_NUMBER> --text "Solar Sizer scraper test"
```

The message arrives when the owner number has started a conversation with the Kapso number. Outside that 24-hour window, WhatsApp only accepts the approved template.

## Step 8: Verify the whole chain

Run these checks after the implementation lands.

1. The gateway answers on the host.

   ```
   fly ssh console -a solar-sizer-gateway -C "node /app/print-unified-key.mjs"
   ```

   The command prints the unified key. The drainer reads the same value at startup, so the output is a check and not a step.

2. The Machine logs show the gateway and the drainer.

   ```
   fly logs -a solar-sizer-gateway
   ```

3. The Worker rejects a request without the key and accepts it with the key.

   ```
   curl -i https://sdk2.<your subdomain>.workers.dev/api/scraper/heartbeat
   curl -i -H "x-admin-key: $ADMIN_PASSWORD" https://sdk2.<your subdomain>.workers.dev/api/scraper/heartbeat
   ```

   The first call answers `401`. The second call answers `200`.

4. The Actions secrets exist.

   ```
   gh secret list --repo oraekene/Solar_Sizer_SDK2
   ```

## What the implementation adds

| Path | Purpose |
| --- | --- |
| `scraper/host/Dockerfile` | Runs the FreeLLMAPI image with the drainer beside it. |
| `scraper/host/start.mjs` | Starts the gateway and the drainer, and stops the Machine when either one dies. |
| `scraper/host/drainer.mjs` | Polls the Worker for queued images, calls the gateway and posts the results back. |
| `scraper/host/print-unified-key.mjs` | Prints the unified key for the check in Step 8. |
| `scraper/adapters/` | One module for each source. |
| `scraper/worker-client.ts` | The authenticated calls into the Worker. |
| `.github/workflows/scraper-sweep.yml` | The daily sweep at 02:00 WAT. |
| `.github/workflows/scraper-discovery.yml` | The weekly crawl on Sunday at 03:00 WAT. |
| `worker/scraper/` | The admin routes for candidates, offers, the queue and the heartbeat. |
| `migrations/0009_scraper.sql` | The staging tables. |
| `wrangler.jsonc` | The scheduled trigger for the heartbeat watchdog. |

## Rotating a secret

1. Set the new value in every place that holds it.
2. Restart the Machine if the value belongs to the host.

   ```
   fly machine restart -a solar-sizer-gateway
   ```

3. If you rotate `ENCRYPTION_KEY`, run the rotation tool in the upstream project first. The key encrypts the provider keys at rest, so a plain change makes every provider key unreadable.
