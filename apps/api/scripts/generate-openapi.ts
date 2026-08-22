import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { buildApp } from '../src/app.ts';

const app = await buildApp({
  // Spec generation never serves a request; nothing can call this.
  verifyToken: () => Promise.reject(new Error('unreachable')),
});
await app.ready();

const target = fileURLToPath(new URL('../openapi.json', import.meta.url));
await writeFile(target, `${JSON.stringify(app.swagger(), null, 2)}\n`);
await app.close();

console.log(`OpenAPI spec written to ${target}`);
