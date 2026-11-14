// The shared HTTP client for the adapters. It sends the crawler user agent,
// keeps one request per second, and backs off when a site throttles.

import { CRAWLER_UA } from './adapters/types.ts';

const MIN_GAP_MS = 1000;
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type FetchResult = {
  status: number;
  html: string;
  error?: string;
};

export async function fetchText(url: string, options: { attempts?: number } = {}): Promise<FetchResult> {
  const attempts = options.attempts ?? 3;
  let lastError = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': CRAWLER_UA,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-NG,en;q=0.9',
        },
        redirect: 'follow',
      });
      const html = await response.text();
      if (response.status === 429 || response.status === 503) {
        lastError = `throttled with status ${response.status}`;
        await sleep(2000 * attempt + Math.floor(Math.random() * 1000));
        continue;
      }
      return { status: response.status, html };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(1000 * attempt);
    }
  }

  return { status: 0, html: '', error: lastError };
}
