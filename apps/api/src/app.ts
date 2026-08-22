import swagger from '@fastify/swagger';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { fastify, type FastifyServerOptions } from 'fastify';

import packageJson from '../package.json' with { type: 'json' };
import { protectScope, type VerifyToken } from './plugins/auth.ts';
import { healthPlugin } from './plugins/health.ts';
import { identityPlugin } from './plugins/identity.ts';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
  /**
   * Required on purpose: there is no "authentication disabled" mode to forget
   * to turn back on. Tests and tooling pass their own verifier.
   */
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

  // Public surface: no token. A liveness probe cannot authenticate, and
  // ADR-0008 wants the future public catalog kept apart from management from
  // day one.
  app.register(healthPlugin);

  // Everything else. The scope is the boundary — see the note on protectScope.
  // The inner register is not awaited: awaiting it would close the
  // encapsulation context and the auth hook would stop covering its siblings.
  app.register((scope, _options, done) => {
    protectScope(scope, options.verifyToken);
    scope.register(identityPlugin);
    done();
  });

  await app.ready();

  return app;
}
