import type { Draft } from '../schemas/draft.schema.js';
import { parseUsDescription } from './us-description.js';
import { flattenTagPlan, type StructuredTagPlan } from './tags.js';
import type { TaigaTask, TaigaUserStory } from '../services/taiga.service.js';

export function parseUsSubject(subject: string): { escopo: string; titulo: string } {
  const match = subject.match(/^\[(.+?)\]\s+(.+)$/);
  if (match) {
    return { escopo: match[1].trim(), titulo: match[2].trim() };
  }
  return { escopo: 'App', titulo: subject.trim() };
}

export function tagPlanFromTagNames(tags: string[]): StructuredTagPlan {
  const normalized = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const pad = [...normalized, 'app', 'front', 'feature', 'geral'];
  return {
    aplicacao: pad[0],
    escopo: pad[1],
    tipo: pad[2],
    dominio: pad[3],
  };
}

export function buildDraftFromUserStory(
  userStory: TaigaUserStory,
  tasks: TaigaTask[],
): Draft {
  const { escopo, titulo } = parseUsSubject(userStory.subject);
  const parsed = parseUsDescription(userStory.description);
  const tagNames = userStory.tags.map(([tag]) => tag);
  const tagPlan = tagPlanFromTagNames(tagNames);

  return {
    escopo,
    titulo,
    contextoGeral: parsed.contexto || userStory.description,
    contexto: parsed.contexto || userStory.description,
    objetivo: parsed.objetivo || titulo,
    criteriosAceite: parsed.criteriosAceite,
    branch: parsed.branch || 'feat/existing-us',
    tags: flattenTagPlan(tagPlan),
    tagPlan,
    tagColors: {},
    usStatusId: userStory.status,
    milestoneId: userStory.milestone ?? null,
    mode: 'existing_us',
    existingUserStoryId: userStory.id,
    existingUserStoryRef: userStory.ref,
    tasks: tasks.map((task) => ({
      subject: task.subject,
      description: task.description,
      statusId: task.status,
    })),
  };
}
