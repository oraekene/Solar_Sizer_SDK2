# Old SolarSizer vs Current SDK2: Feature Comparison

**Old repo:** `C:\Users\rotim\AppData\Local\Temp\opencode\solar-remix` (references below use `old/...`)
**Current repo:** `C:\Users\rotim\Documents\Solar_Sizer_SDK2\Solar_Sizer_SDK2-9c02b14371d2830807c357d2bb5473dce5d658c7` (references below use `cur/...`)

**Snapshot:** 2026-11-09. Current `src/App.tsx` has uncommitted working-tree changes on top of `6ccd8fe` (+160/−66 lines), including a Bachs checkout button, a redesigned system-details modal, overnight-range fixes in the usage profile and saved-profile PDF, and the restored `InteractiveBridge` `onChange` handler. `worker/index.ts` is also modified (+53 lines) with a new `/api/checkout` handler. This report describes that working tree, not the last commit; all other current files match `6ccd8fe`.

**Method:** both trees were read end to end, not mechanically diffed. `App.tsx` was read in full on both sides (old 3,192 lines, current 4,636 lines), plus both calculators, both API layers, types, constants, auth components, build configs, migrations, seeds, and export functions.

---

## 1. Executive summary: top 10 ranked

| # | Finding | Old behaviour | Current behaviour | Severity |
|---|---------|---------------|-------------------|----------|
| 1 | **User accounts and server-side persistence are gone.** | Google OAuth popup, session cookie, per-user profiles/results/hardware in Supabase or SQLite (`old/server.ts:101-239`, `old/server.ts:241-376`, `old/src/components/Auth.tsx:19-77`). | Auth component is an 18-line stub that always reports `null` (`cur/src/components/Auth.tsx:1-18`); the Worker keeps the old URLs but returns empty arrays and silently accepts/discards writes (`cur/worker/index.ts:238-260`). Profiles/results/hardware live only in `localStorage` (`cur/src/App.tsx:610-612`, `cur/src/App.tsx:964-989`, `cur/src/App.tsx:1002-1021`). Clearing browser storage destroys all user work. | Critical |
| 2 | **Local custom hardware is overwritten by global hardware on every load.** | Server hardware was merged into local arrays by id, preserving local-only items (`old/src/App.tsx:511-549`). | Any non-empty global list replaces the whole local array (`cur/src/App.tsx:674-683`), and the persistence effect then writes the replacement back to `localStorage` (`cur/src/App.tsx:955-962`). A non-admin user's added inverter/panel/battery/powerstation is lost on refresh. | High |
| 3 | **High Risk systems no longer reach the UI.** | All statuses were pushed, including High Risk (`old/src/utils/solarCalculator.ts:381-411`). | The engine skips every High Risk result (`cur/src/utils/solarCalculator.ts:336`, `cur/src/utils/solarCalculator.ts:706-709`). The UI still contains High Risk branches that are now unreachable (`cur/src/App.tsx:2679`, `cur/src/App.tsx:2725`, `cur/src/App.tsx:4148-4156`), and users whose load needs an undersized system get "No Matching Systems" instead of a warned option. | High |
| 4 | **Checkout exists but trusts the client's price for custom systems.** | No checkout. | `startBachsCheckout` posts to `/api/checkout` (`cur/src/App.tsx:2155-2178`, button at `cur/src/App.tsx:4311-4318`). The Worker route (`cur/worker/index.ts:399-448`) looks up catalog prices from D1 but accepts `body.amount` for custom systems. It also needs an undocumented `BACHS_API_KEY` (missing from `cur/.env.example:1-7`) and returns to `?payment=...` URLs that no UI code reads (`cur/worker/index.ts:435-436`). | Medium |
| 5 | **Comparison PDF has a column mismatch and hides the generator purchase cost.** | Rows and headers both always appended the generator, and `initialCost` was `hasGenerator ? 0 : selectedGen.price`, showing "Owned" or a price (`old/src/App.tsx:206`, `old/src/App.tsx:224-235`). | Header appends "Generator" only when `hasGen` is true (`cur/src/App.tsx:1133`); rows 1137-1142 append a generator cell unconditionally while the Initial Cost row at 1136 never does, so the table is misaligned either way. `initialCost` is hard-coded to `0` (`cur/src/App.tsx:1127`), so the generator is always treated as owned even when `has_generator` is false (`cur/src/App.tsx:3849`). | Medium-high |
| 6 | **Powerstations are missing from the hardware exports.** | Feature did not exist. | JSON exports `{ inverters, panels, batteries }` only (`cur/src/App.tsx:1380-1384`). Markdown export has sections 1-3 only (`cur/src/App.tsx:1726-1751`). Import accepts `powerstations` (`cur/src/App.tsx:1472-1483`), so export then import loses them. | Medium |
| 7 | **Admin is one shared password stored in `sessionStorage`, with no throttling and client-supplied catalog data.** | Google identity plus a developer email allow-list (`old/src/App.tsx:499-500`). | `?admin=true` prompts once, posts to `/api/admin/verify`, and stores the raw password in `sessionStorage` (`cur/src/App.tsx:635-663`). The Worker compares it timing-safely (`cur/worker/index.ts:56-73`, `cur/worker/index.ts:226-236`) but has no rate limit, lockout, or per-user role. Product writes trust the client payload, including price (`cur/worker/index.ts:339-363`). | Medium |
| 8 | **"Peak Load" in the results PDF is not a peak.** | Results PDF listed surge, nightly, daily, and count only (`old/src/App.tsx:967-1029`). | New row computes `Math.max(...Object.values(results.analysis.hourly_consumption))` (`cur/src/App.tsx:1246-1250`), which is the highest hourly average, not instantaneous peak or surge (surge is the next row). Misleading label on a customer-facing report. | Medium |
| 9 | **Dev and deploy now require two runtimes plus D1.** | `npm run dev` started Express plus Vite in one process (`old/package.json:6`, `old/server.ts:384-388`). | `npm run dev` starts Vite only, and `/api` is proxied to a separate Worker on port 8787 (`cur/vite.config.ts:36-38`, `cur/package.json:6-15`). `npm start` and `dev:worker` start Wrangler (`cur/package.json:10-11`), so local work needs two terminals unless the static build is served by Wrangler. | Low-medium |
| 10 | **Dead code and duplicated logic hide real drift.** | Fewer layers, one comparison PDF implementation (`old/src/App.tsx:212-247`). | `exportSingleResultToPDF` (`cur/src/App.tsx:1171`) and `exportProfileToPDF` (`cur/src/App.tsx:1291`) are defined and never called, as in the old tree (`old/src/App.tsx:914`, `old/src/App.tsx:1031`). New dead helpers: `getStatusFromSimulation` (`cur/src/utils/solarCalculator.ts:208`) is never called; the comparison modal recomputes generator maths (`cur/src/App.tsx:337-355`) that the PDF function recomputes again (`cur/src/App.tsx:1119-1130`). | Low |

