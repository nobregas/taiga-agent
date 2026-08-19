import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(here, '../../.env') });

function parseCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGIN ?? 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([...configured, 'http://localhost:4200', 'http://127.0.0.1:4200'])];
}

function resolveFrontendDist(): string {
  const configured = process.env.FRONTEND_DIST?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  return path.resolve(here, '../../frontend/dist/frontend/browser');
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST?.trim() || '0.0.0.0',
  corsOrigins: parseCorsOrigins(),
  dataDir: process.env.TAIGA_AGENT_DATA_DIR?.trim() || undefined,
  frontendDist: resolveFrontendDist(),
};
