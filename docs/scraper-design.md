# Hardware Scraping System — Design v1 (phase one)

**Status:** v1, gaps closed, awaiting implementation. **Owner:** Kenechukwu Oraelosi. **Last updated:** 2026-11-13.

This document captures every decision made in the engineering-grill session for the system that auto-populates the Solar Sizer hardware database from Nigerian e-commerce and solar-product sources. It is written so an agent can implement phase one from it, and so decisions can be reviewed, amended and versioned.

---

## 0. What we build, in one paragraph

A system that runs unattended, every day, discovering and re-checking solar panel and battery listings on Nigerian selling platforms, grouping each listing into a canonical hardware product, deriving a defensible per-piece price from seller offers, filling missing specs from a data ladder, quarantining fakes, used goods, ambiguous listings and unknown products, and surfacing every candidate and price change for admin review before any row touches the live hardware database or the calculator. Phase one covers panels and batteries only. The system must run while the laptop is off.

---

## 1. Scope for phase one

### 1.1 Tables

- **Phase one writes to the `hardware` table only**, via the staging table described in Section 5.3. `products`, internet kits and accessories are out of scope.

### 1.2 Hardware types

- **In scope:** `panel`, `battery`.
- **Postponed to phase two:** `inverter`, `powerstation`, `charge_controller`, `wiring`.

Rationale: panels and batteries are the two types that every system must have, and they are the two with listings available at every price point from brand-new to white-label. Inverters have the densest undocumented MPPT ceiling and the most fake stock, and they become tractable once the panel/battery pipeline has produced a clean dataset and review cadence.

### 1.3 Sources (equal price sources from the start)

| Tier | Sources | Phase | Role |
| --- | --- | --- | --- |
| 1 | SolarShopNigeria (specialist retailer with full spec tables and PDF datasheets); Jiji; Jumia | 1 | Price anchors and discovery |
| 1b | SolarMart, BuySolar.ng | 1b | Immediately after phase 1 proves the pattern |
| 2 | Konga, CDcare | 2 | Konga blocks its product detail pages and CDcare has no domain, so both need a new decision |
| 3 | AliExpress, Temu | optional, later | Reference/spec only; excluded from price unless landed-cost model exists |

The source inventory and the evidence behind each verdict are in `docs/sources-inventory.md`.

**Important correction to earlier notes:** general marketplaces are **not** treated as reference-only. They are equal price sources from the start, with their own price kinds as in Section 8. CDcare contributes installment prices; AliExpress/Temu contribute only if a landed-cost computation is implemented.

**Excluded from phase one, out of policy and technical reach:** Twitter/X, Facebook, Nairaland, Instagram, WhatsApp. These are closed or unstructured social graphs that require login, session tracking, or image-post analysis beyond the agreed scope. They may be added as a future source type only.

### 1.4 Success gates (exit criteria for the four-week probe)

After four weeks of daily runs, phase one is a success if:

- **Coverage:** at least 150 canonical products each have two or more qualified offers.
- **Accuracy:** a manual spot check of 30 random offers is 90% or more correct on brand, model and price.
- **Freshness:** 95% of published prices are re-checked within 48 hours.
- **Automation:** 80% or more of new candidates are approved without field edits.
- **Safety (hard stop):** no published panel has Voc below the real datasheet value; no battery carries an inferred chemistry or a wrong spec.

**Kill criteria:** accuracy below 80%, or wrong-product merges above one merge in 1,000 offers. The answer in that case is to narrow the sources, not to add more.

---

## 2. Data model

### 2.1 Canonical product (hardware row)

The calculator's hardware table is the golden record. Scraped data must never write its raw shape directly into it.

Columns (existing): `id`, `user_id`, `type`, `data`, `tags`, `description`, `created_at`.

The scraped row is written by the publish step with:

- `id` — deterministic slug from the identity key, prefixed `sc-` (for *scraped*), e.g. `sc-9solar-550-mono`. This avoids collisions with seeded ids and makes origin obvious.
- `user_id` — `system`.
- `type` — `panel` or `battery`.
- `data` — the fully typed object (`Panel` or `Battery`), every required field present at one of the sources in Section 4.1.
- `tags` — category tag plus derived tags: `scraped`, `panel`/`battery`, plus flags for the row as needed, e.g. `representative` (see Section 3.7), `estimated-specs` (when any required field is class-derived).
- `description` — one neutral line: `Aggregated from N sellers, last checked YYYY-MM-DD. Median ₦X. Sources: <sites>`.

