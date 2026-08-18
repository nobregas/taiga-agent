export interface AppSettingsRow {
  id: number;
  taiga_url: string;
  taiga_username: string | null;
  taiga_password: string | null;
  taiga_token: string | null;
  gemini_api_key: string | null;
  gemini_model: string;
  active_workspace_id: number | null;
  updated_at: string;
}

export interface WorkspaceRow {
  id: number;
  name: string;
  taiga_project_id: number;
  taiga_project_slug: string | null;
  default_codebase_id: number | null;
  merge_assignee_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CodebaseRow {
  id: number;
  workspace_id: number;
  name: string;
  gitlab_url: string;
  gitlab_token: string | null;
  gitlab_project_id: string | null;
  gitlab_default_base: string;
  gitlab_diff_snippet_lines: number;
  valid_scopes: string | null;
  valid_task_domains: string | null;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  taigaUrl: string;
  taigaUsername: string | null;
  taigaPassword: string | null;
  taigaToken: string | null;
  geminiApiKey: string | null;
  geminiModel: string;
  activeWorkspaceId: number | null;
  updatedAt: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface GitlabConfig {
  url: string;
  token: string | null;
  projectId: string | null;
  defaultBase: string;
  diffSnippetLines: number;
}

export interface TaigaConfig {
  url: string;
  username: string | null;
  password: string | null;
  token: string | null;
  projectId: number | null;
  projectSlug: string | null;
}

export interface GeminiConfig {
  apiKey: string | null;
  model: string;
}
