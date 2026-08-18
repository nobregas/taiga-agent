import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';

let db: Database.Database | null = null;

export function getDataDir(): string {
  if (config.dataDir) {
    return config.dataDir;
  }

  return path.join(os.homedir(), '.taiga-agent');
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'data.db');
}

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
