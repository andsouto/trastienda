import { expect, it } from 'vitest';

import { buildApp } from './app.ts';

it('GET /health responds ok', async () => {
  const app = await buildApp();

  const response = await app.inject({ method: 'GET', url: '/health' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: 'ok' });

  await app.close();
});
