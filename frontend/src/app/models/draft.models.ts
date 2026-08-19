export type GenerationMode = 'new_us' | 'existing_us' | 'retrospective';

export type TagCategory = 'aplicacao' | 'escopo' | 'tipo' | 'dominio';

export interface StructuredTagPlan {
  aplicacao: string;
  escopo: string;
  tipo: string;
  dominio: string;
}

export const TAG_CATEGORIES: TagCategory[] = ['aplicacao', 'escopo', 'tipo', 'dominio'];

/**
 * Tag categories that may be left blank. Keep this in sync with the optional
 * categories in `structuredTagPlanSchema` on the backend — today only `dominio`.
 * Shared between review-panel and published-panel so both stay consistent.
 */
export const OPTIONAL_TAG_CATEGORIES: readonly TagCategory[] = ['dominio'];

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  aplicacao: 'Aplicacao',
  escopo: 'Escopo',
  tipo: 'Tipo',
  dominio: 'Dominio',
};

export const TAG_CATEGORY_COLORS: Record<TagCategory, string> = {
  aplicacao: '#2563EB',
  escopo: '#525252',
  tipo: '#059669',
  dominio: '#D97706',
};

export interface TaskDraft {
  subject: string;
  description?: string;
  statusId?: number;
  assignedTo?: number | null;
  gitlabInformed?: boolean;
  branchComplete?: boolean;
  inferredFrom?: string[];
}

export interface GitlabEnrichmentMeta {
  sourceBranch: string;
  baseBranch: string;
  enrichedAt: string;
  stats: BranchContextPreview['stats'];
  pathsConsidered: string[];
}

export interface Draft {
  escopo: string;
  titulo: string;
  contextoGeral: string;
  contexto: string;
  objetivo: string;
  criteriosAceite: string | null;
  branch: string;
  tags: string[];
  tagPlan: StructuredTagPlan;
  tagColors?: Record<string, string>;
  usStatusId?: number;
  milestoneId?: number | null;
  tasks: TaskDraft[];
  gitNotes?: string;
  gitlabEnrichment?: GitlabEnrichmentMeta;
  mode?: GenerationMode;
  // Whether this US already has a real/existing branch. When false, `branch` may
  // be empty and the GitLab-enrichment UI/flow is skipped entirely.
  implemented?: boolean;
  existingUserStoryId?: number;
  existingUserStoryRef?: number;
  codebaseId?: number;
  repositoryName?: string;
}

export interface GenerateRequest {
  mode: GenerationMode;
  escopo?: string;
  titulo?: string;
  contextoGeral?: string;
  objetivo?: string;
  criteriosAceite?: string;
  branch?: string;
  branchPrefix?: string;
  tasksFromCall?: string;
  enrichWithGitlab?: boolean;
  gitlabBranch?: string;
  gitlabCompareBase?: string;
  existingUserStoryId?: number;
  existingUserStoryRef?: number;
  codebaseId?: number;
  repositoryName?: string;
  implemented?: boolean;
}

export interface GenerateResponse {
  draft: Draft;
  preview: {
    subject: string;
    description: string;
    gitNotes?: string;
  };
  branchContext: BranchContextPreview | null;
}

