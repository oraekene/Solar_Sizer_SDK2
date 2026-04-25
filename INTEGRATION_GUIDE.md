# SolarSizer Pro: Technical Integration & Platform Documentation

SolarSizer Pro is a full-stack solar energy sizing and product management platform. It can run standalone or be embedded as a "Business Engine" inside a solar company website.

## 1. Platform Overview

SolarSizer Pro provides:

- a sizing engine for inverter, battery, and solar array recommendations
- a unified catalog API that merges curated kits with tagged standalone hardware
- a dedicated remote-work internet tab for Nigerian networking gear stacks
- an admin-only management flow for devices, products, hardware, and pricing settings

## 2. Hosting Model

The project is now designed for Cloudflare free-tier services:

- frontend: static assets served by Cloudflare Workers
- backend API: Cloudflare Worker routes under `/api/*`
- shared persistence: Cloudflare D1
- user-specific drafts/results: browser `localStorage`

## 3. Integration Modes

### A. Iframe Embedding

Embed the app in an existing site and control layout/state using query parameters.

**Base URL**: `https://<your-cloudflare-domain>`

#### URL Parameters

| Parameter | Values | Description |
| :--- | :--- | :--- |
| `compact` | `true` | Hides the app header and primary navigation. |
| `tab` | `calculator`, `products`, `internet`, `results`, `database` | Sets the initial active tab. |
| `tag` | `flagship`, `internet`, `panel`, `battery`, `student`, etc. | Filters the product catalog. |

#### Example

```html
<iframe
  src="https://<your-cloudflare-domain>/?tab=internet&compact=true"
  style="width:100%; height:900px; border:none;"
></iframe>
```

## 4. API Reference

### Unified Product Catalog

**Endpoint**: `GET /api/products?tag={tag_name}`

Returns a merged list of:

- preconfigured kits from the `products` table
- tagged standalone hardware promoted from the `hardware` table

### Sizing Engine

**Endpoint**: `POST /api/calculate`

```json
{
  "location": "SE_SS",
  "devices": [
    {
      "id": "d1",
      "name": "Fridge",
      "watts": 150,
      "qty": 1,
      "category": "compressor",
      "ranges": [{ "start": 18, "end": 6 }]
    }
  ],
  "hardware": {
    "inverters": [],
    "panels": [],
    "batteries": [],
    "powerstations": []
  },
  "batteryPreference": "lithium",
  "tolerance": 20
}
```

### Admin Data Management

All write operations require an `x-admin-key` header.

- `POST /api/devices`
- `DELETE /api/devices/:id`
- `POST /api/hardware`
- `DELETE /api/hardware/:id`
- `POST /api/products`
- `DELETE /api/products/:id`
- `POST /api/settings/:key`

## 5. SDK Usage

The built-in SDK lives in `src/sdk/index.ts`.

```ts
import { sdk } from './src/sdk';

const internetGear = await sdk.getProducts('internet');

await sdk.saveMasterDevice(
  {
    id: 'md-starlink-mini',
    name: 'Starlink Mini',
    category: 'internet',
    default_watts: 25,
    tags: ['internet', 'portable'],
  },
  'YOUR_ADMIN_PASSWORD',
);
```

## 6. Notes

- Powerstations are stored in the `hardware` table with `type = powerstation`.
- Shared catalog data lives in Cloudflare D1.
- `ADMIN_PASSWORD` is a Wrangler secret and is also used by the admin unlock flow in the UI.
