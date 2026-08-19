import { GoogleGenAI } from '@google/genai';
import type { Draft } from '../schemas/draft.schema.js';
import {
  draftSchema,
  finalizeDraft,
  normalizeBranch,
  slugifyBranch,
} from '../schemas/draft.schema.js';
import type { BranchContext } from './gitlab.service.js';
import type { TaigaProjectMeta } from './taiga.service.js';
import { buildSystemPrompt } from '../utils/template.js';
import type { GenerateRequest } from '../schemas/draft.schema.js';
import { defaultOpenStatusId, findDoneStatusId } from '../utils/task-status.js';
import { buildTagStringSchema, mergeTagColors, resolveTagPlanAllowingNew } from '../utils/tags.js';
import { formatAcceptanceCriteria } from '../utils/acceptance-criteria.js';
import { ensureDefaultFinalTasks } from '../utils/default-tasks.js';
import { toValidUserId } from '../utils/user-id.js';
import { runtimeConfig } from './runtime-config.service.js';

function buildAiResponseSchema() {
  const tagValue = buildTagStringSchema();

  return {
    type: 'object',
    properties: {
      escopo: { type: 'string' },
      titulo: { type: 'string' },
      contextoGeral: { type: 'string' },
      contexto: { type: 'string' },
      objetivo: { type: 'string' },
      criteriosAceite: { type: 'array', items: { type: 'string' } },
      branch: { type: 'string' },
      tagPlan: {
        type: 'object',
        properties: {
          aplicacao: tagValue,
          escopo: tagValue,
          tipo: tagValue,
          dominio: tagValue,
        },
        required: ['aplicacao', 'escopo', 'tipo', 'dominio'],
      },
      tags: { type: 'array', items: tagValue },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            subject: { type: 'string' },
            description: { type: 'string' },
            gitlabInformed: { type: 'boolean' },
            branchComplete: { type: 'boolean' },
            inferredFrom: { type: 'array', items: { type: 'string' } },
          },
          required: ['subject'],
        },
      },
      gitNotes: { type: 'string' },
    },
    required: [
      'escopo',
      'titulo',
      'contextoGeral',
      'contexto',
      'objetivo',
      'criteriosAceite',
      'branch',
      'tagPlan',
      'tasks',
    ],
  };
}

export class GeminiService {
  private client: GoogleGenAI | null = null;
  private clientApiKey: string | null = null;

  invalidateClient(): void {
    this.client = null;
    this.clientApiKey = null;
  }

