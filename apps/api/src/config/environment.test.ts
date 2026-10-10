import { expect, it } from 'vitest';

import { loadEnvironment } from './environment.ts';

const valid = {
  DATABASE_URL: 'postgresql://localhost:5432/trastienda',
  OIDC_AUDIENCE: 'trastienda',
  OIDC_ISSUER_URL: 'http://localhost:8080',
};

it('applies defaults for what is optional', () => {
  const environment = loadEnvironment(valid);

  expect(environment.PORT).toBe(3000);
  expect(environment.LOG_LEVEL).toBe('info');
  // Off unless asked for: what a production deployment gets.
  expect(environment.API_DOCS).toBe(false);
  // The standard unless the provider cannot do it.
  expect(environment.OIDC_TYPED_ACCESS_TOKENS).toBe(true);
});

it('reads API_DOCS from its string form', () => {
  expect(loadEnvironment({ ...valid, API_DOCS: 'true' }).API_DOCS).toBe(true);
});

it('reads OIDC_TYPED_ACCESS_TOKENS from its string form', () => {
  expect(loadEnvironment({ ...valid, OIDC_TYPED_ACCESS_TOKENS: 'false' }).OIDC_TYPED_ACCESS_TOKENS).toBe(false);
});

it('says what is wrong without repeating the values', () => {
  const source = {
    ...valid,
    DATABASE_URL: 'postgresql://trastienda:secret@localhost:5432/trastienda',
    PORT: 'many',
  };

  expect(() => loadEnvironment(source)).toThrow(new TypeError('Invalid environment: PORT must be number'));
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

it('reads CORS_ORIGINS as a list, and none when unset', () => {
  expect(loadEnvironment(valid).CORS_ORIGINS).toEqual([]);
  expect(loadEnvironment({ ...valid, CORS_ORIGINS: 'http://localhost:4200, https://admin.example.test' }).CORS_ORIGINS)
    .toEqual(['http://localhost:4200', 'https://admin.example.test']);
});

// An origin with a path or a trailing slash never equals what a browser sends.
it.each(['http://localhost:4200/', 'https://admin.example.test/app', 'localhost:4200'])(
  'refuses a CORS origin like %s',
  (origin) => {
    expect(() => loadEnvironment({ ...valid, CORS_ORIGINS: origin })).toThrow();
  },
);
