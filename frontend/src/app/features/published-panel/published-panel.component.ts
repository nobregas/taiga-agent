import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Draft,
  ProjectMeta,
  PublishResponse,
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  TagCategory,
  buildUsDescription,
  colorFromProject,
  defaultOpenStatusId,
  findDoneStatusId,
  findExistingTag,
  findNewStatusId,
  flattenTagPlan,
  isDoneStatus,
  openTaskStatuses,
  parseUsDescription,
  tagColorFor,
} from '../../models/draft.models';

@Component({
  selector: 'app-published-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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

  get openTaskStatusesList() {
    return openTaskStatuses(this.taskStatuses);
  }

  get doneStatusId(): number | undefined {
    return findDoneStatusId(this.taskStatuses);
  }

  private buildForm(draft: Draft, result: PublishResponse): void {
    this.tagColorOverrides = { ...(draft.tagColors ?? {}) };
    const defaultUsStatus = draft.usStatusId ?? result.userStory.statusId ?? defaultOpenStatusId(this.usStatuses);
    const description = result.userStory.description ?? buildUsDescription(draft);
    const isEditingExisting = draft.mode === 'existing_us';
    const defaultSprintId =
      draft.milestoneId ?? (isEditingExisting ? null : (this.meta?.defaultSprintId ?? null));

    this.form = this.fb.nonNullable.group({
      escopo: [draft.escopo, Validators.required],
      titulo: [draft.titulo, Validators.required],
      usDescription: [description, Validators.required],
      usStatusId: [defaultUsStatus ?? 0, Validators.required],
      milestoneId: [defaultSprintId],
      tagPlan: this.fb.nonNullable.group({
        aplicacao: [draft.tagPlan.aplicacao, Validators.required],
        escopo: [draft.tagPlan.escopo, Validators.required],
        tipo: [draft.tagPlan.tipo, Validators.required],
        dominio: [draft.tagPlan.dominio, Validators.required],
      }),
      tasks: this.fb.array(
        result.tasks.map((task, index) =>
          this.fb.nonNullable.group({
            id: [task.id],
            version: [task.version],
            ref: [task.ref],
            url: [task.url],
            subject: [task.subject, Validators.required],
            description: [task.description ?? draft.tasks[index]?.description ?? ''],
            statusId: [task.statusId, Validators.required],
          }),
        ),
      ),
    });
  }

  get existingProjectTags(): string[] {
    return this.meta?.tags ?? [];
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

  setTaskStatus(index: number, statusId: number): void {
    this.tasks.at(index).patchValue({ statusId });
  }

  isTaskDone(index: number): boolean {
    const statusId = this.tasks.at(index).get('statusId')?.value as number;
    return isDoneStatus(statusId, this.taskStatuses);
  }

  toggleTaskDone(index: number): void {
    const doneId = this.doneStatusId;
    if (!doneId) return;

    if (this.isTaskDone(index)) {
      const reopenId = defaultOpenStatusId(this.taskStatuses) ?? this.openTaskStatusesList[0]?.id;
      if (reopenId) this.setTaskStatus(index, reopenId);
      return;
    }

    this.setTaskStatus(index, doneId);
  }

  markAllTasksDone(): void {
    const doneId = this.doneStatusId;
    if (!doneId) return;

    this.tasks.controls.forEach((_, index) => this.setTaskStatus(index, doneId));
  }

  markAllTasksNew(): void {
    const newId = findNewStatusId(this.taskStatuses);
    if (!newId) return;

    this.tasks.controls.forEach((_, index) => this.setTaskStatus(index, newId));
  }

  get allTasksDone(): boolean {
    if (!this.tasks.length) return false;
    return this.tasks.controls.every((_, index) => this.isTaskDone(index));
  }

  toggleAllTasksDone(): void {
    if (this.allTasksDone) {
      this.markAllTasksNew();
      return;
    }

    this.markAllTasksDone();
  }

  buildDraft(): Draft {
    const value = this.form.getRawValue();
    const tagPlan = value.tagPlan;
    const parsed = parseUsDescription(value.usDescription);

    return {
      ...(this.draft as Draft),
      escopo: value.escopo,
      titulo: value.titulo,
      contexto: parsed.contexto,
      objetivo: parsed.objetivo,
      criteriosAceite: parsed.criteriosAceite,
      branch: parsed.branch || this.draft?.branch || '',
      tagPlan,
      tagColors: this.tagColorOverrides,
      tags: flattenTagPlan(tagPlan),
      usStatusId: value.usStatusId,
      milestoneId: value.milestoneId,
      tasks: value.tasks.map((task: { subject: string; description?: string; statusId: number }) => ({
        subject: task.subject,
        description: task.description,
        statusId: task.statusId,
      })),
    };
  }

  submit(): void {
    if (!this.publishResult || this.form.invalid) {
      this.form?.markAllAsTouched();
      return;
    }

    const draft = this.buildDraft();
    const rawTasks = this.form.getRawValue().tasks;

    this.save.emit({
      draft,
      publishResult: {
        ...this.publishResult,
        userStory: {
          ...this.publishResult.userStory,
          subject: `[${draft.escopo}] ${draft.titulo}`,
          description: this.form.getRawValue().usDescription,
          tags: draft.tags,
          statusId: draft.usStatusId ?? this.publishResult.userStory.statusId,
        },
        tasks: this.publishResult.tasks.map((task, index) => ({
          ...task,
          subject: rawTasks[index].subject,
          description: rawTasks[index].description ?? '',
          statusId: rawTasks[index].statusId,
        })),
      },
    });
  }
}
