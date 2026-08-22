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
  // Not optional: the API refuses to start without an issuer to trust rather
  // than quietly serving an unauthenticated management surface (ADR-0008).
  OIDC_ISSUER_URL: Type.String({ minLength: 1 }),
  OIDC_AUDIENCE: Type.String({ minLength: 1 }),
});

export type Environment = Static<typeof EnvironmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return Value.Parse(EnvironmentSchema, { ...source });
}
