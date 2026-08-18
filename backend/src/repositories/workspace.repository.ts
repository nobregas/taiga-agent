import { getDatabase } from '../db/connection.js';
import type { Workspace, WorkspaceRow } from '../db/types.js';

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    taigaProjectId: row.taiga_project_id,
    taigaProjectSlug: row.taiga_project_slug,
    defaultCodebaseId: row.default_codebase_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateWorkspaceInput {
  name: string;
  taigaProjectId: number;
  taigaProjectSlug?: string | null;
}

export interface UpdateWorkspaceInput {
  name?: string;
  taigaProjectId?: number;
  taigaProjectSlug?: string | null;
  defaultCodebaseId?: number | null;
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
        `INSERT INTO workspaces (name, taiga_project_id, taiga_project_slug, updated_at)
         VALUES (?, ?, ?, datetime('now'))`,
      )
      .run(input.name.trim(), input.taigaProjectId, input.taigaProjectSlug?.trim() || null);

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
          updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        input.name?.trim() || current.name,
        input.taigaProjectId ?? current.taigaProjectId,
        input.taigaProjectSlug !== undefined ? input.taigaProjectSlug : current.taigaProjectSlug,
        input.defaultCodebaseId !== undefined ? input.defaultCodebaseId : current.defaultCodebaseId,
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
