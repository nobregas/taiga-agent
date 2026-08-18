import { createApp } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { seedFromEnvIfEmpty } from './db/seed.js';
import { getDatabase } from './db/connection.js';

runMigrations();
getDatabase();
seedFromEnvIfEmpty();

const app = createApp();

app.listen(config.port, config.host, () => {
  console.log(`Taiga Agent backend running on http://${config.host}:${config.port}`);
});
