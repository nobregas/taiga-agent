import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

function parseCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([...configured, 'http://localhost:4200', 'http://127.0.0.1:4200'])];
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST?.trim() || '0.0.0.0',
  corsOrigins: parseCorsOrigins(),
  dataDir: process.env.TAIGA_AGENT_DATA_DIR?.trim() || undefined,
};
