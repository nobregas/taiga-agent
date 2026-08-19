import { getDatabase } from '../db/connection.js';
import type { Workspace, WorkspaceRow } from '../db/types.js';
import { toValidUserId } from '../utils/user-id.js';

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    taigaProjectId: row.taiga_project_id,
    taigaProjectSlug: row.taiga_project_slug,
    defaultCodebaseId: row.default_codebase_id,
    // Defensively normalize: a stale/corrupted `0` in the DB must never be treated as
    // "assign merge tasks to user 0" — always coerce it back to "no rule configured".
    mergeAssigneeId: toValidUserId(row.merge_assignee_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateWorkspaceInput {
  name: string;
  taigaProjectId: number;
  taigaProjectSlug?: string | null;
  mergeAssigneeId?: number | null;
}

export interface UpdateWorkspaceInput {
  name?: string;
  taigaProjectId?: number;
  taigaProjectSlug?: string | null;
  defaultCodebaseId?: number | null;
  mergeAssigneeId?: number | null;
}

export class WorkspaceRepository {
  list(): Workspace[] {
    const rows = getDatabase()
      .prepare('SELECT * FROM workspaces ORDER BY name COLLATE NOCASE ASC')
      .all() as WorkspaceRow[];
    return rows.map(mapWorkspace);
  }

  getById(id: number): Workspace | null {
    const row = getDatabase().prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
    return row ? mapWorkspace(row) : null;
  }

  create(input: CreateWorkspaceInput): Workspace {
    const result = getDatabase()
      .prepare(
        `INSERT INTO workspaces (name, taiga_project_id, taiga_project_slug, merge_assignee_id, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        input.name.trim(),
        input.taigaProjectId,
        input.taigaProjectSlug?.trim() || null,
        toValidUserId(input.mergeAssigneeId),
      );

    return this.getById(Number(result.lastInsertRowid))!;
  }

  update(id: number, input: UpdateWorkspaceInput): Workspace {
    const current = this.getById(id);
    if (!current) {
      throw new Error('Workspace not found');
    }

    getDatabase()
      .prepare(
        `UPDATE workspaces SET
          name = ?,
          taiga_project_id = ?,
          taiga_project_slug = ?,
          default_codebase_id = ?,
          merge_assignee_id = ?,
          updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.name?.trim() || current.name,
        input.taigaProjectId ?? current.taigaProjectId,
        input.taigaProjectSlug !== undefined ? input.taigaProjectSlug : current.taigaProjectSlug,
        input.defaultCodebaseId !== undefined ? input.defaultCodebaseId : current.defaultCodebaseId,
        input.mergeAssigneeId !== undefined ? toValidUserId(input.mergeAssigneeId) : current.mergeAssigneeId,
        id,
      );

    return this.getById(id)!;
  }

  delete(id: number): void {
    const workspaces = this.list();
    if (workspaces.length <= 1) {
      throw new Error('Cannot delete the only workspace');
    }

    getDatabase().prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  }
}

export const workspaceRepository = new WorkspaceRepository();
