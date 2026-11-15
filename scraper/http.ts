// The shared HTTP client for the adapters. It sends the crawler user agent,
// keeps one request per second, backs off when a site throttles, and applies
// the per-source request budget for the current run.

import { CRAWLER_UA } from './adapters/types.ts';

const MIN_GAP_MS = 1000;
const REQUEST_TIMEOUT_MS = 30_000;
let lastRequestAt = 0;

const budgets = new Map<string, number>();
const requests = new Map<string, number>();
const paused = new Map<string, string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type FetchResult = {
  status: number;
  html: string;
  error?: string;
};

export type BinaryResult = {
  status: number;
  bytes: Uint8Array | null;
  content_type: string | null;
  error?: string;
};

export function sourceForUrl(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('jumia.com.ng')) return 'jumia';
  if (host.includes('jiji.ng')) return 'jiji';
  if (host.includes('solarshopnigeria.com')) return 'solarshopnigeria';
  return host;
}

export function configureRequestBudgets(limits: Record<string, number>): void {
  budgets.clear();
  for (const [source, limit] of Object.entries(limits)) {
    if (Number.isFinite(limit) && limit >= 0) budgets.set(source, limit);
  }
}

export function resetRequestState(): void {
  budgets.clear();
  requests.clear();
  paused.clear();
  lastRequestAt = 0;
}

export function pauseSource(source: string, reason = 'the source was paused'): void {
  if (!paused.has(source)) paused.set(source, reason);
}

export function requestReport(): {
  requests: Record<string, number>;
  budgets: Record<string, number>;
  paused_sources: string[];
  pause_reasons: Record<string, string>;
} {
  return {
    requests: Object.fromEntries(requests),
    budgets: Object.fromEntries(budgets),
    paused_sources: [...paused.keys()].sort(),
    pause_reasons: Object.fromEntries([...paused.entries()].sort(([left], [right]) => left.localeCompare(right))),
  };
}

async function takeRequestSlot(url: string, scope?: string): Promise<string | null> {
  const source = scope ?? sourceForUrl(url);
  if (paused.has(source)) return paused.get(source) ?? `${source} is paused for this run`;

  const limit = budgets.get(source);
  const used = requests.get(source) ?? 0;
  if (limit !== undefined && used >= limit) {
    const reason = `the ${source} request budget was spent`;
    paused.set(source, reason);
    return reason;
  }

  const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  requests.set(source, used + 1);
  return null;
}

const headers = (accept: string) => ({
  'user-agent': CRAWLER_UA,
  accept,
  'accept-language': 'en-NG,en;q=0.9',
});

export async function fetchText(url: string, options: { attempts?: number } = {}): Promise<FetchResult> {
  const attempts = options.attempts ?? 3;
  let lastError = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const blocked = await takeRequestSlot(url);
    if (blocked) return { status: 0, html: '', error: blocked };

    try {
      const response = await fetch(url, {
        headers: headers('text/html,application/xhtml+xml'),
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const html = await response.text();
      if (response.status === 403) {
        pauseSource(sourceForUrl(url), 'the source refused the crawler');
        return { status: response.status, html: '', error: 'the source refused the crawler' };
      }
      if (response.status === 429 || response.status === 503) {
        lastStatus = response.status;
        lastError = `throttled with status ${response.status}`;
        if (attempt < attempts) {
          await sleep(2000 * attempt + Math.floor(Math.random() * 1000));
          continue;
        }
        pauseSource(sourceForUrl(url), lastError);
        return { status: response.status, html: '', error: lastError };
      }
      return { status: response.status, html };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }

  return { status: lastStatus, html: '', error: lastError };
}

export async function fetchBinary(
  url: string,
  options: { attempts?: number; source?: string } = {},
): Promise<BinaryResult> {
  const attempts = options.attempts ?? 2;
  let lastError = '';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const blocked = await takeRequestSlot(url, options.source);
    if (blocked) return { status: 0, bytes: null, content_type: null, error: blocked };

    try {
      const response = await fetch(url, {
        headers: headers('image/avif,image/webp,image/apng,image/*,*/*;q=0.8'),
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 403) {
        pauseSource(
          options.source ?? sourceForUrl(url),
          'the source refused the crawler',
        );
        return { status: response.status, bytes: null, content_type: null, error: 'the source refused the crawler' };
      }
      if (response.status === 429 || response.status === 503) {
        lastStatus = response.status;
        lastError = `throttled with status ${response.status}`;
        if (attempt < attempts) {
          await sleep(2000 * attempt + Math.floor(Math.random() * 1000));
          continue;
        }
        pauseSource(options.source ?? sourceForUrl(url), lastError);
        return { status: response.status, bytes: null, content_type: null, error: lastError };
      }
      if (!response.ok) {
        return { status: response.status, bytes: null, content_type: null, error: `status ${response.status}` };
      }
      return {
        status: response.status,
        bytes: new Uint8Array(await response.arrayBuffer()),
        content_type: response.headers.get('content-type'),
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }

  return { status: lastStatus, bytes: null, content_type: null, error: lastError };
}
