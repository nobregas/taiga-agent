import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ToastComponent } from './components/toast/toast.component';
import { SelectComponent } from './components/select/select.component';
import { ProjectMeta } from './models/draft.models';
import { Workspace } from './models/settings.models';
import { AuthService } from './services/auth.service';
import { MetaService } from './services/meta.service';
import { ApiService } from './services/api.service';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToastComponent, SelectComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly metaService = inject(MetaService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  appVersion = '';
  meta: ProjectMeta | null = null;
  workspaces: Workspace[] = [];
  switchingWorkspace = false;
  isLoginRoute = false;
  userMenuOpen = false;
  avatarBroken = false;

  readonly steps = [
    { id: 'create', label: 'Criar' },
    { id: 'review', label: 'Revisar' },
    { id: 'done', label: 'Publicado' },
  ];

  ngOnInit(): void {
    this.loadAppVersion();
    this.isLoginRoute = this.router.url.startsWith('/login');
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd)).subscribe((event) => {
      this.isLoginRoute = event.urlAfterRedirects.startsWith('/login');
      this.userMenuOpen = false;
      if (!this.isLoginRoute && this.auth.authenticated() && !this.meta) {
        this.loadAppData();
      }
    });

    this.metaService.meta$.subscribe((meta) => {
      this.meta = meta;
    });

    this.metaService.workspaces$.subscribe((workspaces) => {
      this.workspaces = workspaces;
    });

    this.auth.ensureSession().subscribe((session) => {
      if (session.authenticated) {
        this.loadAppData();
      }
    });
  }

  get workspaceOptions() {
    return this.workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }));
  }

  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
  }

  closeUserMenu(): void {
    this.userMenuOpen = false;
  }

  onAvatarError(): void {
    this.avatarBroken = true;
  }

  logout(): void {
    this.userMenuOpen = false;
    this.auth.logout().subscribe({
      next: () => {
        this.meta = null;
        this.workspaces = [];
        this.router.navigateByUrl('/login');
      },
      error: () => {
        this.router.navigateByUrl('/login');
      },
    });
  }

  onWorkspaceIdChange(value: string | number | null): void {
    const id = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(id) || id === this.meta?.workspaceId) {
      return;
    }

    this.switchingWorkspace = true;
    this.metaService.afterWorkspaceChange(id).subscribe({
      next: () => {
        this.switchingWorkspace = false;
      },
      error: (err) => {
        this.switchingWorkspace = false;
        this.toast.show(err?.error?.error ?? 'Falha ao trocar workspace.');
      },
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.userMenuOpen) {
      this.userMenuOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.userMenuOpen = false;
  }

  private loadAppVersion(): void {
    this.api.health().subscribe({
      next: (health) => {
        const version = health.version?.trim();
        if (!version) {
          return;
        }
        this.appVersion = version.startsWith('v') ? version : `v${version}`;
      },
      error: () => {
        // Version badge is optional; ignore if backend is still starting.
      },
    });
  }

  private loadAppData(): void {
    this.avatarBroken = false;
    this.metaService.load().subscribe({
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao carregar metadados do Taiga. Verifique se o backend esta em http://localhost:3000.');
      },
    });

    this.metaService.loadWorkspaces().subscribe({
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Nao foi possivel falar com o backend. Suba com npm run dev (backend + frontend).');
      },
    });
  }
}
