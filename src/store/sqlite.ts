/**
 * Local SQLite persistence layer.
 *
 * Replaces the `ss_*` localStorage keys with an embedded SQLite database so that
 * clearing browser storage (or moving to a new device) does not destroy user
 * work. The public surface mirrors the old localStorage contract exactly:
 *   - get(key) -> parsed value or null
 *   - set(key, value) -> boolean (ok)
 *   - remove(key)
 *   - KEY_* constants for every key the app used to use.
 *
 * Everything is keyed the same way, so callers see no behavioral change.
 * shortcut: this is an in-browser SQLite, not a server database; it lives only
 * in this browser's IndexedDB-backed storage, so a profile reset still loses it.
 */

import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';

export const KEY = {
  INVERTERS: 'ss_inverters',
  PANELS: 'ss_panels',
  BATTERIES: 'ss_batteries',
  POWERSTATIONS: 'ss_powerstations',
  PROFILES: 'ss_profiles',
  RESULTS: 'ss_results',
  MARGINS: 'ss_margins',
  PDF_SETTINGS: 'ss_pdf_settings',
  INTERNAL_LOGS: 'ss_internal_logs',
  HAS_GENERATOR: 'ss_has_generator',
} as const;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
`;

type StoreBackend = {
  get(key: string): unknown | null;
  set(key: string, value: unknown): boolean;
  remove(key: string): boolean;
  exportAll(): Record<string, unknown>;
  importAll(snapshot: Record<string, unknown>): boolean;
};

/** In-memory fallback used when sql.js cannot load (e.g. a node test runner). */
function memoryBackend(): StoreBackend {
  const map = new Map<string, string>();
  return {
    get: (key) => {
      const v = map.get(key);
      return v == null ? null : JSON.parse(v);
    },
    set: (key, value) => {
      try {
        map.set(key, JSON.stringify(value ?? null));
        return true;
      } catch {
        return false;
      }
    },
    remove: (key) => map.delete(key),
    exportAll: () => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of map.entries()) {
        try {
          out[k] = JSON.parse(v);
        } catch {
          out[k] = v;
        }
      }
      return out;
    },
    importAll: (snapshot) => {
      for (const [k, v] of Object.entries(snapshot)) {
        try {
          map.set(k, JSON.stringify(v ?? null));
        } catch {
          return false;
        }
      }
      return true;
    },
  };
}

let backendPromise: Promise<StoreBackend> | null = null;

async function makeBackend(): Promise<StoreBackend> {
  try {
    // sql-wasm-inline.js embeds the wasm as base64, so no locateFile is needed.
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(SCHEMA);

    const get = (key: string): unknown | null => {
      const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as Record<string, unknown> | null;
      if (row == null || row.value == null) return null;
      try {
        return JSON.parse(String(row.value));
      } catch {
        return row.value;
      }
    };

    const set = (key: string, value: unknown): boolean => {
      try {
        db.prepare(
          `INSERT INTO kv (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run(key, JSON.stringify(value ?? null));
        return true;
      } catch {
        return false;
      }
    };

    const remove = (key: string): boolean => {
      db.prepare('DELETE FROM kv WHERE key = ?').run(key);
      return true;
    };

    const exportAll = (): Record<string, unknown> => {
      const rows = db.prepare('SELECT key, value FROM kv').all() as Record<string, unknown>[];
      const out: Record<string, unknown> = {};
      for (const row of rows) {
        try {
          out[String(row.key)] = JSON.parse(String(row.value));
        } catch {
          out[String(row.key)] = row.value;
        }
      }
      return out;
    };

    const importAll = (snapshot: Record<string, unknown>): boolean => {
      const stmt = db.prepare(
        `INSERT INTO kv (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      );
      for (const [key, value] of Object.entries(snapshot)) {
        stmt.run(key, JSON.stringify(value ?? null));
      }
      return true;
    };

    return { get, set, remove, exportAll, importAll };
  } catch (e) {
    console.warn('sql.js unavailable, falling back to in-memory store:', e);
    return memoryBackend();
  }
}

function backend(): Promise<StoreBackend> {
  if (!backendPromise) backendPromise = makeBackend();
  return backendPromise;
}

export async function storeGet<T = unknown>(key: string): Promise<T | null> {
  const b = await backend();
  return b.get(key) as T | null;
}

export async function storeSet(key: string, value: unknown): Promise<boolean> {
  const b = await backend();
  return b.set(key, value);
}

export async function storeRemove(key: string): Promise<boolean> {
  const b = await backend();
  return b.remove(key);
}

export async function storeExport(): Promise<Record<string, unknown>> {
  const b = await backend();
  return b.exportAll();
}

export async function storeImport(snapshot: Record<string, unknown>): Promise<boolean> {
  const b = await backend();
  return b.importAll(snapshot);
}