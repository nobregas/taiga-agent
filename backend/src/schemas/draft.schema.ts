import { z } from 'zod';
import { flattenTagPlan } from '../utils/tags.js';

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
  dominio: z.string().min(1),
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
  criteriosAceite: z.string().nullable(),
  branch: z.string().min(1),
  tags: z.array(z.string()),
  tagPlan: structuredTagPlanSchema,
  tagColors: tagColorsSchema,
  usStatusId: z.number().optional(),
  milestoneId: z.number().nullable().optional(),
  tasks: z.array(taskDraftSchema),
  gitNotes: z.string().optional(),
  gitlabEnrichment: gitlabEnrichmentSchema.optional(),
  mode: z.enum(['new_us', 'existing_us', 'retrospective']).optional(),
  existingUserStoryId: z.number().optional(),
  existingUserStoryRef: z.number().optional(),
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
  })
  .superRefine((data, ctx) => {
    if (data.mode !== 'existing_us' && !data.contextoGeral?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Contexto geral e obrigatorio',
        path: ['contextoGeral'],
      });
    }
    if (data.mode !== 'existing_us' && !data.branch?.trim()) {
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
      id: z.number(),
      version: z.number().optional(),
      subject: z.string(),
      description: z.string().optional(),
      statusId: z.number(),
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

  const branch = normalizeBranch(raw.branch);
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
