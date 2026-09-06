import { type FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';

const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
});

/**
 * Two probes, not one, because Kubernetes reacts differently to each: a failing
 * liveness probe restarts the container, a failing readiness probe only takes
 * the pod out of the Service.
 *
 * Liveness therefore checks nothing beyond the process answering HTTP. Wiring a
 * dependency in here is the classic outage amplifier: the database blips, every
 * replica fails the probe at once and the fleet restarts itself.
 *
 * Readiness is where dependency checks belong, and gains them as they arrive —
 * the database first. The identity provider stays out on purpose: if it is
 * down, every replica is equally unable to serve, so dropping them all out of
 * rotation trades a degraded service for no service at all.
 */
export const healthPlugin: FastifyPluginCallbackTypebox = (app, _options, done) => {
  app.get('/livez', {
    schema: {
      tags: ['system'],
      summary: 'Liveness probe',
      response: { 200: HealthResponse },
    },
  }, () => ({ status: 'ok' as const }));

  app.get('/readyz', {
    schema: {
      tags: ['system'],
      summary: 'Readiness probe',
      response: { 200: HealthResponse },
    },
  }, () => ({ status: 'ok' as const }));

  done();
};
