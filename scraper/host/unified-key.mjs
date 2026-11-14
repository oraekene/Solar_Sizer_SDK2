// Reads the unified key of the gateway from its own database. The key never
// leaves the host.
//
// The gateway runs Node 20, which has no built-in SQLite, so the module it
// already uses for the same database is the first choice there. On Node 22
// the built-in module works and no native module is needed.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function openWithBuiltIn(dbPath) {
  // node:sqlite only exists from Node 22.5, so the import can fail.
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  return { get: (sql) => db.prepare(sql).get(), close: () => db.close() };
}

function openWithGatewayModule(dbPath) {
  const Database = require('/app/server/node_modules/better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  return { get: (sql) => db.prepare(sql).get(), close: () => db.close() };
}

export function readUnifiedKey() {
  const dbPath = process.env.FREEAPI_DB_PATH ?? '/app/server/data/freeapi.db';
  let db;
  try {
    db = openWithBuiltIn(dbPath);
  } catch {
    db = openWithGatewayModule(dbPath);
  }
  try {
    const row = db.get("SELECT value FROM settings WHERE key = 'unified_api_key'");
    return row?.value ?? null;
  } finally {
    db.close();
  }
}
