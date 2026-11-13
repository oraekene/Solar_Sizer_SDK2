# Nigerian solar source inventory

This file records every Nigerian solar shop and marketplace that was checked for the hardware scraper. Each entry states what the site exposes and whether it can supply a price for a panel or a battery. The design is in `docs/scraper-design.md`. The watchlist is in `docs/scraper-watchlist.json`.

Every entry below was fetched on 2026-11-13 with the crawler user agent `SolarSizerBot/0.1 (+https://solarsizer.com/bot; contact@solarsizer.com)`. A site that did not answer is listed under the dead section at the end.

## Phase-one recommendation

Use SolarShopNigeria as the specialist retailer for phase one. It publishes the full manufacturer specification table for every product, including the open-circuit voltage and the short-circuit current. It publishes the manufacturer PDF for each product. It states the pack count for every bulk price, so the per-piece price never needs an assumption. It states the stock status in words, so the stock tri-state never needs a guess. It has no robots file, so it publishes no crawl limits.

Jiji and Jumia stay the two marketplaces for price discovery and seller spread. Jiji supplies the condition field, so used and foreign-used listings can be archived rather than quoted.

BuySolar.ng is the strongest candidate for phase one plus. Its product pages carry a JSON-LD block with the price, the currency, the availability, the condition and the review rating. Its category pages load the products with JavaScript, so the discovery crawl must read its sitemap instead.

## Good sources

### The Solar Shop (solarshopnigeria.com)

- Type: specialist solar retailer in Lagos, trading since 2012, with an office in Abuja and one in Accra.
- Panels: yes, 7 products in the PV Modules category. Batteries: yes, 6 products in the Batteries category.
- Spec table: yes. The product page carries the full manufacturer table with the maximum power, the maximum power voltage, the maximum power current, the open-circuit voltage, the short-circuit current, the efficiency, the cell type, the dimensions, the nominal operating cell temperature, the temperature coefficients and the certifications. The listing card carries a short line such as `Jinko Solar · 535 Wp · 20.75%`.
- Seller identity and rating: one seller, The Solar Shop Limited. It holds the official distribution for Jinko, Victron, Phocos, Schneider, SMA and Huawei, so its offers count as verified tier.
- Condition field: no. Every item is new. The clearance badge marks a discount and not a condition.
- Unit basis or pack count: yes. A pallet line reads `Full Pallet (27 Pieces)`, `Bulk · 27 pcs` and `≈ ₦111,111.11 per unit`. The product page repeats it as `27 units for ₦3,000,000 (₦111,111.11 each, save 8%)`. The specification table also lists the packaging as 27 pieces per pallet.
- robots.txt: the file returns 404. The site publishes no crawl rules.
- HTTP status and server-rendered: 200. The price, the specification line and the stock text are present in the raw HTML, so plain `fetch` works.
- Stock text: `In stock · Lagos`, `In stock at Victoria Island, ready for pickup`, `Lead time applies` and `Pre-order`. The category page also accepts `&stock=in` and `&clearance=1` filters.
- Example panel URL: https://solarshopnigeria.com/products/jinko-solar-eagle-535w-bifacial-solar-module, ₦120,400, Jinko Solar Eagle 535 Wp, Voc 49.42 V, Isc 13.79 A, PDF datasheet link, SKU `TSS-JINKO-SOLAR-EAGLE-535W-BIFACIAL-SOLAR-MODULE`.
- Example battery URL: https://solarshopnigeria.com/products/jinko-solar-jks-b51100-5-12-kwh-lithium-ion-battery, ₦1,170,100, Jinko Solar JKS-51100, LFP, 5.12 kWh, 51.2 V, PDF datasheet link.
- Verdict: GOOD. It is the only phase-one site with electrical specifications, datasheets, pack counts and stock words.

### BuySolar.ng (buysolar.ng)

- Type: specialist solar marketplace.
- Panels: yes, listed in the sitemap. Batteries: yes, listed in the sitemap.
- Spec table: no electrical table. The product page carries a JSON-LD block with the name, the brand, the price, the currency `NGN`, the availability, the condition and the review rating. A Jinko Tiger Neo 615 W page reports `price: 142000`, `availability: InStock`, `itemCondition: NewCondition` and `ratingValue: 4.8` with `reviewCount: 15`.
- Seller identity and rating: yes, through the JSON-LD rating and the merchant return policy.
- Condition field: yes, through the JSON-LD `itemCondition`.
- Unit basis or pack count: no.
- robots.txt: allows `/category/` and `/product/` for Googlebot and for the AI crawler group. It blocks `/api/`, `/account/`, `/checkout/` and `/admin/`. It has no `User-agent: *` group, so other crawlers meet no restriction.
- HTTP status and server-rendered: the product pages return 200 with the JSON-LD in the raw HTML. The category pages return 200 but carry no prices in the raw HTML, because the product list loads with JavaScript.
- Discovery route: the sitemap at https://www.buysolar.ng/sitemap.xml lists the category pages and every product URL. The sitemap holds panel and battery URLs such as `/product/panel-jinko-tiger-neo-615w-bifacial` and `/product/bat-cworth-24v-100ah-lifepo4`.
- Example panel URL: https://www.buysolar.ng/product/panel-jinko-tiger-neo-615w-bifacial, ₦142,000, Jinko Tiger Neo 615 W bifacial.
- Example battery URL: https://www.buysolar.ng/product/bat-cworth-24v-100ah-lifepo4, Cworth 24 V 100 Ah LiFePO4.
- Verdict: GOOD. The JSON-LD gives the price, the stock and the seller rating in one parse. The discovery crawl must use the sitemap.