---

## 2. Feature matrix

Legend: "same" means behaviour and implementation are materially unchanged; "moved" means the feature exists but its storage or location changed; "lost" means the old capability has no working equivalent.

### 2.1 Navigation and screens

| Feature | Old | Current | Verdict |
|---|---|---|---|
| Tab model | `calculator | database | logs | profiles | results` (`old/src/types.ts:123`) | `calculator | products | internet | database | logs | profiles | results` (`cur/src/types.ts:214`) | Expanded |
| Calculator tab | Always available (`old/src/App.tsx:1562-1567`) | Always available (`cur/src/App.tsx:2220-2225`) | Same |
| Profiles tab | Visible only when signed in (`old/src/App.tsx:1568-1575`) | Always visible (`cur/src/App.tsx:2238-2243`) | Access opened, backend lost |
| Results tab | Visible only when signed in (`old/src/App.tsx:1576-1581`) | Always visible (`cur/src/App.tsx:2244-2250`) | Access opened, backend lost |
| Hardware DB tab | Visible only when signed in (`old/src/App.tsx:1582-1587`) | Always visible (`cur/src/App.tsx:2251-2256`) | Access opened |
| Logs tab | Signed-in developer emails only (`old/src/App.tsx:499-500`, `old/src/App.tsx:1588-1595`, `old/src/App.tsx:2281`) | Admin unlock only (`cur/src/App.tsx:2256-2264`, `cur/src/App.tsx:3515`) | Different gate, same hidden-by-default result |
| Products tab | Does not exist | New catalog with tag filters, admin import/export, price display (`cur/src/App.tsx:2910-3074`) | New |
| Internet tab | Does not exist | New Starlink/router catalog (`cur/src/App.tsx:3074-3190`) | New |
| Header auth widget | Google sign-in button, avatar dropdown, Sign Out, Settings "Soon" item (`old/src/components/Auth.tsx:96-215`) | Removed; no auth widget (header runs `cur/src/App.tsx:2208-2278`) | Lost |
| Compact / URL-param mode | Does not exist | `?tab=`, `?tag=`, `?compact=true` handled on mount (`cur/src/App.tsx:617-627`, header hidden at `cur/src/App.tsx:2209`) | New |
| Mobile nav | `hidden md:flex`; no mobile replacement (`old/src/App.tsx:1561`) | `hidden md:flex`; no mobile replacement (`cur/src/App.tsx:2219`) | Same gap |

### 2.2 Calculator workflow

| Feature | Old | Current | Verdict |
|---|---|---|---|
| Region selector | `SE_SS`, `SW`, `North` (`old/src/App.tsx:1623-1640`) | Same (`cur/src/App.tsx:2285-2312`) | Same |
| Battery preference | any / lithium / lead-acid (`old/src/App.tsx:1642-1665`) | Same (`cur/src/App.tsx:2313-2335`) | Same |
| Tolerance slider | 0-50%, default 20 (`old/src/App.tsx:1667-1690`) | Same (`cur/src/App.tsx:2336-2360`) | Same |
| Device add form | Name, category, qty, watts, multiple time ranges (`old/src/App.tsx:1343-1394`) | Same, plus powerstation category support in modal (`cur/src/App.tsx:1765-1834`, `cur/src/App.tsx:4490-4535`) | Same plus extension |
| Time-range wrap | Engine handles overnight wrap (`old/src/utils/solarCalculator.ts:18-33`) | Engine still handles wrap (`cur/src/utils/solarCalculator.ts:18-33`); PDFs now also wrap (working tree `cur/src/App.tsx:1973`, `cur/src/App.tsx:3661`) | Same, PDF bug fixed in working tree |
| Master device quick-add | Does not exist | Add from `devices_master` list into the load (`cur/src/App.tsx:2372-2400`) | New |
| Save profile | Requires sign-in; POST `/api/user/profiles` (`old/src/App.tsx:710-757`) | `localStorage` only (`cur/src/App.tsx:964-993`) | Backend lost |
| Save single result | Requires sign-in; POST `/api/user/results` (`old/src/App.tsx:774-806`) | `localStorage` only (`cur/src/App.tsx:1002-1021`) | Backend lost |
| Save analysis | Requires sign-in (`old/src/App.tsx:808-843`) | `localStorage` only (`cur/src/App.tsx:1024-1047`) | Backend lost |
| Save comparison | Requires sign-in (`old/src/App.tsx:845-884`) | `localStorage` only (`cur/src/App.tsx:1049-1074`) | Backend lost |
| Delete result | Requires sign-in; DELETE `/api/user/results/:id` (`old/src/App.tsx:886-895`) | Local array removal (`cur/src/App.tsx:1076-1082`) | Backend lost |
| Result ordering | Optimal → Conditional → High Risk, then price (`old/src/App.tsx:673-680`) | Same sort (`cur/src/App.tsx:903-910`), but High Risk rows never exist | Drift |
| Result category filter | Does not exist | Full Results / Kits / Powerstations (`cur/src/App.tsx:2605-2628`, filter logic at `cur/src/App.tsx:2664-2667`) | New |
| Result pagination | Renders all systems | 10 per page (`cur/src/App.tsx:606-607`, `cur/src/App.tsx:2691-2693`, controls `cur/src/App.tsx:2822-2855`) | New |
| "Cheapest of each category first" | Does not exist | Pins cheapest Optimal, Conditional, High Risk before the rest (`cur/src/App.tsx:2678-2688`) | New |
| Result detail modal | Separate panels for optimal/conditional/high risk (`old/src/App.tsx:2892-2960`) | Redesigned modal, status banner, three spec cards, Buy button (working tree `cur/src/App.tsx:4098-4324`) | Redesigned |
| InteractiveBridge | Conditional systems only; `onChange` writes `adjustedLoad` (`old/src/App.tsx:2933-2941`) | Working tree restored to Conditional only with `onChange` (`cur/src/App.tsx:4160-4178`); committed HEAD version had no `onChange` and also offered High Risk | Restored in working tree |
| Comparison selection | Checkbox per system, sticky comparison bar, modal (`old/src/App.tsx:614-642`, `old/src/App.tsx:2498-2560`) | Same pattern (`cur/src/App.tsx:841-874`, `cur/src/App.tsx:2856-2890`) | Same |
| Generator comparison | `has_generator` toggle persisted to localStorage (`old/src/App.tsx:604-610`) | Same (`cur/src/App.tsx:831-837`) | Same |
| Social/marketing footer | Does not exist | Footer with links and newsletter form (`cur/src/App.tsx:4053-4100`) | New |

