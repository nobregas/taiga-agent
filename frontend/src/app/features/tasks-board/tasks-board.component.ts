import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectComponent } from '../../components/select/select.component';
import {
  ProjectMeta,
  TaskDraft,
  TaigaUser,
  defaultOpenStatusId,
  ensureDefaultFinalTasks,
  findDoneStatusId,
  findNewStatusId,
  isDoneStatus,
  isMergeTask,
  isSubirPrTask,
  memberDisplayName,
  openTaskStatuses,
} from '../../models/draft.models';

export interface PublishedTaskFields {
  id?: number;
  version?: number;
  ref?: number;
  url?: string;
}

@Component({
  selector: 'app-tasks-board',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SelectComponent],
  templateUrl: './tasks-board.component.html',
  styleUrl: './tasks-board.component.scss',
})
export class TasksBoardComponent {
  @Input({ required: true }) tasks!: FormArray;
  @Input() meta: ProjectMeta | null = null;
  @Input() variant: 'review' | 'published' = 'review';
  @Output() tasksChanged = new EventEmitter<void>();

  @ViewChild('bulkDialog') bulkDialog?: ElementRef<HTMLElement>;

  bulkModalOpen = false;
  bulkAssigneeId: number | null = null;
  bulkSelectedIndexes: number[] = [];
  newTaskSubject = '';

  private previousFocus: HTMLElement | null = null;

  constructor(private readonly fb: FormBuilder) {}

  get taskStatuses() {
    return this.meta?.taskStatuses ?? [];
  }

  get openTaskStatusesList() {
    return openTaskStatuses(this.taskStatuses);
  }

  get doneStatusId(): number | undefined {
    return findDoneStatusId(this.taskStatuses);
  }

  get defaultAssigneeId(): number | null {
    return this.meta?.currentUser?.id ?? null;
  }

  get mergeAssigneeId(): number | null {
    return this.meta?.mergeAssigneeId ?? null;
  }

  get mergeAssigneeLocked(): boolean {
    return this.mergeAssigneeId != null;
  }

  get members(): TaigaUser[] {
    const members = [...(this.meta?.members ?? [])];
    const current = this.meta?.currentUser;
    if (current && !members.some((member) => member.id === current.id)) {
      members.unshift(current);
    }
    return members;
  }

  get assigneeOptions() {
    return [
      { value: null, label: 'Sem responsavel' },
      ...this.members.map((member) => ({ value: member.id, label: memberDisplayName(member) })),
    ];
  }

  get canConfirmBulk(): boolean {
    return this.bulkModalOpen && this.bulkAssigneeId != null && this.bulkSelectedIndexes.length > 0;
  }

  get missingFinalTasks(): boolean {
    const subjects = this.tasks.controls.map((task) => String(task.get('subject')?.value ?? ''));
    return !subjects.some(isSubirPrTask) || !subjects.some(isMergeTask);
  }

  get allTasksDone(): boolean {
    if (!this.tasks.length) return false;
    return this.tasks.controls.every((_, index) => this.isTaskDone(index));
  }

