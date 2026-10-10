// Sets up the local Zitadel of docker-compose.yaml so the admin can log in, and
// writes the admin's runtime config. Run by the `idp` process of
// `process-compose up`, once docker compose is up.
//
// It creates what is missing and puts the admin app's settings back to what
// is written here, so a change made here reaches existing stacks on the next
// `up`. Nothing else in Zitadel is touched.
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { loadEnvironment } from '../src/config/environment.ts';

// Where `ng serve` listens.
const ADMIN_ORIGIN = 'http://localhost:4200';
const ADMIN_CONFIG = new URL('../../admin/public/config.json', import.meta.url);

const environment = loadEnvironment();
const issuer = environment.OIDC_ISSUER_URL;
const projectId = environment.OIDC_AUDIENCE;
const token = await readProvisionerToken();

// 1. The project. Its ID is the audience the API checks, so we choose it.
if (await zitadel('project.v2.ProjectService/GetProject', { projectId }) === null) {
  const organizations = await zitadel<{ result: { id: string }[] }>('org.v2.OrganizationService/ListOrganizations', {
    queries: [{ defaultQuery: {} }],
  });

  await zitadel('project.v2.ProjectService/CreateProject', {
    name: 'trastienda',
    organizationId: organizations?.result[0]?.id,
    projectId,
  });
}

// 2. The admin's OIDC client: public (it runs in the browser, so it cannot
// keep a secret), code flow with PKCE, refresh tokens, and access tokens as
// JWT, which is all the API verifies. Development mode is what lets
// Zitadel accept http:// redirect URIs.
const adminApp = { applicationId: 'admin', projectId };
const oidcConfig = {
  accessTokenType: 'OIDC_TOKEN_TYPE_JWT',
  applicationType: 'OIDC_APP_TYPE_USER_AGENT',
  authMethodType: 'OIDC_AUTH_METHOD_TYPE_NONE',
  developmentMode: true,
  grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'OIDC_GRANT_TYPE_REFRESH_TOKEN'],
  postLogoutRedirectUris: [`${ADMIN_ORIGIN}/`],
  redirectUris: [`${ADMIN_ORIGIN}/auth/callback`],
  responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
  version: 'OIDC_VERSION_1_0',
};

if (await zitadel('application.v2.ApplicationService/GetApplication', { applicationId: adminApp.applicationId }) === null) {
  await zitadel('application.v2.ApplicationService/CreateApplication', {
    ...adminApp,
    name: 'admin',
    oidcConfiguration: oidcConfig,
  });
} else {
  // Without the name: Zitadel applies an unchanged name first, answers "no
  // changes" and skips the rest of the update.
  await zitadel('application.v2.ApplicationService/UpdateApplication', { ...adminApp, oidcConfiguration: oidcConfig });
}

// 3. The admin's runtime config. The client ID is the one value Zitadel always
// generates, which is why the admin reads it from here.
const created = await zitadel<{ application: { oidcConfiguration: { clientId: string } } }>(
  'application.v2.ApplicationService/GetApplication',
  { applicationId: adminApp.applicationId },
);
const config = {
  apiBaseUrl: `http://localhost:${String(environment.PORT)}`,
  clientId: created?.application.oidcConfiguration.clientId,
  issuer,
};

await writeFile(ADMIN_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Zitadel ready: project ${projectId}, admin client ${String(config.clientId)}`);

/**
 * The token of the `provisioner` service account, which Zitadel writes to a
 * shared volume on its first start (docker-compose.yaml). Read through the
 * login container: the Zitadel image has no shell to run `cat` in.
 */
async function readProvisionerToken(): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)(
      'docker',
      ['compose', 'exec', '-T', 'zitadel-login', 'cat', '/zitadel/bootstrap/provisioner.pat'],
    );

    return stdout.trim();
  } catch (error) {
    throw new Error(
      'No provisioner token in Zitadel. It is only created on Zitadel\'s first start, so data from before '
      + 'it existed has none: reset it with `docker compose down -v`, which wipes all local data.',
      { cause: error },
    );
  }
}

/**
 * Calls a Zitadel v2 method: one JSON POST per method (Connect protocol).
 * Resolves to null when what was asked for does not exist, and when an update
 * changes nothing, which Zitadel answers with an error.
 */
async function zitadel<T = unknown>(method: string, body: object): Promise<T | null> {
  const response = await fetch(new URL(`/zitadel.${method}`, issuer), {
    body: JSON.stringify(body),
    headers: {
      'Authorization': `Bearer ${token}`,
      'Connect-Protocol-Version': '1',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  // Read as text first: a proxy error page or an empty body is not JSON, and
  // the failure should still name the method and the status.
  const text = await response.text();
  const payload = parseJson(text);

  if (payload !== undefined && response.ok) {
    return payload as T;
  }

  const error = (payload ?? {}) as { code?: string; message?: string };

  if (error.code === 'not_found' || error.message?.startsWith('No changes')) {
    return null;
  }

  throw new Error(`${method}: HTTP ${String(response.status)} ${error.message ?? text.slice(0, 200)}`);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