### 2.2 Offers (price evidence)

An offer is one seller listing of one canonical product. The table is `hardware_offers`, and it holds every ad the scraper has ever seen. Required fields:

- `canonical_id`
- `source_site` — `solarshopnigeria`, `jiji`, `jumia`, (later `solarmart`, `buysolar`, `konga`, `cdcare`, `aliexpress`, `temu`)
- `source_url`
- `source_listing_id` — the platform's listing id when available, else hash of (site + url)
- `seller_id` — normalized seller identity on that site
- `seller_name`
- `price` — raw quoted price in the listing's currency
- `currency` — `NGN` (or USD for import)
- `price_kind` — `cash`, `installment_total`, `usd_landed`, `per_piece`
- `unit_basis` — `piece`, `pair`, `pallet`, `set`, `kw`, `carton`
- `unit_quantity` — quantity stated by the seller that the price covers; null if not stated
- `condition` — `new`, `used`, `foreign_used`, `refurbished`, `open_box`, `unknown`
- `in_stock` — `true`, `false`, `unknown`, plus `last_checked`
- `stated_specs` — `{watts, voc, isc, voltage, capacity_ah, type, ...}` as literally present
- `raw_payload` — extracted JSON from the page (90-day retention, Section 9)
- `trading_signals` — `{rating, review_count, official_store, warranty_mentioned, price_below_median_pct, suspicious_flags[]}`
- `scraped_at`
- `status` — `qualified`, `excluded`, `review_required`
- `price_source` — `manual` or `scraped`, on the *hardware row* (Section 6.1)

### 2.3 Candidates / review queue

`hardware_candidates` staging table:

- `id`, `canonical_id` or `bucket_key` (null when a new product is proposed)
- `status` — `new`, `enriched`, `suggested`, `pending_review`, `approved`, `published`, `rejected`, `duplicate`
- `current_hardware_row` — id if it merges onto an existing row
- `proposed_data` — typed object to write
- `proposed_price` — new median
- `current_price` — existing price if present
- `offers[]` — referenced offer ids
- `source_urls[]`
- `provenance` — for every field: `{field, value, source, kind: stated|datasheet|pool|model_parse|class_derived, confidence}`
- `created_at`, `reviewed_at`, `reviewer`
- `rejected_with_reason`

Every rejected or excluded ad keeps its row in `hardware_offers` with the status `excluded` and a `reason_code`, so it is never deleted and can be promoted later without a new fetch. The archive is therefore the excluded subset of the offers table rather than a second table that copies the same fields.

### 2.4 Identity

- `identity_key` — the canonical identifier: `brand:manufacturer|unbranded|generic` + `model|model_family` + key electrical facts (`watts`, `cell_type`, `form_factor` for panels; `chemistry`, `voltage`, `capacity_ah` for batteries); plus optional `gtin`/`mpn`.
- `alias_table` — per platform seller naming, so `9Solar`, `Nine Solar`, `Nine Solar Energy` map to one manufacturer.
- A canonical row is only merged when the key matches after normalization. Weaker matches become **reviewed possible duplicates**, never auto-merged.

### 2.5 Price history

Every published hardware price is appended to a `price_history` log (`hardware_row_id`, `price`, `median_at_publish`, `date`). An offer whose price changes appends a row with `offer_id` set instead, so the same table holds both the published prices and the offer movements. Rows are kept indefinitely in compressed form for drift reporting.

### 2.6 Offer dedupe and seller identity

