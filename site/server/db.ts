// The site's own storage: news, settings, player profiles, VIP orders, entitlements and weekly
// baselines.
//
// Deliberately not OpenMU's Postgres schema. OpenMU owns and migrates that schema; a service
// that adds tables to it breaks on the next OpenMU upgrade. The only OpenMU access from here is
// in `openmu.ts`: rankings, account validation and account creation through the same helper the
// register service uses.
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from './config';

mkdirSync(dirname(DB_PATH), { recursive: true, mode: 0o700 });

export const db = new Database(DB_PATH, { create: true, readwrite: true });

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Notícias',
    image_url TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 1,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS news_published ON news (published, pinned DESC, created_at DESC);

  CREATE TABLE IF NOT EXISTS site_players (
    account TEXT COLLATE NOCASE PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vip_orders (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    plan_id TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    days INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT NOT NULL DEFAULT 'mercadopago',
    preference_id TEXT NOT NULL DEFAULT '',
    payment_id TEXT NOT NULL DEFAULT '',
    init_point TEXT NOT NULL DEFAULT '',
    external_reference TEXT NOT NULL UNIQUE,
    raw_json TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    paid_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS vip_orders_account ON vip_orders (account, created_at DESC);
  CREATE INDEX IF NOT EXISTS vip_orders_status ON vip_orders (status, created_at DESC);

  CREATE TABLE IF NOT EXISTS vip_entitlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    plan_name TEXT NOT NULL,
    starts_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    source_order TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS vip_entitlements_account ON vip_entitlements (account, expires_at DESC);

  CREATE TABLE IF NOT EXISTS ranking_baselines (
    week_start INTEGER NOT NULL,
    character_name TEXT NOT NULL,
    experience INTEGER NOT NULL,
    level REAL,
    resets REAL,
    class_name TEXT NOT NULL DEFAULT '',
    captured_at INTEGER NOT NULL,
    PRIMARY KEY (week_start, character_name)
  );
`);

export type SettingRow = { key: string; value: string; updated_at: number };

export function one<T>(sql: string, ...params: (string | number | null)[]): T | null {
  return db.prepare(sql).get(...params) as T | null;
}

export function all<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: (string | number | null)[]): void {
  db.prepare(sql).run(...params);
}

export function getSetting(key: string): string | undefined {
  return one<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value;
}

export function setSetting(key: string, value: string): void {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    Date.now()
  );
}

export function settingRows(): SettingRow[] {
  return all<SettingRow>('SELECT key, value, updated_at FROM settings ORDER BY key');
}

console.info(`site data in ${DB_PATH}`);
