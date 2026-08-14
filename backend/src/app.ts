import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { configRouter } from './routes/config.routes.js';
import { generateRouter } from './routes/generate.routes.js';
import { publishRouter } from './routes/publish.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      taigaConfigured: Boolean(config.taiga.projectId),
      geminiConfigured: Boolean(config.gemini.apiKey),
      gitlabConfigured: Boolean(config.gitlab.token && config.gitlab.projectId),
    });
  });

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