- **Offer uniqueness** is the tuple `(source_site, source_listing_id)`, where `source_listing_id` is the platform's own listing id when available, or a stable hash of `(source_site, source_url, seller_id)` otherwise. Re-checking an offer updates the existing offer row; a changed price appends a row to `price_history` but does not create a duplicate offer.
- **Identical-offer collapse**: two ads from the same seller on the same platform with the same price and a matching perceptual hash count as one offer in the median. A matching hash on a different price is not collapsed; it is a different offer, and the photo match is recorded as a cross-post signal. Collapse is reported in the run so the admin can see how much of the pool is self-cannibalised.
- **Seller identity** is normalised per platform as `seller_id` (for example `jiji:seller:abc123`). The same seller on two platforms gets the same normalized `seller_id` only when a second signal agrees, such as a shared phone number or store handle the platforms expose; otherwise the platforms are treated as independent data points.
- **Trust aggregation** is per normalized `seller_id` across all their offers on all platforms: a seller that is an official store on Jumia and rated on Jiji is established everywhere, while each listing still contributes its own condition, price and availability to the pool.
- **Display and reporting**: the admin offers section shows the collapsed offer with a badge stating the number of identical ads collapsed; the collapse never reduces the seller's evidence base, because all their ads remain in the archive and continue to feed the trust score.

---

## 3. Source mechanics and compliance

### 3.1 Runner

- **GitHub Actions scheduled workflow** is the scraper runner. It runs unattended, never depends on the local PC, and can parse full HTML.
- Each scraper is a Node job using plain `fetch`, no headless browser, because all three phase-one sites return server-rendered HTML.
- **How each site is read**: SolarShopNigeria ships its prices, spec tables and stock words in the raw HTML. Jiji loads its category list with JavaScript, but the same list is served as JSON at `/api_web/v1/listing?slug=<category slug>&page=<n>`, so discovery uses that feed and the product pages render on the server. Jumia renders its category cards and product pages on the server, and each product page carries a JSON-LD Product block with the price, the stock, the condition and the seller.
- **Admin endpoint contract**: the runner posts to a single authenticated route using the existing `x-admin-key` header, which the Worker already checks against the `ADMIN_PASSWORD` environment value with a timing-safe compare and a failed-attempt lockout. The same value is stored as a GitHub Actions secret. The response is a small JSON status with a run id, and the runner treats any non-200 as a run failure rather than continuing.
- Job runs only while the page parses successfully; network-only failures are reported.
- **First-run backfill**: the initial crawl reads the existing hardware rows and the seeded watchlist only, writes candidates with `manual`-protect flags, and never overwrites a row whose `price_source` is already `manual`. The first successful run writes a heartbeat so the watchdog does not raise a false alert on day one.

### 3.2 Rate discipline

- Daily sweep: **one request per offer**, total ceiling **500 checks/day**.
- Weekly Sunday discovery crawl: **ceiling 200 listing pages**.
- Global pacing: **one request per second**, with a random delay up to 15 minutes on each run start, so the schedule is not a predictable clock.
- Jumia respects its robots.txt permission for bots that identify themselves, stay under 200 requests/minute and give an owner contact. Jiji leaves product pages open and only disallows admin/crm/test paths and `/test`. Konga disallows `/search` and `/product/*/details`, so phase 1b uses its listing roots and sitemap.
- The crawler UA identifies the bot: `SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)`.

### 3.3 Refresh policy

- Every known offer is re-checked **daily at 02:00 WAT**.
- Prices within a **15% band** of the last published price publish themselves at once.
- Any price change **outside the band** goes to the review queue with both numbers shown; the old price stays live.
- **Listing not found on three consecutive checks** → strike, then the product is archived and removed from quotes.
- **No successful check for 14 days** → offers are marked unverified; when every offer of a product is unverified, the product drops out of quotes and a system alert fires.
- **Never count scraper bot-blocks or timeouts as strikes** — only genuine listing-not-found responses. A blocked-but-present listing is a run failure, not a product failure.
- Any change of `unit_basis` or stated pack count always goes to review, regardless of percentage.

### 3.4 Unit and price semantics

