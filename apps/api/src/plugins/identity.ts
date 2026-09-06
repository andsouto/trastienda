import { type FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';

import { authenticatedUser } from './auth.ts';

/**
 * Who the bearer token says you are. The admin calls it after login; it also
 * makes the authenticated scope observable end to end while no domain module
 * exists yet.
 */
export const identityPlugin: FastifyPluginCallbackTypebox = (app, _options, done) => {
  app.get('/me', {
    schema: {
      response: {
        200: Type.Object({
          subject: Type.String(),
        }),
      },
      security: [{ bearerAuth: [] }],
      summary: 'The authenticated caller',
      tags: ['system'],
    },
  }, request => ({ subject: authenticatedUser(request).subject }));

  done();
};
