import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  BranchContextPreview,
  Draft,
  GenerateRequest,
  GenerateResponse,
  ProjectMeta,
  PublishResponse,
  TaigaUser,
  UpdatePublishedRequest,
  UserStoryEditResponse,
  UserStorySearchResult,
} from '../models/draft.models';
import {
  AppSettings,
  AuthSession,
  Codebase,
  CreateCodebaseRequest,
  CreateWorkspaceRequest,
  TaigaProjectOption,
  UpdateCodebaseRequest,
  UpdateSettingsRequest,
  UpdateWorkspaceRequest,
  Workspace,
} from '../models/settings.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  health(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.baseUrl}/health`);
  }

  getAuthSession(): Observable<AuthSession> {
    return this.http.get<AuthSession>(`${this.baseUrl}/auth/session`);
  }

  login(payload: { username: string; password: string; taigaUrl?: string }): Observable<AuthSession> {
    return this.http.post<AuthSession>(`${this.baseUrl}/auth/login`, payload);
  }

  logout(): Observable<AuthSession> {
    return this.http.post<AuthSession>(`${this.baseUrl}/auth/logout`, {});
  }

  getMeta(): Observable<ProjectMeta> {
    return this.http.get<ProjectMeta>(`${this.baseUrl}/config/meta`);
  }

  searchUserStories(query = ''): Observable<UserStorySearchResult[]> {
    const q = query.trim();
    if (!q) {
      return of([]);
    }

    return this.http.get<UserStorySearchResult[]>(`${this.baseUrl}/config/userstories/search`, {
      params: { q },
    });
  }

  searchGitlabBranches(query = '', codebaseId?: number | null): Observable<string[]> {
    const params: Record<string, string> = { q: query };
    if (codebaseId) {
      params['codebaseId'] = String(codebaseId);
    }

    return this.http.get<string[]>(`${this.baseUrl}/config/gitlab/branches`, { params });
  }

  listRecentUserStories(): Observable<UserStorySearchResult[]> {
    return this.http.get<UserStorySearchResult[]>(`${this.baseUrl}/config/userstories/recent`);
  }

  loadUserStoryForEdit(ref: number): Observable<UserStoryEditResponse> {
    return this.http.get<UserStoryEditResponse>(`${this.baseUrl}/config/userstories/${ref}/edit`);
  }

  generate(request: GenerateRequest): Observable<GenerateResponse> {
    return this.http.post<GenerateResponse>(`${this.baseUrl}/generate`, request);
  }

  publish(mode: 'new_us' | 'existing_us', draft: Draft): Observable<PublishResponse> {
    return this.http.post<PublishResponse>(`${this.baseUrl}/publish`, { mode, draft });
  }

  updatePublished(payload: UpdatePublishedRequest): Observable<PublishResponse> {
    return this.http.patch<PublishResponse>(`${this.baseUrl}/publish/update`, payload);
  }

  getSettings(): Observable<AppSettings> {
    return this.http.get<AppSettings>(`${this.baseUrl}/settings`);
  }

  updateSettings(payload: UpdateSettingsRequest): Observable<AppSettings> {
    return this.http.put<AppSettings>(`${this.baseUrl}/settings`, payload);
  }

  listTaigaProjects(): Observable<TaigaProjectOption[]> {
    return this.http.get<TaigaProjectOption[]>(`${this.baseUrl}/settings/taiga/projects`);
  }

  listProjectTags(): Observable<{ tags: string[]; tagColors: Record<string, string | null> }> {
    return this.http.get<{ tags: string[]; tagColors: Record<string, string | null> }>(
      `${this.baseUrl}/config/tags`,
    );
  }

  listMembers(workspaceId?: number | null, projectId?: number | null): Observable<{ members: TaigaUser[] }> {
    const params: Record<string, string> = {};
    if (workspaceId) {
      params['workspaceId'] = String(workspaceId);
    }
    if (projectId) {
      params['projectId'] = String(projectId);
    }

    return this.http.get<{ members: TaigaUser[] }>(`${this.baseUrl}/config/members`, { params });
  }

  listWorkspaces(): Observable<Workspace[]> {
    return this.http.get<Workspace[]>(`${this.baseUrl}/workspaces`);
  }

  createWorkspace(payload: CreateWorkspaceRequest): Observable<Workspace> {
    return this.http.post<Workspace>(`${this.baseUrl}/workspaces`, payload);
  }

  updateWorkspace(id: number, payload: UpdateWorkspaceRequest): Observable<Workspace> {
    return this.http.patch<Workspace>(`${this.baseUrl}/workspaces/${id}`, payload);
  }

  deleteWorkspace(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/workspaces/${id}`);
  }

  activateWorkspace(id: number): Observable<Workspace> {
    return this.http.post<Workspace>(`${this.baseUrl}/workspaces/${id}/activate`, {});
  }

  listCodebases(workspaceId: number): Observable<Codebase[]> {
    return this.http.get<Codebase[]>(`${this.baseUrl}/workspaces/${workspaceId}/codebases`);
  }

  createCodebase(workspaceId: number, payload: CreateCodebaseRequest): Observable<Codebase> {
    return this.http.post<Codebase>(`${this.baseUrl}/workspaces/${workspaceId}/codebases`, payload);
  }

  updateCodebase(id: number, payload: UpdateCodebaseRequest): Observable<Codebase> {
    return this.http.patch<Codebase>(`${this.baseUrl}/codebases/${id}`, payload);
  }

  deleteCodebase(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/codebases/${id}`);
  }

  setDefaultCodebase(id: number): Observable<Codebase> {
    return this.http.post<Codebase>(`${this.baseUrl}/codebases/${id}/set-default`, {});
  }
}
