import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Codebase, TaigaProjectOption, Workspace } from '../../models/settings.models';
import { TaigaUser, memberDisplayName } from '../../models/draft.models';
import { ApiService } from '../../services/api.service';
import { MetaService } from '../../services/meta.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-workspaces',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './workspaces.component.html',
  styleUrl: './workspaces.component.scss',
})
export class WorkspacesComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly metaService = inject(MetaService);
  private readonly toast = inject(ToastService);

  loading = true;
  savingWorkspace = false;
  savingCodebase = false;
  workspaces: Workspace[] = [];
  taigaProjects: TaigaProjectOption[] = [];
  selectedWorkspaceId: number | null = null;
  codebases: Codebase[] = [];
  members: TaigaUser[] = [];
  savingMergeRule = false;
  activeWorkspaceId: number | null = null;
  editingWorkspaceId: number | null = null;
  editingCodebaseId: number | null = null;

  workspaceForm = this.fb.nonNullable.group({
    name: [''],
    taigaProjectId: [''],
    taigaProjectSlug: [''],
    mergeAssigneeId: this.fb.control<number | null>(null),
  });

  codebaseForm = this.fb.nonNullable.group({
    name: [''],
    gitlabUrl: ['https://gitlab.com/api/v4'],
    gitlabToken: [''],
    gitlabProjectId: [''],
    gitlabDefaultBase: ['develop'],
    validScopes: [''],
    validTaskDomains: [''],
    isDefault: [false],
  });

  ngOnInit(): void {
    this.reload();
  }

  get workspaceSubmitLabel(): string {
    if (this.savingWorkspace) {
      return this.editingWorkspaceId ? 'Salvando...' : 'Criando...';
    }
    return this.editingWorkspaceId ? 'Salvar workspace' : 'Criar workspace';
  }

  get codebaseSubmitLabel(): string {
    if (this.savingCodebase) {
      return this.editingCodebaseId ? 'Salvando...' : 'Salvando...';
    }
    return this.editingCodebaseId ? 'Salvar repositorio' : 'Adicionar repositorio';
  }

  reload(): void {
    this.loading = true;
    this.api.listWorkspaces().subscribe({
      next: (workspaces) => {
        this.workspaces = workspaces;
        this.metaService.loadWorkspaces().subscribe();
        this.activeWorkspaceId = this.metaService.snapshot?.workspaceId ?? workspaces[0]?.id ?? null;
        this.selectedWorkspaceId = this.selectedWorkspaceId ?? this.activeWorkspaceId;
        this.loadCodebases();
        if (this.selectedWorkspaceId) {
          this.loadMembers(this.selectedWorkspaceId);
        }
        this.loading = false;
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao carregar workspaces. Verifique se o backend esta rodando.');
        this.loading = false;
      },
    });

    this.api.listTaigaProjects().subscribe({
      next: (projects) => {
        this.taigaProjects = projects;
      },
      error: () => {
        this.taigaProjects = [];
      },
    });
  }

  selectWorkspace(id: number): void {
    this.selectedWorkspaceId = id;
    if (this.editingCodebaseId) {
      this.cancelCodebaseEdit();
    }
    this.loadCodebases();
    this.loadMembers(id);
  }

  loadCodebases(): void {
    if (!this.selectedWorkspaceId) {
      this.codebases = [];
      return;
    }

    this.api.listCodebases(this.selectedWorkspaceId).subscribe({
      next: (codebases) => {
        this.codebases = codebases;
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao carregar repositorios.');
      },
    });
  }

  startEditWorkspace(workspace: Workspace, event: Event): void {
    event.stopPropagation();
    this.editingWorkspaceId = workspace.id;
    this.workspaceForm.patchValue({
      name: workspace.name,
      taigaProjectId: String(workspace.taigaProjectId),
      taigaProjectSlug: workspace.taigaProjectSlug ?? '',
      mergeAssigneeId: workspace.mergeAssigneeId,
    });
    this.loadMembers(workspace.id);
  }

  cancelWorkspaceEdit(): void {
    this.editingWorkspaceId = null;
    this.workspaceForm.reset({ name: '', taigaProjectId: '', taigaProjectSlug: '', mergeAssigneeId: null });
  }

  saveWorkspace(): void {
    const value = this.workspaceForm.getRawValue();
    const taigaProjectId = Number(value.taigaProjectId);

    if (!value.name.trim() || !Number.isFinite(taigaProjectId)) {
      this.toast.show('Informe nome e projeto Taiga.');
      return;
    }

    const payload = {
      name: value.name.trim(),
      taigaProjectId,
      taigaProjectSlug: value.taigaProjectSlug.trim() || null,
      mergeAssigneeId: value.mergeAssigneeId,
    };

    this.savingWorkspace = true;

    if (this.editingWorkspaceId) {
      const id = this.editingWorkspaceId;
      this.api.updateWorkspace(id, payload).subscribe({
        next: (workspace) => {
          this.workspaces = this.workspaces.map((item) => (item.id === workspace.id ? workspace : item));
          this.cancelWorkspaceEdit();
          this.savingWorkspace = false;
          this.toast.show('Workspace atualizado.', 'info');
          const shouldActivate = this.activeWorkspaceId === id ? id : null;
          this.metaService.afterWorkspaceChange(shouldActivate).subscribe();
        },
        error: (err) => {
          this.toast.show(err?.error?.error ?? 'Falha ao atualizar workspace.');
          this.savingWorkspace = false;
        },
      });
      return;
    }

    this.api.createWorkspace(payload).subscribe({
      next: (workspace) => {
        this.workspaceForm.reset({ name: '', taigaProjectId: '', taigaProjectSlug: '', mergeAssigneeId: null });
        this.workspaces = [...this.workspaces.filter((item) => item.id !== workspace.id), workspace];
        this.selectedWorkspaceId = workspace.id;
        this.activeWorkspaceId = workspace.id;
        this.loadCodebases();
        this.loadMembers(workspace.id);
        this.savingWorkspace = false;
        this.toast.show('Workspace criado.', 'info');
        this.metaService.afterWorkspaceChange(workspace.id).subscribe();
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao criar workspace.');
        this.savingWorkspace = false;
      },
    });
  }

  activateWorkspace(id: number, event?: Event): void {
    event?.stopPropagation();
    this.api.activateWorkspace(id).subscribe({
      next: () => {
        this.activeWorkspaceId = id;
        this.metaService.afterWorkspaceChange(id).subscribe();
        this.toast.show('Workspace ativado.', 'info');
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao ativar workspace.');
      },
    });
  }

  deleteWorkspace(id: number, event?: Event): void {
    event?.stopPropagation();
    this.api.deleteWorkspace(id).subscribe({
      next: () => {
        this.workspaces = this.workspaces.filter((item) => item.id !== id);
        if (this.selectedWorkspaceId === id) {
          this.selectedWorkspaceId = this.workspaces[0]?.id ?? null;
        }
        if (this.editingWorkspaceId === id) {
          this.cancelWorkspaceEdit();
        }
        this.loadCodebases();
        this.metaService.afterWorkspaceChange().subscribe();
        this.toast.show('Workspace removido.', 'info');
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao remover workspace.');
      },
    });
  }

  onTaigaProjectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const project = this.taigaProjects.find((item) => String(item.id) === value);
    if (project) {
      this.workspaceForm.patchValue({
        taigaProjectId: String(project.id),
        taigaProjectSlug: project.slug,
        name: this.workspaceForm.controls.name.value || project.name,
      });
      this.loadMembers(undefined, project.id);
    }
  }

  startEditCodebase(codebase: Codebase): void {
    this.editingCodebaseId = codebase.id;
    this.codebaseForm.patchValue({
      name: codebase.name,
      gitlabUrl: codebase.gitlabUrl,
      gitlabToken: '',
      gitlabProjectId: codebase.gitlabProjectId ?? '',
      gitlabDefaultBase: codebase.gitlabDefaultBase,
      validScopes: codebase.validScopes.join(', '),
      validTaskDomains: codebase.validTaskDomains.join(', '),
      isDefault: codebase.isDefault,
    });
  }

  cancelCodebaseEdit(): void {
    this.editingCodebaseId = null;
    this.codebaseForm.reset({
      name: '',
      gitlabUrl: 'https://gitlab.com/api/v4',
      gitlabToken: '',
      gitlabProjectId: '',
      gitlabDefaultBase: 'develop',
      validScopes: '',
      validTaskDomains: '',
      isDefault: false,
    });
  }

  saveCodebase(): void {
    if (!this.selectedWorkspaceId) return;

    const value = this.codebaseForm.getRawValue();
    if (!value.name.trim()) {
      this.toast.show('Informe o nome do repositorio.');
      return;
    }

    this.savingCodebase = true;
    const payload = {
      name: value.name.trim(),
      gitlabUrl: value.gitlabUrl.trim(),
      gitlabProjectId: value.gitlabProjectId.trim() || null,
      gitlabDefaultBase: value.gitlabDefaultBase.trim() || 'develop',
      validScopes: this.parseCsv(value.validScopes),
      validTaskDomains: this.parseCsv(value.validTaskDomains),
      isDefault: value.isDefault || this.codebases.length === 0,
      ...(value.gitlabToken.trim() ? { gitlabToken: value.gitlabToken.trim() } : {}),
    };

    if (this.editingCodebaseId) {
      this.api.updateCodebase(this.editingCodebaseId, payload).subscribe({
        next: () => {
          this.cancelCodebaseEdit();
          this.loadCodebases();
          this.metaService.refresh();
          this.savingCodebase = false;
          this.toast.show('Repositorio atualizado.', 'info');
        },
        error: (err) => {
          this.toast.show(err?.error?.error ?? 'Falha ao atualizar repositorio.');
          this.savingCodebase = false;
        },
      });
      return;
    }

    this.api
      .createCodebase(this.selectedWorkspaceId, {
        ...payload,
        gitlabToken: value.gitlabToken.trim() || null,
      })
      .subscribe({
        next: () => {
          this.cancelCodebaseEdit();
          this.loadCodebases();
          this.metaService.refresh();
          this.savingCodebase = false;
          this.toast.show('Repositorio criado.', 'info');
        },
        error: (err) => {
          this.toast.show(err?.error?.error ?? 'Falha ao criar repositorio.');
          this.savingCodebase = false;
        },
      });
  }

  setDefaultCodebase(id: number): void {
    this.api.setDefaultCodebase(id).subscribe({
      next: () => {
        this.loadCodebases();
        this.metaService.refresh();
        this.toast.show('Repositorio padrao atualizado.', 'info');
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao definir repositorio padrao.');
      },
    });
  }

  deleteCodebase(id: number): void {
    this.api.deleteCodebase(id).subscribe({
      next: () => {
        if (this.editingCodebaseId === id) {
          this.cancelCodebaseEdit();
        }
        this.loadCodebases();
        this.metaService.refresh();
        this.toast.show('Repositorio removido.', 'info');
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao remover repositorio.');
      },
    });
  }

  private parseCsv(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  get selectedWorkspace(): Workspace | null {
    return this.workspaces.find((item) => item.id === this.selectedWorkspaceId) ?? null;
  }

  memberLabel(member: TaigaUser): string {
    return memberDisplayName(member);
  }

  loadMembers(workspaceId?: number | null, projectId?: number | null): void {
    if (!workspaceId && !projectId) {
      this.members = [];
      return;
    }

    this.api.listMembers(workspaceId, projectId).subscribe({
      next: (response) => {
        this.members = response.members ?? [];
      },
      error: () => {
        this.members = [];
      },
    });
  }

  onMergeAssigneeChange(event: Event): void {
    const workspaceId = this.selectedWorkspaceId;
    if (!workspaceId) return;

    const raw = (event.target as HTMLSelectElement).value;
    const mergeAssigneeId = raw === '' ? null : Number(raw);
    this.savingMergeRule = true;

    this.api.updateWorkspace(workspaceId, { mergeAssigneeId }).subscribe({
      next: (workspace) => {
        this.workspaces = this.workspaces.map((item) => (item.id === workspace.id ? workspace : item));
        this.savingMergeRule = false;
        this.toast.show('Regra de Merge atualizada.', 'info');
        if (this.activeWorkspaceId === workspaceId) {
          this.metaService.afterWorkspaceChange().subscribe();
        }
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao salvar regra de Merge.');
        this.savingMergeRule = false;
      },
    });
  }
}