### 2.3 Profiles, results, database, logs

| Feature | Old | Current | Verdict |
|---|---|---|---|
| Profiles list | Search, load, PDF export, delete (`old/src/App.tsx:2365-2498`) | Search, load, JSON export/import, delete (`cur/src/App.tsx:3612-3736`) | PDF replaced by JSON |
| Profiles inventory PDF | Inline autotable in the profiles tab (`old/src/App.tsx:2404-2428`) | No inline PDF; `exportProfileToPDF` exists but is never called (`cur/src/App.tsx:1291`) | Lost |
| Saved results list | Server-backed; view, PDF, delete (`old/src/App.tsx:2498-2831`) | `localStorage`-backed; view, PDF, delete, filters (`cur/src/App.tsx:3736-4053`) | Storage moved |
| Saved comparison view | Loads `savedResults` with `is_comparison` (`old/src/App.tsx:2590-2645`) | Same plus stored `devices` snapshot (`cur/src/App.tsx:3830-3870`, `cur/src/types.ts:167-177`) | Improved |
| Hardware DB sections | Inverters, panels, batteries (`old/src/App.tsx:2148-2281`) | Inverters, panels, batteries, powerstations (`cur/src/App.tsx:3190-3515`) | Expanded |
| Master device CRUD | Does not exist | Add/edit/delete/import in admin panel (`cur/src/App.tsx:3330-3420`, `cur/src/App.tsx:4328-4420`) | New |
| Hardware CRUD | Local arrays plus fire-and-forget POST when signed in (`old/src/App.tsx:644-655`, `old/src/App.tsx:1413-1444`) | Local arrays; admin edits also write to D1 (`cur/src/App.tsx:1835-1851`, `cur/src/App.tsx:4455-4492`) | Split source of truth |
| Product CRUD | Does not exist | Admin save/delete/import/export (`cur/src/App.tsx:751-826`, `cur/src/App.tsx:1538-1566`) | New |
| Profit margins | Does not exist | Per-component percentages applied in engine (`cur/src/App.tsx:3247-3270`, `cur/src/utils/solarCalculator.ts:331`, `cur/src/utils/solarCalculator.ts:409-417`) | New |
| PDF quote customization | Hard-coded title, prefix, footers (`old/src/App.tsx:1448`, `old/src/App.tsx:1463`, `old/src/App.tsx:1520-1521`) | Editable title, prefix, two footer lines (`cur/src/App.tsx:3278-3345`, consumed at `cur/src/App.tsx:2037`, `cur/src/App.tsx:2059`, `cur/src/App.tsx:2145-2146`) | New |
| Logs capture | Inline inside `useMemo`, cap 50, duplicates possible (`old/src/App.tsx:682-697`) | `useEffect`, duplicate suppression, cap 20 (`cur/src/App.tsx:916-946`) | Improved |
| Logs clear | Does not exist | "Clear All Logs" with confirm (`cur/src/App.tsx:3532-3543`) | New |
| Log detail | Expandable traces (`old/src/App.tsx:2281-2365`) | Same plus per-log TXT export (`cur/src/App.tsx:3515-3612`) | Same |
| Storage quota guard | None; raw `localStorage.setItem` | `safeLocalStorageSet` catches quota errors (`cur/src/App.tsx:878-890`) | New |

### 2.4 Settings and admin

| Feature | Old | Current | Verdict |
|---|---|---|---|
| Settings entry | Disabled "Settings (Soon)" menu item (`old/src/components/Auth.tsx:150-158`) | No user settings menu; admin panels inside tabs | Lost placeholder, gained real panels |
| Admin unlock | Google login plus hard-coded developer emails (`old/src/App.tsx:499-500`) | `?admin=true` password prompt, `sessionStorage` flags (`cur/src/App.tsx:631-663`) | Replaced |
| Global margins/settings | Does not exist | Saved to D1 via `/api/settings/:key`, mirrored to `localStorage` (`cur/src/App.tsx:1568-1582`, `cur/worker/index.ts:372-396`) | New |
| Product import/export | Does not exist | JSON import/export, admin only (`cur/src/App.tsx:1538-1566`, `cur/src/App.tsx:1586-1590`) | New |
| Internet data import/export | Does not exist | JSON bundle of internet master devices and products (`cur/src/App.tsx:1591-1620`) | New |

---

## 3. Calculation engine diff

File sizes: old `src/utils/solarCalculator.ts` 421 lines; current 743 lines.

### 3.1 Public API

| Function | Old signature | Current signature | Change |
|---|---|---|---|
| `calculateUserNeeds` | `(devices: Device[]) => LoadAnalysis` (`old/src/utils/solarCalculator.ts:4`) | Same (`cur/src/utils/solarCalculator.ts:4`) | None |
| `simulateHourlySoC` | `(hourlyLoad, actualDailyYield, usableBatteryWh, maxChargeW, ccType, location)` (`old/src/utils/solarCalculator.ts:61-68`) | Same (`cur/src/utils/solarCalculator.ts:61-68`) | None |
| `getLoadSheddingAdvice` | `(devices, deficit)` (`old/src/utils/solarCalculator.ts:134`) | Same (`cur/src/utils/solarCalculator.ts:134`) | None |
| `buildCombinations` | `(location, devices, hardware{inverters,panels,batteries}, batteryPreference="any", tolerance=20)` (`old/src/utils/solarCalculator.ts:184-190`) | `(location, devices, hardware{+powerstations}, batteryPreference="any", tolerance=20, products=[], margins={...})` (`cur/src/utils/solarCalculator.ts:309-317`) | Seven parameters; two new optional inputs |

### 3.2 Input handling

| Aspect | Old | Current |
|---|---|---|
| Array guards | None; malformed API payload throws | `safeDevices`, `safeHardware`, `safeProducts` normalise missing arrays (`cur/src/utils/solarCalculator.ts:318-325`) |
| Missing PSH key | `LOCATION_PSH[location]` can be `undefined` (`old/src/utils/solarCalculator.ts:193`) | Falls back to 2.6 (`cur/src/utils/solarCalculator.ts:329`) |

