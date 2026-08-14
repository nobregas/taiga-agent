import { Router } from 'express';
import { isGitlabConfigured } from '../config.js';
import { generateRequestSchema } from '../schemas/draft.schema.js';
import { buildUsDescription, buildUsSubject } from '../schemas/draft.schema.js';
import { geminiService } from '../services/gemini.service.js';
import { gitlabService } from '../services/gitlab.service.js';
import { taigaService } from '../services/taiga.service.js';

export const generateRouter = Router();

generateRouter.post('/', async (req, res, next) => {
  try {
    const request = generateRequestSchema.parse(req.body);

    if (request.mode === 'retrospective' && !request.gitlabBranch?.trim() && !request.branch?.trim()) {
      res.status(400).json({ error: 'Informe a branch GitLab para o modo retrospectiva' });
      return;
    }

    const meta = await taigaService.getProjectMeta();

    let branchContext;
    let branchContextText: string | undefined;

    const branch = request.gitlabBranch?.trim();
    if (request.enrichWithGitlab && branch) {
      if (!isGitlabConfigured()) {
        res.status(400).json({ error: 'GitLab is not configured on the server' });
        return;
      }

      branchContext = await gitlabService.getBranchContext(branch);
      branchContextText = gitlabService.formatContextForPrompt(branchContext);
    }

    const draft = await geminiService.generateDraft(request, meta, branchContext, branchContextText);
    if (draft.milestoneId == null && meta.defaultSprintId) {
      draft.milestoneId = meta.defaultSprintId;
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
