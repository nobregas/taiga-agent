import type { Codebase, GeminiConfig, GitlabConfig, TaigaConfig } from '../db/types.js';
import { codebaseRepository } from '../repositories/codebase.repository.js';
import { settingsRepository } from '../repositories/settings.repository.js';
import { workspaceRepository } from '../repositories/workspace.repository.js';
import { geminiService } from './gemini.service.js';
import { taigaService } from './taiga.service.js';

export class RuntimeConfigService {
  getSettings() {
    return settingsRepository.getOrCreate();
  }

  getActiveWorkspace() {
    const settings = this.getSettings();
    if (!settings.activeWorkspaceId) {
      return null;
    }

    return workspaceRepository.getById(settings.activeWorkspaceId);
  }

  getTaigaConfig(): TaigaConfig {
    const settings = this.getSettings();
    const workspace = this.getActiveWorkspace();

    return {
      url: settings.taigaUrl,
      username: settings.taigaUsername,
      password: settings.taigaPassword,
      token: settings.taigaToken,
      projectId: workspace?.taigaProjectId ?? null,
      projectSlug: workspace?.taigaProjectSlug ?? null,
    };
  }

  getGeminiConfig(): GeminiConfig {
    const settings = this.getSettings();
    return {
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel,
    };
  }

  resolveCodebase(codebaseId?: number | null): Codebase | null {
    const workspace = this.getActiveWorkspace();
    if (!workspace) {
      return null;
    }

    if (codebaseId) {
      const codebase = codebaseRepository.getById(codebaseId);
      if (!codebase || codebase.workspaceId !== workspace.id) {
        throw new Error('Codebase not found in active workspace');
      }
      return codebase;
    }

    if (workspace.defaultCodebaseId) {
      return codebaseRepository.getById(workspace.defaultCodebaseId);
    }

    return codebaseRepository.getDefault(workspace.id);
  }

  getGitlabConfig(codebaseId?: number | null): GitlabConfig {
    const codebase = this.resolveCodebase(codebaseId);

    return {
      url: codebase?.gitlabUrl ?? 'https://gitlab.com/api/v4',
      token: codebase?.gitlabToken ?? null,
      projectId: codebase?.gitlabProjectId ?? null,
      defaultBase: codebase?.gitlabDefaultBase ?? 'develop',
      diffSnippetLines: codebase?.gitlabDiffSnippetLines ?? 30,
    };
  }

  getValidScopes(codebaseId?: number | null): string[] {
    return this.resolveCodebase(codebaseId)?.validScopes ?? [];
  }

  getValidTaskDomains(codebaseId?: number | null): string[] {
    return this.resolveCodebase(codebaseId)?.validTaskDomains ?? [];
  }

  getCodebases(workspaceId?: number) {
    const workspace = workspaceId
      ? workspaceRepository.getById(workspaceId)
      : this.getActiveWorkspace();

    if (!workspace) {
      return [];
    }

    return codebaseRepository.listByWorkspace(workspace.id);
  }

  assertTaigaConfigured(): void {
    const taiga = this.getTaigaConfig();
    if (!taiga.projectId) {
      throw new Error('Nenhum workspace Taiga ativo configurado');
    }
    this.assertTaigaCredentials();
  }

  assertTaigaCredentials(): void {
    const taiga = this.getTaigaConfig();
    if (!taiga.token && (!taiga.username || !taiga.password)) {
      throw new Error('Configure credenciais Taiga em Configuracoes');
    }
  }

  assertGeminiConfigured(): void {
    if (!this.getGeminiConfig().apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
  }

  isGitlabConfigured(codebaseId?: number | null): boolean {
    const gitlab = this.getGitlabConfig(codebaseId);
    return Boolean(gitlab.token && gitlab.projectId);
  }

  hasActiveWorkspace(): boolean {
    return Boolean(this.getActiveWorkspace());
  }

  hasDefaultCodebase(): boolean {
    const workspace = this.getActiveWorkspace();
    if (!workspace) {
      return false;
    }

    return Boolean(codebaseRepository.getDefault(workspace.id));
  }

  invalidateAuth(): void {
    taigaService.invalidateAuth();
    geminiService.invalidateClient();
  }
}

export const runtimeConfig = new RuntimeConfigService();
