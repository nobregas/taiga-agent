import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import {
  BRANCH_PREFIXES,
  GenerationMode,
  GenerateRequest,
  ProjectMeta,
} from '../../models/draft.models';

@Component({
  selector: 'app-draft-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './draft-form.component.html',
  styleUrl: './draft-form.component.scss',
})
export class DraftFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);

  @Input() meta: ProjectMeta | null = null;
  @Input() loading = false;
  @Output() generate = new EventEmitter<GenerateRequest>();
  @Output() openExisting = new EventEmitter<number>();

  activeTab: 'basico' | 'detalhes' | 'gitlab' = 'basico';
  searchResults: Array<{ id: number; ref: number; subject: string }> = [];
  usSuggestionsOpen = false;
  selectedBranchPrefix = 'feat';
  readonly branchPrefixes = BRANCH_PREFIXES;

  readonly modes: Array<{ value: GenerationMode; label: string; hint: string }> = [
    { value: 'new_us', label: 'Nova US', hint: 'Planejamento antes de codar' },
    { value: 'existing_us', label: 'US existente', hint: 'Editar US aberta no Taiga' },
    { value: 'retrospective', label: 'Retrospectiva', hint: 'Branch com commits' },
  ];

  form = this.fb.nonNullable.group({
    mode: ['new_us' as GenerationMode, Validators.required],
    escopo: ['', Validators.required],
    titulo: ['', Validators.required],
    contextoGeral: ['', Validators.required],
    objetivo: [''],
    criteriosAceite: [''],
    branch: [''],
    tasksFromCall: [''],
    enrichWithGitlab: [false],
    gitlabBranch: [''],
    existingUserStoryRef: [''],
    existingUserStoryTitle: [''],
  });

  ngOnInit(): void {
    this.applyModeValidators(this.form.controls.mode.value);
    this.form.controls.mode.valueChanges.subscribe((mode) => this.applyModeValidators(mode));
  }

  get isExistingUsMode(): boolean {
    return this.form.controls.mode.value === 'existing_us';
  }

  get submitLabel(): string {
    if (this.loading) {
      return this.isExistingUsMode ? 'Abrindo...' : 'Gerando...';
    }
    return this.isExistingUsMode ? 'Abrir US' : 'Gerar draft';
  }

  private applyModeValidators(mode: GenerationMode): void {
    if (mode === 'existing_us' || mode === 'retrospective') {
      this.form.controls.escopo.clearValidators();
      this.form.controls.titulo.clearValidators();
      this.form.controls.contextoGeral.clearValidators();
    } else {
      this.form.controls.escopo.setValidators(Validators.required);
      this.form.controls.titulo.setValidators(Validators.required);
      this.form.controls.contextoGeral.setValidators(Validators.required);
    }

    if (mode === 'existing_us') {
      this.form.controls.branch.clearValidators();
      this.form.controls.existingUserStoryRef.setValidators([
        Validators.required,
        Validators.pattern(/^\d+$/),
      ]);
    } else {
      this.form.controls.branch.setValidators([Validators.required, Validators.minLength(3)]);
      this.form.controls.existingUserStoryRef.clearValidators();
    }

    this.form.controls.escopo.updateValueAndValidity({ emitEvent: false });
    this.form.controls.titulo.updateValueAndValidity({ emitEvent: false });
    this.form.controls.contextoGeral.updateValueAndValidity({ emitEvent: false });
    this.form.controls.branch.updateValueAndValidity({ emitEvent: false });
    this.form.controls.existingUserStoryRef.updateValueAndValidity({ emitEvent: false });
  }

  get scopes(): string[] {
    return this.meta?.validScopes?.length
      ? this.meta.validScopes
      : ['App', 'Backend', 'Portal', 'Pedido', 'Checkout'];
  }

  setTab(tab: 'basico' | 'detalhes' | 'gitlab'): void {
    this.activeTab = tab;
  }

  setBranchPrefix(prefix: string): void {
    this.selectedBranchPrefix = prefix;
    const branch = this.form.controls.branch.value.trim();
    if (!branch) return;

    if (branch.includes('/')) {
      const slug = branch.split('/').slice(1).join('/');
      this.form.patchValue({ branch: `${prefix}/${slug}` });
    } else {
      this.form.patchValue({ branch: `${prefix}/${branch}` });
    }
  }

  onUsAutocompleteFocus(): void {
    this.usSuggestionsOpen = true;
    this.loadUsSuggestions(this.form.controls.existingUserStoryTitle.value.trim());
  }

  onUsAutocompleteInput(): void {
    this.usSuggestionsOpen = true;
    this.loadUsSuggestions(this.form.controls.existingUserStoryTitle.value.trim());
  }

  closeUsSuggestions(): void {
    window.setTimeout(() => {
      this.usSuggestionsOpen = false;
    }, 150);
  }

  private loadUsSuggestions(query: string): void {
    this.api.searchUserStories(query).subscribe((results) => {
      this.searchResults = results;
    });
  }

  selectUserStory(us: { id: number; ref: number; subject: string }): void {
    this.form.patchValue({
      existingUserStoryRef: String(us.ref),
      existingUserStoryTitle: us.subject,
    });
    this.searchResults = [];
    this.usSuggestionsOpen = false;
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.activeTab = 'basico';
      return;
    }

    const value = this.form.getRawValue();

    if (value.mode === 'existing_us') {
      const ref = Number.parseInt(value.existingUserStoryRef, 10);
      if (!Number.isFinite(ref)) {
        this.form.controls.existingUserStoryRef.markAsTouched();
        return;
      }
      this.openExisting.emit(ref);
      return;
    }

    const existingRef = value.existingUserStoryRef
      ? Number.parseInt(value.existingUserStoryRef, 10)
      : undefined;

    let branch = value.branch.trim();
    if (branch && !branch.includes('/')) {
      branch = `${this.selectedBranchPrefix}/${branch}`;
    }

    this.generate.emit({
      mode: value.mode,
      escopo: value.escopo || undefined,
      titulo: value.titulo || undefined,
      contextoGeral: value.contextoGeral,
      objetivo: value.objetivo || undefined,
      criteriosAceite: value.criteriosAceite || undefined,
      branch: branch || undefined,
      branchPrefix: this.selectedBranchPrefix,
      tasksFromCall: value.tasksFromCall || undefined,
      enrichWithGitlab: value.enrichWithGitlab || value.mode === 'retrospective',
      gitlabBranch: value.gitlabBranch || value.branch || undefined,
      existingUserStoryRef: Number.isFinite(existingRef) ? existingRef : undefined,
    });
  }
}
