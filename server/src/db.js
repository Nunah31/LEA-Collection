import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const rawDb = new DatabaseSync(path.join(dataDir, 'collection.db'));
rawDb.exec('PRAGMA journal_mode = WAL');

rawDb.exec(`
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sheet_id TEXT,
  sheet_url TEXT,
  sheet_tab TEXT DEFAULT 'Sheet1',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  task TEXT,
  follow_up_date TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  debt_amount TEXT,
  invoice_number TEXT,
  balance_due TEXT,
  payment_method TEXT,
  notes TEXT,
  sheet_row INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// Thin wrapper to mimic better-sqlite3's .prepare(sql).run/get/all(params) ergonomics
// node:sqlite already matches this API closely; we just expose `prepare` directly.
const db = {
  prepare: (sql) => rawDb.prepare(sql),
  exec: (sql) => rawDb.exec(sql),
};

export default db;
