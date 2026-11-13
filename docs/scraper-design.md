# Hardware Scraping System — Design v1 (phase one)

**Status:** draft, awaiting implementation. **Owner:** Kenechukwu Oraelosi. **Last updated:** 2026-11-13.

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
| 1 | One specialist solar retailer with spec tables; Jiji; Jumia | 1 | Price anchors and discovery |
| 2 | Konga, CDcare | 1b | Immediately after phase 1 proves the pattern |
| 3 | AliExpress, Temu | optional, later | Reference/spec only; excluded from price unless landed-cost model exists |

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
- `data` — the fully typed object (`Panel` or `Battery`), every required field present at one of the sources in Section 4.4.
- `tags` — category tag plus derived tags: `scraped`, `panel`/`battery`, plus flags for the row as needed, e.g. `representative` (see Section 4.4), `estimated-specs` (when any required field is class-derived).
- `description` — one neutral line: `Aggregated from N sellers, last checked YYYY-MM-DD. Median ₦X. Sources: <sites>`.

### 2.2 Offers (price evidence)

An offer is one seller listing of one canonical product. Required fields:

- `canonical_id`
- `source_site` — `specialist`, `jiji`, `jumia`, (later `konga`, `cdcare`, `aliexpress`, `temu`)
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

Every rejected or excluded ad is also written to an **archive** table with the same core fields plus its rejection/attraction `reason_code`, so it is never deleted and can be promoted later.

### 2.4 Identity

- `identity_key` — the canonical identifier: `brand:manufacturer|unbranded|generic` + `model|model_family` + key electrical facts (`watts`, `cell_type`, `form_factor` for panels; `chemistry`, `voltage`, `capacity_ah` for batteries); plus optional `gtin`/`mpn`.
- `alias_table` — per platform seller naming, so `9Solar`, `Nine Solar`, `Nine Solar Energy` map to one manufacturer.
- A canonical row is only merged when the key matches after normalization. Weaker matches become **reviewed possible duplicates**, never auto-merged.

### 2.5 Price history

Every published hardware price is appended to a `price_history` log (`hardware_row_id`, `price`, `median_at_publish`, `date`). Rows are kept indefinitely in compressed form for drift reporting.

---

## 3. Source mechanics and compliance

### 3.1 Runner

- **GitHub Actions scheduled workflow** is the scraper runner. It runs unattended, never depends on the local PC, and can parse full HTML.
- Each scraper is a Node job using plain `fetch`, no headless browser, because all three phase-one sites return server-rendered HTML.
- Job runs only while the page parses successfully; network-only failures are reported.

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
- **USD listings** are converted only when a rate and the rate date are both stored; otherwise excluded.
- **VAT** stays as quoted with a `vat_included` flag. The calculator ranks on shelf price, and no silent VAT adjustment is applied.

### 3.5 Trust policy

Hard gates (offer excluded):

- `used` or `foreign_used` condition.
- Dead listing (not found).
- Missing a required spec.
- Price far below the canonical median (a fake/bait signal).

Tier (controls qualification):

- **verified** — official/verified store or platform-verified seller.
- **established** — rating 4.0+ with 10+ reviews, or a known distributor.
- **unknown** — everything else.

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

FreeLLMAPI is a self-hostable Node 20 server, not bound to localhost by the project — 127.0.0.1 is the default binding in this machine's config. It runs on a **small always-on host** (Fly.io or Hetzner, roughly two to five dollars a month), because its SQLite database holds the per-key usage counters that keep the free-model pool under caps, and an ephemeral database forgets them.

Deployment notes:

- Single image: `ghcr.io/tashfeenahmed/freellmapi:latest`, multi-arch (amd64/arm64).
- Declarative startup config via `FREEAPI_CONFIG_JSON` or `FREEAPI_CONFIG_PATH`, containing provider keys, the `routing.strategy`, model list, and admin account; the router then serves the unified `freellmapi-…` bearer key at `/v1`.
- Provider keys are stored encrypted at rest; the `ENCRYPTION_KEY` is a repository secret, never hardcoded.
- It is never exposed to the public internet. Traffic is GitHub Actions → a private IP on the always-on host → FreeLLMAPI, so no dashboard login or TLS termination is required.

### 5.2 Model call governance

Because the free gateway rotates, rate-limits and can return nonsense:

- Every model response is **JSON-validated against a schema** and **cross-checked**. For OCR, the brand/model/Pmax must appear on the image and be consistent with the listing text. For visual verification, the model must return the same product id on repeated identical inputs.
- No model call can change a row unilaterally; all enrichment answers are suggestions or evidence.
- Calls are **queued by image hash and result-cached**, so the same photo never pays for a model twice.
- A failed model call never blocks publishing; the row keeps its highest-available provenance.
- The queue is drained by the always-on FreeLLMAPI host itself. The GitHub Actions scraper enqueues unknown images to a D1 table and moves on, so scraping never depends on model latency.

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

### 6.3 Archive

Every excluded or rejected ad is archived with `reason_code` (from the set in Section 8.4), price, seller, source URL and `scraped_at`. No entry is deleted. Bundles or multi-variant ads can be promoted into a kit row or split later without re-fetching.

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

Each run writes a report with: sources checked, offers re-checked, prices changed within band, prices queued, candidates created, candidates approved, candidates rejected, ambiguity reason codes with counts, model calls made, and errors.

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

## 11. Open items before implementation

- Confirm the always-on host platform (Fly.io vs Hetzner) and reserve it.
- Obtain and store the three secrets: the GitHub Actions runner token scope, the FreeLLMAPI unified bearer key, and the Kapso/WhatsApp sender key.
- Seed the phase-one watchlist: existing hardware rows plus the one specialist retailer's panel/battery categories and the Jiji + Jumia solar panel and battery category URLs.
- Decide the exact 30-product spot-check sampling method and record it in a test spec.
