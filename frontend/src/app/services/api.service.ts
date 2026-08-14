import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Draft,
  GenerateRequest,
  GenerateResponse,
  ProjectMeta,
  PublishResponse,
  UpdatePublishedRequest,
  UserStoryEditResponse,
  UserStorySearchResult,
} from '../models/draft.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  health(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.baseUrl}/health`);
  }

  getMeta(): Observable<ProjectMeta> {
    return this.http.get<ProjectMeta>(`${this.baseUrl}/config/meta`);
  }

  searchUserStories(query = ''): Observable<UserStorySearchResult[]> {
    return this.http.get<UserStorySearchResult[]>(`${this.baseUrl}/config/userstories/search`, {
      params: { q: query },
    });
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
}
