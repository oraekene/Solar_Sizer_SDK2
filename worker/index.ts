import { buildCombinations } from '../src/utils/solarCalculator.ts';
import type { BatteryPreference, Device, Hardware, Product, Region } from '../src/types.ts';
import { classifyProductType, enrichCombinationData } from './enrich.ts';
import { seedDevices, seedHardware, seedProducts } from './seed-data';

type Env = {
  ADMIN_PASSWORD?: string;
  BACHS_API_KEY?: string;
  ASSETS: Fetcher;
  DB: D1Database;
};

type JsonRecord = Record<string, unknown>;

let bootstrapPromise: Promise<void> | null = null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const badRequest = (message: string) => json({ error: message }, 400);
const unauthorized = () => json({ error: 'Unauthorized' }, 403);

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function all<T>(db: D1Database, sql: string, ...bindings: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...bindings).all<T>();
  return result.results ?? [];
}

async function first<T>(db: D1Database, sql: string, ...bindings: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...bindings).first<T>()) ?? null;
}

async function run(db: D1Database, sql: string, ...bindings: unknown[]) {
  return db.prepare(sql).bind(...bindings).run();
}

async function hashSecret(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function timingSafeEqual(left: string, right: string) {
  const [a, b] = await Promise.all([hashSecret(left), hashSecret(right)]);
  let diff = a.length === b.length ? 0 : 1;

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }

  return diff === 0;
}

// Lockout constants: after 5 failed attempts the source IP is blocked for 15
// minutes. This stops password spraying without affecting legitimate admin
// sessions, which clear their counter on every successful auth.
const MAX_ADMIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