  asGroup(control: AbstractControl): FormGroup {
    return control as FormGroup;
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

  isTaskGitlabInformed(index: number): boolean {
    return Boolean(this.tasks.at(index).get('gitlabInformed')?.value);
  }

  isTaskBranchComplete(index: number): boolean {
    return Boolean(this.tasks.at(index).get('branchComplete')?.value);
  }

  taskInferredFrom(index: number): string[] {
    return (this.tasks.at(index).get('inferredFrom')?.value as string[]) ?? [];
  }

  isTaskDone(index: number): boolean {
    const statusId = this.tasks.at(index).get('statusId')?.value as number;
    return isDoneStatus(statusId, this.taskStatuses);
  }

  isMergeTaskAt(index: number): boolean {
    return isMergeTask(String(this.tasks.at(index).get('subject')?.value ?? ''));
  }

  isMergeAssigneeLocked(index: number): boolean {
    return this.mergeAssigneeLocked && this.isMergeTaskAt(index);
  }

  isTaskBulkSelected(index: number): boolean {
    return this.bulkSelectedIndexes.includes(index);
  }

  canRemove(index: number): boolean {
    if (this.variant !== 'published') {
      return true;
    }
    const id = this.tasks.at(index).get('id')?.value as number | undefined;
    return !id;
  }

  setTaskStatus(index: number, statusId: number): void {
    this.tasks.at(index).patchValue({ statusId });
    this.tasksChanged.emit();
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

  toggleAllTasksDone(): void {
    if (this.allTasksDone) {
      this.markAllTasksNew();
      return;
    }
    this.markAllTasksDone();
  }

  taskTitle(index: number): string {
    if (this.variant === 'published') {
      const ref = this.tasks.at(index).get('ref')?.value as number | undefined;
      if (ref) {
        return `Task #${ref}`;
      }
    }
    return `Task ${index + 1}`;
  }

  taskSubject(index: number): string {
    return String(this.tasks.at(index).get('subject')?.value ?? '');
  }

  openBulkModal(): void {
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.bulkModalOpen = true;
    this.bulkAssigneeId = null;
    this.bulkSelectedIndexes = [];
    queueMicrotask(() => {
      window.setTimeout(() => this.bulkDialog?.nativeElement.focus(), 0);
    });
  }

  closeBulkModal(): void {
    this.bulkModalOpen = false;
    this.bulkAssigneeId = null;
    this.bulkSelectedIndexes = [];
    queueMicrotask(() => this.previousFocus?.focus());
  }

  selectBulkAssignee(userId: number): void {
    this.bulkAssigneeId = this.bulkAssigneeId === userId ? null : userId;
  }

  toggleBulkTask(index: number): void {
    if (this.isMergeAssigneeLocked(index)) {
      return;
    }

    if (this.bulkSelectedIndexes.includes(index)) {
      this.bulkSelectedIndexes = this.bulkSelectedIndexes.filter((item) => item !== index);
      return;
    }

    this.bulkSelectedIndexes = [...this.bulkSelectedIndexes, index];
  }

  confirmBulkAssign(): void {
    if (!this.canConfirmBulk || this.bulkAssigneeId == null) {
      return;
    }

    for (const index of this.bulkSelectedIndexes) {
      this.assignTask(index, this.bulkAssigneeId);
    }

    this.closeBulkModal();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.bulkModalOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeBulkModal();
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    const root = this.bulkDialog?.nativeElement;
    if (!root) {
      return;
    }

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

  assignTask(index: number, userId: number | null): void {
    if (this.isMergeAssigneeLocked(index)) {
      this.tasks.at(index).patchValue({ assignedTo: this.mergeAssigneeId });
      this.tasksChanged.emit();
      return;
    }

    this.tasks.at(index).patchValue({ assignedTo: userId });
    this.tasksChanged.emit();
  }

  onAssigneeChange(index: number, userId: string | number | null): void {
    const assignedTo = typeof userId === 'number' || userId == null ? userId : Number(userId);
    this.assignTask(index, Number.isNaN(assignedTo as number) ? null : (assignedTo as number | null));
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

  addTask(subject = this.newTaskSubject): void {
    const trimmed = subject.trim();
    this.tasks.push(
      createTaskFormGroup(
        this.fb,
        {
          subject: trimmed,
          description: '',
          assignedTo: isMergeTask(trimmed) ? this.mergeAssigneeId ?? this.defaultAssigneeId : this.defaultAssigneeId,
        },
        {
          defaultTaskStatus: defaultOpenStatusId(this.taskStatuses),
          defaultAssigneeId: this.defaultAssigneeId,
          mergeAssigneeId: this.mergeAssigneeId,
          published: this.variant === 'published',
        },
      ),
    );
    this.newTaskSubject = '';
    this.reorderFinalTasks();
    this.tasksChanged.emit();
  }

  addTaskFromInput(): void {
    this.addTask(this.newTaskSubject);
  }

  removeTask(index: number): void {
    if (!this.canRemove(index)) {
      return;
    }
    this.tasks.removeAt(index);
    this.tasksChanged.emit();
  }

  restoreFinalTasks(): void {
    this.reorderFinalTasks(true);
    this.tasksChanged.emit();
  }

  private reorderFinalTasks(force = false): void {
    const current = this.tasks.getRawValue() as Array<TaskDraft & PublishedTaskFields>;
    if (!force && !current.length) {
      return;
    }

    const next = ensureDefaultFinalTasks(current, {
      defaultAssigneeId: this.defaultAssigneeId,
      mergeAssigneeId: this.mergeAssigneeId,
    });

    this.tasks.clear();
    next.forEach((task, index) => {
      const previous = current.find((item) => item.subject === task.subject) ?? current[index];
      this.tasks.push(
        createTaskFormGroup(
          this.fb,
          { ...previous, ...task },
          {
            defaultTaskStatus: defaultOpenStatusId(this.taskStatuses),
            defaultAssigneeId: this.defaultAssigneeId,
            mergeAssigneeId: this.mergeAssigneeId,
            published: this.variant === 'published',
          },
        ),
      );
    });
  }
}

export function createTaskFormGroup(
  fb: FormBuilder,
  task: TaskDraft & PublishedTaskFields,
  options: {
    defaultTaskStatus?: number;
    defaultAssigneeId?: number | null;
    mergeAssigneeId?: number | null;
    published?: boolean;
  } = {},
): FormGroup {
  const assignedTo = isMergeTask(task.subject)
    ? (options.mergeAssigneeId ?? task.assignedTo ?? options.defaultAssigneeId ?? null)
    : (task.assignedTo ?? options.defaultAssigneeId ?? null);

  const assignedToControl = fb.control<number | null>(assignedTo);
  if (isMergeTask(task.subject) && options.mergeAssigneeId != null) {
    assignedToControl.disable({ emitEvent: false });
  }

  return fb.nonNullable.group({
    id: [task.id ?? 0],
    version: [task.version ?? 0],
    ref: [task.ref ?? 0],
    url: [task.url ?? ''],
    subject: [task.subject, Validators.required],
    description: [task.description ?? ''],
    statusId: [task.statusId ?? options.defaultTaskStatus ?? 0],
    assignedTo: assignedToControl,
    gitlabInformed: [task.gitlabInformed ?? false],
    branchComplete: [task.branchComplete ?? false],
    inferredFrom: [task.inferredFrom ?? ([] as string[])],
  });
}
