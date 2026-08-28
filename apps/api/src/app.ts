import swagger from '@fastify/swagger';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { fastify, type FastifyServerOptions } from 'fastify';

import packageJson from '../package.json' with { type: 'json' };
import { protectScope, type VerifyToken } from './plugins/auth.ts';
import { healthPlugin } from './plugins/health.ts';
import { identityPlugin } from './plugins/identity.ts';

export interface AppOptions {
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

  app.decorateRequest('auth', null);

  // Outside the protected scope below, so it needs no token.
  app.register(healthPlugin);

  // Not awaited on purpose: awaiting `register` closes the encapsulation
  // context, and the hook stops covering what is registered after it.
  app.register((scope, _options, done) => {
    protectScope(scope, options.verifyToken);
    scope.register(identityPlugin);
    done();
  });

  await app.ready();

  return app;
}
