export type GenerationMode = 'new_us' | 'existing_us' | 'retrospective';

export type TagCategory = 'aplicacao' | 'escopo' | 'tipo' | 'dominio';

export interface StructuredTagPlan {
  aplicacao: string;
  escopo: string;
  tipo: string;
  dominio: string;
}

export const TAG_CATEGORIES: TagCategory[] = ['aplicacao', 'escopo', 'tipo', 'dominio'];

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
  existingUserStoryId?: number;
  existingUserStoryRef?: number;
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
  gitlabConfigured: boolean;
  defaultGitlabBaseBranch?: string;
  geminiConfigured: boolean;
  warning?: string;
}

export interface UserStorySearchResult {
  id: number;
  ref: number;
  subject: string;
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
    id: number;
    version?: number;
    subject: string;
    description?: string;
    statusId: number;
  }>;
}

export type WizardStep = 'create' | 'review' | 'done';

export const BRANCH_PREFIXES = ['feat', 'fix', 'test', 'chore', 'hotfix', 'release', 'docs', 'refactor'] as const;

export function flattenTagPlan(plan: StructuredTagPlan): string[] {
  return [plan.aplicacao, plan.escopo, plan.tipo, plan.dominio]
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export function tagColorFor(plan: StructuredTagPlan, category: TagCategory, tagColors?: Record<string, string>): string {
  const name = plan[category].trim().toLowerCase();
  return tagColors?.[name] ?? TAG_CATEGORY_COLORS[category];
}

export function buildUsDescription(
  draft: Pick<Draft, 'contexto' | 'objetivo' | 'criteriosAceite' | 'branch'>,
): string {
  const criterios = draft.criteriosAceite?.trim() ?? '';
  return `(Contexto)
${draft.contexto.trim()}

(Objetivo)
${draft.objetivo.trim()}

(Critérios de Aceite)
${criterios}

(Branch)
${draft.branch.trim()}`;
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
    criteriosAceite: criterios || null,
    branch: sections['branch'] ?? '',
  };
}

export function defaultOpenStatusId(statuses: TaigaStatus[]): number | undefined {
  return statuses.find((status) => !status.is_closed)?.id ?? statuses[0]?.id;
}

export function findDoneStatusId(statuses: TaigaStatus[]): number | undefined {
  const done = statuses.find(
    (status) =>
      status.is_closed ||
      status.slug === 'done' ||
      status.slug === 'closed' ||
      status.name.toLowerCase() === 'done' ||
      status.name.toLowerCase() === 'closed' ||
      status.name.toLowerCase() === 'concluído' ||
      status.name.toLowerCase() === 'concluido',
  );
  return done?.id;
}

export function isDoneStatus(statusId: number, statuses: TaigaStatus[]): boolean {
  const status = statuses.find((item) => item.id === statusId);
  if (!status) return false;
  return (
    status.is_closed ||
    status.slug === 'done' ||
    status.slug === 'closed' ||
    status.name.toLowerCase() === 'done' ||
    status.name.toLowerCase() === 'closed' ||
    status.name.toLowerCase() === 'concluído' ||
    status.name.toLowerCase() === 'concluido'
  );
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
