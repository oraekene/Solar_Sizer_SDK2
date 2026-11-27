// The enrichment drainer. It pulls queued images from the Worker, asks the
// gateway on the loopback interface to read the specification table, and
// posts the result back.
//
// The unified key never leaves the host. It is read from the gateway
// database at startup and refreshed when the gateway rejects it. See
// docs/scraper-runbook.md.

import { readUnifiedKey } from './unified-key.mjs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER_URL = (process.env.WORKER_URL ?? '').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:3001';
const POLL_MS = Number(process.env.DRAINER_POLL_MS ?? 30000);
const MODEL = process.env.DRAINER_MODEL ?? 'auto';
// The Python that reads the picture for its perceptual hash and thumbnail.
const PYTHON = process.env.IMAGE_HASH_PYTHON ?? 'python';
const IMAGE_HASH_SCRIPT = fileURLToPath(new URL('./image_hash.py', import.meta.url));

if (!WORKER_URL || !ADMIN_PASSWORD) {
  console.error('WORKER_URL and ADMIN_PASSWORD must be set.');
  process.exit(1);
}

// The prompt asks for one JSON object and nothing else, so the answer can be
// stored as the specs of the offer without a second pass.
//
// The key list covers every field the calculator reads. A battery label rarely
// prints the names exactly, so the two fields it never prints plainly are named
// with the phrasings the labels do use.
const PROMPT = [
  'Read the specification table in this image of a solar panel or a battery.',
  'Reply with one JSON object and nothing else.',
  'Use these keys: watts, voc, isc, voltage_v, capacity_ah, capacity_kwh, battery_type, cell_type, efficiency_pct, max_parallel_strings, min_c_rate.',
  'Use a number when the value is visible and null when it is not.',
  'battery_type is "lithium" or "lead-acid".',
  'max_parallel_strings is the largest number of battery modules that may be wired in parallel, printed as "max parallel", "parallel units" or "max parallel connection".',
  'min_c_rate is the smallest charge or discharge rate the battery allows, in C, printed as "C-rate", "charge rate" or "C".',
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
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // The Worker explains the refusal in the body, so it is kept in the log.
    const detail = (await response.text()).slice(0, 200);
    throw new Error(`Worker ${path} failed with status ${response.status}. ${detail}`);
  }
  return response.json();
}

// The image becomes a data URL so the gateway does not fetch it again.
async function fetchImage(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: { 'user-agent': 'SolarSizerBot/0.1 (+https://solarsizer.com/bot)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`the image could not be fetched (status ${response.status})`);
  const type = response.headers.get('content-type') ?? 'image/jpeg';
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, dataUrl: `data:${type.split(';')[0]};base64,${bytes.toString('base64')}` };
}

/**
 * The perceptual hash and the small thumbnail of the picture. The host has
 * Python with Pillow for this. A missing Pillow only costs the hash, so the
 * enrichment still runs.
 */
async function readImageFacts(bytes) {
  const path = join(tmpdir(), `solar-image-${process.pid}-${Date.now()}.bin`);
  try {
    await writeFile(path, bytes);
    const output = await new Promise((resolve, reject) => {
      const child = spawn(PYTHON, [IMAGE_HASH_SCRIPT, path], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`image_hash.py failed with status ${code}: ${stderr.slice(0, 200)}`));
      });
    });
    const parsed = JSON.parse(output);
    return { phash: parsed.phash ?? '', thumb: parsed.thumb ?? '' };
  } finally {
    await unlink(path).catch(() => {});
  }
}

// The model may wrap the JSON in a code block, so the braces are taken out.
function parseAnswer(content) {
  const text = String(content ?? '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('the answer held no JSON object');
  return JSON.parse(text.slice(start, end + 1));
}

async function readSpecs(dataUrl) {
  if (!unifiedKey) {
    unifiedKey = readUnifiedKey();
    if (!unifiedKey) throw new Error('the gateway has no unified key yet');
  }

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
    signal: AbortSignal.timeout(120_000),
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
  // The picture facts are read before the model call, because reading a hash
  // needs no provider. A gateway failure then costs only the specs, and the
  // hash and the thumbnail still reach the Worker.
  let facts = { phash: '', thumb: '' };
  let dataUrl = null;
  try {
    const image = await fetchImage(item.image_url);
    dataUrl = image.dataUrl;
    try {
      facts = await readImageFacts(image.bytes);
    } catch (error) {
      // A host without Pillow still reads the specs.
      console.log(`queue ${item.id} has no image hash: ${error instanceof Error ? error.message : String(error)}`);
    }

    const result = await readSpecs(dataUrl);
    await worker(`/api/scraper/queue/${encodeURIComponent(item.id)}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'done', result, ...facts }),
    });
    console.log(`queue ${item.id} done`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await worker(`/api/scraper/queue/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        body: JSON.stringify({ status: 'failed', error: message, ...facts }),
      });
    } catch {
      // The Worker is down, so the queue row keeps its state and the next
      // poll tries again.
      console.log(`queue ${item.id} could not be marked as failed`);
    }
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
  // The images are read at the same time. The gateway answers five image
  // requests in the time one takes, so the queue drains five times faster.
  await Promise.all(items.map((item) => handle(item)));
}

console.log(`drainer started, gateway ${GATEWAY_URL}, worker ${WORKER_URL}`);
while (true) {
  // The drainer must not stop when the Worker or the gateway has a bad day.
  try {
    await tick();
  } catch (error) {
    console.log(`the drainer hit an error: ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
