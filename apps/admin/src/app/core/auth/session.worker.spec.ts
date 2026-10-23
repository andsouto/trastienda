import { type Hello } from './session-port';

// The worker's own source, served by Vitest's Vite: in a test build, the
// worker Angular emits is not where the rewritten URL points.
const WORKER_SOURCE = new URL('session.worker.ts', import.meta.url);

it('serves the session from a shared worker', async () => {
  const { port } = new SharedWorker(WORKER_SOURCE, { type: 'module' });
  const messages: unknown[] = [];

  port.addEventListener('message', (event) => {
    messages.push(event.data);
  });
  port.start();
  port.postMessage({ config: { clientId: 'admin', issuer: 'http://localhost:8080' } } satisfies Hello);
  port.postMessage({ id: 1, method: 'accessToken', parameters: [] });

  await vi.waitFor(() => {
    expect(messages).toEqual([{ session: null }, { id: 1, result: null }]);
  });
});
