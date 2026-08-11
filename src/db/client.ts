import { Database, type SQLQueryBindings } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getHome } from "../config";

const DB_DIR = path.join(getHome(), "db");
mkdirSync(DB_DIR, { recursive: true });

let _db: Database | null = null;
let _dbPath: string | null = null;

export function getDb(): Database {
  const currentPath = process.env.DB_PATH || path.join(DB_DIR, "data.sqlite");
  if (_db && _dbPath !== currentPath) {
    _db.close();
    _db = null;
  }
  if (!_db) {
    _db = new Database(currentPath);
    _dbPath = currentPath;
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
  }
  return _db;
}

export function query<T = unknown>(
  sql: string,
  ...params: SQLQueryBindings[]
): T[] {
  return getDb()
    .query(sql)
    .all(...params) as T[];
}

export function get<T = unknown>(
  sql: string,
  ...params: SQLQueryBindings[]
): T | null {
  return getDb()
    .query(sql)
    .get(...params) as T | null;
}

export function run(sql: string, ...params: SQLQueryBindings[]): void {
  // bun's Database.run types the bindings as a single array argument (unlike
  // Statement.all/get which take a spread) — verified against runtime.
  getDb().run(sql, params);
}

export function runAndReturnId(
  sql: string,
  ...params: SQLQueryBindings[]
): number {
  const result = getDb().run(sql, params);
  return Number(result.lastInsertRowid);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}
