# SolarSizer Pro: Technical Integration & Platform Documentation

SolarSizer Pro is a comprehensive full-stack solar energy sizing and product management platform. It is designed to function as a standalone application or as an integrated "Business Engine" for solar company websites.

---

## 1. Platform Overview
SolarSizer Pro provides a centralized sizing engine, a multi-user database, and a dynamic product catalog. It handles the complex math of solar engineering while providing a simple interface for both customers and business owners.

### Key Capabilities:
*   **Sizing Engine**: Advanced logic for calculating inverter capacity, battery storage, and solar array requirements based on load profiles and regional sun hours.
*   **Unified Catalog**: A dynamic API that merges pre-configured system packages (`products` table) with tagged standalone hardware (`hardware` table).
*   **Remote Work Internet Tab**: Dedicated view for networking hardware stacks (CPEs, Load Balancers, Bonding devices) tailored for the Nigerian market.
*   **Admin Panel**: Restricted access for business owners to manage the "Master Database," "Product Catalog," and "Hardware Inventory."

---

## 2. Integration Modes (For Your Website)

### A. Iframe Embedding (Recommended)
Embed the app into your website. Use URL parameters to control formatting and initial state.

**Base URL**: `https://ais-dev-r334bdzfkxvedl7o2kkgd2-428485733064.europe-west2.run.app`

#### URL Parameters:
| Parameter | Values | Description |
| :--- | :--- | :--- |
| `compact` | `true` | Hides the app header and main navigation tabs. |
| `tab` | `calculator`, `products`, `internet`, `results`, `database` | Sets the initial active tab. |
| `tag` | `flagship`, `internet`, `panel`, `battery`, `student`, etc. | Filters the product catalog to a specific tag. |

#### Example: Internet Hardware Stack Page
```html
<iframe 
  src="https://ais-dev-r334bdzfkxvedl7o2kkgd2-428485733064.europe-west2.run.app/?tab=internet&compact=true" 
  style="width:100%; height:900px; border:none;"
></iframe>
```

---

## 3. API Reference (REST)

### Unified Product Catalog
**Endpoint**: `GET /api/products?tag={tag_name}`
Returns a merged list of system combinations and tagged hardware components.
*   **tag**: (Optional) Filter by category. Common tags: `flagship`, `kit`, `internet`, `panel`, `battery`.

### Sizing Engine
**Endpoint**: `POST /api/calculate`
**Request Body**:
```json
{
  "region": "SE_SS",
  "devices": [
    { "id": "d1", "name": "Fridge", "watts": 150, "qty": 1, "category": "compressor", "hours": [0,1,2,3,4,5,18,19,20,21,22,23] }
  ],
  "batteryPreference": "lithium",
  "tolerance": 20
}
```

### Master Data Management (Admin Required)
All POST/DELETE operations require an `x-admin-key` header.
*   `POST /api/devices`: Add/Update Load Profile archetypes.
*   `POST /api/hardware`: Add/Update inventory items (Inverters, Panels, Batteries, Powerstations).
*   `POST /api/products`: Promote calculated systems or manual kits to the public catalog.

---

## 4. Developer SDK (TypeScript)
The platform includes a built-in SDK at `src/sdk/index.ts` for programmatic interaction.

```typescript
import { sdk } from './sdk';

// 1. Fetch filtered internet products
const internetGear = await sdk.getProducts('internet');

// 2. Add a new master device (requires admin key)
await sdk.saveMasterDevice({
  id: "md-starlink-mini",
  name: "Starlink Mini",
  category: "internet",
  watts: 25,
  tags: ["internet", "portable"]
}, "YOUR_ADMIN_PASSWORD");

// 3. Programmatic Calculation
const results = await sdk.calculate({
  location: "North",
  devices: userDevices,
  batteryPreference: "lithium"
});
```

---

## 5. Catalog Classification Logic

### Tags & UI Mapping
The "Product Catalog" (`/products` tab) uses tags to segment items:
*   `flagship`: Appears in the "Flagship" filter (Premium kits).
*   `internet`: Appears in the "Internet" filter (Networking stacks).
*   `panel`: Appears in the "Panels" filter (Standalone solar panels).
*   `battery`: Appears in the "Batteries" filter (Standalone batteries).

### "Promote to Product" Workflow
1.  Run a calculation in the **Calculator** tab.
2.  Review the suggested combinations.
3.  Click the **Layers (Promote)** icon on a result.
4.  Optionally add tags like `flagship` or `student`.
5.  This item is now live in the **Products** tab and via the `/api/products` endpoint.

---

## 6. Admin & Powerstation Integration
*   **Powerstations**: Located in the `hardware` table with the type `powerstation`. These are automatically prioritized in the calculator for light-load scenarios (e.g., student setups).
*   **Persistence**: Ensure your `.env` file has a strong `ADMIN_PASSWORD`. This password acts as both the UI unlock key and the API `x-admin-key`.
