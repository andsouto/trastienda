import { type StaticDecode, Type } from 'typebox';
import { DecodeError, Value } from 'typebox/value';

/**
 * Comma-separated in the environment, a list once parsed; empty means no CORS
 * headers at all. `Type.Array` would not split it: parsing wraps the whole
 * string as the list's only entry.
 */
const Origins = Type.Codec(Type.String({ default: '' }))
  .Decode((value) => {
    const origins = value.split(',').map(origin => origin.trim()).filter(origin => origin !== '');

    for (const origin of origins) {
      requireOrigin(origin);
    }

    return origins;
  })
  .Encode(origins => origins.join(','));

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
  API_DOCS: Type.Boolean({ default: false }),
  CORS_ORIGINS: Origins,
  DATABASE_URL: Type.String(),
  OIDC_ISSUER_URL: Type.String(),
  OIDC_AUDIENCE: Type.String({ minLength: 1 }),
  // RFC 9068's at+jwt is required of access tokens unless this is false, for a
  // provider that does not type them (Zitadel).
  OIDC_TYPED_ACCESS_TOKENS: Type.Boolean({ default: true }),
});

export type Environment = StaticDecode<typeof EnvironmentSchema>;

/**
 * Not a schema `format`: TypeBox's `uri` and `url` take any scheme, so they
 * pass `ftp://…` and also `localhost:8080`, which parses with `localhost:` as
 * its scheme — the typo this check exists to catch.
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

/**
 * Browsers send an origin as scheme, host and port, with no path or trailing
 * slash, and CORS compares it as a string: anything else would never match.
 */
function requireOrigin(origin: string): void {
  requireHttpUrl('CORS_ORIGINS', origin);

  if (new URL(origin).origin !== origin) {
    throw new TypeError(`CORS_ORIGINS entries are origins, like http://localhost:4200; got ${JSON.stringify(origin)}`);
  }
}

/**
 * Names each problem and leaves the original error out, `cause` included:
 * TypeBox's says only "Decode" and carries every value it checked, so left to
 * crash the process it would print DATABASE_URL, password included, into
 * whatever collects the logs.
 */
function invalidEnvironment(error: DecodeError): TypeError {
  const problems = error.cause.errors.map(({ instancePath, message }) =>
    instancePath === '' ? message : `${instancePath.slice(1)} ${message}`);

  return new TypeError(`Invalid environment: ${problems.join('; ')}`);
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  let environment: Environment;

  try {
    environment = Value.Decode(EnvironmentSchema, { ...source });
  } catch (error) {
    if (error instanceof DecodeError) {
      throw invalidEnvironment(error);
    }

    throw error;
  }

  requireHttpUrl('OIDC_ISSUER_URL', environment.OIDC_ISSUER_URL);

  return environment;
}
