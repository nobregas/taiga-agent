import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ToastComponent } from './components/toast/toast.component';
import { DraftFormComponent } from './features/draft-form/draft-form.component';
import { PublishedPanelComponent } from './features/published-panel/published-panel.component';
import { ReviewPanelComponent } from './features/review-panel/review-panel.component';
import { ApiService } from './services/api.service';
import { ToastService } from './services/toast.service';
import {
  BranchContextPreview,
  Draft,
  GenerateRequest,
  ProjectMeta,
  PublishResponse,
  WizardStep,
} from './models/draft.models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ToastComponent,
    DraftFormComponent,
    ReviewPanelComponent,
    PublishedPanelComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  step: WizardStep = 'create';
  meta: ProjectMeta | null = null;
  metaWarning = '';
  draft: Draft | null = null;
  branchContext: BranchContextPreview | null = null;
  publishResult: PublishResponse | null = null;

  loading = false;
  publishing = false;
  savingPublished = false;

  readonly steps: Array<{ id: WizardStep; label: string }> = [
    { id: 'create', label: 'Criar' },
    { id: 'review', label: 'Revisar' },
    { id: 'done', label: 'Publicado' },
  ];

  ngOnInit(): void {
    this.api.getMeta().subscribe({
      next: (meta) => {
        this.meta = meta;
        this.metaWarning = meta.warning ?? '';
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao carregar metadados do Taiga.');
      },
    });
  }

  onGenerate(payload: GenerateRequest): void {
    if (payload.mode === 'existing_us') {
      return;
    }

    this.loading = true;
    this.publishResult = null;

    this.api.generate(payload).subscribe({
      next: (response) => {
        this.draft = response.draft;
        this.branchContext = response.branchContext;
        this.step = 'review';
        this.loading = false;
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao gerar draft com IA.');
        this.loading = false;
      },
    });
  }

  onOpenExisting(ref: number): void {
    this.loading = true;
    this.publishResult = null;
    this.branchContext = null;

    this.api.loadUserStoryForEdit(ref).subscribe({
      next: (response) => {
        this.draft = response.draft;
        this.publishResult = response.publishResult;
        this.step = 'done';
        this.loading = false;
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao carregar US do Taiga.');
        this.loading = false;
      },
    });
  }

  onPublish(mode: 'new_us' | 'existing_us', draft: Draft): void {
    this.publishing = true;

    this.api.publish(mode, draft).subscribe({
      next: (result) => {
        this.publishResult = result;
        this.draft = draft;
        this.publishing = false;
        this.step = 'done';
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao publicar no Taiga.');
        this.publishing = false;
      },
    });
  }

  onSavePublished(payload: { draft: Draft; publishResult: PublishResponse }): void {
    if (!payload.publishResult.userStory.id) return;

    this.savingPublished = true;
    this.api
      .updatePublished({
        userStoryId: payload.publishResult.userStory.id,
        userStoryVersion: payload.publishResult.userStory.version,
        draft: payload.draft,
        tasks: payload.publishResult.tasks.map((task) => ({
          id: task.id,
          version: task.version,
          subject: task.subject,
          description: task.description,
          statusId: task.statusId,
        })),
      })
      .subscribe({
        next: (result) => {
          this.publishResult = result;
          this.draft = payload.draft;
          this.savingPublished = false;
          this.toast.show('Alteracoes salvas no Taiga.', 'info');
        },
        error: (err) => {
          this.toast.show(err?.error?.error ?? 'Falha ao salvar alteracoes.');
          this.savingPublished = false;
        },
      });
  }

  onReset(): void {
    this.draft = null;
    this.branchContext = null;
    this.publishResult = null;
    this.step = 'create';
  }

  onBack(): void {
    this.step = 'create';
  }

  stepIndex(): number {
    return this.steps.findIndex((item) => item.id === this.step);
  }
}
