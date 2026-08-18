import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DraftFormComponent } from '../draft-form/draft-form.component';
import { PublishedPanelComponent } from '../published-panel/published-panel.component';
import { ReviewPanelComponent } from '../review-panel/review-panel.component';
import { MetaService } from '../../services/meta.service';
import { ToastService } from '../../services/toast.service';
import { ApiService } from '../../services/api.service';
import {
  BranchContextPreview,
  Draft,
  GenerateRequest,
  ProjectMeta,
  PublishResponse,
  WizardStep,
} from '../../models/draft.models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, DraftFormComponent, ReviewPanelComponent, PublishedPanelComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly metaService = inject(MetaService);
  private readonly toast = inject(ToastService);

  @ViewChild('generateDialog') generateDialog?: ElementRef<HTMLElement>;

  step: WizardStep = 'create';
  meta: ProjectMeta | null = null;
  metaWarning = '';
  draft: Draft | null = null;
  branchContext: BranchContextPreview | null = null;
  publishResult: PublishResponse | null = null;

  loading = false;
  publishing = false;
  savingPublished = false;

  generateOpen = false;
  generateError = '';
  generateStepIndex = 0;
  generateSucceeded = false;

  readonly generateSteps = [
    'Extraindo contexto',
    'Analisando requisito',
    'Consultando tags do projeto',
    'Extraindo criterios',
    'Gerando tasks',
    'Montando user story',
  ];

  readonly steps: Array<{ id: WizardStep; label: string }> = [
    { id: 'create', label: 'Criar' },
    { id: 'review', label: 'Revisar' },
    { id: 'done', label: 'Publicado' },
  ];

  private generateSub?: Subscription;
  private generateTimer?: number;
  private closeTimer?: number;
  private lastGenerateRequest: GenerateRequest | null = null;
  private previousFocus: HTMLElement | null = null;

  ngOnInit(): void {
    this.metaService.meta$.subscribe((meta) => {
      this.meta = meta;
      this.metaWarning = meta?.warning ?? '';
    });
  }

  ngOnDestroy(): void {
    this.clearGenerateTimers();
    this.generateSub?.unsubscribe();
  }

  onGenerate(payload: GenerateRequest): void {
    if (payload.mode === 'existing_us') {
      return;
    }

    this.lastGenerateRequest = payload;
    this.startGenerate(payload);
  }

  retryGenerate(): void {
    if (!this.lastGenerateRequest) {
      return;
    }
    this.startGenerate(this.lastGenerateRequest);
  }

  cancelGenerate(): void {
    if (this.generateSucceeded) {
      return;
    }

    this.generateSub?.unsubscribe();
    this.clearGenerateTimers();
    this.loading = false;
    this.closeGenerateModal();
  }

  closeGenerateModal(): void {
    this.generateOpen = false;
    this.generateError = '';
    this.generateSucceeded = false;
    this.clearGenerateTimers();
    queueMicrotask(() => this.previousFocus?.focus());
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.generateOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.generateError || !this.loading) {
        this.closeGenerateModal();
      } else {
        this.cancelGenerate();
      }
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  generateStepState(index: number): 'done' | 'current' | 'pending' {
    if (index < this.generateStepIndex) return 'done';
    if (index === this.generateStepIndex) return 'current';
    return 'pending';
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
          assignedTo: task.assignedTo ?? null,
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

  private startGenerate(payload: GenerateRequest): void {
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.generateOpen = true;
    this.generateError = '';
    this.generateSucceeded = false;
    this.generateStepIndex = 0;
    this.loading = true;
    this.publishResult = null;
    this.generateSub?.unsubscribe();
    this.clearGenerateTimers();
    this.startGenerateTicker();

    queueMicrotask(() => {
      window.setTimeout(() => this.generateDialog?.nativeElement.focus(), 0);
    });

    this.generateSub = this.api.generate(payload).subscribe({
      next: (response) => {
        this.clearGenerateTimers();
        this.generateStepIndex = this.generateSteps.length - 1;
        this.generateSucceeded = true;
        this.draft = response.draft;
        this.branchContext = response.branchContext;
        this.step = 'review';
        this.loading = false;
        this.closeTimer = window.setTimeout(() => this.closeGenerateModal(), 450);
      },
      error: (err) => {
        this.clearGenerateTimers();
        this.generateError = err?.error?.error ?? 'Falha ao gerar draft com IA.';
        this.loading = false;
      },
    });
  }

  private startGenerateTicker(): void {
    this.generateTimer = window.setInterval(() => {
      const lastPending = this.generateSteps.length - 2;
      if (this.generateStepIndex < lastPending) {
        this.generateStepIndex += 1;
      }
    }, 1100);
  }

  private clearGenerateTimers(): void {
    if (this.generateTimer) {
      window.clearInterval(this.generateTimer);
      this.generateTimer = undefined;
    }
    if (this.closeTimer) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = undefined;
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const root = this.generateDialog?.nativeElement;
    if (!root) return;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);

    if (!focusable.length) {
      event.preventDefault();
      root.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !root.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }
}
