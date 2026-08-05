import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DB_DIR = path.join(import.meta.dir, "../../db");
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

export function query<T = unknown>(sql: string, ...params: unknown[]): T[] {
  return getDb()
    .query(sql)
    .all(...params) as T[];
}

export function get<T = unknown>(sql: string, ...params: unknown[]): T | null {
  return getDb()
    .query(sql)
    .get(...params) as T | null;
}

export function run(sql: string, ...params: unknown[]): void {
  getDb().run(sql, ...params);
}

export function runAndReturnId(sql: string, ...params: unknown[]): number {
  const result = getDb().run(sql, ...params);
  return result.lastInsertRowid;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}
