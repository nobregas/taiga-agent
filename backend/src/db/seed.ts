import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './connection.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

function optionalInt(name: string): number | undefined {
  const value = process.env[name];
  return value ? Number.parseInt(value, 10) : undefined;
}

function parseCsv(value: string | undefined): string[] | null {
  if (!value?.trim()) {
    return null;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function seedFromEnvIfEmpty(): void {
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM app_settings WHERE id = 1').get();

  if (existing) {
    return;
  }

  const taigaUsername = optional('TAIGA_USERNAME');
  const taigaPassword = optional('TAIGA_PASSWORD');
  const taigaToken = optional('TAIGA_TOKEN');
  const geminiApiKey = optional('GEMINI_API_KEY');
  const taigaProjectId = optionalInt('TAIGA_PROJECT_ID');
  const gitlabProjectId = optional('GITLAB_PROJECT_ID');

  const hasSettings =
    taigaUsername ||
    taigaPassword ||
    taigaToken ||
    geminiApiKey ||
    taigaProjectId ||
    gitlabProjectId;

  if (!hasSettings) {
    db.prepare(
      `INSERT INTO app_settings (id, taiga_url, gemini_model, updated_at)
       VALUES (1, ?, ?, datetime('now'))`,
    ).run(
      process.env.TAIGA_URL ?? 'https://api.taiga.io/api/v1',
      process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    );
    return;
  }

  db.prepare(
    `INSERT INTO app_settings (
      id, taiga_url, taiga_username, taiga_password, taiga_token,
      gemini_api_key, gemini_model, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    process.env.TAIGA_URL ?? 'https://api.taiga.io/api/v1',
    taigaUsername ?? null,
    taigaPassword ?? null,
    taigaToken ?? null,
    geminiApiKey ?? null,
    process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  );

  if (!taigaProjectId) {
    return;
  }

  const workspaceResult = db
    .prepare(
      `INSERT INTO workspaces (name, taiga_project_id, taiga_project_slug, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
    )
    .run('Default', taigaProjectId, optional('TAIGA_PROJECT_SLUG') ?? null);

  const workspaceId = Number(workspaceResult.lastInsertRowid);

  if (gitlabProjectId) {
    const codebaseResult = db
      .prepare(
        `INSERT INTO codebases (
          workspace_id, name, gitlab_url, gitlab_token, gitlab_project_id,
          gitlab_default_base, gitlab_diff_snippet_lines, valid_scopes, valid_task_domains,
          is_default, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      )
      .run(
        workspaceId,
        'Default',
        process.env.GITLAB_URL ?? 'https://gitlab.com/api/v4',
        optional('GITLAB_TOKEN') ?? null,
        gitlabProjectId,
        process.env.GITLAB_DEFAULT_BASE ?? 'develop',
        Number.parseInt(process.env.GITLAB_DIFF_SNIPPET_LINES ?? '30', 10),
        parseCsv(process.env.VALID_SCOPES) ? JSON.stringify(parseCsv(process.env.VALID_SCOPES)) : null,
        parseCsv(process.env.VALID_TASK_DOMAINS)
          ? JSON.stringify(parseCsv(process.env.VALID_TASK_DOMAINS))
          : null,
      );

    const codebaseId = Number(codebaseResult.lastInsertRowid);

    db.prepare('UPDATE workspaces SET default_codebase_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      codebaseId,
      workspaceId,
    );
  }

  db.prepare('UPDATE app_settings SET active_workspace_id = ?, updated_at = datetime(\'now\') WHERE id = 1').run(
    workspaceId,
  );
}
