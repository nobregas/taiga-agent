import { GoogleGenAI } from '@google/genai';
import { assertGeminiConfigured, config } from '../config.js';
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

const aiResponseSchema = {
  type: 'object',
  properties: {
    escopo: { type: 'string' },
    titulo: { type: 'string' },
    contextoGeral: { type: 'string' },
    contexto: { type: 'string' },
    objetivo: { type: 'string' },
    criteriosAceite: { type: ['string', 'null'] },
    branch: { type: 'string' },
    tagPlan: {
      type: 'object',
      properties: {
        aplicacao: { type: 'string' },
        escopo: { type: 'string' },
        tipo: { type: 'string' },
        dominio: { type: 'string' },
      },
      required: ['aplicacao', 'escopo', 'tipo', 'dominio'],
    },
    tagColors: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    tags: { type: 'array', items: { type: 'string' } },
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

export class GeminiService {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    assertGeminiConfigured();
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: config.gemini.apiKey! });
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
    if (request.branch) {
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

    parts.push(
      `Tags existentes no Taiga: ${meta.tags.join(', ') || 'nenhuma — gere tagPlan e tagColors'}`,
    );
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
  ): Promise<Draft> {
    const client = this.getClient();
    const prefix = request.branchPrefix ?? 'feat';

    const response = await client.models.generateContent({
      model: config.gemini.model,
      contents: this.buildUserPrompt(request, meta, branchContextText),
      config: {
        systemInstruction: buildSystemPrompt(meta.tags),
        responseMimeType: 'application/json',
        responseSchema: aiResponseSchema,
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

    const draft = draftSchema.parse({
      ...parsed,
      escopo,
      titulo,
      contextoGeral: parsed.contextoGeral || request.contextoGeral,
      mode: request.mode,
      existingUserStoryId: request.existingUserStoryId,
      existingUserStoryRef: request.existingUserStoryRef,
      criteriosAceite: parsed.criteriosAceite ?? null,
      branch: normalizeBranch(
        parsed.branch || request.branch || `${prefix}/${slugifyBranch(titulo)}`,
        prefix,
      ),
      tagColors: parsed.tagColors ?? {},
      tags: parsed.tags ?? [],
      tasks: this.applyTaskBranchMetadata(parsed.tasks, meta, Boolean(branchContextText)),
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
