import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CriteriosEditorComponent } from '../../components/criterios-editor/criterios-editor.component';
import { SelectComponent } from '../../components/select/select.component';
import { TasksBoardComponent, createTaskFormGroup } from '../tasks-board/tasks-board.component';
import {
  BranchContextPreview,
  Draft,
  OPTIONAL_TAG_CATEGORIES,
  ProjectMeta,
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  TagCategory,
  areAllTasksComplete,
  colorFromProject,
  ensureDefaultFinalTasks,
  findExistingTag,
  flattenTagPlan,
  formatAcceptanceCriteria,
  isMergeTask,
  resolveUserStoryStatusId,
  tagColorFor,
  toValidUserId,
} from '../../models/draft.models';

@Component({
  selector: 'app-review-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectComponent,
    CriteriosEditorComponent,
    TasksBoardComponent,
  ],
  templateUrl: './review-panel.component.html',
  styleUrl: './review-panel.component.scss',
})
export class ReviewPanelComponent {
  @Input() meta: ProjectMeta | null = null;
  @Input() publishing = false;
  @Input() branchContext: BranchContextPreview | null = null;

  @Output() publish = new EventEmitter<{ mode: 'new_us' | 'existing_us'; draft: Draft }>();
  @Output() reset = new EventEmitter<void>();
  @Output() back = new EventEmitter<void>();

  activeTab: 'us' | 'tasks' = 'us';
  form!: FormGroup;
  tagCategories = TAG_CATEGORIES;
  tagCategoryLabels = TAG_CATEGORY_LABELS;
  tagColorOverrides: Record<string, string> = {};
  private sourceDraft: Draft | null = null;
  private readonly optionalTagCategories: readonly TagCategory[] = OPTIONAL_TAG_CATEGORIES;

  @Input({ required: true })
  set draft(value: Draft | null) {
    if (!value) return;

    this.sourceDraft = value;
    this.tagColorOverrides = { ...(value.tagColors ?? {}) };
    const isNewUs = value.mode !== 'existing_us';
    const defaultSprintId = value.milestoneId ?? (isNewUs ? (this.meta?.defaultSprintId ?? null) : null);
    const preparedTasks = ensureDefaultFinalTasks(value.tasks, {
      defaultAssigneeId: this.defaultAssigneeId,
      mergeAssigneeId: this.mergeAssigneeId,
    });
    const defaultUsStatus = resolveUserStoryStatusId(this.usStatuses, {
      allTasksComplete: areAllTasksComplete(preparedTasks, this.taskStatuses),
      preferredId: value.usStatusId,
    });

    this.form = this.fb.nonNullable.group({
      escopo: [value.escopo, Validators.required],
      titulo: [value.titulo, Validators.required],
      contexto: [value.contexto, Validators.required],
      objetivo: [value.objetivo, Validators.required],
      criteriosAceite: [formatAcceptanceCriteria(value.criteriosAceite)],
      // Branch is only required when the US is marked as already implemented —
      // mirrors the conditional validator in draft-form.component.ts.
      branch: [value.branch, this.isBranchRequired ? Validators.required : []],
      usStatusId: [defaultUsStatus ?? 0],
      milestoneId: [defaultSprintId],
      gitNotes: [value.gitNotes ?? ''],
      tagPlan: this.fb.nonNullable.group({
        aplicacao: [value.tagPlan.aplicacao, Validators.required],
        escopo: [value.tagPlan.escopo, Validators.required],
        tipo: [value.tagPlan.tipo, Validators.required],
        // Dominio is the only optional tag category — it can be cleared via the UI.
        dominio: [value.tagPlan.dominio],
      }),
      tasks: this.fb.array(
        preparedTasks.map((task) =>
          createTaskFormGroup(this.fb, task, {
            defaultAssigneeId: this.defaultAssigneeId,
            mergeAssigneeId: this.mergeAssigneeId,
          }),
        ),
      ),
    });
  }

  constructor(private readonly fb: FormBuilder) {}

  get tasks(): FormArray {
    return this.form.get('tasks') as FormArray;
  }

  get computedSubject(): string {
    const { escopo, titulo } = this.form.getRawValue();
    return `[${escopo}] ${titulo}`;
  }

  get usStatuses() {
    return this.meta?.userStoryStatuses ?? [];
  }

  get taskStatuses() {
    return this.meta?.taskStatuses ?? [];
  }

  get sprints() {
    return this.meta?.sprints ?? [];
  }

  get sprintOptions() {
    return [
      { value: null, label: 'Sem sprint' },
      ...this.sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
    ];
  }

  get gitlabEnrichment() {
    return this.sourceDraft?.gitlabEnrichment ?? null;
  }

  get gitlabInformedTaskCount(): number {
    return this.tasks.controls.filter((task) => task.get('gitlabInformed')?.value).length;
  }

  get gitlabCompleteTaskCount(): number {
    return this.tasks.controls.filter((task) => task.get('branchComplete')?.value).length;
  }

