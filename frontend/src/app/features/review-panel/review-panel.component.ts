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
  TaskDraft,
  TaigaUser,
  buildUsDescription,
  colorFromProject,
  defaultOpenStatusId,
  ensureDefaultFinalTasks,
  findDoneStatusId,
  findExistingTag,
  findNewStatusId,
  flattenTagPlan,
  isDoneStatus,
  isMergeTask,
  isSubirPrTask,
  memberDisplayName,
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
  tagColorOverrides: Record<string, string> = {};
  bulkAssigneeId: number | null = null;
  newTaskSubject = '';
  private sourceDraft: Draft | null = null;

  @Input({ required: true })
  set draft(value: Draft | null) {
    if (!value) return;

    this.sourceDraft = value;
    this.tagColorOverrides = { ...(value.tagColors ?? {}) };
    const defaultUsStatus = value.usStatusId ?? defaultOpenStatusId(this.meta?.userStoryStatuses ?? []);
    const defaultTaskStatus = defaultOpenStatusId(this.meta?.taskStatuses ?? []);
    const isNewUs = value.mode !== 'existing_us';
    const defaultSprintId =
      value.milestoneId ?? (isNewUs ? (this.meta?.defaultSprintId ?? null) : null);

    const defaultAssigneeId = this.defaultAssigneeId;
    const preparedTasks = ensureDefaultFinalTasks(value.tasks, {
      defaultAssigneeId,
      mergeAssigneeId: this.mergeAssigneeId,
    });

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
      tasks: this.fb.array(preparedTasks.map((task) => this.buildTaskGroup(task, defaultTaskStatus))),
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

  addTask(subject = this.newTaskSubject): void {
    const defaultTaskStatus = defaultOpenStatusId(this.meta?.taskStatuses ?? []);
    const trimmed = subject.trim();
    this.tasks.push(
      this.buildTaskGroup(
        {
          subject: trimmed,
          description: '',
          assignedTo: isMergeTask(trimmed) ? this.mergeAssigneeId ?? this.defaultAssigneeId : this.defaultAssigneeId,
        },
        defaultTaskStatus,
      ),
    );
    this.newTaskSubject = '';
    this.reorderFinalTasks();
    this.activeTab = 'tasks';
  }

  addTaskFromInput(): void {
    this.addTask(this.newTaskSubject);
  }

  removeTask(index: number): void {
    this.tasks.removeAt(index);
  }

  restoreFinalTasks(): void {
    this.reorderFinalTasks(true);
  }

  get defaultAssigneeId(): number | null {
    return this.meta?.currentUser?.id ?? null;
  }

  get mergeAssigneeId(): number | null {
    return this.meta?.mergeAssigneeId ?? null;
  }

  get members() {
    const members = [...(this.meta?.members ?? [])];
    const current = this.meta?.currentUser;
    if (current && !members.some((member) => member.id === current.id)) {
      members.unshift(current);
    }
    return members;
  }

  get mergeAssigneeLocked(): boolean {
    return this.mergeAssigneeId != null;
  }

  get missingFinalTasks(): boolean {
    if (!this.form) return false;
    const subjects = this.tasks.controls.map((task) => String(task.get('subject')?.value ?? ''));
    return !subjects.some(isSubirPrTask) || !subjects.some(isMergeTask);
  }

  get bulkAssignee() {
    return this.members.find((member) => member.id === this.bulkAssigneeId) ?? null;
  }

  memberName(userId: number | null | undefined): string {
    if (userId == null) {
      return 'Sem responsavel';
    }
    const member = this.members.find((item) => item.id === userId);
    return memberDisplayName(member) || `#${userId}`;
  }

  memberDisplay(member: TaigaUser): string {
    return memberDisplayName(member);
  }

  memberInitials(member: TaigaUser): string {
    const name = memberDisplayName(member);
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  isMergeAssigneeLocked(index: number): boolean {
    return this.mergeAssigneeLocked && this.isMergeTaskAt(index);
  }

  isMergeTaskAt(index: number): boolean {
    return isMergeTask(String(this.tasks.at(index).get('subject')?.value ?? ''));
  }

  isTaskAssignedToBulk(index: number): boolean {
    return this.bulkAssigneeId != null && this.tasks.at(index).get('assignedTo')?.value === this.bulkAssigneeId;
  }

  toggleBulkAssignee(userId: number): void {
    this.bulkAssigneeId = this.bulkAssigneeId === userId ? null : userId;
  }

  clearBulkAssignee(): void {
    this.bulkAssigneeId = null;
  }

  onTaskCardClick(index: number, event: MouseEvent): void {
    if (this.bulkAssigneeId == null) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, label')) {
      return;
    }

    this.assignTask(index, this.bulkAssigneeId);
  }

  assignTask(index: number, userId: number | null): void {
    if (this.isMergeAssigneeLocked(index)) {
      this.tasks.at(index).patchValue({ assignedTo: this.mergeAssigneeId });
      return;
    }

    this.tasks.at(index).patchValue({ assignedTo: userId });
  }

  onAssigneeChange(index: number): void {
    if (this.isMergeAssigneeLocked(index)) {
      this.tasks.at(index).patchValue({ assignedTo: this.mergeAssigneeId });
    }
  }

  onTaskSubjectChange(index: number): void {
    const assignedTo = this.tasks.at(index).get('assignedTo');
    if (this.isMergeAssigneeLocked(index)) {
      assignedTo?.patchValue(this.mergeAssigneeId, { emitEvent: false });
      assignedTo?.disable({ emitEvent: false });
      return;
    }

    assignedTo?.enable({ emitEvent: false });
  }

  private buildTaskGroup(task: TaskDraft, defaultTaskStatus?: number) {
    const assignedTo = isMergeTask(task.subject)
      ? (this.mergeAssigneeId ?? task.assignedTo ?? this.defaultAssigneeId)
      : (task.assignedTo ?? this.defaultAssigneeId);

    const assignedToControl = this.fb.control<number | null>(assignedTo);
    if (isMergeTask(task.subject) && this.mergeAssigneeLocked) {
      assignedToControl.disable({ emitEvent: false });
    }

    return this.fb.nonNullable.group({
      subject: [task.subject, Validators.required],
      description: [task.description ?? ''],
      statusId: [task.statusId ?? defaultTaskStatus ?? 0],
      assignedTo: assignedToControl,
      gitlabInformed: [task.gitlabInformed ?? false],
      branchComplete: [task.branchComplete ?? false],
      inferredFrom: [task.inferredFrom ?? ([] as string[])],
    });
  }

  private reorderFinalTasks(force = false): void {
    const defaultTaskStatus = defaultOpenStatusId(this.meta?.taskStatuses ?? []);
    const current = this.tasks.getRawValue() as TaskDraft[];
    if (!force && !current.length) {
      return;
    }

    const next = ensureDefaultFinalTasks(current, {
      defaultAssigneeId: this.defaultAssigneeId,
      mergeAssigneeId: this.mergeAssigneeId,
    });

    this.tasks.clear();
    next.forEach((task) => this.tasks.push(this.buildTaskGroup(task, defaultTaskStatus)));
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
      tagColors: this.tagColorOverrides,
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
        assignedTo?: number | null;
        gitlabInformed?: boolean;
        branchComplete?: boolean;
        inferredFrom?: string[];
      }) => ({
        subject: task.subject,
        description: task.description,
        statusId: task.statusId,
        assignedTo: isMergeTask(task.subject)
          ? (this.mergeAssigneeId ?? task.assignedTo ?? this.defaultAssigneeId)
          : (task.assignedTo ?? this.defaultAssigneeId),
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
