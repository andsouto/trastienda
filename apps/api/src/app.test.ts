import { expect, it } from 'vitest';

import { buildApp } from './app.ts';

const rejectEveryToken = () => Promise.reject(new Error('no token is valid here'));

it.each(['/livez', '/readyz'])('GET %s responds ok without a token', async (url) => {
  const app = await buildApp({ verifyToken: rejectEveryToken });

  const response = await app.inject({ method: 'GET', url });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok' });

  await app.close();
});

it('serves no API reference unless asked to', async () => {
  const app = await buildApp({ verifyToken: rejectEveryToken });

  const response = await app.inject({ method: 'GET', url: '/docs/' });

  expect(response.statusCode).toBe(404);

  await app.close();
});

it('serves the API reference on request, and keeps it out of the contract', async () => {
  const app = await buildApp({ apiReference: true, verifyToken: rejectEveryToken });

  const page = await app.inject({ method: 'GET', url: '/docs/' });
  const spec = await app.inject({ method: 'GET', url: '/docs/openapi.json' });

  expect(page.statusCode).toBe(200);
  expect(page.headers['content-type']).toMatch(/^text\/html/);
  expect(spec.json()).toHaveProperty('paths./me');
  expect(Object.keys(app.swagger().paths ?? {})).not.toContainEqual(expect.stringMatching(/^\/docs/));

  await app.close();
});
