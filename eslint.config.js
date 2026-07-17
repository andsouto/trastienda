// @ts-check
// Lints repo-root loose files only (eslint.base.config.js itself, future
// root-level scripts). Each app lints itself independently — see
// apps/*/eslint.config.js — so apps/ is excluded here to avoid double-linting
// them under a weaker, app-unaware ruleset.
import {defineConfig, globalIgnores} from 'eslint/config';

import {baseConfig} from './eslint.base.config.js';

export default defineConfig(
  globalIgnores(['apps/']),
  ...baseConfig(import.meta.dirname),
);
