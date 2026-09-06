import { type Static, Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const EnvironmentSchema = Type.Object({
  PORT: Type.Number({ default: 3000 }),
  HOST: Type.String({ default: '0.0.0.0' }),
  LOG_LEVEL: Type.Union(
    [
      Type.Literal('fatal'),
      Type.Literal('error'),
      Type.Literal('warn'),
      Type.Literal('info'),
      Type.Literal('debug'),
      Type.Literal('trace'),
    ],
    { default: 'info' },
  ),
  DATABASE_URL: Type.String(),
  OIDC_ISSUER_URL: Type.String(),
  // Nothing to check beyond emptiness: any identifier the provider issues tokens
  // for is valid. The constraint earns its place because `OIDC_AUDIENCE=` in a
  // .env file yields an empty string rather than an absent variable.
  OIDC_AUDIENCE: Type.String({ minLength: 1 }),
});

export type Environment = Static<typeof EnvironmentSchema>;

/**
 * Checked here rather than as a schema `format`, which TypeBox ignores unless a
 * validator is registered, and registering one is an import side effect.
 */
function requireHttpUrl(name: string, value: string): void {
  let protocol: string;

  try {
    ({ protocol } = new URL(value));
  } catch {
    throw new TypeError(`${name} is not a URL: ${JSON.stringify(value)}`);
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new TypeError(`${name} must be an http(s) URL, got ${protocol}`);
  }
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const environment = Value.Parse(EnvironmentSchema, { ...source });

  requireHttpUrl('OIDC_ISSUER_URL', environment.OIDC_ISSUER_URL);

  return environment;
}