### 3.3 Search space

| Loop | Old | Current |
|---|---|---|
| Inverter × panel × battery | Present (`old/src/utils/solarCalculator.ts:198-415`) | Present, same nested structure (`cur/src/utils/solarCalculator.ts:527-730`) |
| Pre-configured kits | None | Iterates `products` where `type === "combination"`, skips non-solar kits, checks inverter surge, battery and panel fit, applies product margin (`cur/src/utils/solarCalculator.ts:338-438`) |
| Powerstations | None | Iterates `hardware.powerstations`, checks capacity, output, PV input, applies powerstation margin and a flat panel price of 95,000 (`cur/src/utils/solarCalculator.ts:442-521`, `cur/src/utils/solarCalculator.ts:498-500`) |

### 3.4 Status logic

| Aspect | Old | Current |
|---|---|---|
| Deficit used for percentage | `sim.finalDeficitWh / total_daily_wh` (`old/src/utils/solarCalculator.ts:368-369`) | `getEffectiveDeficitWh = max(totalDaily - dailyYield, simDeficit)` (`cur/src/utils/solarCalculator.ts:300-307`, used at `cur/src/utils/solarCalculator.ts:680-682`) |
| Optimal | `sim.passed` (`old/src/utils/solarCalculator.ts:371-374`) | `sim.passed && effectiveDeficitWh === 0` (`cur/src/utils/solarCalculator.ts:690-693`) |
| Conditional | `deficitPercentage <= tolerance` (`old/src/utils/solarCalculator.ts:375-380`) | Same threshold on effective deficit (`cur/src/utils/solarCalculator.ts:694-698`) |
| High Risk | Kept and pushed with a warning (`old/src/utils/solarCalculator.ts:381-386`, `old/src/utils/solarCalculator.ts:393-411`) | Computed, logged, then discarded (`cur/src/utils/solarCalculator.ts:699-709`) |
| Status helper | None | `getStatusFromSimulation` exists but is never called (`cur/src/utils/solarCalculator.ts:208-219`) |

The High Risk drop is the largest behavioural change in the engine. Old results included a warned, priced High Risk option; current results simply omit it. This interacts badly with the UI that still filters and sorts High Risk (`cur/src/App.tsx:2679`, `cur/src/App.tsx:2725`).

### 3.5 Battery compatibility

| Aspect | Old | Current |
|---|---|---|
| Voltage check | Battery voltage must divide system DC voltage exactly, so 12.8 V lithium fails on a 12 V system (`old/src/utils/solarCalculator.ts:237-244`) | `getNominalBatteryVoltage` maps 12.8 V lithium to 12 V and `isBatteryVoltageCompatible` allows a 20 % deviation plus a modulo system match (`cur/src/utils/solarCalculator.ts:184-201`, used at `cur/src/utils/solarCalculator.ts:563-572`) |
| Effect | 12.8 V lithium often rejected on 12 V systems | 12.8 V lithium accepted on 12 V systems |

### 3.6 Pricing

| Aspect | Old | Current |
|---|---|---|
| Inverter | `inv.price * numUnits` (`old/src/utils/solarCalculator.ts:390`) | `applyMargin(inv.price * numUnits, margins.inverter)` (`cur/src/utils/solarCalculator.ts:712`) |
| Panel | `panel.price * totalPanels` (`old/src/utils/solarCalculator.ts:389`) | `applyMargin(panel.price * totalPanels, margins.panel)` (`cur/src/utils/solarCalculator.ts:711`) |
| Battery | `bat.price * totalBatteries` (`old/src/utils/solarCalculator.ts:283`) | `applyMargin(bat.price * totalBatteries, margins.battery)` (`cur/src/utils/solarCalculator.ts:612`) |
| Powerstation | N/A | `applyMargin(ps.price, margins.powerstation)` plus `applyMargin(panelEquivalentCount * 95000, margins.panel)` (`cur/src/utils/solarCalculator.ts:498-500`) |
| Kits | N/A | Product price and component prices each get `margins.product` (`cur/src/utils/solarCalculator.ts:409-417`) |

The 95,000 hard-coded panel price at `cur/src/utils/solarCalculator.ts:500` is a magic number with no constant or comment.

### 3.7 Constants

| Item | Old | Current |
|---|---|---|
| Inverters | 3 (`old/src/constants.ts:22-62`) | 3, unchanged models (`cur/src/constants.ts:24-64`) |
| Panels | 2 (`old/src/constants.ts:64-82`) | 10 (`cur/src/constants.ts:66-78`) |
| Batteries | 3 lead/lithium (`old/src/constants.ts:83-114`) | 5 lithium at 12.8 V (`cur/src/constants.ts:79-86`) |
| Powerstations | None | 5 (`cur/src/constants.ts:87-145`) |
| Location/irradiance/surge tables | Present (`old/src/constants.ts:3-21`) | Identical (`cur/src/constants.ts:3-23`) |

### 3.8 Log format

Both engines return `allLogs: string[][]` (`old/src/utils/solarCalculator.ts:190`, `cur/src/utils/solarCalculator.ts:317`). Current adds kit and powerstation trace rows, margin traces, and the effective-deficit explanation. The UI log viewer and TXT export consume the same shape, so no migration is needed there.

---

## 4. Data, persistence, and API diff

### 4.1 Backend shape

| Aspect | Old | Current |
|---|---|---|
| Runtime | Express 4 on port 3000 (`old/server.ts:17-30`, `old/server.ts:384-390`) | Cloudflare Worker with static assets (`cur/worker/index.ts:426-453`) |
| Database | Supabase if `SUPABASE_URL` + service key, else SQLite `solar_sizer.db` via better-sqlite3 (`old/server.ts:17-72`) | D1 binding `DB`, database `solar-sizer-sdk2` (`cur/wrangler.jsonc:12-19`) |
| Schema | `users`, `profiles`, `results`, `hardware` (`old/supabase.sql`) | `devices_master`, `hardware`, `products`, `settings` (`cur/migrations/0001_init.sql:1-39`, mirrored at `cur/worker/index.ts:98-134`) |
| Seeding | None; tables assumed populated by users | Auto-seeds on first boot: 25 devices, 23 products, 38 hardware rows (`cur/worker/index.ts:141-193`, `cur/worker/seed-data.ts:1-311`) |
| Health check | `/healthz` (`old/server.ts:79-84`) | `/healthz` before boot (`cur/worker/index.ts:430-432`), `run_worker_first` includes it (`cur/wrangler.jsonc:10`) |
| SPA fallback | Express static + `*` route (`old/server.ts:386-390`) | `not_found_handling: single-page-application` (`cur/wrangler.jsonc:9`) |

