import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { codebasesRouter } from './routes/codebases.routes.js';
import { configRouter } from './routes/config.routes.js';
import { generateRouter } from './routes/generate.routes.js';
import { publishRouter } from './routes/publish.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { workspacesRouter } from './routes/workspaces.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { runtimeConfig } from './services/runtime-config.service.js';
import { formatErrorMessage } from './utils/error-message.js';
import { HttpError } from './utils/http-error.js';
import { getAppVersion } from './version.js';

function mountFrontend(app: express.Express): void {
  const indexHtml = path.join(config.frontendDist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    return;
  }

  app.use(express.static(config.frontendDist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    res.sendFile(indexHtml, (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const settings = runtimeConfig.getSettings();
    res.json({
      status: 'ok',
      version: getAppVersion(),
      hasActiveWorkspace: runtimeConfig.hasActiveWorkspace(),
      hasDefaultCodebase: runtimeConfig.hasDefaultCodebase(),
      settingsConfigured: Boolean(settings.geminiApiKey && runtimeConfig.isTaigaAuthenticated()),
      taigaConfigured: Boolean(runtimeConfig.getTaigaConfig().projectId),
      geminiConfigured: Boolean(settings.geminiApiKey),
      gitlabConfigured: runtimeConfig.isGitlabConfigured(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api', codebasesRouter);
  app.use('/api/config', configRouter);
  app.use('/api/generate', generateRouter);
  app.use('/api/publish', publishRouter);

  mountFrontend(app);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const status = error instanceof HttpError ? error.status : 500;
    res.status(status).json({ error: formatErrorMessage(error) });
  });

  return app;
}
