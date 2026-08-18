import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthSession } from '../models/settings.models';
import { ApiService } from './api.service';

const emptySession = (taigaUrl = 'https://api.taiga.io/api/v1'): AuthSession => ({
  authenticated: false,
  user: null,
  taigaUrl,
  lastUsername: null,
});

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly sessionState = signal<AuthSession>(emptySession());
  private sessionLoaded = false;
  private inflight$: Observable<AuthSession> | null = null;

  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState().user);
  readonly authenticated = computed(() => this.sessionState().authenticated);

  ensureSession(): Observable<AuthSession> {
    if (this.sessionLoaded) {
      return of(this.sessionState());
    }

    if (!this.inflight$) {
      this.inflight$ = this.reloadSession().pipe(
        tap(() => {
          this.inflight$ = null;
        }),
        shareReplay(1),
      );
    }

    return this.inflight$;
  }

  reloadSession(): Observable<AuthSession> {
    return this.api.getAuthSession().pipe(
      tap((session) => this.setSession(session)),
      catchError(() => {
        this.setSession(emptySession(this.sessionState().taigaUrl));
        return of(this.sessionState());
      }),
    );
  }

  login(username: string, password: string): Observable<AuthSession> {
    return this.api.login({ username, password, taigaUrl: this.sessionState().taigaUrl }).pipe(
      tap((session) => this.setSession(session)),
    );
  }

  logout(): Observable<AuthSession> {
    return this.api.logout().pipe(
      tap((session) => this.setSession(session)),
      catchError(() => {
        this.setSession(emptySession(this.sessionState().taigaUrl));
        return of(this.sessionState());
      }),
    );
  }

  userInitials(): string {
    const user = this.sessionState().user;
    const name = user?.full_name || user?.email || user?.username || '';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || '?';
  }

  displayEmail(): string {
    const user = this.sessionState().user;
    return user?.email || user?.username || '';
  }

  private setSession(session: AuthSession): void {
    this.sessionLoaded = true;
    this.sessionState.set(session);
  }
}
