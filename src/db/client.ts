import { Database } from "bun:sqlite";
import path from "node:path";

const DB_PATH = path.join(import.meta.dir, "../../data.sqlite");

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
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
  }
}