export interface BranchContextPreview {
  branch: string;
  stats: {
    totalCommits: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
  commits: Array<{ sha: string; title: string; body: string; date: string }>;
  diffSummary: Array<{ path: string; additions: number; deletions: number; snippet?: string }>;
}

export interface TaigaUser {
  id: number;
  username: string;
  full_name: string;
  email?: string | null;
  photo?: string | null;
}

export interface TaigaStatus {
  id: number;
  name: string;
  slug: string;
  is_closed: boolean;
}

export interface TaigaSprint {
  id: number;
  name: string;
  slug: string;
  estimated_start: string | null;
  estimated_finish: string | null;
  closed: boolean;
}

export interface ProjectMeta {
  workspaceId: number | null;
  workspaceName: string | null;
  projectId: number | null;
  projectSlug: string;
  tags: string[];
  tagColors: Record<string, string | null>;
  userStoryStatuses: TaigaStatus[];
  taskStatuses: TaigaStatus[];
  sprints: TaigaSprint[];
  defaultSprintId: number | null;
  validScopes: string[];
  validTaskDomains: string[];
  currentUser: TaigaUser | null;
  members: TaigaUser[];
  mergeAssigneeId: number | null;
  codebases: Array<{
    id: number;
    workspaceId: number;
    name: string;
    gitlabUrl: string;
    gitlabToken: string | null;
    gitlabProjectId: string | null;
    gitlabDefaultBase: string;
    gitlabDiffSnippetLines: number;
    validScopes: string[];
    validTaskDomains: string[];
    isDefault: boolean;
    hasGitlabToken: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  defaultCodebaseId: number | null;
  gitlabConfigured: boolean;
  defaultGitlabBaseBranch?: string;
  geminiConfigured: boolean;
  settingsConfigured?: boolean;
  hasActiveWorkspace?: boolean;
  hasDefaultCodebase?: boolean;
  warning?: string;
}

export interface UserStorySearchResult {
  id: number;
  ref: number;
  subject: string;
  status?: number | string;
}

export interface UserStoryEditResponse {
  draft: Draft;
  publishResult: PublishResponse;
}

export interface PublishedTask {
  id: number;
  ref: number;
  subject: string;
  description: string;
  statusId: number;
  assignedTo?: number | null;
  version: number;
  url: string;
}

export interface PublishResponse {
  success: boolean;
  userStory: {
    id: number;
    ref: number | undefined;
    subject: string;
    description?: string;
    tags?: string[];
    statusId: number;
    version: number;
    url: string | null;
  };
  tasks: PublishedTask[];
  gitNotes?: string;
  reminders: string[];
}

export interface UpdatePublishedRequest {
  userStoryId: number;
  userStoryVersion?: number;
  draft: Draft;
  tasks: Array<{
    id?: number;
    version?: number;
    subject: string;
    description?: string;
    statusId: number;
    assignedTo?: number | null;
  }>;
}

export type WizardStep = 'create' | 'review' | 'done';

export const BRANCH_PREFIXES = ['feat', 'fix', 'test', 'chore', 'hotfix', 'release', 'docs', 'refactor'] as const;

/**
 * Normalizes a candidate Taiga user id.
 *
 * Taiga (Django) primary keys start at 1, so `0`, negative numbers, `NaN` and
 * anything non-finite can never refer to a real user. Treat all of those the
 * same as "no id" (`null`) so we never send e.g. `assignedTo: 0` to the backend,
 * which would forward it to Taiga's API and fail with something like
 * `Invalid pk "0" - object does not exist.`
 */
export function toValidUserId(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.trunc(parsed);
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

export function sameStatusId(a: unknown, b: unknown): boolean {
  const left = toStatusId(a);
  const right = toStatusId(b);
  return left != null && right != null && left === right;
}

export function sprintRequiredError(
  milestoneId: number | null | undefined,
  sprints: Array<{ id: number }>,
): string | null {
  if (!sprints.length) {
    return 'Nenhuma sprint disponivel neste projeto. Crie uma sprint no Taiga.';
  }
  if (milestoneId == null) {
    return 'Selecione uma sprint.';
  }
  return null;
}

export function flattenTagPlan(plan: StructuredTagPlan): string[] {
  return [plan.aplicacao, plan.escopo, plan.tipo, plan.dominio].map((tag) => tag.trim()).filter(Boolean);
}

const TAG_SYNONYM_GROUPS: string[][] = [
  ['app', 'aplicativo', 'aplicativos', 'aplicacao', 'aplicacoes', 'application', 'applications'],
  ['api', 'apis', 'endpoint', 'endpoints'],
  ['front', 'frontend', 'ui', 'web'],
  ['back', 'backend', 'server'],
  ['feature', 'feat', 'funcionalidade', 'funcionalidades'],
  ['fix', 'bugfix', 'hotfix', 'correcao'],
  ['teste', 'test', 'tests', 'testing', 'qa'],
  ['docs', 'doc', 'documentacao', 'documentation'],
  ['pedido', 'pedidos', 'order', 'orders'],
  ['pagamento', 'pagamentos', 'payment', 'payments'],
  ['usuario', 'user', 'users', 'usuarios'],
];

function normalizeTagKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compactTagKey(value: string): string {
  return normalizeTagKey(value).replace(/\s+/g, '');
}

function singularizeTagKey(key: string): string {
  if (key.endsWith('oes') && key.length > 5) {
    return `${key.slice(0, -3)}ao`;
  }
  if (key.endsWith('s') && !key.endsWith('ss') && key.length > 4) {
    return key.slice(0, -1);
  }
  return key;
}

const TAG_SYNONYM_INDEX = (() => {
  const map = new Map<string, number>();
  TAG_SYNONYM_GROUPS.forEach((group, index) => {
    for (const alias of group) {
      map.set(compactTagKey(alias), index);
    }
  });
  return map;
})();

function sameTagSynonymGroup(a: string, b: string): boolean {
  const left = TAG_SYNONYM_INDEX.get(a);
  const right = TAG_SYNONYM_INDEX.get(b);
  return left != null && right != null && left === right;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) {
    index += 1;
  }
  return index;
}

function scoreTagMatch(query: string, tag: string): number {
  const queryNormalized = normalizeTagKey(query);
  const tagNormalized = normalizeTagKey(tag);
  if (!queryNormalized || !tagNormalized) {
    return 0;
  }
  if (queryNormalized === tagNormalized) {
    return 100;
  }

  const queryCompact = compactTagKey(query);
  const tagCompact = compactTagKey(tag);
  if (queryCompact === tagCompact) {
    return 95;
  }

  const querySingular = singularizeTagKey(queryCompact);
  const tagSingular = singularizeTagKey(tagCompact);
  if (querySingular === tagSingular) {
    return 92;
  }

  if (sameTagSynonymGroup(queryCompact, tagCompact) || sameTagSynonymGroup(querySingular, tagSingular)) {
    return 90;
  }

  const prefix = commonPrefixLength(querySingular, tagSingular);
  const shorter = Math.min(querySingular.length, tagSingular.length);
  if (prefix >= 5 || (prefix >= 4 && shorter > 0 && prefix / shorter >= 0.7)) {
    return 70 + Math.min(20, prefix);
  }

  return 0;
}

export function findExistingTag(name: string, tags: string[]): string | undefined {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return tags.find((tag) => tag.toLowerCase() === normalized);
}

export function fuzzyMatchTag(name: string, tags: string[]): string | undefined {
  const exact = findExistingTag(name, tags);
  if (exact) {
    return exact;
  }

  if (!name.trim() || !tags.length) {
    return undefined;
  }

  let best: string | undefined;
  let bestScore = 0;
  let bestDelta = Infinity;

  for (const tag of tags) {
    const score = scoreTagMatch(name, tag);
    if (score < 60) {
      continue;
    }

    const delta = Math.abs(compactTagKey(tag).length - compactTagKey(name).length);
    if (score > bestScore || (score === bestScore && delta < bestDelta)) {
      best = tag;
      bestScore = score;
      bestDelta = delta;
    }
  }

  return best;
}

export function colorFromProject(
  name: string,
  projectColors?: Record<string, string | null>,
): string | undefined {
  if (!name || !projectColors) {
    return undefined;
  }

  const match = Object.entries(projectColors).find(
    ([tag]) => tag.toLowerCase() === name.trim().toLowerCase(),
  );
  return match?.[1] || undefined;
}

export function toColorInputValue(color: string): string {
  const value = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(value)) {
    return `#${value.slice(1, 7)}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value}`;
  }
  return '#737373';
}

export function tagColorFor(
  plan: StructuredTagPlan,
  category: TagCategory,
  tagColors?: Record<string, string>,
  projectColors?: Record<string, string | null>,
): string {
  const name = plan[category].trim();
  return toColorInputValue(
    tagColors?.[name] ??
      tagColors?.[name.toLowerCase()] ??
      colorFromProject(name, projectColors) ??
      TAG_CATEGORY_COLORS[category],
  );
}

export function parseAcceptanceCriteria(value: string | string[] | null | undefined): string[] {
  if (value == null) {
    return [];
  }

  const lines = Array.isArray(value) ? value : value.split(/\r?\n/);
  return lines
    .map((line) => line.replace(/^\s*[-*]\s+/, '').replace(/^\s*[-*]\s*$/, '').trim())
    .filter(Boolean);
}

export function formatAcceptanceCriteria(value: string | string[] | null | undefined): string {
  const items = parseAcceptanceCriteria(value);
  return items.map((item) => `- ${item}`).join('\n');
}

export function buildUsDescription(
  draft: Pick<Draft, 'contexto' | 'objetivo' | 'criteriosAceite' | 'branch' | 'repositoryName'>,
): string {
  const criterios = formatAcceptanceCriteria(draft.criteriosAceite);
  const repositorySection = draft.repositoryName?.trim()
    ? `\n\n(Repositório)\n${draft.repositoryName.trim()}`
    : '';
  // A US may not have a branch yet (not implemented) — show a human placeholder
  // instead of an empty section, while keeping the "(Branch)" marker that
  // parseUsDescription()/validateUsDescription() rely on.
  const branchSection = draft.branch.trim() || 'A definir';

  return `(Contexto)
${draft.contexto.trim()}

(Objetivo)
${draft.objetivo.trim()}

(Critérios de Aceite)
${criterios}

(Branch)
${branchSection}${repositorySection}`;
}

export function parseUsDescription(description: string): {
  contexto: string;
  objetivo: string;
  criteriosAceite: string | null;
  branch: string;
} {
  const sections: Record<string, string> = {};
  const parts = description.split(/\n(?=\([^)]+\)\s*\n)/);

