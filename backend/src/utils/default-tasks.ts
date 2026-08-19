import type { TaskDraft } from '../schemas/draft.schema.js';
import { toValidUserId } from './user-id.js';

export const DEFAULT_FINAL_TASKS = {
  subirPr: 'Subir PR',
  merge: 'Merge',
} as const;

export interface EnsureDefaultTasksOptions {
  defaultAssigneeId?: number | null;
  mergeAssigneeId?: number | null;
}

export function stripTaskDomainPrefix(subject: string): string {
  return subject.replace(/^\[[^\]]*\]\s*/, '').trim();
}

export function normalizeTaskLabel(subject: string): string {
  return stripTaskDomainPrefix(subject)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMergeTask(subject: string): boolean {
  const label = normalizeTaskLabel(subject);
  return (
    label === 'merge' ||
    label === 'fazer merge' ||
    label === 'realizar merge' ||
    label === 'mergear' ||
    label === 'merge da pr' ||
    label === 'merge do pr'
  );
}

export function isSubirPrTask(subject: string): boolean {
  const label = normalizeTaskLabel(subject);
  return (
    label === 'subir pr' ||
    label === 'subir pull request' ||
    label === 'abrir pr' ||
    label === 'abrir pull request' ||
    label === 'criar pr' ||
    label === 'criar pull request' ||
    label === 'abrir o pr'
  );
}

export function isDefaultFinalTask(subject: string): boolean {
  return isSubirPrTask(subject) || isMergeTask(subject);
}

function withAssignee(task: TaskDraft, assignedTo: number | null): TaskDraft {
  return { ...task, assignedTo };
}

export function applyDefaultAssignees(
  tasks: TaskDraft[],
  options: EnsureDefaultTasksOptions,
): TaskDraft[] {
  const defaultAssigneeId = toValidUserId(options.defaultAssigneeId);
  const mergeAssigneeId = toValidUserId(options.mergeAssigneeId);

  return tasks.map((task) => {
    if (isMergeTask(task.subject) && mergeAssigneeId != null) {
      return withAssignee(task, mergeAssigneeId);
    }

    if (task.assignedTo === undefined) {
      return withAssignee(task, defaultAssigneeId);
    }

    if (task.assignedTo !== null) {
      // Explicit but invalid ids (e.g. a stale `0`) fall back to the default assignee
      // instead of being forwarded as-is to Taiga.
      const sanitized = toValidUserId(task.assignedTo);
      return withAssignee(task, sanitized ?? defaultAssigneeId);
    }

    return task;
  });
}

export function ensureDefaultFinalTasks(
  tasks: TaskDraft[],
  options: EnsureDefaultTasksOptions = {},
): TaskDraft[] {
  const defaultAssigneeId = toValidUserId(options.defaultAssigneeId);
  const mergeAssigneeId = toValidUserId(options.mergeAssigneeId) ?? defaultAssigneeId;

  const assigned = applyDefaultAssignees(tasks, options);
  const work: TaskDraft[] = [];
  let subirPr: TaskDraft | undefined;
  let merge: TaskDraft | undefined;

  for (const task of assigned) {
    if (isSubirPrTask(task.subject)) {
      if (!subirPr) {
        subirPr = { ...task, subject: DEFAULT_FINAL_TASKS.subirPr };
      }
      continue;
    }

    if (isMergeTask(task.subject)) {
      if (!merge) {
        merge = {
          ...task,
          subject: DEFAULT_FINAL_TASKS.merge,
          assignedTo: mergeAssigneeId ?? task.assignedTo ?? defaultAssigneeId,
        };
      }
      continue;
    }

    work.push(task);
  }

  work.push(
    subirPr ?? {
      subject: DEFAULT_FINAL_TASKS.subirPr,
      description: '',
      assignedTo: defaultAssigneeId,
    },
  );
  work.push(
    merge ?? {
      subject: DEFAULT_FINAL_TASKS.merge,
      description: '',
      assignedTo: mergeAssigneeId,
    },
  );

  return applyDefaultAssignees(work, options);
}
