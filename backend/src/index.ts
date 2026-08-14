import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`Taiga Agent backend running on http://localhost:${config.port}`);
});
