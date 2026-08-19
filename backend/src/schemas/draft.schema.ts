import { z } from 'zod';
import { flattenTagPlan } from '../utils/tags.js';
import { formatAcceptanceCriteria } from '../utils/acceptance-criteria.js';

export const TASK_SUBJECT_REGEX = /^(\[[^\]]+\] )?[A-ZÁÉÍÓÚÂÊÔÃÕÇ].+/;
export const US_SUBJECT_REGEX = /^\[.+\] .+/;

const forbiddenTaskPatterns = [
  /^faça\b/i,
  /^faca\b/i,
  /^você deve\b/i,
  /^voce deve\b/i,
  /^como usu[aá]rio\b/i,
  /^as a user\b/i,
];

export const structuredTagPlanSchema = z.object({
  aplicacao: z.string().min(1),
  escopo: z.string().min(1),
  tipo: z.string().min(1),
  // Dominio is the only optional tag category: it may be cleared by the user in the review panel.
  dominio: z.string().default(''),
});

export const tagColorsSchema = z.record(z.string()).optional();

export const taskDraftSchema = z.object({
  subject: z
    .string()
    .min(3)
    .max(120)
    .regex(TASK_SUBJECT_REGEX, 'Task subject must use oblique language')
    .refine(
      (value) => !forbiddenTaskPatterns.some((pattern) => pattern.test(value)),
      'Task must not use imperative or user-story format',
    ),
  description: z.string().optional(),
  statusId: z.number().optional(),
  assignedTo: z.number().nullable().optional(),
  gitlabInformed: z.boolean().optional(),
  branchComplete: z.boolean().optional(),
  inferredFrom: z.array(z.string()).optional(),
});

export const gitlabEnrichmentSchema = z.object({
  sourceBranch: z.string().min(1),
  baseBranch: z.string().min(1),
  enrichedAt: z.string().min(1),
  stats: z.object({
    totalCommits: z.number(),
    filesChanged: z.number(),
    linesAdded: z.number(),
    linesRemoved: z.number(),
  }),
  pathsConsidered: z.array(z.string()),
});

export const draftSchema = z.object({
  escopo: z.string().min(1),
  titulo: z.string().min(1),
  contextoGeral: z.string().min(1),
  contexto: z.string().min(1),
  objetivo: z.string().min(1),
  criteriosAceite: z
    .union([z.string(), z.array(z.string()), z.null()])
    .transform((value) => {
      if (value == null) {
        return null;
      }
      const formatted = formatAcceptanceCriteria(value);
      return formatted || null;
    }),
  // Empty when `implemented` is false — a US may be planned before any branch exists.
  branch: z.string(),
  tags: z.array(z.string()),
  tagPlan: structuredTagPlanSchema,
  tagColors: tagColorsSchema,
  usStatusId: z.number().optional(),
  milestoneId: z.number().nullable().optional(),
  tasks: z.array(taskDraftSchema),
  gitNotes: z.string().optional(),
  gitlabEnrichment: gitlabEnrichmentSchema.optional(),
  mode: z.enum(['new_us', 'existing_us', 'retrospective']).optional(),
  // Whether this US already has a real/existing branch. Defaults to true (the
  // historical, pre-flag behavior) so callers that omit it keep requiring a branch.
  implemented: z.boolean().optional(),
  existingUserStoryId: z.number().optional(),
  existingUserStoryRef: z.number().optional(),
  codebaseId: z.number().optional(),
  repositoryName: z.string().optional(),
});

export type Draft = z.infer<typeof draftSchema>;
export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type StructuredTagPlan = z.infer<typeof structuredTagPlanSchema>;

export const generateRequestSchema = z
  .object({
    mode: z.enum(['new_us', 'existing_us', 'retrospective']).default('new_us'),
    escopo: z.string().optional(),
    titulo: z.string().optional(),
    contextoGeral: z.string().optional(),
    objetivo: z.string().optional(),
    criteriosAceite: z.string().optional(),
    branch: z.string().optional(),
    branchPrefix: z.string().optional(),
    tasksFromCall: z.string().optional(),
    enrichWithGitlab: z.boolean().default(false),
    gitlabBranch: z.string().optional(),
    gitlabCompareBase: z.string().optional(),
    existingUserStoryId: z.number().optional(),
    existingUserStoryRef: z.number().optional(),
    codebaseId: z.number().optional(),
    repositoryName: z.string().optional(),
    // Whether this US already has a real/existing branch. Defaults to true (the
    // historical, pre-flag behavior) so callers that omit it keep requiring a branch.
    implemented: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode !== 'existing_us' && !data.contextoGeral?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Contexto geral e obrigatorio',
        path: ['contextoGeral'],
      });
    }
    // Retrospective mode always analyzes a real branch. For new_us, only require a
    // branch when the user explicitly marked the US as already implemented — an
    // explicit `implemented: false` is the only way to opt out (omitted/true keeps
    // the original, always-required behavior for backwards compatibility).
    const branchRequired = data.mode === 'retrospective' || (data.mode === 'new_us' && data.implemented !== false);
    if (branchRequired && !data.branch?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Branch planejada e obrigatoria',
        path: ['branch'],
      });
    }
  });