- **Qualified offers must be `piece`-basis.** A pallet, pair, carton or set price is divided by the **seller's stated** count, never an assumed one, and only when the count is explicit and matches the product.
- **Derived per-piece prices** are allowed and labelled, so a pallet of 31 at ₦3,100,000 publishes as ₦100,000 per piece with `unit_basis: derived`, `unit_quantity: 31`.
- **Ambiguous ads are excluded, not averaged:** price ranges, "price depends on quantity", bundles, and installation-inclusive prices are dropped with a reason code and archived.
- **USD listings** are converted using a daily NGN/USD rate fetched from a single configured reference and stored with the rate date; a conversion is allowed only when the stored rate is less than seven days old. The rate source is a repository secret so it can be rotated without a redeploy. Phase one has no rate source, so the runner archives every price that is not in naira with the reason code `usd_rate_unavailable` instead of converting it.
- Converted prices are rounded to the nearest hundred naira before entering the pool, and the raw converted value is kept alongside the rounded figure for audit.
- **Rate-limit handling**: each source keeps its own soft budget below the global ceiling, a jittered backoff on a 429 or throttle response, and a mid-run pause that reports the skipped offers; a sustained challenge from one source pauses that source adapter rather than failing the whole run.
- **VAT** stays as quoted with a `vat_included` flag. The calculator ranks on shelf price, and no silent VAT adjustment is applied.

### 3.5 Trust policy

Hard gates (offer excluded):

- `used` or `foreign_used` condition.
- Dead listing (not found).
- Missing a required spec.
- Price far below the canonical median (a fake/bait signal).

Tier (controls qualification):

- **verified** — official store, platform-verified badge, or the brand's own distributor page.
- **established** — rating of 4.0 or higher with at least 10 reviews, or a seller known to stock the brand.
- **unknown** — everything else.
- **Price outlier** for the fake/bait gate is an offer priced below 60% of the current canonical median, which is the typical depth of a missing-zero typo or a bait listing and is far deeper than legitimate discounting. The threshold is configurable per source and is reviewed whenever the unknown-offer rate rises.

The median is computed from verified and established offers. **Unknown offers are archived and shown, but do not set the median.** If no verified or established offer exists, the median falls back to unknown offers with a `low-confidence-price` flag on the row; it is never dropped for want of a better offer.

Used/foreign-used listings are **kept with a condition label in the archive** and never shown in displays or quoted, and they feed a separate used-price series for later.

Trust does **not** add a new ranking axis in phase one. It decides which offers set the price. A reliability badge is a phase-two option.

### 3.6 Price basis when no piece offer exists

When a product has only pallet/pair prices and no piece offer:

- If a stated pack count exists and is unambiguous, publish the derived per-piece price with the label.
- If the count is ambiguous, the product stays **unpriced**.
- Never publish a price from a bundle, a multi-variant ad, or a quantity range.

### 3.7 Unbranded identity

Ads with no brand text land in an **unbranded bucket**, keyed on stated watts, cell type and form factor, e.g. `generic:550w:mono:half_cell`. The bucket:

- Never merges into a branded product or its median.
- Gets representative electrical values from branded peers of the same class: **highest Voc and lowest Isc** for that wattage class, biased in the safe direction.
- Carries a `representative` flag.
- Is promoted to a branded canonical row only when a brand claim agrees with a second signal (the listing title or a datasheet match), per Section 7.

**Correction to earlier notes:** this bucket remains in phase one as the final fallback. It is a panel-shaped fallback. Batteries practically always state chemistry, voltage and capacity in the title, so they should reach the bucket rarely; a battery without those three stated stays unpriced.

---

## 4. Extraction and enrichment

### 4.1 Required fields and publish bar

A row may publish only when every required field has a source at one of these ranks:

1. `datasheet` — manufacturer or official product page.
2. `stated` — stated on any qualifying offer.
3. `pool` — stated on another seller's qualifying offer of the same canonical product (cross-seller pooling).
4. `model_parse` — extracted deterministically from the model code, e.g. `550W` or `200Ah`.
5. `class_derived` — default for the chemistry/technology class, marked `class_derived` and `estimated-specs`.

Rank 5 values carry `confidence` low and a visible marker on the row. They are allowed for panels and for the bucket; for batteries they are disallowed for chemistry.

**Estimated rows in end-user quotes**: a row carrying `estimated-specs` or `representative` is still selectable in the calculator, because the unbranded panel market is mostly estimated and hiding it would make the tool useless, but the quote line shows a short "estimated specs" marker and the admin details modal lists each estimated field with its source and confidence. A battery row never shows this marker because a battery cannot publish on an inferred value.

### 4.2 Estimation safety

- A guessed Voc is **biased upward**, because an underestimated Voc can exceed the MPPT ceiling and damage hardware.
- A guessed Isc is **biased downward**, which undersizes rather than overstates charging current.
- Class-derived panel specs use the highest Voc and lowest Isc among branded peers of the same wattage class.

