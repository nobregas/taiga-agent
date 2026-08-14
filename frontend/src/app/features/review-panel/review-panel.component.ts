import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BranchContextPreview,
  Draft,
  ProjectMeta,
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  TagCategory,
  buildUsDescription,
  defaultOpenStatusId,
  findDoneStatusId,
  findNewStatusId,
  flattenTagPlan,
  isDoneStatus,
  openTaskStatuses,
  parseUsDescription,
  tagColorFor,
} from '../../models/draft.models';

@Component({
  selector: 'app-review-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
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
  private sourceDraft: Draft | null = null;

  @Input({ required: true })
  set draft(value: Draft | null) {
    if (!value) return;

    this.sourceDraft = value;
    const defaultUsStatus = value.usStatusId ?? defaultOpenStatusId(this.meta?.userStoryStatuses ?? []);
    const defaultTaskStatus = defaultOpenStatusId(this.meta?.taskStatuses ?? []);
    const isNewUs = value.mode !== 'existing_us';
    const defaultSprintId =
      value.milestoneId ?? (isNewUs ? (this.meta?.defaultSprintId ?? null) : null);

    this.form = this.fb.nonNullable.group({
      escopo: [value.escopo, Validators.required],
      titulo: [value.titulo, Validators.required],
      usDescription: [buildUsDescription(value), Validators.required],
      usStatusId: [defaultUsStatus ?? 0],
      milestoneId: [defaultSprintId],
      gitNotes: [value.gitNotes ?? ''],
      tagPlan: this.fb.nonNullable.group({
        aplicacao: [value.tagPlan.aplicacao, Validators.required],
        escopo: [value.tagPlan.escopo, Validators.required],
        tipo: [value.tagPlan.tipo, Validators.required],
        dominio: [value.tagPlan.dominio, Validators.required],
      }),
      tasks: this.fb.array(
        value.tasks.map((task) =>
          this.fb.nonNullable.group({
            subject: [task.subject, Validators.required],
            description: [task.description ?? ''],
            statusId: [task.statusId ?? defaultTaskStatus ?? 0],
            gitlabInformed: [task.gitlabInformed ?? false],
            branchComplete: [task.branchComplete ?? false],
            inferredFrom: [task.inferredFrom ?? [] as string[]],
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

  get openTaskStatusesList() {
    return openTaskStatuses(this.taskStatuses);
  }

  get doneStatusId(): number | undefined {
    return findDoneStatusId(this.taskStatuses);
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

  isTaskGitlabInformed(index: number): boolean {
    return Boolean(this.tasks.at(index).get('gitlabInformed')?.value);
  }

  isTaskBranchComplete(index: number): boolean {
    return Boolean(this.tasks.at(index).get('branchComplete')?.value);
  }

  taskInferredFrom(index: number): string[] {
    return (this.tasks.at(index).get('inferredFrom')?.value as string[]) ?? [];
  }

  setTab(tab: 'us' | 'tasks'): void {
    this.activeTab = tab;
  }

  tagColor(category: TagCategory): string {
    const plan = this.form.get('tagPlan')?.getRawValue();
    if (!plan) return '#737373';
    return tagColorFor(plan, category, this.sourceDraft?.tagColors);
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

  addTask(): void {
    const defaultTaskStatus = defaultOpenStatusId(this.meta?.taskStatuses ?? []);
    this.tasks.push(
      this.fb.nonNullable.group({
        subject: ['', Validators.required],
        description: [''],
        statusId: [defaultTaskStatus ?? 0],
        gitlabInformed: [false],
        branchComplete: [false],
        inferredFrom: [[] as string[]],
      }),
    );
    this.activeTab = 'tasks';
  }

  removeTask(index: number): void {
    this.tasks.removeAt(index);
  }

  buildDraft(): Draft {
    const value = this.form.getRawValue();
    const tagPlan = value.tagPlan;
    const parsed = parseUsDescription(value.usDescription);

    return {
      escopo: value.escopo,
      titulo: value.titulo,
      contextoGeral: this.sourceDraft?.contextoGeral ?? parsed.contexto,
      contexto: parsed.contexto,
      objetivo: parsed.objetivo,
      criteriosAceite: parsed.criteriosAceite,
      branch: parsed.branch || this.sourceDraft?.branch || '',
      tagPlan,
      tagColors: this.sourceDraft?.tagColors ?? {},
      tags: flattenTagPlan(tagPlan),
      usStatusId: value.usStatusId,
      milestoneId: value.milestoneId,
      gitNotes: value.gitNotes || undefined,
      gitlabEnrichment: this.sourceDraft?.gitlabEnrichment,
      mode: this.sourceDraft?.mode,
      existingUserStoryId: this.sourceDraft?.existingUserStoryId,
      existingUserStoryRef: this.sourceDraft?.existingUserStoryRef,
      tasks: value.tasks.map((task: {
        subject: string;
        description?: string;
        statusId: number;
        gitlabInformed?: boolean;
        branchComplete?: boolean;
        inferredFrom?: string[];
      }) => ({
        subject: task.subject,
        description: task.description,
        statusId: task.statusId,
        gitlabInformed: task.gitlabInformed,
        branchComplete: task.branchComplete,
        inferredFrom: task.inferredFrom,
      })),
    };
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.activeTab = 'us';
      return;
    }

    this.publish.emit({ mode: 'new_us', draft: this.buildDraft() });
  }
}
