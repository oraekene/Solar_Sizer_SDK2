// Finds the main product image and stores a content hash for it. The hash
// lets the merge rules collapse two ads that use the same photo.

import { createHash } from 'node:crypto';
import { fetchBinary } from './http.ts';

const cache = new Map<string, { image_url: string; image_hash: string } | null>();

const decodeAttribute = (value: string) =>
  value
    .replaceAll(String.fromCharCode(38, 97, 109, 112, 59), String.fromCharCode(38))
    .replaceAll(String.fromCharCode(38, 113, 117, 111, 116, 59), String.fromCharCode(34))
    .replaceAll(String.fromCharCode(38, 39, 59), String.fromCharCode(39))
    .replaceAll(String.fromCharCode(38, 108, 116, 59), String.fromCharCode(60))
    .replaceAll(String.fromCharCode(38, 103, 116, 59), String.fromCharCode(62));

function absoluteUrl(value: string, baseUrl: string): string | null {
  const decoded = decodeAttribute(value.trim());
  if (!decoded || /^data:/i.test(decoded)) return null;
  try {
    return new URL(decoded, baseUrl).href;
  } catch {
    return null;
  }
}

export function imageUrlFromHtml(html: string, baseUrl: string): string | null {
  const attribute = (attributes: string, name: string) =>
    attributes.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] ?? '';

  const candidates: Array<{ url: string; score: number; order: number }> = [];
  let order = 0;

  const add = (
    source: string,
    kind: 'meta' | 'preload' | 'image',
    alt = '',
    attributes = '',
    nearby = '',
  ) => {
    const url = absoluteUrl(source, baseUrl);
    if (!url) return;
    const description = `${alt} ${attributes} ${url}`;
    if (/logo|avatar|placeholder|sprite|favicon|icon(?:\b|\.)/i.test(description)) return;
    if (/display\s*:\s*none/i.test(attributes)) return;
    if (/b-seller-block__avatar|b-seller-avatar/i.test(nearby)) return;

    let score = kind === 'meta' ? 8 : kind === 'preload' ? 4 : 0;
    if (/product|gallery|main|zoom|media/i.test(description)) score += 5;
    if (alt) score += 2;
    if (/\/files\//i.test(url)) score += 2;
    const width = Number(attribute(attributes, 'width'));
    if (Number.isFinite(width) && width >= 400) score += 2;
    if (/loading=["']lazy["']/i.test(attributes)) score -= 2;
    candidates.push({ url, score, order });
  };

  const metaPattern = /<meta\b([^>]*)>/gi;
  for (const match of html.matchAll(metaPattern)) {
    const attributes = match[1];
    const property = attribute(attributes, 'property') || attribute(attributes, 'name');
    if (!/^(og:image|twitter:image)$/i.test(property)) continue;
    add(attribute(attributes, 'content'), 'meta');
  }

  const preloadPattern = /<link\b([^>]*)>/gi;
  for (const match of html.matchAll(preloadPattern)) {
    const attributes = match[1];
    if (!/rel=["'][^"']*preload[^"']*["']/i.test(attributes)) continue;
    if (!/as=["']image["']/i.test(attributes)) continue;
    const source = attribute(attributes, 'imagesrcset').split(/\s+/)[0] || attribute(attributes, 'href');
    add(source, 'preload');
  }

  const imagePattern = /<img\b([^>]*)>/gi;
  for (const match of html.matchAll(imagePattern)) {
    const attributes = match[1];
    const source =
      attribute(attributes, 'data-src') ||
      attribute(attributes, 'src') ||
      attribute(attributes, 'srcset').split(/\s+/)[0];
    const start = match.index ?? 0;
    const nearby = html.slice(Math.max(0, start - 500), start);
    add(source, 'image', decodeAttribute(attribute(attributes, 'alt')), attributes, nearby);
  }

  candidates.sort((left, right) => right.score - left.score || left.order - right.order);
  return candidates[0]?.url ?? null;
}

export function hashImageBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function collectImageFacts(
  html: string,
  baseUrl: string,
  source: string,
  preferredUrl?: string | null,
): Promise<{ image_url: string | null; image_hash: string | null }> {
  const candidate = preferredUrl ?? imageUrlFromHtml(html, baseUrl);
  if (!candidate) return { image_url: null, image_hash: null };
  const imageUrl = absoluteUrl(candidate, baseUrl);
  if (!imageUrl) return { image_url: null, image_hash: null };
  if (cache.has(imageUrl)) return cache.get(imageUrl) ?? { image_url: null, image_hash: null };

  const response = await fetchBinary(imageUrl, { source });
  if (response.status !== 200 || !response.bytes) {
    cache.set(imageUrl, null);
    return { image_url: imageUrl, image_hash: null };
  }
  const facts = { image_url: imageUrl, image_hash: hashImageBytes(response.bytes) };
  cache.set(imageUrl, facts);
  return facts;
}
