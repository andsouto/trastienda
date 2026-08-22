// Composition root: the only place that knows every concrete implementation.
import { buildApp } from './app.ts';
import { loadEnvironment } from './config/environment.ts';
import { createRemoteTokenVerifier } from './plugins/auth.ts';

const environment = loadEnvironment();

const app = await buildApp({
  logger: { level: environment.LOG_LEVEL },
  verifyToken: createRemoteTokenVerifier({
    audience: environment.OIDC_AUDIENCE,
    issuer: environment.OIDC_ISSUER_URL,
  }),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close();
  });
}

await app.listen({ port: environment.PORT, host: environment.HOST });
