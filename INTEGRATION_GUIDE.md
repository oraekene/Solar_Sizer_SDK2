# SolarSizer Pro: Technical Integration & Platform Documentation

SolarSizer Pro is a comprehensive full-stack solar energy sizing and product management platform. It is designed to function as a standalone application or as an integrated "Business Engine" for solar company websites.

---

## 1. Platform Overview
SolarSizer Pro provides a centralized sizing engine, a multi-user database, and a dynamic product catalog. It handles the complex math of solar engineering while providing a simple interface for both customers and business owners.

### Key Capabilities:
*   **Sizing Engine**: Advanced logic for calculating inverter capacity, battery storage, and solar array requirements based on load profiles and regional sun hours.
*   **Unified Catalog**: A dynamic API that merges pre-configured system packages with individual hardware components based on tags.
*   **Multi-User Auth**: Built-in Google OAuth support with isolated user data (Load Profiles, Results).
*   **Admin Panel**: Restricted access for business owners to manage the "Master Database" and "Product Catalog."

---

## 2. Integration Modes (For Your Website)

### A. Iframe Embedding (Recommended)
The easiest way to integrate SolarSizer Pro into your business website is via an Iframe. The app supports special URL parameters to change its behavior.

**Base URL**: `https://ais-dev-wttvbdqce7s75ppusm6y5x-428485733064.europe-west2.run.app`

#### URL Parameters:
| Parameter | Values | Description |
| :--- | :--- | :--- |
| `compact` | `true` | Hides the app header and navigation. Makes the app look like a native component. |
| `tab` | `calculator`, `products`, `results` | Sets the initial view. |
| `tag` | `residential`, `commercial`, etc. | Filters the product catalog to a specific category. |

#### Example: Residential Product Page
```html
<iframe 
  src="https://ais-dev-wttvbdqce7s75ppusm6y5x-428485733064.europe-west2.run.app/?tab=products&tag=residential&compact=true" 
  style="width:100%; height:800px; border:none;"
></iframe>
```

---

## 3. API Reference (REST)

### Unified Product Catalog
**Endpoint**: `GET /api/products?tag={tag_name}`
Returns a merged list of system combinations and tagged hardware.
*   **tag**: (Optional) Filter by category (e.g., `budget`, `featured`).

### Sizing Engine
**Endpoint**: `POST /api/calculate`
**Body**:
```json
{
  "devices": [
    { "name": "AC", "watts": 1500, "qty": 1, "ranges": [{ "start": 12, "end": 18 }] }
  ],
  "region": "SE_SS",
  "batteryPreference": "lithium",
  "tolerance": 20
}
```

### Master Device List
**Endpoint**: `GET /api/devices`
Returns the "Quick Add" database of standard appliances and their default wattages.

---

## 4. Developer SDK (TypeScript)
The platform includes a built-in SDK located at `src/sdk/index.ts`.

```typescript
import { SolarSizerSDK } from './sdk';

const sdk = new SolarSizerSDK();

// Fetch residential products
const products = await sdk.getProducts('residential');

// Run a calculation programmatically
const results = await sdk.calculate(devices, 'North', 'any', 20);
```

---

## 5. Database Schema (Unified Catalog Logic)

### `products` Table
Stores full system combinations (Inverter + Panels + Batteries).
*   **Tags**: Used to determine which website page the package appears on.

### `hardware` Table
Stores individual components.
*   **Unified Logic**: If a hardware item has `tags`, it is automatically served as a "Standalone Product" in the `/api/products` endpoint.

### `devices_master` Table
The central repository of appliances used for "Quick Add" in the calculator.

---

## 6. Admin & Business Owner Workflow

### Managing the Catalog
1.  **Login**: Use your authorized email (`oraelosikeny@gmail.com` or `oraelosikenny@gmail.com`).
2.  **Add Hardware**: Go to the **Hardware DB** tab. Add an item, provide a description, and add tags (e.g., `featured`).
3.  **Create Packages**: Use the **Calculator** to find an optimal system. Click the blue **Layers (Promote to Product)** icon to save it to the catalog.
4.  **Automatic Sync**: Your website's embedded iframes will instantly update with the new items based on their tags.

---

## 7. Security & Authentication
*   **Multi-User**: Users log in via Google. Their saved results and load profiles are private to them.
*   **Admin Protection**: The "Hardware DB" and "Promote to Product" features are only visible to the specified developer emails.
*   **CORS/Iframe**: The app is configured to allow embedding in your business website domain.
