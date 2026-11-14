// The enrichment drainer. It pulls queued images from the Worker, asks the
// gateway on the loopback interface to read the specification table, and
// posts the result back.
//
// The unified key never leaves the host. It is read from the gateway
// database at startup and refreshed when the gateway rejects it. See
// docs/scraper-runbook.md.

import { readUnifiedKey } from './unified-key.mjs';

const WORKER_URL = (process.env.WORKER_URL ?? '').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3001';
const POLL_MS = Number(process.env.DRAINER_POLL_MS ?? 30000);
const MODEL = process.env.DRAINER_MODEL ?? 'auto';

if (!WORKER_URL || !ADMIN_PASSWORD) {
  console.error('WORKER_URL and ADMIN_PASSWORD must be set.');
  process.exit(1);
}

// The prompt asks for one JSON object and nothing else, so the answer can be
// stored as the specs of the offer without a second pass.
const PROMPT = [
  'Read the specification table in this image of a solar panel or a battery.',
  'Reply with one JSON object and nothing else.',
  'Use these keys: watts, voc, isc, voltage_v, capacity_ah, capacity_kwh, battery_type, cell_type, efficiency_pct.',
  'Use a number when the value is visible and null when it is not.',
  'battery_type is "lithium" or "lead-acid".',
].join(' ');

let unifiedKey = null;

async function worker(path, init = {}) {
  const response = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      'x-admin-key': ADMIN_PASSWORD,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Worker ${path} failed with status ${response.status}.`);
  }
  return response.json();
}

// The image becomes a data URL so the gateway does not fetch it again.
async function imageAsDataUrl(imageUrl) {
  const response = await fetch(imageUrl, { headers: { 'user-agent': 'SolarSizerBot/0.1 (+https://solarsizer.com/bot)' } });
  if (!response.ok) throw new Error(`the image could not be fetched (status ${response.status})`);
  const type = response.headers.get('content-type') ?? 'image/jpeg';
  const bytes = Buffer.from(await response.arrayBuffer());
  return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
}

// The model may wrap the JSON in a code block, so the braces are taken out.
function parseAnswer(content) {
  const text = String(content ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the answer held no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

async function readSpecs(imageUrl) {
  if (!unifiedKey) {
    unifiedKey = readUnifiedKey();
    if (!unifiedKey) throw new Error('the gateway has no unified key yet');
  }

  const dataUrl = await imageAsDataUrl(imageUrl);
  const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${unifiedKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (response.status === 401) {
    // The key was rotated, so it is read again.
    unifiedKey = null;
    throw new Error('the gateway rejected the unified key');
  }
  if (!response.ok) {
    throw new Error(`the gateway failed with status ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const body = await response.json();
  return parseAnswer(body.choices?.[0]?.message?.content);
}

async function handle(item) {
  try {
    const result = await readSpecs(item.image_url);
    await worker(`/api/scraper/queue/${encodeURIComponent(item.id)}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'done', result }),
    });
    console.log(`queue ${item.id} done`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await worker(`/api/scraper/queue/${encodeURIComponent(item.id)}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'failed', error: message }),
    });
    console.log(`queue ${item.id} failed: ${message}`);
  }
}

async function tick() {
  let items = [];
  try {
    items = await worker('/api/scraper/queue?limit=5');
  } catch (error) {
    console.log(`the queue could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  for (const item of items) {
    await handle(item);
  }
}

console.log(`drainer started, gateway ${GATEWAY_URL}, worker ${WORKER_URL}`);
while (true) {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
