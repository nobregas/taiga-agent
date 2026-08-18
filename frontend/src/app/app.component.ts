import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastComponent } from './components/toast/toast.component';
import { ProjectMeta } from './models/draft.models';
import { Workspace } from './models/settings.models';
import { MetaService } from './services/meta.service';
import { ToastService } from './services/toast.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly metaService = inject(MetaService);
  private readonly toast = inject(ToastService);

  meta: ProjectMeta | null = null;
  workspaces: Workspace[] = [];
  switchingWorkspace = false;

  readonly steps = [
    { id: 'create', label: 'Criar' },
    { id: 'review', label: 'Revisar' },
    { id: 'done', label: 'Publicado' },
  ];

  ngOnInit(): void {
    this.metaService.meta$.subscribe((meta) => {
      this.meta = meta;
    });

    this.metaService.workspaces$.subscribe((workspaces) => {
      this.workspaces = workspaces;
    });

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

  onWorkspaceChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!Number.isFinite(value) || value === this.meta?.workspaceId) {
      return;
    }

    this.switchingWorkspace = true;
    this.metaService.afterWorkspaceChange(value).subscribe({
      next: () => {
        this.switchingWorkspace = false;
      },
      error: (err) => {
        this.switchingWorkspace = false;
        this.toast.show(err?.error?.error ?? 'Falha ao trocar workspace.');
      },
    });
  }
}
