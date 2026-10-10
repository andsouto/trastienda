import { describe, expect, it } from 'vitest';

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

const admin = 'http://localhost:4200';

function preflight(origin: string) {
  return {
    headers: {
      'access-control-request-headers': 'authorization',
      'access-control-request-method': 'GET',
      origin,
    },
    method: 'OPTIONS' as const,
    url: '/me',
  };
}

describe('CORS', () => {
  it('answers a preflight from an allowed origin without asking for a token', async () => {
    const app = await buildApp({ corsOrigins: [admin], verifyToken: rejectEveryToken });

    const response = await app.inject(preflight(admin));

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(admin);
    expect(response.headers['access-control-allow-headers']).toMatch(/authorization/i);
    expect(response.headers['access-control-allow-methods']).toBe('GET, HEAD, POST, PUT, PATCH, DELETE');
    expect(response.headers['access-control-max-age']).toBe('7200');

    await app.close();
  });

  // Otherwise the browser hides the 401 from the admin, which then cannot tell
  // an expired session from a network failure.
  it('lets an allowed origin read a 401', async () => {
    const app = await buildApp({ corsOrigins: [admin], verifyToken: rejectEveryToken });

    const response = await app.inject({ headers: { origin: admin }, method: 'GET', url: '/me' });

    expect(response.statusCode).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe(admin);

    await app.close();
  });

  it.each<[string, string[] | undefined, string]>([
    ['an origin not in the list', [admin], 'https://evil.example.test'],
    ['any origin when none is configured', undefined, admin],
  ])('allows no cross-origin call from %s', async (_case, corsOrigins, origin) => {
    const app = await buildApp({ ...(corsOrigins && { corsOrigins }), verifyToken: rejectEveryToken });

    const response = await app.inject({ headers: { origin }, method: 'GET', url: '/livez' });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });
});
