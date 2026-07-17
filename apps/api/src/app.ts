import swagger from '@fastify/swagger';
import { type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { fastify, type FastifyServerOptions } from 'fastify';

import { healthPlugin } from './plugins/health.ts';

export interface AppOptions {
  logger?: FastifyServerOptions['logger'];
}

/**
 * Builds the HTTP application without binding it to the network, so tests and
 * tooling (OpenAPI generation) can use it via `inject()` / `swagger()`.
 * Dependencies (repositories, UnitOfWork, ...) will be passed in here by the
 * composition root in `main.ts` as domain modules appear.
 */
export async function buildApp(options: AppOptions = {}) {
  const app = fastify({
    logger: options.logger ?? false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'trastienda API',
        description: 'Inventory and sales management for small retail.',
        version: '0.0.0',
      },
    },
  });

  await app.register(healthPlugin);

  return app;
}