### 4.2 Auth and session

| Endpoint / behaviour | Old | Current |
|---|---|---|
| `GET /api/auth/user` | Returns session user (`old/server.ts:106-108`) | Always `{ user: null }` (`cur/worker/index.ts:238-241`) |
| `POST /api/auth/logout` | Clears session (`old/server.ts:110-113`) | Returns `{ success: true }` (`cur/worker/index.ts:243-245`) |
| `GET /api/auth/google/url` | Builds Google OAuth URL (`old/server.ts:116-139`) | Missing; 404 |
| `GET /api/auth/google/callback` | Exchanges code, upserts user, sets session (`old/server.ts:141-239`) | Missing; 404 |
| Session storage | Signed cookie session (`old/server.ts:87-99`) | None |
| Auth UI | Google button, avatar, sign out (`old/src/components/Auth.tsx:19-215`) | Renders `null` and calls `onUserChange(null)` (`cur/src/components/Auth.tsx:1-18`) |

### 4.3 User data endpoints

| Endpoint | Old | Current |
|---|---|---|
| `GET /api/user/data` | Returns the signed-in user's profiles, results, hardware (`old/server.ts:241-267`) | Returns empty arrays for everyone (`cur/worker/index.ts:247-249`) |
| `POST /api/user/profiles` | Upsert, auth required (`old/server.ts:269-298`) | Returns `{ success: true }`, discards body (`cur/worker/index.ts:251-256`) |
| `POST /api/user/results` | Upsert, auth required (`old/server.ts:300-325`) | Returns `{ success: true }`, discards body (`cur/worker/index.ts:251-256`) |
| `POST /api/user/hardware` | Upsert, auth required (`old/server.ts:327-351`) | Returns `{ success: true }`, discards body (`cur/worker/index.ts:251-256`) |
| `DELETE /api/user/:type/:id` | Deletes from the user's table (`old/server.ts:353-376`) | Returns `{ success: true }` (`cur/worker/index.ts:258-260`) |

The client no longer calls these endpoints. The stubs exist only to keep the old contract alive for future OAuth work, as the comment at `cur/worker/index.ts:238` states.

### 4.4 Catalog endpoints

| Endpoint | Old | Current |
|---|---|---|
| `GET /api/devices` | Does not exist | Returns `devices_master`, tags parsed (`cur/worker/index.ts:262-265`, `cur/worker/index.ts:75-80`) |
| `POST /api/devices` | Does not exist | Admin upsert (`cur/worker/index.ts:267-287`) |
| `DELETE /api/devices/:id` | Does not exist | Admin delete (`cur/worker/index.ts:289-293`) |
| `GET /api/hardware` | Does not exist | Returns `user_id = 'system'` rows (`cur/worker/index.ts:295-298`) |
| `POST /api/hardware` | Does not exist | Admin upsert (`cur/worker/index.ts:300-320`) |
| `DELETE /api/hardware/:id` | Does not exist | Admin delete (`cur/worker/index.ts:322-326`) |
| `GET /api/products` | Does not exist | Products merged with tagged hardware as `standalone` products, optional `?tag=` (`cur/worker/index.ts:328-337`, adapter at `cur/worker/index.ts:210-220`) |
| `POST /api/products` | Does not exist | Admin upsert, enriches `combination_data` (`cur/worker/index.ts:339-364`, `cur/worker/enrich.ts:15-91`) |
| `DELETE /api/products/:id` | Does not exist | Admin delete (`cur/worker/index.ts:366-370`) |
| `GET/POST /api/settings/:key` | Does not exist | Public read, admin write (`cur/worker/index.ts:372-396`) |
| `POST /api/calculate` | Does not exist; calculation ran in the browser | Server-side calculation using the same TS engine and D1 products (`cur/worker/index.ts:398-421`) |
| `POST /api/checkout` | Does not exist | Called by the working-tree Buy button (`cur/src/App.tsx:2159`). Creates a Bachs checkout session (`cur/worker/index.ts:399-448`), returns `{ url }`, 503 until `BACHS_API_KEY` is set. Catalog ids are priced from D1; custom ids trust the client amount. |

### 4.5 Client storage keys

| Key | Old | Current |
|---|---|---|
| `ss_inverters` | Yes (`old/src/App.tsx:562`) | Yes (`cur/src/App.tsx:689`) |
| `ss_panels` | Yes (`old/src/App.tsx:572`) | Yes (`cur/src/App.tsx:699`) |
| `ss_batteries` | Yes (`old/src/App.tsx:577`) | Yes (`cur/src/App.tsx:704`) |
| `ss_profiles` | Yes (`old/src/App.tsx:663`) | Yes (`cur/src/App.tsx:960`) |
| `ss_internal_logs` | Yes (`old/src/App.tsx:584`) | Yes (`cur/src/App.tsx:716`, `cur/src/App.tsx:944`) |
| `ss_has_generator` | Yes (`old/src/App.tsx:605`) | Yes (`cur/src/App.tsx:831-837`) |
| `ss_powerstations` | No | Yes (`cur/src/App.tsx:709`, `cur/src/App.tsx:959`) |
| `ss_results` | No; results came from the server | Yes (`cur/src/App.tsx:610`, `cur/src/App.tsx:1018`) |
| `ss_margins` | No | Yes (`cur/src/App.tsx:961`) |
| `ss_pdf_settings` | No | Yes (`cur/src/App.tsx:727-729`, `cur/src/App.tsx:1577`) |
| `ss_admin_unlocked` | No | Yes, `sessionStorage` (`cur/src/App.tsx:632`, `cur/src/App.tsx:651`) |
| `ss_admin_key` | No | Yes, raw password in `sessionStorage` (`cur/src/App.tsx:652`) |

### 4.6 Data ownership and merge behaviour

Old:
- Profiles and results hydrate from the server when signed in, else from `localStorage` for profiles and an empty results list (`old/src/App.tsx:502-557`).
- Hardware hydrates from `localStorage` and merges server hardware by id, preserving local-only entries (`old/src/App.tsx:511-549`).

