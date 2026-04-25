import { buildCombinations } from '../src/utils/solarCalculator.ts';
import type { BatteryPreference, Device, Hardware, Product, Region } from '../src/types.ts';
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
    combination_data: safeJsonParse<JsonRecord | null>(row.combination_data, null),
    tags: safeJsonParse<string[]>(row.tags, []),
  };
}

async function ensureBootstrapped(db: D1Database) {
  const existing = await first<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM devices_master');
  if ((existing?.count ?? 0) > 0) return;

  const statements: D1PreparedStatement[] = [];

  for (const device of seedDevices) {
    statements.push(
      db
        .prepare('INSERT OR IGNORE INTO devices_master (id, name, category, default_watts, tags) VALUES (?, ?, ?, ?, ?)')
        .bind(device.id, device.name, device.category, device.watts, JSON.stringify(device.tags)),
    );
  }

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

  await db.batch(statements);
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

  if (pathname === '/api/devices' && method === 'GET') {
    const devices = await all<Record<string, unknown>>(env.DB, 'SELECT * FROM devices_master ORDER BY name');
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
    const hardware = await all<Record<string, unknown>>(env.DB, "SELECT * FROM hardware WHERE user_id = 'system' ORDER BY id");
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
    const products = (await all<Record<string, unknown>>(env.DB, 'SELECT * FROM products ORDER BY name')).map(normalizeProduct);
    const hardware = (await all<Record<string, unknown>>(env.DB, "SELECT * FROM hardware WHERE tags IS NOT NULL AND tags != '[]' ORDER BY id")).map(normalizeHardware);

    const productList = tag ? products.filter((product) => product.tags.includes(tag)) : products;
    const hardwareList = tag ? hardware.filter((item) => item.tags.includes(tag)) : hardware;

    return json([...productList, ...hardwareCatalogAsProducts(hardwareList)]);
  }

  if (pathname === '/api/products' && method === 'POST') {
    if (!(await requireAdmin(request, env))) return unauthorized();
    const product = await readBody<{ id: string; name: string; description: string; type: string; combination_data?: JsonRecord | null; tags?: string[]; price: number }>(request);

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
      JSON.stringify(product.combination_data ?? null),
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

    const products = (await all<Record<string, unknown>>(env.DB, 'SELECT * FROM products ORDER BY name')).map(
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
    try {
      await boot(env.DB);

      const url = new URL(request.url);
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
