import { buildApp } from './app.js';
import { migrate } from './db/migrate.js';

await migrate();
const app = await buildApp({ logger: true });
const port = Number(process.env.PORT || 3000);
await app.listen({ port, host: '0.0.0.0' });
