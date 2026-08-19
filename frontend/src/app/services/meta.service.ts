import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { ProjectMeta } from '../models/draft.models';
import { Workspace } from '../models/settings.models';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class MetaService {
  private readonly api = inject(ApiService);
  private readonly metaSubject = new BehaviorSubject<ProjectMeta | null>(null);
  private readonly workspacesSubject = new BehaviorSubject<Workspace[]>([]);

  readonly meta$ = this.metaSubject.asObservable();
  readonly workspaces$ = this.workspacesSubject.asObservable();

  get snapshot(): ProjectMeta | null {
    return this.metaSubject.value;
  }

  get workspacesSnapshot(): Workspace[] {
    return this.workspacesSubject.value;
  }

  load(): Observable<ProjectMeta> {
    return this.api.getMeta().pipe(tap((meta) => this.metaSubject.next(meta)));
  }

  loadWorkspaces(): Observable<Workspace[]> {
    return this.api.listWorkspaces().pipe(tap((workspaces) => this.workspacesSubject.next(workspaces)));
  }

  refresh(): void {
    this.load().subscribe({
      error: () => {
        /* handled by callers */
      },
    });
  }

  refreshWorkspaces(): void {
    this.loadWorkspaces().subscribe({
      error: () => {
        /* handled by callers */
      },
    });
  }

  clear(): void {
    this.metaSubject.next(null);
    this.workspacesSubject.next([]);
  }

  afterWorkspaceChange(activateId?: number | null): Observable<ProjectMeta> {
    const syncWorkspaces$ = activateId
      ? this.api.activateWorkspace(activateId).pipe(switchMap(() => this.loadWorkspaces()))
      : this.loadWorkspaces();

    return syncWorkspaces$.pipe(
      switchMap(() => this.load()),
      catchError((error) => {
        this.refreshWorkspaces();
        this.refresh();
        return throwError(() => error);
      }),
    );
  }
}
