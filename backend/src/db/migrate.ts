import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './connection.js';

function migrationsDir(): string {
  const localDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  if (fs.existsSync(localDir)) {
    return localDir;
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/db/migrations');
}

export function runMigrations(): void {
  const db = getDatabase();
  const dir = migrationsDir();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((row) => (row as { version: string }).version),
  );

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
  }
}
