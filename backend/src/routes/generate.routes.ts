import { Router } from 'express';
import { generateRequestSchema } from '../schemas/draft.schema.js';
import { buildUsDescription, buildUsSubject } from '../schemas/draft.schema.js';
import { geminiService } from '../services/gemini.service.js';
import { gitlabService } from '../services/gitlab.service.js';
import { runtimeConfig } from '../services/runtime-config.service.js';
import { taigaService } from '../services/taiga.service.js';
import { ensureDefaultFinalTasks } from '../utils/default-tasks.js';

export const generateRouter = Router();

generateRouter.post('/', async (req, res, next) => {
  try {
    const request = generateRequestSchema.parse(req.body);
    runtimeConfig.assertTaigaConfigured();
    runtimeConfig.assertGeminiConfigured();

    if (request.mode === 'retrospective' && !request.gitlabBranch?.trim() && !request.branch?.trim()) {
      res.status(400).json({ error: 'Informe a branch GitLab para o modo retrospectiva' });
      return;
    }

    const codebase = runtimeConfig.resolveCodebase(request.codebaseId);
    const gitlab = runtimeConfig.getGitlabConfig(codebase?.id);

    if (request.codebaseId && !codebase) {
      res.status(400).json({ error: 'Repositorio invalido para o workspace ativo' });
      return;
    }

    const meta = await taigaService.getProjectMeta();

    let branchContext;
    let branchContextText: string | undefined;

    const branchName = (request.gitlabBranch?.trim() || request.branch?.trim()) ?? '';

    if (runtimeConfig.isGitlabConfigured(codebase?.id) && branchName) {
      const compareBase = request.gitlabCompareBase?.trim() || gitlab.defaultBase;

      branchContext = await gitlabService.getBranchContext(gitlab, branchName, compareBase);
      branchContextText = gitlabService.formatContextForPrompt(branchContext);
    }

    const draft = await geminiService.generateDraft(
      {
        ...request,
        codebaseId: codebase?.id ?? request.codebaseId,
        repositoryName: codebase?.name ?? request.repositoryName,
      },
      meta,
      branchContext,
      branchContextText,
      codebase?.id,
    );

    const workspace = runtimeConfig.getActiveWorkspace();
    draft.tasks = ensureDefaultFinalTasks(draft.tasks, {
      defaultAssigneeId: meta.currentUser?.id ?? null,
      mergeAssigneeId: workspace?.mergeAssigneeId ?? null,
    });

    if (draft.milestoneId == null && meta.defaultSprintId) {
      draft.milestoneId = meta.defaultSprintId;
    }

    if (branchContext) {
      const compareBase = request.gitlabCompareBase?.trim() || gitlab.defaultBase;
      draft.gitlabEnrichment = {
        sourceBranch: branchContext.branch,
        baseBranch: compareBase,
        enrichedAt: new Date().toISOString(),
        stats: branchContext.stats,
        pathsConsidered: branchContext.diffSummary.slice(0, 15).map((item) => item.path),
      };
    }

    res.json({
      draft,
      preview: {
        subject: buildUsSubject(draft.escopo, draft.titulo),
        description: buildUsDescription(draft),
        gitNotes: draft.gitNotes,
      },
      branchContext: branchContext
        ? {
            branch: branchContext.branch,
            stats: branchContext.stats,
            commits: branchContext.commits.slice(0, 10),
            diffSummary: branchContext.diffSummary.slice(0, 15),
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});
