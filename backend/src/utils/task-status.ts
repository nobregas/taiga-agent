export interface TaigaStatusLike {
  id: number;
  name: string;
  slug: string;
  is_closed: boolean;
}

const READY_FOR_DEV_ALIASES = [
  'ready-for-dev',
  'ready_for_dev',
  'ready-for-development',
  'ready for dev',
  'ready for development',
  'pronta para dev',
  'pronto para dev',
  'pronta para desenvolvimento',
  'pronto para desenvolvimento',
  'readyfordev',
];

const READY_ONLY_ALIASES = ['ready', 'pronta', 'pronto'];

const RELEASED_ALIASES = ['released', 'release', 'lancado', 'publicado'];

const DONE_ALIASES = ['done', 'closed', 'concluido', 'concluído', 'finalizado'];

function normalizeStatusText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function statusMatches(status: TaigaStatusLike, aliases: string[]): boolean {
  const slug = normalizeStatusText(status.slug).replace(/ /g, '-');
  const name = normalizeStatusText(status.name);
  const nameDashed = name.replace(/ /g, '-');

  return aliases.some((alias) => {
    const normalized = normalizeStatusText(alias);
    const dashed = normalized.replace(/ /g, '-');
    return slug === dashed || name === normalized || nameDashed === dashed;
  });
}

export function defaultOpenStatusId(statuses: TaigaStatusLike[]): number | undefined {
  return statuses.find((status) => !status.is_closed)?.id ?? statuses[0]?.id;
}

export function findStatusByAliases(
  statuses: TaigaStatusLike[],
  aliases: string[],
): TaigaStatusLike | undefined {
  return statuses.find((status) => statusMatches(status, aliases));
}

export function findReadyForDevStatusId(statuses: TaigaStatusLike[]): number | undefined {
  const exact = findStatusByAliases(statuses, READY_FOR_DEV_ALIASES);
  if (exact) {
    return exact.id;
  }

  const readyOnly = findStatusByAliases(statuses, READY_ONLY_ALIASES);
  if (readyOnly) {
    return readyOnly.id;
  }

  return defaultOpenStatusId(statuses);
}

export function findReleasedOrDoneUsStatusId(statuses: TaigaStatusLike[]): number | undefined {
  const released = findStatusByAliases(statuses, RELEASED_ALIASES);
  if (released) {
    return released.id;
  }

  const done = findStatusByAliases(statuses, DONE_ALIASES);
  if (done) {
    return done.id;
  }

  return statuses.find((status) => status.is_closed)?.id;
}

export function findDoneStatusId(statuses: TaigaStatusLike[]): number | undefined {
  const named = findStatusByAliases(statuses, DONE_ALIASES);
  if (named) {
    return named.id;
  }

  return statuses.find((status) => status.is_closed)?.id;
}

export function isDoneStatus(statusId: number | undefined, statuses: TaigaStatusLike[]): boolean {
  if (statusId == null) {
    return false;
  }

  const status = statuses.find((item) => Number(item.id) === Number(statusId));
  if (!status) {
    return false;
  }

  return status.is_closed || statusMatches(status, DONE_ALIASES);
}

export function toStatusId(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }

  if (typeof value === 'object' && value && 'id' in value) {
    return toStatusId((value as { id?: unknown }).id);
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.trunc(parsed);
}

export function areAllTasksComplete(
  tasks: Array<{ statusId?: number; branchComplete?: boolean }>,
  statuses: TaigaStatusLike[],
): boolean {
  return tasks.length > 0 && tasks.every((task) => task.branchComplete || isDoneStatus(task.statusId, statuses));
}

export function resolveUserStoryStatusId(
  statuses: TaigaStatusLike[],
  options: { allTasksComplete: boolean; preferredId?: number },
): number | undefined {
  if (options.allTasksComplete) {
    return findReleasedOrDoneUsStatusId(statuses) ?? options.preferredId ?? findReadyForDevStatusId(statuses);
  }

  const readyId = findReadyForDevStatusId(statuses);
  const closedId = findReleasedOrDoneUsStatusId(statuses);

  if (options.preferredId && options.preferredId !== closedId) {
    return options.preferredId;
  }

  return readyId ?? options.preferredId;
}