### Jiji (jiji.ng)

- Type: general marketplace.
- Panels: yes. Batteries: yes, 8,835 results at the solar battery path.
- Spec table: no. The listing shows the title and the price. The panel wattage and the battery capacity must be parsed from the title.
- Seller identity and rating: yes. The seller facet and the seller badge are on the page. The seller tiers are Diamond, Enterprise and Popular.
- Condition field: yes. The condition facet counts Brand New 6,347, Refurbished 15 and Used 710.
- Unit basis or pack count: no.
- robots.txt: allows the product and the category paths. It blocks `/test/*`, `/admin/*`, `/crm/*` and `/auth/facebook*`. Bingbot alone is blocked from the query paths.
- HTTP status and server-rendered: 200. The page data sits in the `window.__NUXT__` payload.
- Breadcrumbs: Repair and Construction, then Electrical Equipment, then Solar and Renewable at `/solar-energy-products`.
- Example panel URL: https://jiji.ng/electronics?query=solar%20panel.
- Example battery URL: https://jiji.ng/272-solar-batteries, 8,835 results.
- Verdict: GOOD. It is the phase-one marketplace for price spread, and it supplies the condition field.

### Jumia Nigeria (jumia.com.ng)

- Type: general marketplace.
- Panels: yes, 579 results at the solar panels path. Batteries: yes, 1,800 results at the solar battery path.
- Spec table: no electrical table. The title carries the wattage, the capacity and the brand.
- Seller identity and rating: yes. The seller name, the seller score and the rating facet are on the page.
- Condition field: yes, through the shipping and the condition facets.
- Unit basis or pack count: no.
- robots.txt: the file states that scraping is allowed when the user agent names the bot, the bot has an owner contact and the crawler sends fewer than 200 requests per minute. It blocks the facet query paths, which include `*price=`, `*rating=`, `*wattage=`, `*capacity=`, `*battery=`, `*power=`, `*tag=`, `*sort=` and `*q=`. It also blocks the paths `/*/generic/`, `/*/general/`, `*/brands/`, `*/seller/`, `*/top-sellers/`, `*/new-products/` and `*/special-price/`, and the three-level paths `/*/*/*/`. The brand paths under a category, such as `/solar-panels/jinko/`, stay allowed.
- HTTP status and server-rendered: 200. The names and the prices sit in the raw HTML.
- Example panel URL: https://www.jumia.com.ng/solar-panels/, 579 results.
- Example battery URL: https://www.jumia.com.ng/solar-battery-chargers-charging-kits/, 1,800 results.
- Verdict: GOOD. It stays the largest price pool, but the crawler must not use the facet URLs or the generic brand paths.

## Usable sources

### SolarMart (solarmart.ng)

- Type: specialist marketplace in Lagos.
- Panels: yes, 6 results in the solar panels category. Batteries: yes.
- Spec table: no. The card shows the name, the brand and the price only.
- Seller identity and rating: one seller, SolarMart. Every product reads `No reviews yet`, so the trust tier stays unknown until the shop has reviews.
- Condition field: no.
- Unit basis or pack count: no.
- robots.txt: allows the whole site. It blocks `/admin`, `/installer`, `/affiliate`, `/account`, `/checkout`, `/cart` and `/payment`, and it blocks the named AI training crawlers. The content signal reads `search=yes, ai-train=no, use=reference`.
- HTTP status and server-rendered: 200. The product page carries a JSON-LD block with the name, the SKU, the brand, the price, the availability and the seller name.
- Example panel URL: https://solarmart.ng/p/450w-monocrystalline-solar-panel, ₦135,000, Jinko 620 W bifacial.
- Example battery URL: https://solarmart.ng/c/batteries.
- Verdict: USABLE. The prices are clean and the JSON-LD is easy to parse, but the catalogue holds only 6 panels and no specifications. One trap: the URL slug does not match the product name, so the scraper must read the JSON-LD name and not the slug.

## Rejected sources

### itel Energy (itelenergy.com)

- Type: brand official store.
- Panels: no. Batteries: no.
- HTTP status and server-rendered: 200, but the page shows a `Launching Soon` counter and no catalogue.
- Verdict: POOR. The brand sells through the Jumia and the BuySolar.ng stores instead, and the watchlist uses those paths.

### ValKing Solar (valkingsolar.com)