export const publishRequestSchema = z.object({
  mode: z.enum(['new_us', 'existing_us']),
  draft: draftSchema,
});

export const updatePublishedSchema = z.object({
  userStoryId: z.number(),
  userStoryVersion: z.number().optional(),
  draft: draftSchema,
  tasks: z.array(
    z.object({
      id: z.number().optional(),
      version: z.number().optional(),
      subject: z.string(),
      description: z.string().optional(),
      statusId: z.number(),
      assignedTo: z.number().nullable().optional(),
    }),
  ),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type PublishRequest = z.infer<typeof publishRequestSchema>;
export type UpdatePublishedRequest = z.infer<typeof updatePublishedSchema>;

export function buildUsSubject(escopo: string, titulo: string): string {
  return `[${escopo}] ${titulo}`;
}

export function buildUsDescription(
  draft: Pick<Draft, 'contexto' | 'objetivo' | 'criteriosAceite' | 'branch' | 'repositoryName'>,
): string {
  const criterios = formatAcceptanceCriteria(draft.criteriosAceite);
  const repositorySection = draft.repositoryName?.trim()
    ? `\n\n(Repositório)\n${draft.repositoryName.trim()}`
    : '';
  // A US may not have a branch yet (not implemented) — render a human placeholder
  // instead of leaving the section blank, while still keeping the "(Branch)" marker
  // that validateUsDescription() requires.
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

export function validateUsDescription(description: string): boolean {
  return (
    description.includes('(Contexto)') &&
    description.includes('(Objetivo)') &&
    description.includes('(Critérios de Aceite)') &&
    description.includes('(Branch)')
  );
}

export function slugifyBranch(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeBranch(branch: string, defaultPrefix = 'feat'): string {
  const trimmed = branch.trim().replace(/\s+/g, '-');
  if (!trimmed) {
    return `${defaultPrefix}/nova-feature`;
  }

  if (trimmed.includes('/')) {
    return trimmed;
  }

  return `${defaultPrefix}/${trimmed}`;
}

export function syncTagsFromPlan(draft: Draft): Draft {
  return {
    ...draft,
    tags: flattenTagPlan(draft.tagPlan),
  };
}

export function finalizeDraft(raw: Draft, usEscopo?: string): Draft {
  const subject = buildUsSubject(raw.escopo, raw.titulo);
  if (!US_SUBJECT_REGEX.test(subject)) {
    throw new Error('Invalid US subject format');
  }

  // Only fabricate a placeholder branch name when the US is meant to have one.
  // When explicitly not implemented, keep it truly empty instead of inventing
  // something like "feat/nova-feature" that could be mistaken for a real branch.
  const branch = raw.implemented === false ? '' : normalizeBranch(raw.branch);
  const description = buildUsDescription({ ...raw, branch });
  if (!validateUsDescription(description)) {
    throw new Error('Invalid US description sections');
  }

  const normalizedTasks = raw.tasks.map((task) => ({
    ...task,
    subject: normalizeTaskSubject(task.subject, usEscopo ?? raw.escopo),
  }));

  if (normalizedTasks.length === 0) {
    throw new Error('At least one task is required');
  }

  const validated = draftSchema.parse({
    ...raw,
    branch,
    tasks: normalizedTasks,
    tags: flattenTagPlan(raw.tagPlan),
  });

  return validated;
}

function normalizeTaskSubject(subject: string, usEscopo: string): string {
  const scopePattern = new RegExp(`^\\[${escapeRegex(usEscopo)}\\] `, 'i');
  if (scopePattern.test(subject)) {
    return subject.replace(scopePattern, '');
  }
  return subject;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
