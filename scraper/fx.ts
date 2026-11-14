// Fetches the daily naira rate and converts dollar offers into naira. The
// raw price and currency stay on the offer so the conversion can be audited.

import { CRAWLER_UA } from './adapters/types.ts';
import { roundPrice } from './rules.ts';

export const NAIRADAILY_FX_URL = 'https://nairadaily.net/api/rates?source=USD&target=NGN';
export const FALLBACK_FX_URL = 'https://open.er-api.com/v6/latest/USD';
export const FX_URLS = [NAIRADAILY_FX_URL, FALLBACK_FX_URL] as const;
export const MAX_FX_AGE_DAYS = 7;

export type FxRate = {
  rate: number;
  date: string;
  source: string;
};

type ConvertibleOffer = {
  price: number | null;
  currency: string;
  status: string;
  reason_code: string | null;
  price_ngn?: number | null;
  price_ngn_rounded?: number | null;
  fx_rate?: number | null;
  fx_rate_date?: string | null;
  fx_source?: string | null;
};

type FxFields = {
  price_ngn: number | null;
  price_ngn_rounded: number | null;
  fx_rate: number | null;
  fx_rate_date: string | null;
  fx_source: string | null;
};

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function parseFxPayload(payload: unknown): { rate: number; date: string } | null {
  if (Array.isArray(payload)) {
    const row = payload.find((item) => {
      const value = item as { source?: string; target?: string };
      return value?.source?.toUpperCase() === 'USD' && value?.target?.toUpperCase() === 'NGN';
    }) as { rate?: number; time?: string } | undefined;
    if (!row || typeof row.rate !== 'number' || !Number.isFinite(row.rate) || row.rate <= 0) return null;
    const date = parseDate(row.time);
    return date ? { rate: row.rate, date } : null;
  }

  if (payload && typeof payload === 'object') {
    const value = payload as { rates?: { NGN?: number }; time_last_update_utc?: string };
    const rate = value.rates?.NGN;
    const date = parseDate(value.time_last_update_utc);
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && date) return { rate, date };
  }
  return null;
}

export function isFreshFxRate(rate: FxRate, now = new Date()): boolean {
  const time = Date.parse(rate.date);
  if (Number.isNaN(time)) return false;
  const age = now.getTime() - time;
  return age >= -24 * 60 * 60 * 1000 && age < MAX_FX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

async function fetchRate(url: string, source: string): Promise<FxRate | null> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': CRAWLER_UA, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const parsed = parseFxPayload(await response.json());
    if (!parsed || !isFreshFxRate({ ...parsed, source })) return null;
    return { ...parsed, source };
  } catch {
    return null;
  }
}

export async function loadFxRate(now = new Date()): Promise<FxRate | null> {
  for (const url of FX_URLS) {
    const source = url === NAIRADAILY_FX_URL ? 'nairadaily.net' : 'open.er-api.com';
    const rate = await fetchRate(url, source);
    if (rate && isFreshFxRate(rate, now)) return rate;
  }
  return null;
}

export function applyFxRate<T extends ConvertibleOffer>(
  offer: T,
  rate: FxRate | null,
): T & FxFields {
  const currency = offer.currency.toUpperCase();
  if (currency === 'NGN') {
    return {
      ...offer,
      price_ngn: offer.price,
      price_ngn_rounded: null,
      fx_rate: offer.fx_rate ?? null,
      fx_rate_date: offer.fx_rate_date ?? null,
      fx_source: offer.fx_source ?? null,
    };
  }

  const hasPrice = typeof offer.price === 'number' && offer.price > 0;
  if (!hasPrice) {
    return {
      ...offer,
      price_ngn: offer.price_ngn ?? null,
      price_ngn_rounded: offer.price_ngn_rounded ?? null,
      fx_rate: offer.fx_rate ?? null,
      fx_rate_date: offer.fx_rate_date ?? null,
      fx_source: offer.fx_source ?? null,
    };
  }

  if (currency !== 'USD' || !rate) {
    if (offer.status === 'qualified') {
      return {
        ...offer,
        status: 'review_required',
        reason_code: 'usd_rate_unavailable',
        price_ngn: null,
        price_ngn_rounded: null,
        fx_rate: null,
        fx_rate_date: null,
        fx_source: null,
      };
    }
    return {
      ...offer,
      price_ngn: null,
      price_ngn_rounded: null,
      fx_rate: null,
      fx_rate_date: null,
      fx_source: null,
    };
  }

  const priceNgn = offer.price * rate.rate;
  const restored =
    offer.reason_code === 'usd_rate_unavailable' &&
    (offer.status === 'review_required' || offer.status === 'excluded')
      ? { status: 'qualified', reason_code: null }
      : {};
  return {
    ...offer,
    ...restored,
    price_ngn: priceNgn,
    price_ngn_rounded: roundPrice(priceNgn),
    fx_rate: rate.rate,
    fx_rate_date: rate.date,
    fx_source: rate.source,
  };
}
