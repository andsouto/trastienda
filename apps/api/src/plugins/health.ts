import { type FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';

export const healthPlugin: FastifyPluginCallbackTypebox = (app, _options, done) => {
  app.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Liveness probe',
      response: {
        200: Type.Object({
          status: Type.Literal('ok'),
        }),
      },
    },
  }, () => ({ status: 'ok' as const }));

  done();
};