  private getClient(): GoogleGenAI {
    runtimeConfig.assertGeminiConfigured();
    const { apiKey, model: _model } = runtimeConfig.getGeminiConfig();

    if (!this.client || this.clientApiKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey: apiKey! });
      this.clientApiKey = apiKey;
    }

    return this.client;
  }

  private buildUserPrompt(
    request: GenerateRequest,
    meta: TaigaProjectMeta,
    branchContextText?: string,
  ): string {
    const tasksFromCall = request.tasksFromCall
      ?.split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);

    const prefix = request.branchPrefix ?? 'feat';
    const parts = [
      `Modo: ${request.mode}`,
      `Escopo da US (somente no titulo): ${request.escopo ?? '(inferir)'}`,
      `Titulo da US: ${request.titulo ?? '(inferir)'}`,
      `Contexto geral informado pelo usuario (briefing — NAO copiar para secao Contexto da US):`,
      request.contextoGeral,
    ];

    if (request.objetivo) {
      parts.push(`Objetivo informado: ${request.objetivo}`);
    }
    if (request.criteriosAceite) {
      parts.push(`Criterios de aceite informados: ${request.criteriosAceite}`);
    }
    if (request.implemented === false) {
      parts.push(
        'US ainda nao implementada: nao existe branch. Nao mencione uma branch especifica no contexto/objetivo.',
      );
    } else if (request.branch) {
      parts.push(`Branch informada: ${request.branch}`);
    } else if (request.titulo) {
      parts.push(`Branch sugerida: ${prefix}/${slugifyBranch(request.titulo)}`);
    }
    if (tasksFromCall?.length) {
      parts.push(
        `Tasks da call (prioridade — reescrever em linguagem obliqua com dominio [Pedido], [Checkout], etc.):\n${tasksFromCall.map((t) => `- ${t}`).join('\n')}`,
      );
    }
    if (request.existingUserStoryRef) {
      parts.push(`US existente ref: #${request.existingUserStoryRef}`);
    }
    if (branchContextText) {
      parts.push(`Contexto GitLab:\n${branchContextText}`);
      parts.push(
        `Para cada task, use o contexto GitLab e preencha:
- gitlabInformed: true quando a task foi inferida ou validada com base nos commits/diffs da branch
- branchComplete: true quando o trabalho da task ja aparece implementado no diff/commits
- inferredFrom: ate 5 caminhos de arquivo ou SHAs de commit que sustentam a task
Tasks sem relacao com a branch devem ter gitlabInformed=false e branchComplete=false.`,
      );
    }

    if (meta.tags.length) {
      parts.push(
        'Prefira tags do banco compacto do system prompt. Crie tag nova SOMENTE se nenhum nome existente servir.',
      );
    } else {
      parts.push('Projeto sem tags cadastradas — crie tagPlan com nomes curtos.');
    }
    parts.push('criteriosAceite deve ser um array de strings, um criterio por item, sem numeracao.');
    parts.push(
      `Prefixo de branch preferido pelo usuario: ${prefix} (pode mudar se fix/test/chore/hotfix for mais adequado)`,
    );

    if (request.mode === 'existing_us') {
      parts.push('Gere apenas tasks. Mantenha contextoGeral informado e gere contexto enxuto se necessario.');
    }

    if (request.mode === 'retrospective') {
      parts.push(
        'Modo retrospectiva: inferir US/tasks dos commits. Tasks com dominio de negocio, nunca [App] se App for escopo da US.',
      );
    }

    return parts.join('\n\n');
  }

  async generateDraft(
    request: GenerateRequest,
    meta: TaigaProjectMeta,
    _branchContext?: BranchContext,
    branchContextText?: string,
    codebaseId?: number | null,
  ): Promise<Draft> {
    const client = this.getClient();
    const prefix = request.branchPrefix ?? 'feat';
    const gemini = runtimeConfig.getGeminiConfig();
    const codebase = runtimeConfig.resolveCodebase(codebaseId ?? request.codebaseId);

    const response = await client.models.generateContent({
      model: gemini.model,
      contents: this.buildUserPrompt(request, meta, branchContextText),
      config: {
        systemInstruction: buildSystemPrompt(meta.tags, codebaseId ?? request.codebaseId),
        responseMimeType: 'application/json',
        responseSchema: buildAiResponseSchema(),
        temperature: 0.4,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned an empty response');
    }

    const parsed = JSON.parse(text) as Draft;
    const escopo = parsed.escopo || request.escopo || 'App';
    const titulo = parsed.titulo || request.titulo || 'Nova user story';
    const tagPlan = resolveTagPlanAllowingNew(parsed.tagPlan, meta.tags);

    const draft = draftSchema.parse({
      ...parsed,
      escopo,
      titulo,
      contextoGeral: parsed.contextoGeral || request.contextoGeral,
      mode: request.mode,
      implemented: request.implemented,
      existingUserStoryId: request.existingUserStoryId,
      existingUserStoryRef: request.existingUserStoryRef,
      codebaseId: codebase?.id ?? codebaseId ?? request.codebaseId,
      repositoryName: codebase?.name ?? request.repositoryName,
      criteriosAceite: formatAcceptanceCriteria(parsed.criteriosAceite ?? request.criteriosAceite) || null,
      branch: normalizeBranch(
        parsed.branch || request.branch || `${prefix}/${slugifyBranch(titulo)}`,
        prefix,
      ),
      tagPlan,
      tagColors: mergeTagColors(tagPlan, parsed.tagColors, meta.tagColors),
      tags: parsed.tags ?? [],
      tasks: ensureDefaultFinalTasks(
        this.applyTaskBranchMetadata(parsed.tasks ?? [], meta, Boolean(branchContextText)),
        { defaultAssigneeId: toValidUserId(meta.currentUser?.id) },
      ),
    });

    return finalizeDraft(draft, escopo);
  }

  private applyTaskBranchMetadata(
    tasks: Draft['tasks'],
    meta: TaigaProjectMeta,
    hasBranchContext: boolean,
  ): Draft['tasks'] {
    if (!hasBranchContext) {
      return tasks.map((task) => ({
        ...task,
        gitlabInformed: false,
        branchComplete: false,
        inferredFrom: undefined,
      }));
    }

    const doneId = findDoneStatusId(meta.taskStatuses);
    const openId = defaultOpenStatusId(meta.taskStatuses);

    return tasks.map((task) => {
      const gitlabInformed = Boolean(task.gitlabInformed);
      const branchComplete = Boolean(task.branchComplete);
      const inferredFrom = task.inferredFrom?.filter(Boolean).slice(0, 5);

      let statusId = task.statusId;
      if (branchComplete && doneId) {
        statusId = doneId;
      } else if (gitlabInformed && openId) {
        statusId = openId;
      }

      return {
        ...task,
        gitlabInformed,
        branchComplete,
        inferredFrom: inferredFrom?.length ? inferredFrom : undefined,
        statusId,
      };
    });
  }
}

export const geminiService = new GeminiService();
