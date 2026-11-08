import { buildCombinations } from '../src/utils/solarCalculator.ts';
import type { BatteryPreference, Device, Hardware, Product, Region } from '../src/types.ts';
import { enrichCombinationData } from './enrich.ts';
import { seedDevices, seedHardware, seedProducts } from './seed-data';

type Env = {
  ADMIN_PASSWORD?: string;
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

async function requireAdmin(request: Request, env: Env) {
  const adminPassword = env.ADMIN_PASSWORD;
  const candidate = request.headers.get('x-admin-key');

  if (!adminPassword || !candidate) return false;
  return timingSafeEqual(candidate, adminPassword);
}

function normalizeDevice(row: Record<string, unknown>): Record<string, unknown> & { tags: string[] } {
  return {
    ...row,
    tags: safeJsonParse<string[]>(row.tags, []),
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
  return {
    ...row,
    combination_data: enrichCombinationData(row, safeJsonParse<unknown>(row.combination_data, null)),
    tags: safeJsonParse<string[]>(row.tags, []),
  };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS devices_master (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    default_watts REAL NOT NULL,
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
  }));
}

async function handleApi(request: Request, env: Env, pathname: string) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (pathname === '/api/admin/verify' && method === 'POST') {
    const body = await readBody<{ password?: string }>(request);
    const password = body.password ?? '';
    const adminPassword = env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return json({ valid: false, error: 'Admin password not configured on server.' });
    }

    return json({ valid: await timingSafeEqual(password, adminPassword) });
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
    const device = await readBody<{ id: string; name: string; category: string; default_watts: number; tags?: string[] }>(request);

    await run(
      env.DB,
      `INSERT INTO devices_master (id, name, category, default_watts, tags)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         category = excluded.category,
         default_watts = excluded.default_watts,
         tags = excluded.tags`,
      device.id,
      device.name,
      device.category,
      device.default_watts,
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
