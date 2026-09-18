import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: '../api/openapi.json',
    output: {
      // wipes src/app/core/api/ on every run: nothing hand-written goes there
      clean: true,
      client: 'angular',
      mode: 'tags-split',
      override: {
        // httpResource helpers for reads, injectable services for writes (ADR-0007)
        angular: { retrievalClient: 'both' },
      },
      schemas: 'src/app/core/api/model',
      // a directory, not a file: in tags-split every file is named after its tag
      target: 'src/app/core/api',
    },
  },
});
