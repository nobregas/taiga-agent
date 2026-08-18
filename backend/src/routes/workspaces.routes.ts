import { Router } from 'express';
import { settingsRepository } from '../repositories/settings.repository.js';
import { workspaceRepository } from '../repositories/workspace.repository.js';
import { runtimeConfig } from '../services/runtime-config.service.js';

function parseNullableId(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const workspacesRouter = Router();

workspacesRouter.get('/', (_req, res) => {
  res.json(workspaceRepository.list());
});

workspacesRouter.post('/', (req, res, next) => {
  try {
    const name = String(req.body.name ?? '').trim();
    const taigaProjectId = Number(req.body.taigaProjectId);
    const taigaProjectSlug = req.body.taigaProjectSlug ? String(req.body.taigaProjectSlug).trim() : null;

    if (!name) {
      res.status(400).json({ error: 'Nome do workspace e obrigatorio' });
      return;
    }

    if (!Number.isFinite(taigaProjectId)) {
      res.status(400).json({ error: 'taigaProjectId invalido' });
      return;
    }

    const workspace = workspaceRepository.create({
      name,
      taigaProjectId,
      taigaProjectSlug,
      mergeAssigneeId: parseNullableId(req.body.mergeAssigneeId) ?? null,
    });

    const settings = settingsRepository.getOrCreate();
    if (!settings.activeWorkspaceId) {
      settingsRepository.setActiveWorkspace(workspace.id);
      runtimeConfig.invalidateAuth();
    }

    res.status(201).json(workspace);
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:id', (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID invalido' });
      return;
    }

    const workspace = workspaceRepository.update(id, {
      name: req.body.name ? String(req.body.name).trim() : undefined,
      taigaProjectId:
        req.body.taigaProjectId !== undefined ? Number(req.body.taigaProjectId) : undefined,
      taigaProjectSlug:
        req.body.taigaProjectSlug !== undefined
          ? String(req.body.taigaProjectSlug).trim() || null
          : undefined,
      defaultCodebaseId:
        req.body.defaultCodebaseId !== undefined ? req.body.defaultCodebaseId : undefined,
      mergeAssigneeId: parseNullableId(req.body.mergeAssigneeId),
    });

    const settings = settingsRepository.getOrCreate();
    if (settings.activeWorkspaceId === id) {
      runtimeConfig.invalidateAuth();
    }

    res.json(workspace);
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete('/:id', (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID invalido' });
      return;
    }

    const settings = settingsRepository.getOrCreate();
    workspaceRepository.delete(id);

    if (settings.activeWorkspaceId === id) {
      const remaining = workspaceRepository.list()[0];
      settingsRepository.setActiveWorkspace(remaining?.id ?? null);
      runtimeConfig.invalidateAuth();
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post('/:id/activate', (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID invalido' });
      return;
    }

    const workspace = workspaceRepository.getById(id);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    settingsRepository.setActiveWorkspace(id);
    runtimeConfig.invalidateAuth();
    res.json(workspace);
  } catch (error) {
    next(error);
  }
});