  get gitlabPendingTaskCount(): number {
    return this.tasks.controls.filter(
      (task) => task.get('gitlabInformed')?.value && !task.get('branchComplete')?.value,
    ).length;
  }

  get existingProjectTags(): string[] {
    return this.meta?.tags ?? [];
  }

  get isImplemented(): boolean {
    return this.sourceDraft?.implemented !== false;
  }

  get isBranchRequired(): boolean {
    return this.isImplemented;
  }

  get defaultAssigneeId(): number | null {
    return toValidUserId(this.meta?.currentUser?.id);
  }

  get mergeAssigneeId(): number | null {
    return toValidUserId(this.meta?.mergeAssigneeId);
  }

  setTab(tab: 'us' | 'tasks'): void {
    this.activeTab = tab;
  }

  tagColor(category: TagCategory): string {
    const plan = this.form.get('tagPlan')?.getRawValue();
    if (!plan) return '#737373';
    return tagColorFor(plan, category, this.tagColorOverrides, this.meta?.tagColors);
  }

  isTagOptional(category: TagCategory): boolean {
    return this.optionalTagCategories.includes(category);
  }

  isTagClearable(category: TagCategory): boolean {
    return this.isTagOptional(category) && Boolean(this.form.get('tagPlan')?.get(category)?.value?.trim());
  }

  clearTag(category: TagCategory): void {
    if (!this.isTagOptional(category)) {
      return;
    }
    this.form.get('tagPlan')?.get(category)?.setValue('');
  }

  onTagNameChange(category: TagCategory): void {
    const raw = String(this.form.get('tagPlan')?.get(category)?.value ?? '').trim();
    const existingName = findExistingTag(raw, this.existingProjectTags);
    if (existingName && existingName !== raw) {
      this.form.get('tagPlan')?.get(category)?.setValue(existingName, { emitEvent: false });
    }

    const name = (existingName ?? raw).toLowerCase();
    if (!name) {
      return;
    }

    const existingColor = colorFromProject(name, this.meta?.tagColors);
    if (existingColor && !this.tagColorOverrides[name]) {
      this.tagColorOverrides = { ...this.tagColorOverrides, [name]: existingColor };
    }
  }

  onTagColorChange(category: TagCategory, event: Event): void {
    const name = String(this.form.get('tagPlan')?.get(category)?.value ?? '')
      .trim()
      .toLowerCase();
    if (!name) {
      return;
    }

    this.tagColorOverrides = {
      ...this.tagColorOverrides,
      [name]: (event.target as HTMLInputElement).value,
    };
  }

  setUsStatus(statusId: number): void {
    this.form.patchValue({ usStatusId: statusId });
  }

  syncUsStatusFromTasks(): void {
    if (!this.form) {
      return;
    }

    const next = resolveUserStoryStatusId(this.usStatuses, {
      allTasksComplete: areAllTasksComplete(this.tasks.getRawValue(), this.taskStatuses),
      preferredId: this.form.get('usStatusId')?.value,
    });

    if (next && next !== this.form.get('usStatusId')?.value) {
      this.form.patchValue({ usStatusId: next });
    }
  }

  buildDraft(): Draft {
    const value = this.form.getRawValue();
    const tagPlan = value.tagPlan;

    return {
      escopo: value.escopo,
      titulo: value.titulo,
      contextoGeral: this.sourceDraft?.contextoGeral ?? value.contexto,
      contexto: value.contexto,
      objetivo: value.objetivo,
      criteriosAceite: formatAcceptanceCriteria(value.criteriosAceite) || null,
      branch: value.branch || this.sourceDraft?.branch || '',
      tagPlan,
      tagColors: this.tagColorOverrides,
      tags: flattenTagPlan(tagPlan),
      usStatusId: value.usStatusId,
      milestoneId: value.milestoneId,
      gitNotes: value.gitNotes || undefined,
      gitlabEnrichment: this.sourceDraft?.gitlabEnrichment,
      mode: this.sourceDraft?.mode,
      implemented: this.sourceDraft?.implemented,
      existingUserStoryId: this.sourceDraft?.existingUserStoryId,
      existingUserStoryRef: this.sourceDraft?.existingUserStoryRef,
      tasks: value.tasks.map(
        (task: {
          subject: string;
          description?: string;
          statusId: number;
          assignedTo?: number | null;
          gitlabInformed?: boolean;
          branchComplete?: boolean;
          inferredFrom?: string[];
        }) => ({
          subject: task.subject,
          description: task.description,
          statusId: task.statusId,
          assignedTo: isMergeTask(task.subject)
            ? (this.mergeAssigneeId ?? toValidUserId(task.assignedTo) ?? this.defaultAssigneeId)
            : (toValidUserId(task.assignedTo) ?? this.defaultAssigneeId),
          gitlabInformed: task.gitlabInformed,
          branchComplete: task.branchComplete,
          inferredFrom: task.inferredFrom,
        }),
      ),
    };
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.activeTab = 'us';
      return;
    }

    this.syncUsStatusFromTasks();
    this.publish.emit({ mode: 'new_us', draft: this.buildDraft() });
  }
}