### 4.3 Spec enrichment ladder

For every offer, in order:

1. Read the listing text (title, description, spec table, JSON).
2. If brand, model and wattage are present and consistent, identity is known; fetch the datasheet.
3. Otherwise, OCR the label sticker. OCR recovers manufacturer, model, Pmax, Voc, Isc — the strongest single read for panels.
4. If OCR is unusable, run the VLM chain (Section 7).
5. If all identification fails, bucket on stated watts + cell type + form factor.

OCR brand claims require a second-signal agreement before promoting out of the bucket.

### 4.4 Datasheet sourcing

Datasheets are looked up by manufacturer + model family, starting with the brand's Nigerian distributor pages, then the global site, then a general web search by model. The datasheet is treated as `datasheet` provenance, not `stated`, and its values override offer-stated values for the same field.

### 4.5 Image analysis and dedupe

For each new listing:

1. Compute a perceptual hash; fall back to a small CLIP embedding when hashes collide.
2. **Hash hit** → the photo is proposed as belonging to an existing canonical product. A hash hit **proposes** identity and is rejected on disagreement with the title/spec; it never renames a row silently.
3. **Hash miss** → continue the enrichment ladder.
4. **Stored assets:** a content-addressed hash and a small thumbnail only; never the full image by default. Full images are fetched on demand in review. Hash index and thumbnails are retained until enrichment completes, then the raw image is discarded; hashes persist.

---

## 5. Platform and pipelines

### 5.1 FreeLLMAPI placement

FreeLLMAPI is a self-hostable Node 20 server, not bound to localhost by the project — 127.0.0.1 is the default binding in this machine's config. It runs on a **small always-on host** (Fly.io or Hetzner, roughly two to seven dollars a month), because its SQLite database holds the per-key usage counters that keep the free-model pool under caps, and an ephemeral database forgets them.

The host runs two processes: the FreeLLMAPI gateway, and a small **enrichment drainer** that pulls queued images from the Worker, calls the gateway on loopback, and writes the results back.

Deployment notes:

- Single image: `ghcr.io/tashfeenahmed/freellmapi:latest`, multi-arch (amd64/arm64). The container serves the API and the dashboard on port 3001.
- Required environment: `ENCRYPTION_KEY` (32 random bytes as hex) and `PORT=3001`. `ENCRYPTION_KEY` encrypts the provider keys at rest and never leaves the host.
- Declarative startup config via `FREEAPI_CONFIG_JSON` or `FREEAPI_CONFIG_PATH`, containing provider keys, the `routing.strategy`, model list, and admin account; the router then serves the unified `freellmapi-…` bearer key at `/v1`. That file holds plaintext secrets, so it is protected like the encryption key.
- The SQLite database lives at `/app/server/data/freeapi.db` in the container, or wherever `FREEAPI_DB_PATH` points. A host with an ephemeral disk needs `FREEAPI_DB_PATH` plus a backup target, or a persistent volume.
- The gateway binds to the loopback interface, because the only caller is the drainer on the same host.

#### The host pulls, it does not accept calls

**GitHub Actions runners cannot reach a private IP on a remote host.** A hosted runner sits in a Microsoft datacenter with no route to the host's private network, so an earlier version of this document was wrong when it described the traffic as running to a private IP.

The fix is not to build a private path. The fix is that **nothing calls the host**, because the pipeline already separates scraping from enrichment:

- GitHub Actions scrapes, extracts text, and writes a candidate plus an image hash to the Worker, then ends its job.
- The enrichment drainer on the always-on host polls the Worker for queued image hashes, downloads the image, calls `http://127.0.0.1:3001/v1/chat/completions` on loopback, and writes the OCR or VLM result back to the Worker.
- The Worker merges the enrichment result into the candidate when it arrives.

Every call in this design leaves the host as an outbound HTTPS request, so the host needs no inbound port, no public IP address, no tunnel, no reverse proxy and no Cloudflare Access service token. The gateway is reachable only from the machine it runs on.

The three outbound destinations are the Worker admin API, the model providers that FreeLLMAPI calls, and the Kapso API if the alert path is hosted on the host. Each one is an ordinary public HTTPS endpoint, and the Worker path already authenticates with the existing `x-admin-key` header.

