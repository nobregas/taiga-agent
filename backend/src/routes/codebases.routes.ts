import { Router } from 'express';
import { codebaseRepository } from '../repositories/codebase.repository.js';
import { workspaceRepository } from '../repositories/workspace.repository.js';

export const codebasesRouter = Router();

codebasesRouter.get('/workspaces/:workspaceId/codebases', (req, res, next) => {
  try {
    const workspaceId = Number.parseInt(req.params.workspaceId, 10);
    if (!Number.isFinite(workspaceId)) {
      res.status(400).json({ error: 'workspaceId invalido' });
      return;
    }

    if (!workspaceRepository.getById(workspaceId)) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json(codebaseRepository.listByWorkspace(workspaceId).map((item) => codebaseRepository.toPublic(item)));
  } catch (error) {
    next(error);
  }
});

codebasesRouter.post('/workspaces/:workspaceId/codebases', (req, res, next) => {
  try {
    const workspaceId = Number.parseInt(req.params.workspaceId, 10);
    if (!Number.isFinite(workspaceId)) {
      res.status(400).json({ error: 'workspaceId invalido' });
      return;
    }

    if (!workspaceRepository.getById(workspaceId)) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const name = String(req.body.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'Nome do repositorio e obrigatorio' });
      return;
    }

    const codebase = codebaseRepository.create({
      workspaceId,
      name,
      gitlabUrl: req.body.gitlabUrl,
      gitlabToken: req.body.gitlabToken,
      gitlabProjectId: req.body.gitlabProjectId,
      gitlabDefaultBase: req.body.gitlabDefaultBase,
      gitlabDiffSnippetLines:
        req.body.gitlabDiffSnippetLines !== undefined
          ? Number(req.body.gitlabDiffSnippetLines)
          : undefined,
      validScopes: Array.isArray(req.body.validScopes) ? req.body.validScopes : undefined,
      validTaskDomains: Array.isArray(req.body.validTaskDomains) ? req.body.validTaskDomains : undefined,
      isDefault: Boolean(req.body.isDefault),
    });

    res.status(201).json(codebaseRepository.toPublic(codebase));
  } catch (error) {
    next(error);
  }
});

codebasesRouter.patch('/codebases/:id', (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID invalido' });
      return;
    }

    const codebase = codebaseRepository.update(id, {
      name: req.body.name ? String(req.body.name).trim() : undefined,
      gitlabUrl: req.body.gitlabUrl,
      gitlabToken: req.body.gitlabToken,
      gitlabProjectId: req.body.gitlabProjectId,
      gitlabDefaultBase: req.body.gitlabDefaultBase,
      gitlabDiffSnippetLines:
        req.body.gitlabDiffSnippetLines !== undefined
          ? Number(req.body.gitlabDiffSnippetLines)
          : undefined,
      validScopes: Array.isArray(req.body.validScopes) ? req.body.validScopes : undefined,
      validTaskDomains: Array.isArray(req.body.validTaskDomains) ? req.body.validTaskDomains : undefined,
      isDefault: req.body.isDefault !== undefined ? Boolean(req.body.isDefault) : undefined,
    });

    res.json(codebaseRepository.toPublic(codebase));
  } catch (error) {
    next(error);
  }
});

codebasesRouter.delete('/codebases/:id', (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID invalido' });
      return;
    }

    codebaseRepository.delete(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

codebasesRouter.post('/codebases/:id/set-default', (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'ID invalido' });
      return;
    }

    const codebase = codebaseRepository.setDefault(id);
    res.json(codebaseRepository.toPublic(codebase));
  } catch (error) {
    next(error);
  }
});
