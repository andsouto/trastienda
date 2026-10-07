import { type FastifyInstance } from 'fastify';

/**
 * The API reference (Scalar) at `/docs`, rendering the live spec, so a schema
 * change shows on save without waiting for `pnpm codegen`.
 *
 * Development only: every consumer starts from the published `openapi.json`,
 * so production would gain nothing from it. The package is a devDependency
 * imported here on demand, so a production install does not contain it and
 * turning `API_DOCS` on there stops the API at startup instead of shipping
 * the UI.
 */
export async function installApiReference(app: FastifyInstance): Promise<void> {
  const scalar = await loadScalar();

  app.register(scalar, {
    // Not Scalar's `/reference`, which reference data may want one day.
    routePrefix: '/docs',
    configuration: {
      pageTitle: 'trastienda API',
      // "Open API Client": a link to Scalar's hosted client with this spec's
      // URL. The built-in client behind "Test Request" stays.
      hideClientButton: true,
      // The next three are on by default whenever the page is served from
      // localhost, which is the only place this runs.
      // "Ask AI": a chat hosted by Scalar whose agent can run GET requests with
      // the credentials set in the client, and sends the responses back to it.
      agent: { disabled: true },
      // "Generate MCP": uploads the spec to Scalar and opens its sign-up page.
      mcp: { disabled: true },
      // Toolbar: Configure (nothing persists), Share (uploads the spec to a
      // public link) and Deploy (their hosting).
      showDeveloperTools: 'never',
      // Inter and JetBrains Mono from fonts.scalar.com on every page load, the
      // one request that needs no click; system fonts instead.
      withDefaultFonts: false,
    },
  });
}

async function loadScalar() {
  try {
    const { default: scalar } = await import('@scalar/fastify-api-reference');

    return scalar;
  } catch (error) {
    throw new Error('API_DOCS is on but the API reference did not load: it is a devDependency, absent from production installs', { cause: error });
  }
}
