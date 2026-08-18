import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { codebasesRouter } from './routes/codebases.routes.js';
import { configRouter } from './routes/config.routes.js';
import { generateRouter } from './routes/generate.routes.js';
import { publishRouter } from './routes/publish.routes.js';
import { settingsRouter } from './routes/settings.routes.js';
import { workspacesRouter } from './routes/workspaces.routes.js';
import { runtimeConfig } from './services/runtime-config.service.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    const settings = runtimeConfig.getSettings();
    res.json({
      status: 'ok',
      hasActiveWorkspace: runtimeConfig.hasActiveWorkspace(),
      hasDefaultCodebase: runtimeConfig.hasDefaultCodebase(),
      settingsConfigured: Boolean(
        settings.geminiApiKey && (settings.taigaToken || (settings.taigaUsername && settings.taigaPassword)),
      ),
      taigaConfigured: Boolean(runtimeConfig.getTaigaConfig().projectId),
      geminiConfigured: Boolean(settings.geminiApiKey),
      gitlabConfigured: runtimeConfig.isGitlabConfigured(),
    });
  });

  app.use('/api/settings', settingsRouter);
  app.use('/api/workspaces', workspacesRouter);
  app.use('/api', codebasesRouter);
  app.use('/api/config', configRouter);
  app.use('/api/generate', generateRouter);
  app.use('/api/publish', publishRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    res.status(500).json({ error: message });
  });

  return app;
}
