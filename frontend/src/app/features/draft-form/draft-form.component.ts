import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs/operators';
import { CriteriosEditorComponent } from '../../components/criterios-editor/criterios-editor.component';
import { SelectComponent } from '../../components/select/select.component';
import { ApiService } from '../../services/api.service';
import { ToastService } from '../../services/toast.service';
import {
  BRANCH_PREFIXES,
  GenerationMode,
  GenerateRequest,
  ProjectMeta,
  UserStorySearchResult,
} from '../../models/draft.models';

@Component({
  selector: 'app-draft-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SelectComponent, CriteriosEditorComponent],
  templateUrl: './draft-form.component.html',
  styleUrl: './draft-form.component.scss',
})
export class DraftFormComponent implements OnInit, OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly branchSearch$ = new Subject<{ query: string; codebaseId?: number | null }>();
  private readonly usSearch$ = new Subject<string>();

  @Input() meta: ProjectMeta | null = null;
  @Input() loading = false;
  @Output() generate = new EventEmitter<GenerateRequest>();
  @Output() openExisting = new EventEmitter<number>();
  @Output() createManual = new EventEmitter<GenerateRequest>();

  activeTab: 'basico' | 'detalhes' = 'basico';
  searchResults: UserStorySearchResult[] = [];
  usSuggestionsOpen = false;
  usSearchQuery = '';
  usSearchError = '';
  branchResults: string[] = [];
  branchSuggestionsField: 'branch' | 'compareBase' | null = null;
  selectedBranchPrefix = 'feat';
  readonly branchPrefixes = BRANCH_PREFIXES;

  readonly modes: Array<{ value: GenerationMode; label: string; hint: string }> = [
    { value: 'new_us', label: 'Nova US', hint: 'Planejamento antes de codar' },
    { value: 'existing_us', label: 'US existente', hint: 'Editar US aberta no Taiga' },
  ];

  form = this.fb.nonNullable.group({
    mode: ['new_us' as GenerationMode, Validators.required],
    codebaseId: [null as number | null],
    escopo: ['', Validators.required],
    titulo: ['', Validators.required],
    contextoGeral: ['', Validators.required],
    objetivo: [''],
    criteriosAceite: [''],
    branch: [''],
    gitlabCompareBase: ['develop'],
    tasksFromCall: [''],
    existingUserStoryRef: [''],
    existingUserStoryTitle: [''],
  });

  private metaDefaultsApplied = false;

  ngOnInit(): void {
    this.applyModeValidators(this.form.controls.mode.value);
    this.form.controls.mode.valueChanges.subscribe((mode) => this.applyModeValidators(mode));
    this.form.controls.codebaseId.valueChanges.subscribe(() => {
      this.branchResults = [];
      this.applyCodebaseDefaults();
    });

    this.branchSearch$
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => a.query === b.query && a.codebaseId === b.codebaseId),
        switchMap(({ query, codebaseId }) => this.api.searchGitlabBranches(query, codebaseId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.branchResults = results;
      });

    this.usSearch$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.searchUserStories(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.searchResults = results;
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['meta'] && this.meta) {
      const workspaceChanged =
        changes['meta'].previousValue?.workspaceId !== changes['meta'].currentValue?.workspaceId;

      if (!this.metaDefaultsApplied || workspaceChanged) {
        this.form.patchValue(
          {
            codebaseId: this.meta.defaultCodebaseId,
            gitlabCompareBase: this.meta.defaultGitlabBaseBranch ?? 'develop',
          },
          { emitEvent: false },
        );
        this.metaDefaultsApplied = true;
      }
    }
  }

  get isExistingUsMode(): boolean {
    return this.form.controls.mode.value === 'existing_us';
  }

  get selectedCodebase() {
    const codebaseId = this.form.controls.codebaseId.value;
    return this.meta?.codebases.find((item) => item.id === codebaseId) ?? null;
  }

  get gitlabConfigured(): boolean {
    const codebase = this.selectedCodebase;
    if (codebase) {
      return Boolean(codebase.hasGitlabToken && codebase.gitlabProjectId);
    }
    return Boolean(this.meta?.gitlabConfigured);
  }

  get codebaseOptions() {
    const codebases = this.meta?.codebases ?? [];
    if (!codebases.length) {
      return [{ value: null, label: 'Nenhum repositorio cadastrado' }];
    }
    return codebases.map((codebase) => ({ value: codebase.id, label: codebase.name }));
  }

  get submitLabel(): string {
    if (this.loading) {
      return this.isExistingUsMode ? 'Abrindo...' : 'Gerando...';
    }
    return this.isExistingUsMode ? 'Abrir US' : 'Gerar draft';
  }

  private applyCodebaseDefaults(): void {
    const codebase = this.selectedCodebase;
    if (codebase?.gitlabDefaultBase) {
      this.form.patchValue({ gitlabCompareBase: codebase.gitlabDefaultBase }, { emitEvent: false });
    }
  }

  private applyModeValidators(mode: GenerationMode): void {
    if (mode === 'existing_us') {
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
    const codebaseScopes = this.selectedCodebase?.validScopes;
    if (codebaseScopes?.length) {
      return codebaseScopes;
    }

    return this.meta?.validScopes?.length
      ? this.meta.validScopes
      : ['App', 'Backend', 'Portal', 'Pedido', 'Checkout'];
  }

  setTab(tab: 'basico' | 'detalhes'): void {
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
    this.queueUsSuggestions(this.form.controls.existingUserStoryTitle.value.trim());
  }

  onUsAutocompleteInput(): void {
    this.usSuggestionsOpen = true;
    this.queueUsSuggestions(this.form.controls.existingUserStoryTitle.value.trim());
  }

  closeUsSuggestions(): void {
    window.setTimeout(() => {
      this.usSuggestionsOpen = false;
    }, 150);
  }

  private queueUsSuggestions(query: string): void {
    this.usSearchQuery = query.trim();
    this.usSearchError = '';
    if (!this.usSearchQuery) {
      this.searchResults = [];
    }
    this.usSearch$.next(this.usSearchQuery);
  }

  private searchUserStories(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      this.usSearchError = '';
      return of([] as UserStorySearchResult[]);
    }

    return this.api.searchUserStories(trimmed).pipe(
      tap(() => {
        this.usSearchError = '';
      }),
      catchError((err) => {
        this.usSearchError = err?.error?.error ?? 'Falha ao buscar user stories no Taiga.';
        this.toast.show(this.usSearchError);
        return of([] as UserStorySearchResult[]);
      }),
    );
  }

  selectUserStory(us: UserStorySearchResult): void {
    this.form.patchValue({
      existingUserStoryRef: String(us.ref),
      existingUserStoryTitle: us.subject,
    });
    this.searchResults = [];
    this.usSuggestionsOpen = false;
  }

  onBranchAutocompleteFocus(field: 'branch' | 'compareBase'): void {
    if (!this.gitlabConfigured) return;

    this.branchSuggestionsField = field;
    const query =
      field === 'compareBase'
        ? this.form.controls.gitlabCompareBase.value.trim()
        : this.form.controls.branch.value.trim();
    this.fetchBranchSuggestionsNow(query);
  }

  onBranchAutocompleteInput(field: 'branch' | 'compareBase'): void {
    if (!this.gitlabConfigured) return;

    this.branchSuggestionsField = field;
    const query =
      field === 'compareBase'
        ? this.form.controls.gitlabCompareBase.value.trim()
        : this.form.controls.branch.value.trim();
    this.queueBranchSuggestions(query);
  }

  closeBranchSuggestions(): void {
    window.setTimeout(() => {
      this.branchSuggestionsField = null;
    }, 150);
  }

  private queueBranchSuggestions(query: string): void {
    this.branchSearch$.next({
      query,
      codebaseId: this.form.controls.codebaseId.value,
    });
  }

  private fetchBranchSuggestionsNow(query: string): void {
    this.api.searchGitlabBranches(query, this.form.controls.codebaseId.value).subscribe((results) => {
      this.branchResults = results;
    });
  }

  selectBranch(branch: string, field: 'branch' | 'compareBase'): void {
    if (field === 'compareBase') {
      this.form.patchValue({ gitlabCompareBase: branch });
    } else {
      this.form.patchValue({ branch });
      const slashIndex = branch.indexOf('/');
      if (slashIndex > 0) {
        const prefix = branch.slice(0, slashIndex);
        if ((this.branchPrefixes as readonly string[]).includes(prefix)) {
          this.selectedBranchPrefix = prefix;
        }
      }
    }

    this.branchResults = [];
    this.branchSuggestionsField = null;
  }

  emitManual(): void {
    this.createManual.emit(this.buildGenerateRequest());
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

    this.generate.emit(this.buildGenerateRequest());
  }

  private buildGenerateRequest(): GenerateRequest {
    const value = this.form.getRawValue();
    const existingRef = value.existingUserStoryRef
      ? Number.parseInt(value.existingUserStoryRef, 10)
      : undefined;

    let branch = value.branch.trim();
    if (branch && !this.gitlabConfigured && !branch.includes('/')) {
      branch = `${this.selectedBranchPrefix}/${branch}`;
    }

    const enrichWithGitlab = this.gitlabConfigured && Boolean(branch);
    const codebase = this.selectedCodebase;

    return {
      mode: value.mode === 'existing_us' ? 'new_us' : value.mode,
      escopo: value.escopo || undefined,
      titulo: value.titulo || undefined,
      contextoGeral: value.contextoGeral,
      objetivo: value.objetivo || undefined,
      criteriosAceite: value.criteriosAceite || undefined,
      branch: branch || undefined,
      branchPrefix: this.selectedBranchPrefix,
      tasksFromCall: value.tasksFromCall || undefined,
      enrichWithGitlab,
      gitlabBranch: enrichWithGitlab ? branch : undefined,
      gitlabCompareBase: enrichWithGitlab ? value.gitlabCompareBase.trim() || 'develop' : undefined,
      existingUserStoryRef: Number.isFinite(existingRef) ? existingRef : undefined,
      codebaseId: value.codebaseId ?? undefined,
      repositoryName: codebase?.name,
    };
  }
}
