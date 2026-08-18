export interface AppSettings {
  taigaUrl: string;
  taigaUsername: string | null;
  taigaPassword: string | null;
  taigaToken: string | null;
  geminiApiKey: string | null;
  geminiModel: string;
  activeWorkspaceId: number | null;
  updatedAt: string;
  hasTaigaPassword: boolean;
  hasTaigaToken: boolean;
  hasGeminiApiKey: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  email?: string | null;
  photo?: string | null;
}

export interface AuthSession {
  authenticated: boolean;
  user: AuthUser | null;
  taigaUrl: string;
  lastUsername: string | null;
}

export interface UpdateSettingsRequest {
  taigaUrl?: string;
  taigaToken?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}

export interface Workspace {
  id: number;
  name: string;
  taigaProjectId: number;
  taigaProjectSlug: string | null;
  defaultCodebaseId: number | null;
  mergeAssigneeId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Codebase {
  id: number;
  workspaceId: number;
  name: string;
  gitlabUrl: string;
  gitlabToken: string | null;
  gitlabProjectId: string | null;
  gitlabDefaultBase: string;
  gitlabDiffSnippetLines: number;
  validScopes: string[];
  validTaskDomains: string[];
  isDefault: boolean;
  hasGitlabToken: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaigaProjectOption {
  id: number;
  name: string;
  slug: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  taigaProjectId: number;
  taigaProjectSlug?: string | null;
  mergeAssigneeId?: number | null;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  taigaProjectId?: number;
  taigaProjectSlug?: string | null;
  mergeAssigneeId?: number | null;
}

export interface CreateCodebaseRequest {
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

export interface UpdateCodebaseRequest extends CreateCodebaseRequest {}
