# Solar Sizer SDK2 — Domain Model

A single-page solar sizing tool for the Nigerian market. The user lists household
appliances with run schedules, the engine searches the hardware catalogue for every
viable inverter + battery + panel combination, and the UI ranks the survivors by
price so the user can quote or buy one.

## Core vocabulary

| Term | Meaning |
| :--- | :--- |
| **Device** | A load item the user adds: watts, quantity, and one or more `TimeRange` schedules. Master devices are reusable templates for these. |
| **Load analysis** | `calculateUserNeeds` output: `max_surge`, `nighttime_wh`, `total_daily_wh`, and `hourly_consumption` (24 hourly averages). |
| **System combination** | One inverter + battery bank + panel array produced by `buildCombinations`. It is the unit that gets priced, compared and quoted. |
| **Kit** | A product row in the Product Catalog that is a whole system, not a single part. Distinguished by `product_id` being set and `is_preconfigured: true`. |
| **Powerstation** | A self-contained unit with a built-in inverter and battery. Modelled as a kit with no `product_id`. |
| **Wiring item** | A catalogue entry in one of the ten `WiringCategory` groups. Either `mandatory` (always quoted) or `nice-to-have` (quoted only when ticked). |
| **Margin** | Per-category percentage added on top of retail price. Applied through `applyMargin`. |
| **Tolerance** | The user-set deficit percentage at or below which a system is still offered. Default 20%. |

## Status thresholds

A system is `Optimal`, `Conditional` or `High Risk`, decided in
`src/utils/solarCalculator.ts` from the hourly simulation deficit:

- **Optimal** — the hourly simulation passed and `effectiveDeficitWh` is 0.
- **Conditional** — deficit percentage is greater than 0 and at or below the
  tolerance. The user can still rescue it with the interactive bridge.
- **High Risk** — deficit percentage is above the tolerance. Offered behind the
  "Show High Risk Systems" toggle rather than dropped, so an undersized load gets
  a warned option instead of "No Matching Systems".

Deficit percentage is `effectiveDeficitWh / total_daily_wh * 100`, where
`effectiveDeficitWh` is floored at the annualised shortfall between consumption
and generation so a system is never credited for energy it cannot deliver.

## Wiring selection

- Mandatory items are always included.
- Nice-to-have items are included only when their id is in
  `selectedNiceToHaveIds`, passed into `buildCombinations` as a `string[]`.
- Selection state is client-only and persists in `localStorage` under
  `ss_wiring_v2`. It is never written to D1.

## Powerstation vs kit vs custom

`resultFilter` on the results page splits the three shapes:

- `kits` — `is_preconfigured && product_id`
- `powerstations` — `is_preconfigured && !product_id`
- custom — everything else

## Where things live

- `src/utils/solarCalculator.ts` — the whole search: load analysis, hourly
  simulation, string sizing, status assignment, wiring integration.
- `src/constants.ts` — seed hardware, `WIRING_CATEGORY_LABELS`,
  `WIRING_SPEC_FIELDS`, `WIRING_OPTIONAL_BY_DEFAULT`, location PSH.
- `src/App.tsx` — every tab and modal. Local hardware state is merged with the
  D1 catalogue by id so user-added items survive a refresh.
- `worker/index.ts` — D1 schema, seeding, `/api/*` routes, admin auth with
  per-IP lockout, Bachs checkout.
