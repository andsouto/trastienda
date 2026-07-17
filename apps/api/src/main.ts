// Composition root: the only place that knows every concrete implementation.
import { buildApp } from './app.ts';
import { loadEnvironment } from './config/environment.ts';

const environment = loadEnvironment();

const app = await buildApp({
  logger: { level: environment.LOG_LEVEL },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close();
  });
}

await app.listen({ port: environment.PORT, host: environment.HOST });