- Type: dealer, named in the original request.
- HTTP status: no answer. The domain has no DNS record, and the same holds for `valkingsolar.com.ng`, `valkingsolar.ng`, `valkingsolar.co`, `valkingenergy.com` and `valkingenergy.com.ng`.
- Verdict: BLOCKED. The domain does not resolve, so no listing can be read. If the business trades under another name, the owner must supply the working address.

### CDcare (cdcare.com.ng)

- Type: dealer, named in the original request.
- HTTP status: no answer. The domain has no DNS record. The address `cdcare.com` redirects to `cdcare.org`, which is a dialysis care provider in the United States and not a solar shop.
- Verdict: BLOCKED. The domain does not resolve, and the name now belongs to an unrelated business.

### Solar Home (solarhome.ng)

- Type: installer with a WooCommerce shop in Lagos, Ibadan and Jos.
- Panels: yes, 5 panel products. Batteries: yes, 1 tubular battery.
- Spec table: no. A panel card shows the type, the power output and the weight. The battery card shows the type, the capacity, the voltage and the brand.
- Seller identity and rating: one seller, no ratings.
- Condition field: no.
- Unit basis or pack count: no, but the 500 W panel card lists a package that includes the mounting hardware, which makes it a bundle.
- robots.txt: not checked in this pass.
- HTTP status and server-rendered: 200. The names and the prices sit in the raw HTML.
- Example panel URL: https://solarhome.ng/product/500-watts-solar-panel/, ₦185,000, 500 W monocrystalline, brand Veggie Concept.
- Example battery URL: https://solarhome.ng/product/tubular-battery-220-ah-12v/, ₦240,000, 220 Ah 12 V tubular.
- Verdict: POOR. The shop holds 11 products under a house brand, gives no electrical specification, and mixes mounting hardware into the panel price.

### EnergyHub (energyhub.com.ng)

- Type: portal with a sign-in page.
- HTTP status and server-rendered: 200, but the page holds only a sign-in form and the words `Fast, Efficient and Productive`.
- Verdict: BLOCKED. A sign-in is needed before any listing is visible.

### SolarKite (solarkite.com)

- Type: solar shop.
- HTTP status and server-rendered: 200, but the page returns no content. The domain points at an Amazon-hosted address.
- Verdict: BLOCKED. The site returns an empty body.

### Duravolt (duravolt.com)

- Type: brand official store.
- HTTP status: the domain redirects to a page on hugedomains.com that offers the domain for sale.
- Verdict: POOR. The domain is parked. The brand sells through the Jumia and the BuySolar.ng stores instead.

### Oraimo Nigeria (ng.oraimo.com)

- Type: brand official store.
- HTTP status: 403 for a crawler.
- Verdict: POOR. The store blocks crawlers. The brand panel path on Jumia stays in the watchlist instead.

### Konga (konga.com)

- Type: general marketplace.
- Panels: yes. Batteries: yes.
- Spec table: no.
- Seller identity and rating: yes, but the detail pages are blocked.
- Condition field: yes, but the detail pages are blocked.
- robots.txt: blocks `/product/*/details` for every crawler, and also blocks `/search`, `/category/-` and `/product/-`.
- HTTP status and server-rendered: the category page loads, but the product list builds with JavaScript and the detail pages are out of bounds.
- Verdict: POOR. The robots file closes the price detail pages, so the site cannot supply a price.

## Dead domains

Each domain below failed to resolve or to answer on 2026-11-13.

| Domain | Result |
| --- | --- |
| valkingsolar.com | No DNS record |
| valkingsolar.com.ng | No answer |
| valkingsolar.ng | No answer |
| valkingsolar.co | No answer |
| valkingenergy.com | No answer |
| valkingenergy.com.ng | No answer |
| cdcare.com.ng | No DNS record |
| sunenergyng.com | No DNS record |
| luminasolar.com.ng | No DNS record |
| solarstore.com.ng | No answer |
| sunenergy.ng | No answer |
| sunfit.com.ng | No answer |
| qasa.com.ng | No answer |
| www.solarenergy.co | No answer |

The brands Felicity, Hithium, Ecoflow, Cworth and Taico do not run a Nigerian shop that answers a crawler. Their products appear on Jiji, Jumia and BuySolar.ng, and the brand paths on those sites carry the offers.

## What this changes in the design

- Section 1.3 of the design names one specialist retailer for phase one. The name is SolarShopNigeria.
- The watchlist loses the Jumia generic brand paths, because the Jumia robots file blocks `/*/generic/` and `/*/general/`.
- The watchlist gains the two Jiji subcategory paths, `/272-solar-batteries` and `/solar-energy-products`.
- The watchlist gains the SolarShopNigeria category paths, `/products?category=pv-modules` and `/products?category=batteries`, plus the stock filter `/products?category=pv-modules&stock=in`.
- SolarMart and BuySolar.ng join the watchlist as phase-one-plus paths, because the phase-one source count is fixed at one specialist retailer plus Jiji plus Jumia.
