import { loadAppConfig } from './app-config';

function serve(response: Response): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('reads the config, without the trailing slash of the API URL', async () => {
  serve(Response.json({ apiBaseUrl: 'https://api.example.test/', clientId: 'admin', issuer: 'https://idp.example.test' }));

  await expect(loadAppConfig()).resolves.toEqual({
    apiBaseUrl: 'https://api.example.test',
    clientId: 'admin',
    issuer: 'https://idp.example.test',
  });
});

it('says which value is missing', async () => {
  serve(Response.json({ apiBaseUrl: 'https://api.example.test', issuer: 'https://idp.example.test' }));

  await expect(loadAppConfig()).rejects.toThrow(/clientId/);
});

it('says the config did not load', async () => {
  serve(new Response(null, { status: 404 }));

  await expect(loadAppConfig()).rejects.toThrow(/HTTP 404/);
});
