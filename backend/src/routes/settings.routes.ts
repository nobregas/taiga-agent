import { Router } from 'express';
import { settingsRepository } from '../repositories/settings.repository.js';
import { runtimeConfig } from '../services/runtime-config.service.js';
import { taigaService } from '../services/taiga.service.js';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  const settings = settingsRepository.getOrCreate();
  res.json(settingsRepository.toPublic(settings));
});

settingsRouter.put('/', (req, res, next) => {
  try {
    const updated = settingsRepository.update({
      taigaUrl: req.body.taigaUrl,
      taigaUsername: req.body.taigaUsername,
      taigaPassword: req.body.taigaPassword,
      taigaToken: req.body.taigaToken,
      geminiApiKey: req.body.geminiApiKey,
      geminiModel: req.body.geminiModel,
    });

    runtimeConfig.invalidateAuth();
    res.json(settingsRepository.toPublic(updated));
  } catch (error) {
    next(error);
  }
});

settingsRouter.get('/taiga/projects', async (_req, res, next) => {
  try {
    runtimeConfig.assertTaigaCredentials();
    const projects = await taigaService.listProjects();
    res.json(projects);
  } catch (error) {
    next(error);
  }
});