Current:
- All user data is local (`cur/src/App.tsx:610-612`, `cur/src/App.tsx:964-989`).
- Global catalog hardware replaces local hardware wholesale whenever the global list is non-empty (`cur/src/App.tsx:674-683`), then the persistence effect writes the replacement back (`cur/src/App.tsx:955-962`).
- No merge by id, no conflict resolution, no user scoping.

This is the single largest data-integrity risk in the current tree.

---

## 5. Exports and imports diff

### 5.1 PDF exports

| Export | Old | Current | Status |
|---|---|---|---|
| Single result PDF | Defined `old/src/App.tsx:914`, never called | Defined `cur/src/App.tsx:1171`, never called | Dead in both |
| Results PDF | `old/src/App.tsx:967-1029`; surge, nighttime, daily, count, device list, systems table | `cur/src/App.tsx:1224-1289`; adds Peak Load row, accepts `savedDevices` so a saved analysis prints its own device snapshot (`cur/src/App.tsx:1225-1227`), uses saved devices at call sites (`cur/src/App.tsx:3851`, `cur/src/App.tsx:3892`) | Improved, one bad metric |
| Profile PDF | Defined `old/src/App.tsx:1031`, never called; profiles tab printed inline (`old/src/App.tsx:2404-2428`) | Defined `cur/src/App.tsx:1291`, never called; no inline profile print | Lost |
| Hardware database PDF | `old/src/App.tsx:1059-1094`; three tables | `cur/src/App.tsx:1319-1363`; adds a powerstation table (`cur/src/App.tsx:1351-1357`) | Improved |
| Comparison PDF | Built inside `ComparisonModal` (`old/src/App.tsx:212-247`); always has a Generator column; correct `initialCost` | Hoisted to `exportComparisonToPDF` (`cur/src/App.tsx:1101-1167`); Generator column conditional but rows unconditional; `initialCost = 0`; two old rows (Daily Usage, Fuel Price) replaced by Reliability (`cur/src/App.tsx:1135-1142`) | Degraded |
| Quote PDF | Fixed title "SOLARSIZER PRO QUOTE", fixed `QT-` prefix, specs first, costs second, no Units column, fixed footer (`old/src/App.tsx:1445-1524`) | Editable title/prefix/footers (`cur/src/App.tsx:2039-2040`, `cur/src/App.tsx:2060`, `cur/src/App.tsx:2146-2147`), costs first with Units column (`cur/src/App.tsx:2077-2093`), specs second (`cur/src/App.tsx:2103-2118`), wiring guide third (`cur/src/App.tsx:2128-2140`), VAT footer unchanged (`cur/src/App.tsx:2092`) | Improved |
| Usage profile PDF | Does not exist | Generated on demand and automatically with every quote (`cur/src/App.tsx:1922-2032`, called at `cur/src/App.tsx:2152`); overnight ranges fixed in working tree (`cur/src/App.tsx:1973`) | New, forced side effect |

### 5.2 JSON, TXT, Markdown

| Export | Old | Current | Status |
|---|---|---|---|
| Results JSON | `metadata{generated,region,batteryPreference}`, `analysis`, `devices`, `systems` (`old/src/App.tsx:1096-1109`) | Identical (`cur/src/App.tsx:1365-1376`) | Same, still no `powerstations` key (not applicable to old) |
| Hardware JSON | `{ inverters, panels, batteries }` (`old/src/App.tsx:1111-1115`) | `{ inverters, panels, batteries }` (`cur/src/App.tsx:1380-1384`) | Same code, now incomplete |
| Hardware Markdown | Three sections (`old/src/App.tsx:1304-1341`) | Three sections (`cur/src/App.tsx:1726-1761`), no powerstation section | Same code, now incomplete |
| Profiles JSON | `old/src/App.tsx:1224-1228` | `cur/src/App.tsx:1646-1650` | Same |
| Full logs TXT | `old/src/App.tsx:1250-1270` | `cur/src/App.tsx:1672-1692` | Same |
| Single log TXT | `old/src/App.tsx:1272-1301` | `cur/src/App.tsx:1694-1723` | Same |
| Products JSON | Does not exist | `cur/src/App.tsx:1586-1590` | New |
| Internet bundle JSON | Does not exist | `{ masterDevices, products }` filtered by internet tag (`cur/src/App.tsx:1591-1596`) | New |
| Usage profile data | Does not exist | Not exported as JSON, only PDF | Gap |

### 5.3 Imports

| Import | Old | Current | Status |
|---|---|---|---|
| Hardware database | Accepts inverters, panels, batteries, sanitises numbers and ids (`old/src/App.tsx:1117-1222`) | Same plus `powerstations` (`cur/src/App.tsx:1386-1506`, powerstation branch at `cur/src/App.tsx:1472-1483`) | Improved |
| Profiles | Merge by id/name (`old/src/App.tsx:1229-1248`) | Same (`cur/src/App.tsx:1651-1670`) | Same |
| Master devices | Does not exist | Admin JSON import, upserts through SDK (`cur/src/App.tsx:1508-1536`) | New |
| Products | Does not exist | Admin JSON import, upserts through SDK (`cur/src/App.tsx:1538-1566`) | New |
| Internet bundle | Does not exist | Imports master devices then products (`cur/src/App.tsx:1599-1644`) | New |

---

## 6. UI and UX diff

### 6.1 Global shell

| Element | Old | Current |
|---|---|---|
| Header | Logo, nav, Save Profile, auth widget (`old/src/App.tsx:1551-1615`) | Logo, nav, Save Profile, no auth widget (`cur/src/App.tsx:2208-2278`) |
| Nav visibility | Profiles/results/database hidden until sign-in; logs hidden until developer email (`old/src/App.tsx:1568-1597`) | Everything visible except logs, which need admin unlock (`cur/src/App.tsx:2220-2264`) |
| Compact mode | None | Header and footer suppressed with `?compact=true` (`cur/src/App.tsx:2209`, `cur/src/App.tsx:617-627`) |
| Footer | None in old (`old/src/App.tsx` ends after main content) | Marketing footer, link columns, newsletter input (`cur/src/App.tsx:4053-4100`) |
| Theme | Stone/emerald, same palette | Same palette, light UI made the main interface at HEAD `6ccd8fe` |

### 6.2 Calculator screen