The cost of this choice is that an enriched candidate appears minutes after the sweep instead of inside it. The publish bar already waits for a required field to have a source, so a row publishes on a later pass once the enrichment lands.

#### Host choice

| Option | Price | Memory | Persistent disk | Notes |
| --- | --- | --- | --- | --- |
| Fly.io `shared-cpu-1x` | $3.69/month for 512 MB, $6.70/month for 1 GB | 512 MB or 1 GB | 1 GB volume at $0.15/month | Deploys from the repo with no SSH. Region `jnb` (Johannesburg) is the closest to Nigeria. A personal organisation whose bill is under $5 has that bill waived. |
| Hetzner Cloud CX23 | €5.99/month | 4 GB | 40 GB NVMe included | The cheapest memory per dollar and a full disk for the SQLite file, but it needs account verification and hands-on host setup. |

**Recommendation: Fly.io**, one `shared-cpu-1x` Machine with 512 MB of RAM and a 1 GB volume, deployed to `jnb`, with `auto_stop_machines = false` and `min_machines_running = 1` so the gateway stays up and the usage counters survive a restart. It costs about $3.84 per month before egress, which a personal organisation does not pay below the $5 threshold, and it removes the SSH, patching and disk-loss work that a plain virtual machine would need. If the gateway later needs more memory for image reading, the change is one line: a 1 GB Machine at $6.70 per month.

The Machine runs the gateway and the drainer as two child processes of one supervisor, because Fly gives each process group its own Machine and a second Machine doubles the bill. The gateway keeps its port on loopback, so the Machine has no public HTTP service and Fly never routes traffic to it.

The scraping itself does not run on this host. GitHub Actions does the fetching, so the host's only job is model enrichment, which is not latency-sensitive.

### 5.2 Model call governance

Because the free gateway rotates, rate-limits and can return nonsense:

- Every model response is **JSON-validated against a schema** and **cross-checked**. For OCR, the brand/model/Pmax must appear on the image and be consistent with the listing text. For visual verification, the model must return the same product id on repeated identical inputs.
- No model call can change a row unilaterally; all enrichment answers are suggestions or evidence.
- Calls are **queued by image hash and result-cached**, so the same photo never pays for a model twice.
- A failed model call never blocks publishing; the row keeps its highest-available provenance.
- The queue is drained by the always-on FreeLLMAPI host itself. The GitHub Actions scraper enqueues unknown images in the `scraper_queue` table and moves on, so scraping never depends on model latency.
- **Test strategy**: scraper tests run against saved golden-page HTML snapshots stored in the repo with no live network access, enrichment tests run against a deterministic mock model that returns fixed, schema-valid responses, and a CI stage asserts that every offer reason code and every status value has a documented definition.
- **Spot-check sampling method**: for the 30-offer audit, take 30 offers by stratified random draw across all phase-one sources and all trust tiers, and score each on brand match, model match and price match against the offer's source page and its canonical product; the raw list of sampled offers is written to the run report so the audit is reproducible.

### 5.3 Pipeline stages

1. **Discover** (weekly Sunday 03:00 WAT): crawl source categories and saved search URLs; propose candidates.
2. **Sweep** (daily 02:00 WAT): re-check every known offer URL; extract price, condition, seller, stock, specs; apply ambiguity rules; compute candidate medians.
3. **Enrich** (as needed): queue image hash; OCR; VLM chain; datasheet fetch; alias resolution.
4. **Merge & propose**: group offers into canonical identities; compute medians; compute proposed `hardware` row; write `hardware_candidates`.
5. **Alert**: if no sweep wrote a heartbeat, open/update the `scraper-alert` issue.
6. **Review** (admin): approve, reject with reason, merge, edit, bulk-approve; publish.
7. **Publish**: write typed row into `hardware`, log price history, notify.
8. **Archive**: every excluded or rejected ad and every unknown product is archived with a reason code.

---

## 6. Admin and review

### 6.1 Manual vs scraped

The hardware row carries `price_source: manual` or `scraped`.

