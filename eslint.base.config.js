// @ts-check
// Shared ESLint ruleset: each app's eslint.config.js spreads baseConfig(), as
// each app's tsconfig.json extends tsconfig.base.json. Its imports resolve from
// this file, so the plugins it uses stay root devDependencies.
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import {defineConfig} from 'eslint/config';
import perfectionist from 'eslint-plugin-perfectionist';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

/**
 * @param {string} tsconfigRootDir - `import.meta.dirname` of the calling app's eslint.config.js
 * @returns {import('eslint/config').Config[]} already flattened, so each app's
 * defineConfig() does not resolve `extends` again
 */
export function baseConfig(tsconfigRootDir) {
  return defineConfig(
    // TypeScript: the presets, then what this repo adds to them.
    {
      files: ['**/*.ts'],
      extends: [
        eslint.configs.recommended,
        ...tseslint.configs.strictTypeChecked,
        ...tseslint.configs.stylisticTypeChecked,
        unicorn.configs.recommended,
        stylistic.configs.customize({
          blockSpacing: false,
          braceStyle: '1tbs',
          indent: 2,
          jsx: false,
          quotes: 'single',
          semi: true,
        }),
      ],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      plugins: {perfectionist},
      rules: {
        // Order of imports and exports.
        'perfectionist/sort-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-exports': ['error', {type: 'natural'}],

        // unicorn's recommended rules that do not fit this code.
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/no-null': 'off',
        'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',

        // A leading `_` marks a name as unused on purpose.
        '@typescript-eslint/no-unused-vars': ['error', {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }],
      },
    },

    // Config files their tool loads, never imported: `export default
    // defineConfig()` counts as a side effect, and prisma.config.ts also loads
    // .env at import time by design. Listed by name so nothing is exempted by
    // accident (a `*.config.ts` glob also matches the admin's app.config.ts).
    {
      files: ['**/orval.config.ts', '**/prisma.config.ts', '**/vitest.config.ts'],
      rules: {
        'unicorn/no-top-level-side-effects': 'off',
      },
    },

    // Tests.
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      plugins: {vitest},
      rules: {
        ...vitest.configs.recommended.rules,
        // beforeAll/afterAll assigning suite-level state is the standard pattern
        'unicorn/no-top-level-assignment-in-function': 'off',
      },
    },

    // Plain JS: config files, without type information.
    {
      files: ['**/*.js', '**/*.mjs'],
      extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
    },
  );
}