| Element | Old | Current |
|---|---|---|
| Empty state | No dedicated empty state; results column blank | Empty state panel with `min-h-[420px]` so it stays at the top (`cur/src/App.tsx:2554`; HEAD `863310d`; working tree retains it) |
| Device card | Name, watts, qty, category, ranges, edit/delete (`old/src/App.tsx:1618-1916`) | Same plus master-device chips (`cur/src/App.tsx:2280-2590`) |
| Range editor | Start/end selects, add/remove (`old/src/App.tsx:1395-1412`) | Same (`cur/src/App.tsx:1817-1834`) |
| Results header | Count, comparison bar (`old/src/App.tsx:1916-1940`) | Count, All/Kits/Powerstations filter, pagination (`cur/src/App.tsx:2603-2630`) |
| System card | Status chip, price, specs, save/compare/quote buttons (`old/src/App.tsx:1940-2148`) | Same plus High Risk dead branches and "Included" price fallbacks (`cur/src/App.tsx:2700-2910`) |
| Detail modal | Three-column specs, conditional bridge button (`old/src/App.tsx:2892-2960`) | Redesigned banner, three cards, Buy button, bridge for Conditional only (working tree `cur/src/App.tsx:4101-4340`) |
| Comparison modal | Side-by-side metrics, generator settings, PDF (`old/src/App.tsx:171-453`) | Same, PDF delegated to App (`cur/src/App.tsx:313-565`) |

### 6.3 Products and Internet tabs

| Element | Old | Current |
|---|---|---|
| Product card | None | Image/icon, name, description, price, tags, specs, Buy (working tree), admin edit/delete (`cur/src/App.tsx:2990-3070`) |
| Tag filters | None | Flagship, Solar, Internet, Powerstation, All (`cur/src/App.tsx:2950-2990`) |
| Admin toolbar | None | Import products, export products, add product (`cur/src/App.tsx:2918-2938`) |
| Internet page | None | Hero copy, import/export, master device list, product list (`cur/src/App.tsx:3074-3190`) |
| Empty states | None | Present for products and internet lists |

### 6.4 Profiles, results, database, logs

| Element | Old | Current |
|---|---|---|
| Profiles | Search, load, PDF, delete (`old/src/App.tsx:2365-2498`) | Search, load, delete, JSON export/import (`cur/src/App.tsx:3612-3736`) |
| Results | Server list, view, PDF, delete (`old/src/App.tsx:2498-2831`) | Local list, view, PDF, delete, comparison view (`cur/src/App.tsx:3736-4053`) |
| Database | Three sections, add/edit/duplicate/delete, import/export (`old/src/App.tsx:2148-2281`) | Four sections, plus master devices and margins/PDF panels behind admin (`cur/src/App.tsx:3190-3515`) |
| Logs | Developer only, expandable traces (`old/src/App.tsx:2281-2365`) | Admin only, duplicate suppression, clear button, per-log TXT (`cur/src/App.tsx:3515-3612`) |

### 6.5 Accessibility and mobile

Both trees use the same patterns: icon buttons with `title` attributes but no `aria-label` in many places, modals without focus traps, and no mobile navigation replacement for `hidden md:flex`. Current does not regress these, but it also does not fix them. New controls (Buy, admin imports) continue the icon-button pattern without accessible names (`cur/src/App.tsx:4311-4318`).

---

## 7. Architecture and build diff

| Aspect | Old | Current |
|---|---|---|
| Frontend | Vite 6 + React 19 + Tailwind 4 + Motion + jsPDF (`old/package.json:17-33`) | Same plus no Gemini/Supabase (`cur/package.json:19-30`) |
| Backend | Express + cookie-session + better-sqlite3 + Supabase (`old/package.json:18-29`) | Cloudflare Worker + D1 (`cur/wrangler.jsonc`, `cur/worker/index.ts`) |
| Dev command | `tsx server.ts` serves API and Vite middleware (`old/package.json:6`, `old/server.ts:384`) | `vite` only, `/api` proxied to `127.0.0.1:8787` (`cur/vite.config.ts:36-38`, `cur/package.json:6`) |
| Worker dev | N/A | `wrangler dev --local --port 8787` (`cur/package.json:7`, `cur/package.json:10-11`) |
| Build | `vite build` (`old/package.json:7`) | `vite build` plus manual vendor chunks for react, UI, PDF (`cur/vite.config.ts:8-28`) |
| Deploy | Not configured in repo | GitHub Actions to Cloudflare Workers, needs `CLOUDFLARE_API_TOKEN` (`cur/.github/workflows/deploy.yml:1-26`) |
| Database migrations | `supabase.sql` applied manually (`old/supabase.sql`) | `wrangler d1 migrations apply` with `migrations/0001_init.sql` (`cur/package.json:15`) |
| Seeding | None | `worker/seed-data.ts`, auto-applied on first request (`cur/worker/index.ts:141-193`) |
| Tests | None | `worker/enrich.test.ts` via `npm run test:worker` (`cur/package.json:14`) |
| Typing | `tsc --noEmit` (`old/package.json:8`) | Same (`cur/package.json:12`) |
| SDK | None | `src/sdk/index.ts` wraps axios calls for devices, products, hardware, settings, calculate (`cur/src/sdk/index.ts:1-88`) |
| CLI | None | `cli.ts` lists devices and runs a calculation against the local Worker (`cur/cli.ts:1-66`) |
| Docs | README only | README, `INTEGRATION_GUIDE.md`, `docs/agents/{domain,issue-tracker,triage-labels}.md`, `AGENTS.md` |
| Env | Gemini, App URL, session secret, Google OAuth, Supabase (`old/.env.example:1-21`) | `ADMIN_PASSWORD`, optional `APP_URL` (`cur/.env.example:1-7`) |
| Title | "My Google AI Studio App" (`old/index.html`) | "SolarSizer Pro — Intelligent Solar Sizing" (`cur/index.html`) |

Two build-level consequences follow. First, `npm run dev` alone no longer serves the API, so a fresh clone appears broken until the developer starts `dev:worker` as well. Second, the deployed Worker serves the SPA and the API from one origin, which removes CORS and cookie-domain problems but makes the Worker the single point of failure for both.

---

## 8. Port recommendations

Ordered by value per unit of work. Each item names the file and the smallest change that closes the gap.

1. **Restore a real identity layer or remove the pretence.** Either port the Google OAuth flow and the per-user tables (`old/server.ts:101-376`, `old/supabase.sql`) to a Worker-compatible auth provider, or delete the no-op endpoints (`cur/worker/index.ts:238-260`) and the `Auth` stub (`cur/src/components/Auth.tsx`) and label the product as local-only. Keeping silent success responses is the worst option because callers believe data was saved.