- A **manual** row never changes price automatically. Scraped offers still accumulate and a suggested median is shown alongside the manual price with the delta.
- Clicking accept flips the row to `scraped` and enables the 15% band.
- Existing seeded/manual rows are protected; a new scraper run never overwrites them.
- A one-time bulk action converts chosen manual rows to scraped after a couple of weeks of median agreement.

### 6.2 Review UI (extend the Database tab)

The admin Database tab is extended:

- A review queue badge showing pending count.
- A candidate list page: id, type, brand, watts/Ah, proposed price, sources, freshness, risk flags (low price, low trust, estimated specs).
- A row detail modal with an **offers section**: per-offer seller, price, unit basis, condition, trust tier, freshness, and a source link.
- Actions: **approve**, **reject with reason**, **merge into existing product**, **edit**, and **bulk approve** for same-canonical duplicates.
- The risk flags live on the candidate row, so the list shows the same warnings every time it loads.
- A row that misses a field the calculator reads never goes live. The publish route refuses it and names the missing fields, and the edit form fills them in. The required fields are a panel wattage, Voc and Isc, and a battery voltage, capacity, type, parallel limit and C-rate.
- A manual row keeps its price until the admin accepts the scraped median. The publish route refuses the row first and asks for that confirmation.

### 6.3 Archive

Every excluded or rejected ad is archived with `reason_code` (from the closed set in Section 8.3), price, seller, source URL and `scraped_at`. No entry is deleted. Bundles or multi-variant ads can be promoted into a kit row or split later without re-fetching, following the promotion rule in Section 8.4.

---

## 7. Identity enrichment chain

The four mechanisms are one pipeline, not alternatives. Escalation order:

1. **Perceptual hash / CLIP embedding** — cheap first pass. A hit proposes identity; a miss continues. A mismatch with the listing text sends the item to review rather than renaming it.
2. **Listing text** — brand, model, watts, chemistry, voltage, Ah.
3. **Sticker OCR** — manufacturer, model, Pmax, Voc, Isc; the strongest single read for panels. An OCR brand requires a second signal (listing title or datasheet match) before promotion.
4. **VLM chain** — when nothing is readable: the model describes the photo, a text query is built, the query searches the existing catalogue and the platforms, candidate pages are fetched, and the model visually verifies the match.

If all four fail, the ad falls into the unbranded bucket.

---

## 8. Alerts and observability

### 8.1 Channels

- **GitHub issue `scraper-alert`** is the record: reopened on each failure, closed after a clean run. It carries the source, the failing URL, the error type, the run link, and whether prices are still fresh.
- **WhatsApp via Kapso** wakes the owner.
- A separate **heartbeat watchdog** checks that yesterday's sweep wrote its heartbeat and raises the same issue if not.

### 8.2 Run report

Each run writes a report with: sources checked, offers re-checked, offers collapsed, unique sellers, trust tier distribution, prices changed within band, prices queued, candidates created, candidates approved, candidates rejected, ambiguity reason codes with counts, model calls made, and errors. The report is stored in a `run_report` table keyed by run id so it can be queried by date and source.

### 8.3 Reason codes

Every excluded or archived offer carries exactly one reason code from this fixed set. A new code is only added by editing this list and a test that asserts the set is closed.

- `used` — condition is used.
- `foreign_used` — condition is foreign used.
- `refurbished` — condition is refurbished or open box.
- `listing_not_found` — the platform reports the listing is gone.
- `missing_required_spec` — no qualifying source for a required field.
- `price_outlier` — priced below the fake/bait threshold.
- `price_range` — the ad quotes a range rather than one number.
- `price_depends_on_quantity` — the price varies with quantity and no count is stated.
- `call_for_price` — no number is published.
- `bundle` — the ad sells a system or several products together.
- `multi_variant` — the ad covers several variants with one price.
- `installation_included` — the price includes installation.
- `ambiguous_unit` — the unit basis or pack count cannot be read.
- `usd_rate_unavailable` — a USD price with no fresh stored rate.
- `trust_unknown_only` — excluded from the median because only unknown-tier offers remain, and no fallback was permitted for this product.
- `duplicate_of_existing_offer` — collapsed into an identical offer.
- `wrong_product_type` — the ad is not a panel or a battery.
- `not_solar_hardware` — the ad matched a search but is unrelated hardware.
- `unverified_stale` — no successful check inside the staleness window.
- `admin_rejected` — an admin rejected the candidate.
- `superseded` — a newer candidate replaced this one.

