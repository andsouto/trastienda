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
