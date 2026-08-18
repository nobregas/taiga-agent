import { getDatabase } from '../db/connection.js';
import type { AppSettings, AppSettingsRow } from '../db/types.js';
import { maskSecret } from '../db/utils.js';

function mapSettings(row: AppSettingsRow): AppSettings {
  return {
    taigaUrl: row.taiga_url,
    taigaUsername: row.taiga_username,
    taigaPassword: row.taiga_password,
    taigaToken: row.taiga_token,
    geminiApiKey: row.gemini_api_key,
    geminiModel: row.gemini_model,
    activeWorkspaceId: row.active_workspace_id,
    updatedAt: row.updated_at,
  };
}

export interface AppSettingsPublic extends Omit<AppSettings, 'taigaPassword' | 'taigaToken' | 'geminiApiKey'> {
  taigaPassword: string | null;
  taigaToken: string | null;
  geminiApiKey: string | null;
  hasTaigaPassword: boolean;
  hasTaigaToken: boolean;
  hasGeminiApiKey: boolean;
}

export interface UpdateSettingsInput {
  taigaUrl?: string;
  taigaUsername?: string;
  taigaPassword?: string;
  taigaToken?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  activeWorkspaceId?: number | null;
}

export class SettingsRepository {
  get(): AppSettings | null {
    const row = getDatabase().prepare('SELECT * FROM app_settings WHERE id = 1').get() as AppSettingsRow | undefined;
    return row ? mapSettings(row) : null;
  }

  getOrCreate(): AppSettings {
    const existing = this.get();
    if (existing) {
      return existing;
    }

    getDatabase()
      .prepare(
        `INSERT INTO app_settings (id, taiga_url, gemini_model, updated_at)
         VALUES (1, 'https://api.taiga.io/api/v1', 'gemini-2.5-flash', datetime('now'))`,
      )
      .run();

    return this.get()!;
  }

  toPublic(settings: AppSettings): AppSettingsPublic {
    return {
      taigaUrl: settings.taigaUrl,
      taigaUsername: settings.taigaUsername,
      taigaPassword: maskSecret(settings.taigaPassword),
      taigaToken: maskSecret(settings.taigaToken),
      geminiApiKey: maskSecret(settings.geminiApiKey),
      geminiModel: settings.geminiModel,
      activeWorkspaceId: settings.activeWorkspaceId,
      updatedAt: settings.updatedAt,
      hasTaigaPassword: Boolean(settings.taigaPassword),
      hasTaigaToken: Boolean(settings.taigaToken),
      hasGeminiApiKey: Boolean(settings.geminiApiKey),
    };
  }

  update(input: UpdateSettingsInput): AppSettings {
    const current = this.getOrCreate();
    const next: AppSettings = {
      taigaUrl: input.taigaUrl?.trim() || current.taigaUrl,
      taigaUsername:
        input.taigaUsername !== undefined ? input.taigaUsername.trim() || null : current.taigaUsername,
      taigaPassword:
        input.taigaPassword !== undefined
          ? input.taigaPassword.trim() || null
          : current.taigaPassword,
      taigaToken:
        input.taigaToken !== undefined ? input.taigaToken.trim() || null : current.taigaToken,
      geminiApiKey:
        input.geminiApiKey !== undefined ? input.geminiApiKey.trim() || null : current.geminiApiKey,
      geminiModel: input.geminiModel?.trim() || current.geminiModel,
      activeWorkspaceId:
        input.activeWorkspaceId !== undefined ? input.activeWorkspaceId : current.activeWorkspaceId,
      updatedAt: new Date().toISOString(),
    };

    getDatabase()
      .prepare(
        `UPDATE app_settings SET
          taiga_url = ?,
          taiga_username = ?,
          taiga_password = ?,
          taiga_token = ?,
          gemini_api_key = ?,
          gemini_model = ?,
          active_workspace_id = ?,
          updated_at = ?
         WHERE id = 1`,
      )
      .run(
        next.taigaUrl,
        next.taigaUsername,
        next.taigaPassword,
        next.taigaToken,
        next.geminiApiKey,
        next.geminiModel,
        next.activeWorkspaceId,
        next.updatedAt,
      );

    return next;
  }

  setActiveWorkspace(workspaceId: number | null): AppSettings {
    return this.update({ activeWorkspaceId: workspaceId });
  }
}

export const settingsRepository = new SettingsRepository();
