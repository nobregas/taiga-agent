import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CriteriosEditorComponent } from '../../components/criterios-editor/criterios-editor.component';
import { SelectComponent } from '../../components/select/select.component';
import { TasksBoardComponent, createTaskFormGroup } from '../tasks-board/tasks-board.component';
import {
  Draft,
  ProjectMeta,
  PublishResponse,
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
  parseUsDescription,
  resolveUserStoryStatusId,
  tagColorFor,
} from '../../models/draft.models';

@Component({
  selector: 'app-published-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectComponent,
    CriteriosEditorComponent,
    TasksBoardComponent,
  ],
  templateUrl: './published-panel.component.html',
  styleUrl: './published-panel.component.scss',
})
export class PublishedPanelComponent implements OnChanges {
  @Input() meta: ProjectMeta | null = null;
  @Input() draft: Draft | null = null;
  @Input() publishResult: PublishResponse | null = null;
  @Input() saving = false;

  @Output() save = new EventEmitter<{ draft: Draft; publishResult: PublishResponse }>();
  @Output() reset = new EventEmitter<void>();

  form!: FormGroup;
  tagCategories = TAG_CATEGORIES;
  tagCategoryLabels = TAG_CATEGORY_LABELS;
  tagColorOverrides: Record<string, string> = {};

  constructor(private readonly fb: FormBuilder) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['draft'] || changes['publishResult']) && this.draft && this.publishResult) {
      this.buildForm(this.draft, this.publishResult);
    }
  }

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

  get existingProjectTags(): string[] {
    return this.meta?.tags ?? [];
  }

  get defaultAssigneeId(): number | null {
    return this.meta?.currentUser?.id ?? null;
  }

  get mergeAssigneeId(): number | null {
    return this.meta?.mergeAssigneeId ?? null;
  }

  private buildForm(draft: Draft, result: PublishResponse): void {
    this.tagColorOverrides = { ...(draft.tagColors ?? {}) };
    const description = result.userStory.description ?? '';
    const parsed = parseUsDescription(description);
    const isEditingExisting = draft.mode === 'existing_us';
    const defaultSprintId =
      draft.milestoneId ?? (isEditingExisting ? null : (this.meta?.defaultSprintId ?? null));

    const preparedTasks = ensureDefaultFinalTasks(
      result.tasks.map((task, index) => ({
        id: task.id,
        version: task.version,
        ref: task.ref,
        url: task.url,
        subject: task.subject,
        description: task.description ?? draft.tasks[index]?.description ?? '',
        statusId: task.statusId,
        assignedTo: task.assignedTo ?? draft.tasks[index]?.assignedTo ?? this.defaultAssigneeId,
      })),
      {
        defaultAssigneeId: this.defaultAssigneeId,
        mergeAssigneeId: this.mergeAssigneeId,
      },
    );

    const defaultUsStatus = resolveUserStoryStatusId(this.usStatuses, {
      allTasksComplete: areAllTasksComplete(preparedTasks, this.taskStatuses),
      preferredId: draft.usStatusId ?? result.userStory.statusId,
    });

    this.form = this.fb.nonNullable.group({
      escopo: [draft.escopo, Validators.required],
      titulo: [draft.titulo, Validators.required],
      contexto: [parsed.contexto || draft.contexto, Validators.required],
      objetivo: [parsed.objetivo || draft.objetivo, Validators.required],
      criteriosAceite: [formatAcceptanceCriteria(parsed.criteriosAceite ?? draft.criteriosAceite)],
      branch: [parsed.branch || draft.branch, Validators.required],
      usStatusId: [defaultUsStatus ?? 0, Validators.required],
      milestoneId: [defaultSprintId],
      tagPlan: this.fb.nonNullable.group({
        aplicacao: [draft.tagPlan.aplicacao, Validators.required],
        escopo: [draft.tagPlan.escopo, Validators.required],
        tipo: [draft.tagPlan.tipo, Validators.required],
        dominio: [draft.tagPlan.dominio, Validators.required],
      }),
      tasks: this.fb.array(
        preparedTasks.map((task) =>
          createTaskFormGroup(this.fb, task, {
            defaultAssigneeId: this.defaultAssigneeId,
            mergeAssigneeId: this.mergeAssigneeId,
            published: true,
          }),
        ),
      ),
    });
  }

  tagColor(category: TagCategory): string {
    const plan = this.form.get('tagPlan')?.getRawValue();
    if (!plan) return '#737373';
    return tagColorFor(plan, category, this.tagColorOverrides, this.meta?.tagColors);
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
      ...(this.draft as Draft),
      escopo: value.escopo,
      titulo: value.titulo,
      contexto: value.contexto,
      objetivo: value.objetivo,
      criteriosAceite: formatAcceptanceCriteria(value.criteriosAceite) || null,
      branch: value.branch || this.draft?.branch || '',
      tagPlan,
      tagColors: this.tagColorOverrides,
      tags: flattenTagPlan(tagPlan),
      usStatusId: value.usStatusId,
      milestoneId: value.milestoneId,
      tasks: value.tasks.map(
        (task: { subject: string; description?: string; statusId: number; assignedTo?: number | null }) => ({
          subject: task.subject,
          description: task.description,
          statusId: task.statusId,
          assignedTo: isMergeTask(task.subject)
            ? (this.mergeAssigneeId ?? task.assignedTo ?? this.defaultAssigneeId)
            : (task.assignedTo ?? this.defaultAssigneeId),
        }),
      ),
    };
  }

  submit(): void {
    if (!this.publishResult || this.form.invalid) {
      this.form?.markAllAsTouched();
      return;
    }

    this.syncUsStatusFromTasks();
    const draft = this.buildDraft();
    const rawTasks = this.form.getRawValue().tasks as Array<{
      id?: number;
      version?: number;
      ref?: number;
      url?: string;
      subject: string;
      description?: string;
      statusId: number;
      assignedTo?: number | null;
    }>;

    this.save.emit({
      draft,
      publishResult: {
        ...this.publishResult,
        userStory: {
          ...this.publishResult.userStory,
          subject: `[${draft.escopo}] ${draft.titulo}`,
          description: undefined,
          tags: draft.tags,
          statusId: draft.usStatusId ?? this.publishResult.userStory.statusId,
        },
        tasks: rawTasks.map((task) => ({
          id: task.id || 0,
          version: task.version ?? 1,
          ref: task.ref ?? 0,
          url: task.url ?? '',
          subject: task.subject,
          description: task.description ?? '',
          statusId: task.statusId,
          assignedTo: isMergeTask(task.subject)
            ? (this.mergeAssigneeId ?? task.assignedTo ?? null)
            : (task.assignedTo ?? null),
        })),
      },
    });
  }
}
