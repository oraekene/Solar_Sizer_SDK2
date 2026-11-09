// sql.js ships no TypeScript declarations; declare the minimal surface we use.
declare module 'sql.js/dist/sql-wasm-inline.js' {
  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export interface Statement {
    run: (...bindings: unknown[]) => Statement;
    get: (...bindings: unknown[]) => Record<string, unknown> | null;
    all: (...bindings: unknown[]) => Record<string, unknown>[];
    free: () => void;
  }

  export interface Database {
    run: (sql: string) => void;
    prepare: (sql: string) => Statement;
    close: () => void;
  }

  type InitSqlJs = (config?: SqlJsConfig) => Promise<{ Database: new () => Database }>;
  const initSqlJs: InitSqlJs;
  export default initSqlJs;
}