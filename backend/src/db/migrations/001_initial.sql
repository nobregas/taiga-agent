CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  taiga_url TEXT NOT NULL DEFAULT 'https://api.taiga.io/api/v1',
  taiga_username TEXT,
  taiga_password TEXT,
  taiga_token TEXT,
  gemini_api_key TEXT,
  gemini_model TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  active_workspace_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  taiga_project_id INTEGER NOT NULL,
  taiga_project_slug TEXT,
  default_codebase_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS codebases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  gitlab_url TEXT NOT NULL DEFAULT 'https://gitlab.com/api/v4',
  gitlab_token TEXT,
  gitlab_project_id TEXT,
  gitlab_default_base TEXT NOT NULL DEFAULT 'develop',
  gitlab_diff_snippet_lines INTEGER NOT NULL DEFAULT 30,
  valid_scopes TEXT,
  valid_task_domains TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
