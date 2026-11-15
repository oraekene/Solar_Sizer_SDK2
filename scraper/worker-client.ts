// The client for the Worker admin routes. Every call carries the admin key
// in the x-admin-key header, the same header the browser review screen uses.

import type { HardwareRow } from './merge.ts';

export type WorkerOfferRow = {
  id: string;
  source_site: string;
  source_listing_id: string;
  source_url: string;
  seller_id: string | null;
  seller_name: string | null;
  price: number | null;
  currency: string;
  price_ngn: number | null;
  price_ngn_rounded: number | null;
  fx_rate: number | null;
  fx_rate_date: string | null;
  fx_source: string | null;
  price_kind: string;
  unit_basis: string | null;
  unit_quantity: number | null;
  condition: string;
  in_stock: string;
  trust_tier: string;
  stated_specs: Record<string, unknown>;
  trading_signals: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  raw_payload_at: string | null;
  image_hash: string | null;
  status: string;
  reason_code: string | null;
  not_found_strikes: number;
  last_checked: string | null;
  canonical_id: string | null;
};

export type RunReport = {
  run_id: string;
  kind: 'sweep' | 'discovery';
  status: 'ok' | 'partial' | 'failed';
  sources: string[];
  report: Record<string, unknown>;
  started_at: string;
  finished_at: string;
};

export class WorkerClient {
  private readonly workerUrl: string;
  private readonly adminKey: string;

  constructor(workerUrl: string, adminKey: string) {
    this.workerUrl = workerUrl;
    this.adminKey = adminKey;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.workerUrl}${path}`, {
      ...init,
      headers: {
        'x-admin-key': this.adminKey,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      throw new Error(`Worker ${path} failed with status ${response.status}. ${body}`);
    }
    return response.json();
  }

  async listOffers(limit = 5000): Promise<WorkerOfferRow[]> {
    return (await this.request(`/api/scraper/offers?limit=${limit}`)) as WorkerOfferRow[];
  }

  async saveOffers(offers: unknown[]): Promise<void> {
    for (let start = 0; start < offers.length; start += 12) {
      await this.request('/api/scraper/offers', {
        method: 'POST',
        body: JSON.stringify({ offers: offers.slice(start, start + 12) }),
      });
    }
  }

  async saveCandidates(candidates: unknown[]): Promise<void> {
    for (let start = 0; start < candidates.length; start += 40) {
      await this.request('/api/scraper/candidates', {
        method: 'POST',
        body: JSON.stringify({ candidates: candidates.slice(start, start + 40) }),
      });
    }
  }

  async enqueueImages(items: Array<{ offer_id: string; image_url: string; image_hash: string }>): Promise<void> {
    for (let start = 0; start < items.length; start += 100) {
      await this.request('/api/scraper/queue', {
        method: 'POST',
        body: JSON.stringify({ items: items.slice(start, start + 100) }),
      });
    }
  }

  async purgeOldOffers(): Promise<number> {
    const response = (await this.request('/api/scraper/offers/purge', {
      method: 'POST',
      body: JSON.stringify({}),
    })) as { purged?: number };
    return response.purged ?? 0;
  }

  async publishCandidate(candidateId: string): Promise<void> {
    await this.request(`/api/scraper/candidates/${encodeURIComponent(candidateId)}/publish`, {
      method: 'POST',
      body: JSON.stringify({ reviewer: 'auto-publish' }),
    });
  }

  async listHardware(): Promise<HardwareRow[]> {
    const response = await fetch(`${this.workerUrl}/api/hardware`, {
      headers: { 'x-admin-key': this.adminKey },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Worker /api/hardware failed with status ${response.status}.`);
    const rows = (await response.json()) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const data = (row.data ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? ''),
        type: String(row.type ?? ''),
        price: typeof data.price === 'number' ? data.price : null,
        price_source: typeof row.price_source === 'string' ? row.price_source : 'manual',
        data,
      };
    });
  }

  async reportRun(run: RunReport): Promise<void> {
    await this.request('/api/scraper/run', {
      method: 'POST',
      body: JSON.stringify(run),
    });
  }
}
