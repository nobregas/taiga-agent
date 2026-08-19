import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(here, '../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version?.trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export function getAppVersion(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return loadPackageVersion();
}
