import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { fastify, type FastifyServerOptions } from 'fastify';

import packageJson from '../package.json' with { type: 'json' };
import { installApiReference } from './plugins/api-reference.ts';
import { installAuth, protectScope, type VerifyToken } from './plugins/auth.ts';
import { healthPlugin } from './plugins/health.ts';
import { identityPlugin } from './plugins/identity.ts';

export interface AppOptions {
  /**
  Serves the API reference at `/docs`. Development only: see `plugins/api-reference.ts`.
  */
  apiReference?: boolean;
  /**
  Browser origins allowed to call the API from another origin, such as the admin's.
  */
  corsOrigins?: string[];
  logger?: FastifyServerOptions['logger'];
  verifyToken: VerifyToken;
}

/**
 * Builds the HTTP application without binding it to the network, so tests and
 * tooling (OpenAPI generation) can use it via `inject()` / `swagger()`.
 * Dependencies (repositories, UnitOfWork, ...) will be passed in here by the
 * composition root in `main.ts` as domain modules appear.
 */
export async function buildApp(options: AppOptions) {
  const app = fastify({
    logger: options.logger ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  installAuth(app);

  // Unless told, @fastify/cors lets the browser send only GET, HEAD and POST.
  // Chromium keeps a preflight for two hours at most.
  if (options.corsOrigins?.length) {
    app.register(cors, {
      maxAge: 7200,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      origin: options.corsOrigins,
    });
  }

  app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'trastienda API',
        description: 'Inventory and sales management for small retail.',
        version: packageJson.version,
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  if (options.apiReference) {
    await installApiReference(app);
  }

  app.register(healthPlugin);

  app.register((scope, _options, done) => {
    protectScope(scope, options.verifyToken);
    scope.register(identityPlugin);
    done();
  });

  await app.ready();

  return app;
}
