import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

function optionalInt(name: string): number | undefined {
  const value = process.env[name];
  return value ? Number.parseInt(value, 10) : undefined;
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:4200',
  taiga: {
    url: process.env.TAIGA_URL ?? 'https://api.taiga.io/api/v1',
    username: optional('TAIGA_USERNAME'),
    password: optional('TAIGA_PASSWORD'),
    token: optional('TAIGA_TOKEN'),
    projectId: optionalInt('TAIGA_PROJECT_ID'),
    projectSlug: optional('TAIGA_PROJECT_SLUG'),
  },
  gemini: {
    apiKey: optional('GEMINI_API_KEY'),
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  },
  gitlab: {
    url: process.env.GITLAB_URL ?? 'https://gitlab.com/api/v4',
    token: optional('GITLAB_TOKEN'),
    projectId: optional('GITLAB_PROJECT_ID'),
    defaultBase: process.env.GITLAB_DEFAULT_BASE ?? 'develop',
    diffSnippetLines: Number.parseInt(process.env.GITLAB_DIFF_SNIPPET_LINES ?? '30', 10),
  },
  validScopes: process.env.VALID_SCOPES?.split(',').map((s) => s.trim()).filter(Boolean),
  validTaskDomains: process.env.VALID_TASK_DOMAINS?.split(',').map((s) => s.trim()).filter(Boolean),
};

export function assertTaigaConfigured(): void {
  if (!config.taiga.projectId) {
    throw new Error('TAIGA_PROJECT_ID is not configured');
  }
  if (!config.taiga.token && (!config.taiga.username || !config.taiga.password)) {
    throw new Error('Configure TAIGA_TOKEN or TAIGA_USERNAME + TAIGA_PASSWORD');
  }
}

export function assertGeminiConfigured(): void {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
}

export function isGitlabConfigured(): boolean {
  return Boolean(config.gitlab.token && config.gitlab.projectId);
}