### 8.4 Archive promotion

An archived offer is never deleted and can be promoted without re-fetching the page. A promotion creates a new `hardware_candidates` row in `pending_review` that references the archived offer id, so the archive record and the new candidate keep their link. Promotion is allowed for any archived offer whose reason code describes ambiguity rather than a disqualifier, which means `price_range`, `price_depends_on_quantity`, `bundle`, `multi_variant`, `installation_included` and `ambiguous_unit` can be promoted after a human resolves the ambiguity, while `used`, `foreign_used`, `price_outlier` and `listing_not_found` cannot be promoted into a live price.

---

## 9. Retention

- Offer records and `price_history` are retained indefinitely in compressed form.
- `raw_payload` (the page JSON) is retained for **90 days**.
- Images: hash and thumbnail persist; full images are discarded after enrichment completes.
- **No full HTML pages are stored.**

---

## 10. Out of scope and known limits

- Social sources (Twitter/X, Facebook, Nairaland, Instagram, WhatsApp) are excluded by scope.
- Inverters, powerstations, charge controllers, wiring, and accessories are phase two.
- AliExpress/Temu contribute only if a landed-cost model is added.
- No seller rating history, no dispute history, no external review aggregation.
- No visual anti-counterfeit beyond price/trust signals and sticker OCR; counterfeit labels on genuine-looking panels cannot be fully distinguished by scraping alone.
- No guarantee that scraped prices include local taxes or delivery, and no automatic claim settlement for mispriced goods.

---

## 11. Deferred to later phases

Everything in this list was discussed and consciously postponed. Nothing here blocks phase one.

| Item | Phase | Why it waits |
| --- | --- | --- |
| Inverters, powerstations, charge controllers, wiring, accessories | 2 | Inverter MPPT ceilings and surge values are the least published specs and the most dangerous to guess. |
| `products` table, kits, accessories catalogue | 2 | Phase one proves the hardware pipeline first. |
| Konga and CDcare adapters | 1b | Accepted as "immediately after" the first three sources; Konga disallows `/search` and product detail paths, so its adapter needs a different discovery route. |
| AliExpress and Temu price contribution | 3 | Needs a landed-cost model covering shipping, duty and FX before an import price may enter a median. |
| Social sources (Twitter/X, Facebook, Nairaland, Instagram, WhatsApp) | out of scope | Closed or unstructured graphs needing login, session tracking or image-post analysis. |
| CDcare installment price as a normal price kind | 1b | An installment total is not comparable to a cash price until its own conversion rule is defined. |
| Used-price series | 2 | The used archive is populated in phase one, but no series or display is built yet. |
| Reliability badge as a ranking signal | 2 | Phase one uses trust only to qualify offers; a badge would add a ranking axis. |
| Seller rating history, dispute history, external review aggregation | 2 | No public data source for these was verified. |
| True external reverse image search (Lens, Bing Visual Search, Yandex, TinEye) | 2 | No dependable free API; the useful version is the admin escalation button, not the automated path. |
| Full visual anti-counterfeit beyond price, trust and sticker OCR | 2 | A counterfeit sticker is a claim, not proof, and scraping cannot settle it. |
| VAT adjustment, landed cost, delivery normalisation | 2 | The calculator ranks on shelf price, so changing the price basis now would distort every existing quote. |
| Automatic kit promotion from an archived bundle | 2 | The archive promotion path exists in phase one, but splitting a bundle into a kit row needs the `products` table. |

## 12. Open items before implementation

- Create the Fly.io account, the `jnb` Machine with its 1 GB volume, and the host secrets, following `docs/scraper-runbook.md`.
- Store the remaining secrets: the Worker `ADMIN_PASSWORD`, the GitHub Actions copies of `ADMIN_PASSWORD`, `WORKER_URL` and `FX_RATE_URL`, and the Kapso values for the alert.
- Confirm the SolarShopNigeria brand filter slugs on the first crawl. Only `jinko-solar` was confirmed.
- Confirm that a GitHub Actions runner can read the full Jumia page. A Node fetch returned a reduced page while another client returned the full page, so the runner may see a thinner page than expected.
