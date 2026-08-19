import { Router } from 'express';
import { codebaseRepository } from '../repositories/codebase.repository.js';
import { workspaceRepository } from '../repositories/workspace.repository.js';
import { buildDraftFromUserStory } from '../utils/us.mapper.js';
import { gitlabService } from '../services/gitlab.service.js';
import { runtimeConfig } from '../services/runtime-config.service.js';
import { taigaService } from '../services/taiga.service.js';
import { HttpError } from '../utils/http-error.js';
import { toStatusId } from '../utils/task-status.js';

export const configRouter = Router();

configRouter.get('/meta', async (_req, res, next) => {
  const workspace = runtimeConfig.getActiveWorkspace();
  const settings = runtimeConfig.getSettings();
  const codebases = workspace
    ? codebaseRepository.listByWorkspace(workspace.id).map((item) => codebaseRepository.toPublic(item))
    : [];
  const defaultCodebase = workspace ? runtimeConfig.resolveCodebase(null) : null;
  const defaultCodebaseId = defaultCodebase?.id ?? workspace?.defaultCodebaseId ?? null;

  try {
    runtimeConfig.assertTaigaConfigured();
    const meta = await taigaService.getProjectMeta();
    res.json({
      workspaceId: workspace?.id ?? null,
      workspaceName: workspace?.name ?? null,
      projectId: workspace?.taigaProjectId ?? null,
      projectSlug: meta.projectSlug,
      tags: meta.tags,
      tagColors: meta.tagColors,
      userStoryStatuses: meta.userStoryStatuses,
      taskStatuses: meta.taskStatuses,
      sprints: meta.sprints,
      defaultSprintId: meta.defaultSprintId,
      validScopes: runtimeConfig.getValidScopes(defaultCodebaseId),
      validTaskDomains: runtimeConfig.getValidTaskDomains(defaultCodebaseId),
      currentUser: meta.currentUser,
      members: meta.members,
      mergeAssigneeId: workspace?.mergeAssigneeId ?? null,
      codebases,
      defaultCodebaseId,
      gitlabConfigured: runtimeConfig.isGitlabConfigured(defaultCodebaseId),
      defaultGitlabBaseBranch: runtimeConfig.getGitlabConfig(defaultCodebaseId).defaultBase,
      geminiConfigured: Boolean(settings.geminiApiKey),
      settingsConfigured: Boolean(settings.geminiApiKey && runtimeConfig.isTaigaAuthenticated()),
      hasActiveWorkspace: Boolean(workspace),
      hasDefaultCodebase: Boolean(defaultCodebase),
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      next(error);
      return;
    }
    res.json({
      workspaceId: workspace?.id ?? null,
      workspaceName: workspace?.name ?? null,
      projectId: workspace?.taigaProjectId ?? null,
      projectSlug: workspace?.taigaProjectSlug ?? 'unknown',
      tags: [],
      tagColors: {},
      userStoryStatuses: [],
      taskStatuses: [],
      sprints: [],
      defaultSprintId: null,
      validScopes: runtimeConfig.getValidScopes(defaultCodebaseId),
      validTaskDomains: runtimeConfig.getValidTaskDomains(defaultCodebaseId),
      currentUser: null,
      members: [],
      mergeAssigneeId: workspace?.mergeAssigneeId ?? null,
      codebases,
      defaultCodebaseId,
      gitlabConfigured: runtimeConfig.isGitlabConfigured(defaultCodebaseId),
      defaultGitlabBaseBranch: runtimeConfig.getGitlabConfig(defaultCodebaseId).defaultBase,
      geminiConfigured: Boolean(settings.geminiApiKey),
      settingsConfigured: Boolean(settings.geminiApiKey && runtimeConfig.isTaigaAuthenticated()),
      hasActiveWorkspace: Boolean(workspace),
      hasDefaultCodebase: Boolean(defaultCodebase),
      warning: error instanceof Error ? error.message : 'Taiga metadata unavailable',
    });
  }
});

configRouter.get('/tags', async (_req, res, next) => {
  try {
    runtimeConfig.assertTaigaConfigured();
    const meta = await taigaService.getProjectMeta();
    res.json({
      tags: meta.tags,
      tagColors: meta.tagColors,
    });
  } catch (error) {
    next(error);
  }
});

configRouter.get('/members', async (req, res, next) => {
  try {
    runtimeConfig.assertTaigaCredentials();
    const workspaceId = req.query.workspaceId ? Number.parseInt(String(req.query.workspaceId), 10) : null;
    const projectIdQuery = req.query.projectId ? Number.parseInt(String(req.query.projectId), 10) : null;
    let projectId = Number.isFinite(projectIdQuery) ? projectIdQuery : null;

    if (Number.isFinite(workspaceId) && workspaceId) {
      const workspace = workspaceRepository.getById(workspaceId);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }
      projectId = workspace.taigaProjectId;
    }

    if (!projectId) {
      runtimeConfig.assertTaigaConfigured();
      projectId = runtimeConfig.getTaigaConfig().projectId;
    }

    const members = await taigaService.getProjectMembers(projectId);
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

configRouter.get('/gitlab/branches', async (req, res, next) => {
  try {
    const codebaseId = req.query.codebaseId ? Number.parseInt(String(req.query.codebaseId), 10) : null;
    const gitlab = runtimeConfig.getGitlabConfig(codebaseId);

    if (!runtimeConfig.isGitlabConfigured(codebaseId)) {
      res.status(400).json({ error: 'GitLab is not configured for this repository' });
      return;
    }

    const query = String(req.query.q ?? '').trim();
    const branches = await gitlabService.searchBranches(gitlab, query);
    res.json(branches);
  } catch (error) {
    next(error);
  }
});

configRouter.get('/userstories/search', async (req, res, next) => {
  try {
    runtimeConfig.assertTaigaConfigured();
    const query = String(req.query.q ?? '').trim();
    if (!query) {
      res.json([]);
      return;
    }

    const results = await taigaService.searchUserStories(query);
    res.json(results.slice(0, 20));
  } catch (error) {
    console.error('[userstories/search] Falha ao buscar US no Taiga', error);
    next(error);
  }
});

configRouter.get('/userstories/recent', async (_req, res, next) => {
  try {
    runtimeConfig.assertTaigaConfigured();
    const results = await taigaService.listRecentUserStories(20);
    res.json(
      results.map((us) => ({
        id: us.id,
        ref: us.ref,
        subject: us.subject,
        status: us.status,
      })),
    );
  } catch (error) {
    next(error);
  }
});

configRouter.get('/userstories/:ref/edit', async (req, res, next) => {
  try {
    runtimeConfig.assertTaigaConfigured();
    const ref = Number.parseInt(req.params.ref, 10);
    if (!Number.isFinite(ref)) {
      res.status(400).json({ error: 'Ref invalida' });
      return;
    }

    const meta = await taigaService.getProjectMeta();
    const userStory = await taigaService.findUserStoryByRef(ref);
    const tasks = await taigaService.getTasksByUserStory(userStory.id);
    const draft = buildDraftFromUserStory(userStory, tasks);
    const tagNames = userStory.tags.map(([tag]) => tag);

    res.json({
      draft,
      publishResult: {
        success: true,
        userStory: {
          id: userStory.id,
          ref: userStory.ref,
          subject: userStory.subject,
          description: userStory.description,
          tags: tagNames,
          statusId: toStatusId(userStory.status) ?? userStory.status,
          version: userStory.version,
          url: taigaService.buildUserStoryUrl(userStory.ref, meta.projectSlug),
        },
        tasks: tasks.map((task) => ({
          id: task.id,
          ref: task.ref,
          subject: task.subject,
          description: task.description,
          statusId: toStatusId(task.status) ?? task.status,
          assignedTo: task.assigned_to ?? null,
          version: task.version,
          url: taigaService.buildTaskUrl(task.ref, meta.projectSlug),
        })),
        reminders: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

configRouter.get('/userstories/:ref', async (req, res, next) => {
  try {
    runtimeConfig.assertTaigaConfigured();
    const ref = Number.parseInt(req.params.ref, 10);
    const userStory = await taigaService.findUserStoryByRef(ref);
    res.json({
      id: userStory.id,
      ref: userStory.ref,
      subject: userStory.subject,
      description: userStory.description,
      tags: userStory.tags.map(([tag]) => tag),
    });
  } catch (error) {
    next(error);
  }
});
