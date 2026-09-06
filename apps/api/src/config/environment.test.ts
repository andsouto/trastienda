import { expect, it } from 'vitest';

import { loadEnvironment } from './environment.ts';

const valid = {
  DATABASE_URL: 'postgresql://localhost:5432/trastienda',
  OIDC_AUDIENCE: 'trastienda-api',
  OIDC_ISSUER_URL: 'http://localhost:8080',
};

it('applies defaults for what is optional', () => {
  const environment = loadEnvironment(valid);

  expect(environment.PORT).toBe(3000);
  expect(environment.LOG_LEVEL).toBe('info');
});

it.each([
  ['a missing issuer', { ...valid, OIDC_ISSUER_URL: undefined }],
  ['an empty issuer', { ...valid, OIDC_ISSUER_URL: '' }],
  // The typo that would otherwise only surface when the first token arrives.
  ['an issuer with no scheme', { ...valid, OIDC_ISSUER_URL: 'localhost:8080' }],
  ['a non-http scheme', { ...valid, OIDC_ISSUER_URL: 'ftp://idp.example.test' }],
  ['an empty audience', { ...valid, OIDC_AUDIENCE: '' }],
  ['a missing audience', { ...valid, OIDC_AUDIENCE: undefined }],
])('refuses to start with %s', (_case, source) => {
  expect(() => loadEnvironment(source)).toThrow();
});