2. **Fix the hardware merge before anything else ships.** Replace the wholesale assignment at `cur/src/App.tsx:680-683` with the old merge-by-id logic (`old/src/App.tsx:511-549`), and only fall back to global defaults when local storage is empty. Add a unit test for "local item survives a global refresh".

3. **Decide whether High Risk belongs in the product.** If yes, delete the `continue` at `cur/src/utils/solarCalculator.ts:706-709` and keep the existing UI branches. If no, delete the High Risk branches, filters, and sort keys (`cur/src/App.tsx:2679`, `cur/src/App.tsx:2725`, `cur/src/App.tsx:4148-4156`) so the UI does not advertise a status the engine cannot return. Do not leave both halves.

4. **Finish the checkout flow.** The working-tree Buy button posts product id, amount, and description (`cur/src/App.tsx:2155-2178`) and the Worker route exists (`cur/worker/index.ts:399-448`). It prices catalog ids from D1 but still trusts `amount` for custom systems and hardware-derived products. Re-price those server-side or create the session from a stored quote. Document `BACHS_API_KEY` in `.env.example`, read `?payment=success|cancelled` in the UI instead of dropping it, and hide the button while the key is unset (today it opens an alert).

5. **Repair the comparison PDF.** Restore `initialCost = hasGenerator ? 0 : selectedGen.price` (`old/src/App.tsx:206`), build rows conditionally with the header, and re-add the Daily Usage and Fuel Price rows if they matter to customers. Add one assertion-style check that every row length equals `headers.length`.

6. **Add powerstations to every hardware export.** Include `powerstations` in `exportHardwareDatabaseJSON` (`cur/src/App.tsx:1380-1384`) and add section 4 to the Markdown export (`cur/src/App.tsx:1726-1761`). The importer already accepts them, so this closes a round-trip data loss.

7. **Replace the single admin password with a scoped token or per-user role.** At minimum, add a Worker rate limit on `/api/admin/verify` (`cur/worker/index.ts:226-236`), stop storing the raw password in `sessionStorage` (`cur/src/App.tsx:652`), and validate catalog payloads server-side, including price and ids.

8. **Make the usage profile opt-in and verify its maths.** The quote currently downloads two files with no warning (`cur/src/App.tsx:2152`). Add a checkbox beside "Generate Quote". Keep the working-tree overnight fix (`cur/src/App.tsx:1973`) and add a test for a 20:00-02:00 range.

9. **Remove dead exports and helpers.** Delete `exportSingleResultToPDF` and `exportProfileToPDF` or wire them to visible buttons; delete `getStatusFromSimulation` (`cur/src/utils/solarCalculator.ts:208`) or use it in the main loop; move `buildProductDetails` and `buildMasterDeviceDetails` into their proper scope (`cur/src/App.tsx:221-300`).

10. **Make local development one command.** Add a `dev:all` script that runs Vite and Wrangler together, or proxy through Wrangler only. Document the two-terminal requirement in the README, and add a `dev` guard that fails with a clear message when `127.0.0.1:8787` is not listening.

11. **Reconsider the "Peak Load" label.** Either compute a true instantaneous peak (which requires per-device surge overlap, already available in `hourly_surge`) or rename the row to "Highest Hourly Load" so the report does not overstate what it measures (`cur/src/App.tsx:1246-1250`).

12. **Close the exports gap for kits and powerstations.** Results JSON already carries the systems, but hardware JSON/Markdown omit powerstations. Consider adding a `products` and `powerstations` block to the results export so a customer quote bundle can be reconstructed offline.

---

## Appendix A: Endpoint inventory

Old (`old/server.ts`):

| Method | Path | Auth | Line |
|---|---|---|---|
| GET | `/healthz` | No | 79 |
| GET | `/api/auth/user` | No | 106 |
| POST | `/api/auth/logout` | No | 110 |
| GET | `/api/auth/google/url` | No | 116 |
| GET | `/api/auth/google/callback` | No | 141 |
| GET | `/api/user/data` | Yes | 241 |
| POST | `/api/user/profiles` | Yes | 269 |
| POST | `/api/user/results` | Yes | 300 |
| POST | `/api/user/hardware` | Yes | 327 |
| DELETE | `/api/user/:type/:id` | Yes | 353 |

Current (`cur/worker/index.ts`):

| Method | Path | Auth | Line |
|---|---|---|---|
| GET | `/healthz` | No | 430 |
| POST | `/api/admin/verify` | Password body | 226 |
| GET | `/api/auth/user` | No, stub | 239 |
| POST | `/api/auth/logout` | No, stub | 243 |
| GET | `/api/user/data` | No, stub returns empty | 247 |
| POST | `/api/user/{profiles,results,hardware}` | No, stub discards | 251 |
| DELETE | `/api/user/*` | No, stub | 258 |
| GET | `/api/devices` | No | 262 |
| POST | `/api/devices` | Admin header | 267 |
| DELETE | `/api/devices/:id` | Admin header | 289 |
| GET | `/api/hardware` | No | 295 |
| POST | `/api/hardware` | Admin header | 300 |
| DELETE | `/api/hardware/:id` | Admin header | 322 |
| GET | `/api/products` | No | 328 |
| POST | `/api/products` | Admin header | 339 |
| DELETE | `/api/products/:id` | Admin header | 366 |
| GET/POST | `/api/settings/:key` | Read public, write admin | 372 |
| POST | `/api/calculate` | No | 398 |

## Appendix B: File inventory deltas

Added in current: `worker/` (index, enrich, enrich.test, seed-data), `migrations/0001_init.sql`, `wrangler.jsonc`, `worker-configuration.d.ts`, `src/sdk/index.ts`, `src/components/InteractiveBridge.tsx` (same as old), `cli.ts`, `INTEGRATION_GUIDE.md`, `.github/workflows/deploy.yml`, `docs/agents/`, `AGENTS.md`.

Removed from current: `server.ts`, `supabase.sql`, `.env.example` OAuth/Supabase/Gemini entries, `@google/genai`, `@supabase/supabase-js`, `better-sqlite3`, `cookie-session`, `express`, `dotenv`, `tsx`.

Modified in current: `src/App.tsx`, `src/utils/solarCalculator.ts`, `src/types.ts`, `src/constants.ts`, `src/components/Auth.tsx`, `vite.config.ts`, `index.html`, `package.json`, `metadata.json`.

Unchanged in current: `src/components/ErrorBoundary.tsx` (62 lines, byte-identical to old), `src/components/InteractiveBridge.tsx` (148 lines, byte-identical apart from line endings), `src/main.tsx`.
