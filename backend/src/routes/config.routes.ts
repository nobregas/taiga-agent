import { Router } from 'express';
import { config, isGitlabConfigured } from '../config.js';
import { buildDraftFromUserStory } from '../utils/us.mapper.js';
import { gitlabService } from '../services/gitlab.service.js';
import { taigaService } from '../services/taiga.service.js';

export const configRouter = Router();

configRouter.get('/meta', async (_req, res) => {
  try {
    const meta = await taigaService.getProjectMeta();
    res.json({
      projectId: config.taiga.projectId,
      projectSlug: meta.projectSlug,
      tags: meta.tags,
      tagColors: meta.tagColors,
      userStoryStatuses: meta.userStoryStatuses,
      taskStatuses: meta.taskStatuses,
      sprints: meta.sprints,
      defaultSprintId: meta.defaultSprintId,
      validScopes: config.validScopes ?? [],
      validTaskDomains: config.validTaskDomains ?? [],
      currentUser: meta.currentUser,
      gitlabConfigured: isGitlabConfigured(),
      defaultGitlabBaseBranch: config.gitlab.defaultBase,
      geminiConfigured: Boolean(config.gemini.apiKey),
    });
  } catch (error) {
    res.json({
      projectId: config.taiga.projectId ?? null,
      projectSlug: config.taiga.projectSlug ?? 'unknown',
      tags: [],
      tagColors: {},
      userStoryStatuses: [],
      taskStatuses: [],
      sprints: [],
      defaultSprintId: null,
      validScopes: config.validScopes ?? [],
      validTaskDomains: config.validTaskDomains ?? [],
      currentUser: null,
      gitlabConfigured: isGitlabConfigured(),
      defaultGitlabBaseBranch: config.gitlab.defaultBase,
      geminiConfigured: Boolean(config.gemini.apiKey),
      warning: error instanceof Error ? error.message : 'Taiga metadata unavailable',
    });
  }
});

configRouter.get('/gitlab/branches', async (req, res, next) => {
  try {
    if (!isGitlabConfigured()) {
      res.status(400).json({ error: 'GitLab is not configured on the server' });
      return;
    }

    const query = String(req.query.q ?? '').trim();
    const branches = await gitlabService.searchBranches(query);
    res.json(branches);
  } catch (error) {
    next(error);
  }
});

configRouter.get('/userstories/search', async (req, res, next) => {
  try {
    const query = String(req.query.q ?? '').trim();
    const results = query
      ? await taigaService.searchUserStories(query)
      : await taigaService.listRecentUserStories(20);

    res.json(
      results.slice(0, 20).map((us) => ({
        id: us.id,
        ref: us.ref,
        subject: us.subject,
      })),
    );
  } catch (error) {
    next(error);
  }
});

configRouter.get('/userstories/recent', async (_req, res, next) => {
  try {
    const results = await taigaService.listRecentUserStories(20);
    res.json(
      results.map((us) => ({
        id: us.id,
        ref: us.ref,
        subject: us.subject,
      })),
    );
  } catch (error) {
    next(error);
  }
});

configRouter.get('/userstories/:ref/edit', async (req, res, next) => {
  try {
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
          statusId: userStory.status,
          version: userStory.version,
          url: taigaService.buildUserStoryUrl(userStory.ref, meta.projectSlug),
        },
        tasks: tasks.map((task) => ({
          id: task.id,
          ref: task.ref,
          subject: task.subject,
          description: task.description,
          statusId: task.status,
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
