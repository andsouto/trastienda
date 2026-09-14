import { describe, expect, it } from 'vitest';

import { buildApp } from '../app.ts';
import { type VerifyToken } from './auth.ts';

const ACCEPTED = 'the-one-good-token';

const verifyToken: VerifyToken = token =>
  token === ACCEPTED
    ? Promise.resolve({ subject: 'user-7' })
    : Promise.reject(new Error('rejected by the test verifier'));

async function getMe(authorization?: string) {
  const app = await buildApp({ verifyToken });

  try {
    return await app.inject({
      headers: authorization === undefined ? {} : { authorization },
      method: 'GET',
      url: '/me',
    });
  } finally {
    await app.close();
  }
}

it('hands the verified caller to the route', async () => {
  const response = await getMe(`Bearer ${ACCEPTED}`);

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ subject: 'user-7' });
});

describe('answers 401', () => {
  // RFC 6750 §3: with no credentials at all, the challenge names the scheme
  // and nothing else.
  it('with a bare challenge when there is no Authorization header', async () => {
    const response = await getMe();

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('with a bare challenge for a scheme other than Bearer', async () => {
    const response = await getMe('Basic dXNlcjpwYXNz');

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('with invalid_token when the verifier rejects, and says no more', async () => {
    const response = await getMe('Bearer anything-else');

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    expect(response.json()).toEqual({ message: 'invalid token' });
  });
});
