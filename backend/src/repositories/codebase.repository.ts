import { getDatabase } from '../db/connection.js';
import type { Codebase, CodebaseRow } from '../db/types.js';
import { maskSecret, parseJsonArray, stringifyJsonArray } from '../db/utils.js';

function mapCodebase(row: CodebaseRow): Codebase {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    gitlabUrl: row.gitlab_url,
    gitlabToken: row.gitlab_token,
    gitlabProjectId: row.gitlab_project_id,
    gitlabDefaultBase: row.gitlab_default_base,
    gitlabDiffSnippetLines: row.gitlab_diff_snippet_lines,
    validScopes: parseJsonArray(row.valid_scopes),
    validTaskDomains: parseJsonArray(row.valid_task_domains),
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CodebasePublic extends Omit<Codebase, 'gitlabToken'> {
  gitlabToken: string | null;
  hasGitlabToken: boolean;
}

export interface CreateCodebaseInput {
  workspaceId: number;
  name: string;
  gitlabUrl?: string;
  gitlabToken?: string | null;
  gitlabProjectId?: string | null;
  gitlabDefaultBase?: string;
  gitlabDiffSnippetLines?: number;
  validScopes?: string[];
  validTaskDomains?: string[];
  isDefault?: boolean;
}

export interface UpdateCodebaseInput {
  name?: string;
  gitlabUrl?: string;
  gitlabToken?: string | null;
  gitlabProjectId?: string | null;
  gitlabDefaultBase?: string;
  gitlabDiffSnippetLines?: number;
  validScopes?: string[];
  validTaskDomains?: string[];
  isDefault?: boolean;
}

export class CodebaseRepository {
  listByWorkspace(workspaceId: number): Codebase[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM codebases WHERE workspace_id = ? ORDER BY is_default DESC, name COLLATE NOCASE ASC')
      .all(workspaceId) as CodebaseRow[];
    return rows.map(mapCodebase);
  }

  getById(id: number): Codebase | null {
    const row = getDatabase().prepare('SELECT * FROM codebases WHERE id = ?').get(id) as CodebaseRow | undefined;
    return row ? mapCodebase(row) : null;
  }

  getDefault(workspaceId: number): Codebase | null {
    const row = getDatabase()
      .prepare('SELECT * FROM codebases WHERE workspace_id = ? AND is_default = 1 LIMIT 1')
      .get(workspaceId) as CodebaseRow | undefined;

    if (row) {
      return mapCodebase(row);
    }

    const fallback = getDatabase()
      .prepare('SELECT * FROM codebases WHERE workspace_id = ? ORDER BY id ASC LIMIT 1')
      .get(workspaceId) as CodebaseRow | undefined;

    return fallback ? mapCodebase(fallback) : null;
  }

  toPublic(codebase: Codebase): CodebasePublic {
    return {
      ...codebase,
      gitlabToken: maskSecret(codebase.gitlabToken),
      hasGitlabToken: Boolean(codebase.gitlabToken),
    };
  }

  create(input: CreateCodebaseInput): Codebase {
    const db = getDatabase();
    const result = db
      .prepare(
        `INSERT INTO codebases (
          workspace_id, name, gitlab_url, gitlab_token, gitlab_project_id,
          gitlab_default_base, gitlab_diff_snippet_lines, valid_scopes, valid_task_domains,
          is_default, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        input.workspaceId,
        input.name.trim(),
        input.gitlabUrl?.trim() || 'https://gitlab.com/api/v4',
        input.gitlabToken?.trim() || null,
        input.gitlabProjectId?.trim() || null,
        input.gitlabDefaultBase?.trim() || 'develop',
        input.gitlabDiffSnippetLines ?? 30,
        stringifyJsonArray(input.validScopes),
        stringifyJsonArray(input.validTaskDomains),
        input.isDefault ? 1 : 0,
      );

    const codebaseId = Number(result.lastInsertRowid);

    if (input.isDefault) {
      this.setDefault(codebaseId);
    }

    return this.getById(codebaseId)!;
  }

  update(id: number, input: UpdateCodebaseInput): Codebase {
    const current = this.getById(id);
    if (!current) {
      throw new Error('Codebase not found');
    }

    const nextToken =
      input.gitlabToken !== undefined ? input.gitlabToken?.trim() || null : current.gitlabToken;

    getDatabase()
      .prepare(
        `UPDATE codebases SET
          name = ?,
          gitlab_url = ?,
          gitlab_token = ?,
          gitlab_project_id = ?,
          gitlab_default_base = ?,
          gitlab_diff_snippet_lines = ?,
          valid_scopes = ?,
          valid_task_domains = ?,
          is_default = ?,
          updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.name?.trim() || current.name,
        input.gitlabUrl?.trim() || current.gitlabUrl,
        nextToken,
        input.gitlabProjectId !== undefined ? input.gitlabProjectId?.trim() || null : current.gitlabProjectId,
        input.gitlabDefaultBase?.trim() || current.gitlabDefaultBase,
        input.gitlabDiffSnippetLines ?? current.gitlabDiffSnippetLines,
        input.validScopes !== undefined ? stringifyJsonArray(input.validScopes) : stringifyJsonArray(current.validScopes),
        input.validTaskDomains !== undefined
          ? stringifyJsonArray(input.validTaskDomains)
          : stringifyJsonArray(current.validTaskDomains),
        input.isDefault !== undefined ? (input.isDefault ? 1 : 0) : current.isDefault ? 1 : 0,
        id,
      );

    if (input.isDefault) {
      this.setDefault(id);
    }

    return this.getById(id)!;
  }

  setDefault(id: number): Codebase {
    const codebase = this.getById(id);
    if (!codebase) {
      throw new Error('Codebase not found');
    }

    const db = getDatabase();
    db.prepare('UPDATE codebases SET is_default = 0, updated_at = datetime(\'now\') WHERE workspace_id = ?').run(
      codebase.workspaceId,
    );
    db.prepare('UPDATE codebases SET is_default = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
    db.prepare('UPDATE workspaces SET default_codebase_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
      id,
      codebase.workspaceId,
    );

    return this.getById(id)!;
  }

  delete(id: number): void {
    const codebase = this.getById(id);
    if (!codebase) {
      throw new Error('Codebase not found');
    }

    const db = getDatabase();
    db.prepare('DELETE FROM codebases WHERE id = ?').run(id);

    if (codebase.isDefault) {
      const replacement = this.getDefault(codebase.workspaceId);
      if (replacement) {
        this.setDefault(replacement.id);
      } else {
        db.prepare('UPDATE workspaces SET default_codebase_id = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(
          codebase.workspaceId,
        );
      }
    }
  }
}

export const codebaseRepository = new CodebaseRepository();