  for (const part of parts) {
    const match = part.match(/^\(([^)]+)\)\s*\n([\s\S]*)$/);
    if (match) {
      sections[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }

  const criterios =
    sections['critérios de aceite'] ??
    sections['criterios de aceite'] ??
    '';

  return {
    contexto: sections['contexto'] ?? '',
    objetivo: sections['objetivo'] ?? '',
    criteriosAceite: formatAcceptanceCriteria(criterios) || null,
    branch: sections['branch'] ?? '',
  };
}

export function defaultOpenStatusId(statuses: TaigaStatus[]): number | undefined {
  return statuses.find((status) => !status.is_closed)?.id ?? statuses[0]?.id;
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

function statusMatches(status: TaigaStatus, aliases: string[]): boolean {
  const slug = normalizeStatusText(status.slug).replace(/ /g, '-');
  const name = normalizeStatusText(status.name);
  const nameDashed = name.replace(/ /g, '-');

  return aliases.some((alias) => {
    const normalized = normalizeStatusText(alias);
    const dashed = normalized.replace(/ /g, '-');
    return slug === dashed || name === normalized || nameDashed === dashed;
  });
}

export function findStatusByAliases(statuses: TaigaStatus[], aliases: string[]): TaigaStatus | undefined {
  return statuses.find((status) => statusMatches(status, aliases));
}

export function findReadyForDevStatusId(statuses: TaigaStatus[]): number | undefined {
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

export function findReleasedOrDoneUsStatusId(statuses: TaigaStatus[]): number | undefined {
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

export function findDoneStatusId(statuses: TaigaStatus[]): number | undefined {
  const named = findStatusByAliases(statuses, DONE_ALIASES);
  if (named) {
    return named.id;
  }

  return statuses.find((status) => status.is_closed)?.id;
}

export function isDoneStatus(statusId: number | string | undefined, statuses: TaigaStatus[]): boolean {
  const resolved = toStatusId(statusId);
  const status = statuses.find((item) => sameStatusId(item.id, resolved));
  if (!status) return false;
  return status.is_closed || statusMatches(status, DONE_ALIASES);
}

export function areAllTasksComplete(
  tasks: Array<{ statusId?: number; branchComplete?: boolean }>,
  statuses: TaigaStatus[],
): boolean {
  return (
    tasks.length > 0 &&
    tasks.every((task) => Boolean(task.branchComplete) || isDoneStatus(task.statusId ?? -1, statuses))
  );
}

export function resolveUserStoryStatusId(
  statuses: TaigaStatus[],
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

export function openTaskStatuses(statuses: TaigaStatus[]): TaigaStatus[] {
  return statuses.filter((status) => !isDoneStatus(status.id, statuses));
}

export function findNewStatusId(statuses: TaigaStatus[]): number | undefined {
  const explicit = statuses.find(
    (status) =>
      status.slug === 'new' ||
      status.name.toLowerCase() === 'new' ||
      status.name.toLowerCase() === 'novo',
  );
  if (explicit) {
    return explicit.id;
  }

  return defaultOpenStatusId(statuses);
}

export const DEFAULT_FINAL_TASKS = {
  subirPr: 'Subir PR',
  merge: 'Merge',
} as const;

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

export function memberDisplayName(user: TaigaUser | null | undefined): string {
  if (!user) {
    return 'Sem responsavel';
  }

  const fullName = user.full_name?.trim();
  if (fullName && !/^\d+$/.test(fullName)) {
    return fullName;
  }

  const username = user.username?.trim();
  if (username && !/^\d+$/.test(username)) {
    return username;
  }

  return 'Membro';
}

export function memberLabelById(userId: number | null | undefined, members: TaigaUser[]): string {
  if (userId == null) {
    return 'Sem responsavel';
  }

  const member = members.find((item) => item.id === userId);
  return memberDisplayName(member ?? undefined) === 'Sem responsavel'
    ? 'Membro'
    : memberDisplayName(member);
}

export function slugifyBranchTitle(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'nova-user-story'
  );
}

export function buildManualDraft(
  meta: ProjectMeta | null,
  seed?: Partial<GenerateRequest> | null,
): Draft {
  const tags = meta?.tags ?? [];
  const pickTag = (preferred: string, index: number) =>
    fuzzyMatchTag(preferred, tags) ?? tags[index] ?? preferred;

  const escopo = seed?.escopo?.trim() || 'App';
  const titulo = seed?.titulo?.trim() || 'Nova user story';
  const contextoGeral = seed?.contextoGeral?.trim() || 'A definir';
  const prefix = seed?.branchPrefix ?? 'feat';
  // Not implemented (default) => no branch to fabricate; keep it genuinely empty.
  const implemented = Boolean(seed?.implemented);
  const branch = implemented ? seed?.branch?.trim() || `${prefix}/${slugifyBranchTitle(titulo)}` : '';
  const defaultAssigneeId = toValidUserId(meta?.currentUser?.id);
  const mergeAssigneeId = toValidUserId(meta?.mergeAssigneeId);

  const callTasks = (seed?.tasksFromCall ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .map((subject) => ({
      subject: /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\[]/.test(subject) ? subject : `[Geral] ${subject}`,
      description: '',
      assignedTo: defaultAssigneeId,
    }));

  const tagPlan = {
    aplicacao: pickTag('app', 0),
    escopo: pickTag('front', 1),
    tipo: pickTag('feature', 2),
    dominio: pickTag('geral', 3),
  };

  const tasks = ensureDefaultFinalTasks(callTasks, { defaultAssigneeId, mergeAssigneeId });
  const usStatusId = resolveUserStoryStatusId(meta?.userStoryStatuses ?? [], {
    allTasksComplete: areAllTasksComplete(tasks, meta?.taskStatuses ?? []),
  });

  return {
    escopo,
    titulo,
    contextoGeral,
    contexto: 'A definir.',
    objetivo: seed?.objetivo?.trim() || titulo,
    criteriosAceite: formatAcceptanceCriteria(seed?.criteriosAceite) || '- ',
    branch,
    tags: flattenTagPlan(tagPlan),
    tagPlan,
    tagColors: {},
    usStatusId,
    milestoneId: meta?.defaultSprintId ?? null,
    tasks,
    mode: seed?.mode === 'existing_us' ? 'new_us' : (seed?.mode ?? 'new_us'),
    implemented,
    codebaseId: seed?.codebaseId,
    repositoryName: seed?.repositoryName,
  };
}

export function ensureDefaultFinalTasks(
  tasks: TaskDraft[],
  options: { defaultAssigneeId?: number | null; mergeAssigneeId?: number | null } = {},
): TaskDraft[] {
  // Normalize once so `0`/negative/NaN ids (e.g. a stale merge-assignee setting)
  // can never leak into a task's assignedTo and reach Taiga's API.
  const defaultAssigneeId = toValidUserId(options.defaultAssigneeId);
  const mergeAssigneeId = toValidUserId(options.mergeAssigneeId) ?? defaultAssigneeId;
  const work: TaskDraft[] = [];
  let subirPr: TaskDraft | undefined;
  let merge: TaskDraft | undefined;

  for (const task of tasks) {
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
          assignedTo: mergeAssigneeId ?? toValidUserId(task.assignedTo) ?? defaultAssigneeId,
        };
      }
      continue;
    }

    work.push({
      ...task,
      assignedTo: toValidUserId(task.assignedTo) ?? defaultAssigneeId,
    });
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

  return work.map((task) =>
    isMergeTask(task.subject) && mergeAssigneeId != null
      ? { ...task, assignedTo: mergeAssigneeId }
      : { ...task, assignedTo: toValidUserId(task.assignedTo) ?? defaultAssigneeId },
  );
}
