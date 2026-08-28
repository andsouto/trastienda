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
        // ADR-0007 wants 'both'; its httpResource half does not compile under
        // exactOptionalPropertyTypes (orval-labs/orval#3909)
        angular: { retrievalClient: 'httpClient' },
      },
      schemas: 'src/app/core/api/model',
      // a directory, not a file: in tags-split every file is named after its tag
      target: 'src/app/core/api',
    },
  },
});
