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
  OIDC_AUDIENCE: Type.String({ minLength: 1 }),
});

export type Environment = Static<typeof EnvironmentSchema>;

/**
 * Not a schema `format`: TypeBox's own checker fails every value under a format
 * it has not been taught, and teaching it means mutating a global registry at
 * import time. Fastify's route validation does know `uri` — it runs Ajv with
 * ajv-formats — but this file is checked with `Value.Parse`, which does not.
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