async function getClientIp(request: Request): Promise<string> {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

async function getLockoutState(db: D1Database, ip: string) {
  const row = await first<{ failed_count: number; locked_until: string | null }>(
    db,
    'SELECT failed_count, locked_until FROM admin_attempts WHERE ip = ?',
    ip
  );
  return row ?? { failed_count: 0, locked_until: null };
}

async function recordAdminFailure(db: D1Database, ip: string) {
  const now = new Date().toISOString();
  const { failed_count } = await getLockoutState(db, ip);
  const newCount = failed_count + 1;
  const lockedUntil = newCount >= MAX_ADMIN_ATTEMPTS
    ? new Date(Date.now() + LOCKOUT_MS).toISOString()
    : null;
  await run(
    db,
    `INSERT INTO admin_attempts (ip, failed_count, locked_until, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ip) DO UPDATE SET
       failed_count = excluded.failed_count,
       locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`,
    ip, newCount, lockedUntil, now
  );
}

async function clearAdminFailures(db: D1Database, ip: string) {
  await run(db, 'DELETE FROM admin_attempts WHERE ip = ?', ip);
}

async function isLockedOut(db: D1Database, ip: string): Promise<boolean> {
  const state = await getLockoutState(db, ip);
  if (!state.locked_until) return false;
  return new Date(state.locked_until) > new Date();
}

async function requireAdmin(request: Request, env: Env) {
  const ip = await getClientIp(request);
  if (await isLockedOut(env.DB, ip)) return false;

  const adminPassword = env.ADMIN_PASSWORD;
  const candidate = request.headers.get('x-admin-key');

  if (!adminPassword || !candidate) {
    await recordAdminFailure(env.DB, ip);
    return false;
  }

  const ok = await timingSafeEqual(candidate, adminPassword);
  if (ok) {
    await clearAdminFailures(env.DB, ip);
    return true;
  }

  await recordAdminFailure(env.DB, ip);
  return false;
}

function normalizeDevice(row: Record<string, unknown>): Record<string, unknown> & { tags: string[] } {
  return {
    ...row,
    tags: safeJsonParse<string[]>(row.tags, []),
    specs: safeJsonParse<JsonRecord>(row.specs, {}),
  };
}

function normalizeHardware(row: Record<string, unknown>): Record<string, unknown> & { data: JsonRecord; tags: string[] } {
  return {
    ...row,
    data: safeJsonParse<JsonRecord>(row.data, {}),
    tags: safeJsonParse<string[]>(row.tags, []),
  };
}

function normalizeProduct(row: Record<string, unknown>): Record<string, unknown> & { combination_data: JsonRecord | null; tags: string[] } {
  const tags = safeJsonParse<string[]>(row.tags, []);
  const combination_data = enrichCombinationData(row, safeJsonParse<unknown>(row.combination_data, null));
  return {
    ...row,
    combination_data,
    tags,
    product_type: classifyProductType(tags, combination_data !== null),
  };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS devices_master (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    default_watts REAL NOT NULL,
    price REAL,
    specs TEXT NOT NULL DEFAULT '{}',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS hardware (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    tags TEXT NOT NULL DEFAULT '[]',
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    combination_data TEXT DEFAULT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    price REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS idx_hardware_user_id ON hardware(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_hardware_type ON hardware(type)',
  'CREATE INDEX IF NOT EXISTS idx_products_type ON products(type)',
];

async function tableIsEmpty(db: D1Database, table: 'devices_master' | 'products' | 'hardware') {
  const row = await first<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table}`);
  return (row?.count ?? 0) === 0;
}

async function ensureBootstrapped(db: D1Database) {
  // Keep working on a fresh D1 even if the migration has not been applied yet.
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));

  const statements: D1PreparedStatement[] = [];

  if (await tableIsEmpty(db, 'devices_master')) {
    for (const device of seedDevices) {
      statements.push(
        db
          .prepare('INSERT OR IGNORE INTO devices_master (id, name, category, default_watts, tags) VALUES (?, ?, ?, ?, ?)')
          .bind(device.id, device.name, device.category, device.watts, JSON.stringify(device.tags)),
      );
    }
  }

  if (await tableIsEmpty(db, 'products')) {
    for (const product of seedProducts) {
      statements.push(
        db
          .prepare('INSERT OR IGNORE INTO products (id, name, description, type, combination_data, tags, price) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(
            product.id,
            product.name,
            product.description,
            product.type,
            JSON.stringify(product.combination_data ?? null),
            JSON.stringify(product.tags),
            product.price,
          ),
      );
    }
  }

  if (await tableIsEmpty(db, 'hardware')) {
    for (const hardware of seedHardware) {
      statements.push(
        db
          .prepare('INSERT OR IGNORE INTO hardware (id, user_id, type, data, tags, description) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(
            hardware.id,
            'system',
            hardware.type,
            JSON.stringify(hardware.data ?? {}),
            JSON.stringify(hardware.tags),
            hardware.description,
          ),
      );
    }
  }

  if (statements.length > 0) await db.batch(statements);
}

async function boot(db: D1Database) {
  if (!bootstrapPromise) {
    bootstrapPromise = ensureBootstrapped(db).catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}

async function readBody<T>(request: Request): Promise<T> {
  return request.json<T>();
}

function hardwareCatalogAsProducts(rows: Array<Record<string, unknown> & { data: JsonRecord; tags: string[] }>) {
  return rows.map((hardware) => ({
    id: hardware.id,
    name: String((hardware.data as JsonRecord).name ?? hardware.id),
    description: hardware.description || `Standalone ${hardware.type}`,
    type: 'standalone',
    combination_data: null,
    tags: hardware.tags,
    price: Number((hardware.data as JsonRecord).price ?? 0),
    product_type: classifyProductType(hardware.tags, false),
  }));
}

async function handleApi(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (pathname === '/api/admin/verify' && method === 'POST') {
    const ip = await getClientIp(request);
    if (await isLockedOut(env.DB, ip)) {
      return json({ valid: false, error: 'Too many attempts. Try again later.' }, 429);
    }

    const body = await readBody<{ password?: string }>(request);
    const password = body.password ?? '';
    const adminPassword = env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return json({ valid: false, error: 'Admin password not configured on server.' });
    }

    const ok = await timingSafeEqual(password, adminPassword);
    if (ok) {
      await clearAdminFailures(env.DB, ip);
      return json({ valid: true });
    }

    await recordAdminFailure(env.DB, ip);
    return json({ valid: false, error: 'Invalid password.' });
  }

  // Auth stays disabled, but keep the old contract for clients and future OAuth work.
  if (pathname === '/api/auth/user' && method === 'GET') {
    return json({ user: null });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return json({ success: true });
  }

  if (pathname === '/api/user/data' && method === 'GET') {
    return json({ profiles: [], results: [], hardware: [] });
  }

  if (
    (pathname === '/api/user/profiles' || pathname === '/api/user/results' || pathname === '/api/user/hardware') &&
    method === 'POST'
  ) {
    return json({ success: true });
  }

  if (pathname.startsWith('/api/user/') && method === 'DELETE') {
    return json({ success: true });
  }

  if (pathname === '/api/devices' && method === 'GET') {
    const devices = await all<Record<string, unknown>>(env.DB, 'SELECT * FROM devices_master');
    return json(devices.map(normalizeDevice));
  }

  if (pathname === '/api/devices' && method === 'POST') {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const device = await readBody<{ id: string; name: string; category: string; default_watts: number; price?: number; specs?: JsonRecord; tags?: string[] }>(request);

    await run(
      env.DB,
      `INSERT INTO devices_master (id, name, category, default_watts, price, specs, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         category = excluded.category,
         default_watts = excluded.default_watts,
         price = excluded.price,
         specs = excluded.specs,
         tags = excluded.tags`,
      device.id,
      device.name,
      device.category,
      device.default_watts,
      device.price ?? null,
      JSON.stringify(device.specs ?? {}),
      JSON.stringify(device.tags ?? []),
    );
    return json({ success: true });
  }

  if (pathname.startsWith('/api/devices/') && method === 'DELETE') {
    if (!(await requireAdmin(request, env))) return unauthorized();
    await run(env.DB, 'DELETE FROM devices_master WHERE id = ?', pathname.slice('/api/devices/'.length));
    return json({ success: true });
  }

  if (pathname === '/api/hardware' && method === 'GET') {
    const hardware = await all<Record<string, unknown>>(env.DB, "SELECT * FROM hardware WHERE user_id = 'system'");
    return json(hardware.map(normalizeHardware));
  }

  if (pathname === '/api/hardware' && method === 'POST') {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const hardware = await readBody<{ id: string; type: string; data?: JsonRecord; tags?: string[]; description?: string }>(request);

    await run(
      env.DB,
      `INSERT INTO hardware (id, user_id, type, data, tags, description)
       VALUES (?, 'system', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         data = excluded.data,
         tags = excluded.tags,
         description = excluded.description`,
      hardware.id,
      hardware.type,
      JSON.stringify(hardware.data ?? {}),
      JSON.stringify(hardware.tags ?? []),
      hardware.description ?? '',
    );
    return json({ success: true });
  }

  if (pathname.startsWith('/api/hardware/') && method === 'DELETE') {
    if (!(await requireAdmin(request, env))) return unauthorized();
    await run(env.DB, 'DELETE FROM hardware WHERE id = ?', pathname.slice('/api/hardware/'.length));
    return json({ success: true });
  }

  if (pathname === '/api/products' && method === 'GET') {
    const tag = url.searchParams.get('tag');
    const products = (await all<Record<string, unknown>>(env.DB, 'SELECT * FROM products')).map(normalizeProduct);
    const hardware = (await all<Record<string, unknown>>(env.DB, "SELECT * FROM hardware WHERE tags IS NOT NULL AND tags != '[]'")).map(normalizeHardware);

    const productList = tag ? products.filter((product) => product.tags.includes(tag)) : products;
    const hardwareList = tag ? hardware.filter((item) => item.tags.includes(tag)) : hardware;

    return json([...productList, ...hardwareCatalogAsProducts(hardwareList)]);
  }

  if (pathname === '/api/products' && method === 'POST') {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const product = await readBody<{ id: string; name: string; description: string; type: string; combination_data?: JsonRecord | null; tags?: string[]; price: number }>(request);
    const combinationData = enrichCombinationData(product, product.combination_data ?? null);

    await run(
      env.DB,
      `INSERT INTO products (id, name, description, type, combination_data, tags, price)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         type = excluded.type,
         combination_data = excluded.combination_data,
         tags = excluded.tags,
         price = excluded.price`,
      product.id,
      product.name,
      product.description,
      product.type,
      JSON.stringify(combinationData),
      JSON.stringify(product.tags ?? []),
      product.price,
    );
    return json({ success: true });
  }

  if (pathname.startsWith('/api/products/') && method === 'DELETE') {
    if (!(await requireAdmin(request, env))) return unauthorized();
    await run(env.DB, 'DELETE FROM products WHERE id = ?', pathname.slice('/api/products/'.length));
    return json({ success: true });
  }

  if (pathname.startsWith('/api/settings/')) {
    const key = pathname.slice('/api/settings/'.length);
    if (!key) return badRequest('Setting key is required.');

    if (method === 'GET') {
      const setting = await first<{ value: string | null }>(env.DB, 'SELECT value FROM settings WHERE key = ?', key);
      return json(setting?.value ? safeJsonParse(setting.value, null) : null);
    }

    if (method === 'POST') {
      if (!(await requireAdmin(request, env))) return unauthorized();
      const body = await readBody<{ value: unknown }>(request);
      await run(
        env.DB,
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = datetime('now')`,
        key,
        JSON.stringify(body.value ?? null),
      );
      return json({ success: true });
    }
  }

  if (pathname === '/api/checkout' && method === 'POST') {
    const apiKey = env.BACHS_API_KEY;
    if (!apiKey) return json({ error: 'Payment is not configured yet.' }, 503);

    const body = await readBody<{ productId?: string; amount?: number; description?: string }>(request);

    // Catalog products are priced from D1. Custom systems and hardware-derived products send their computed total.
    // shortcut: fallback amounts come from the client, so re-price them server-side before fulfilment if this becomes a paid flow.
    let amount = Number(body.amount);
    if (body.productId) {
      const product = await first<{ price: number }>(
        env.DB,
        'SELECT price FROM products WHERE id = ?',
        body.productId,
      );
      if (product) amount = Number(product.price);
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      return badRequest('Invalid checkout amount.');
    }

    const origin = new URL(request.url).origin;
    const base = apiKey.startsWith('sk_sandbox_')
      ? 'https://sandbox-api.bachs.io'
      : 'https://api.bachs.io';
    const response = await fetch(`${base}/v1/checkout-sessions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        pricing: { currency: 'NGN', amount: amount.toFixed(2) },
        metadata: { description: (body.description || 'SolarSizer system').slice(0, 120) },
        success_url: `${origin}/?payment=success`,
        cancel_url: `${origin}/?payment=cancelled`,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | { checkout_url?: string; message?: string; error?: string }
      | null;

    if (!response.ok || !data?.checkout_url) {
      return json({ error: data?.message || data?.error || 'Could not create checkout.' }, 502);
    }

    return json({ url: data.checkout_url });
  }

  if (pathname === '/api/calculate' && method === 'POST') {
    const body = await readBody<{
      location: Region;
      devices: Device[];
      hardware: Hardware;
      batteryPreference?: BatteryPreference;
      tolerance?: number;
    }>(request);

    if (!body.hardware) return badRequest('Hardware database is required for calculation.');

    const products = (await all<Record<string, unknown>>(env.DB, 'SELECT * FROM products')).map(
      (product) => normalizeProduct(product) as unknown as Product,
    );
    const result = buildCombinations(
      body.location,
      body.devices ?? [],
      body.hardware,
      body.batteryPreference,
      body.tolerance,
      products,
    );
    return json(result);
  }

  return json({ error: 'Not Found' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/healthz') {
      return new Response('OK', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    try {
      await boot(env.DB);

      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, env, url.pathname);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', message: 'worker-request-failed', error }));
      return json(
        {
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      );
    }
  },
};
