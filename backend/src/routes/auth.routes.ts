import { Router } from 'express';
import { settingsRepository } from '../repositories/settings.repository.js';
import { runtimeConfig } from '../services/runtime-config.service.js';
import { taigaService } from '../services/taiga.service.js';
import { HttpError } from '../utils/http-error.js';

export const authRouter = Router();

function sessionPayload(
  authenticated: boolean,
  user: Awaited<ReturnType<typeof taigaService.getCurrentUser>> | null = null,
) {
  const settings = runtimeConfig.getSettings();
  return {
    authenticated,
    user,
    taigaUrl: settings.taigaUrl,
    lastUsername: user?.email || user?.username || settings.taigaUsername,
  };
}

authRouter.get('/session', async (_req, res, next) => {
  try {
    if (!runtimeConfig.isTaigaAuthenticated()) {
      res.json(sessionPayload(false));
      return;
    }

    try {
      const user = await taigaService.getCurrentUser();
      res.json(sessionPayload(true, user));
    } catch (error) {
      console.error('[auth/session] Falha ao validar sessao Taiga', error);
      if (error instanceof HttpError && error.status === 401) {
        taigaService.invalidateAuth();
        settingsRepository.update({ taigaToken: '', taigaPassword: '' });
      }
      res.json(sessionPayload(false));
    }
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const taigaUrl = typeof req.body?.taigaUrl === 'string' ? req.body.taigaUrl.trim() : '';

    if (!username || !password) {
      throw new HttpError('Informe usuario e senha do Taiga', 400);
    }

    if (taigaUrl) {
      settingsRepository.update({ taigaUrl });
      runtimeConfig.invalidateAuth();
    }

    const { token, user } = await taigaService.authenticate(username, password);
    settingsRepository.update({
      taigaUsername: user.email || user.username,
      taigaToken: token,
      taigaPassword: '',
    });
    taigaService.hydrateSession(token, user);

    res.json(sessionPayload(true, user));
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', (_req, res, next) => {
  try {
    taigaService.invalidateAuth();
    settingsRepository.update({ taigaToken: '', taigaPassword: '' });
    res.json(sessionPayload(false));
  } catch (error) {
    next(error);
  }
});
