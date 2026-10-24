// @ts-check
// Shared ESLint ruleset, consumed by each app's own eslint.config.js — the
// eslint equivalent of tsconfig.base.json. Not runnable on its own: it only
// exports a factory, and its own imports resolve from *this file's* location
// (repo root), so the packages it imports stay root devDependencies even
// though each app decides for itself when/how to apply them.
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import {defineConfig} from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import perfectionist from 'eslint-plugin-perfectionist';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

/**
 * @param {string} tsconfigRootDir - pass `import.meta.dirname` from the calling app's eslint.config.js
 * @returns {import('eslint/config').Config[]} already flattened by defineConfig, so
 * `extends` below is resolved once here rather than left for each app's own
 * `defineConfig()` call to re-resolve.
 */
export function baseConfig(tsconfigRootDir) {
  return defineConfig(
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
      plugins: {jsdoc, perfectionist},
      rules: {
        'perfectionist/sort-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-exports': ['error', {type: 'natural'}],
        // Groups only, in this order. Private fields come first because the
        // public ones are often derived from them (`session =
        // this.#session.asReadonly()`), and fields initialise top to bottom.
        // Methods put what the class offers before how it does it.
        'perfectionist/sort-classes': ['error', {
          type: 'unsorted',
          groups: [
            'index-signature',
            'static-property',
            'static-block',
            'private-property',
            ['public-property', 'protected-property', 'property'],
            'constructor',
            ['public-method', 'protected-method', 'method', 'get-method', 'set-method'],
            'private-method',
            'unknown',
          ],
        }],
        // A blank line before every documentation comment, except where a
        // block opens, so each documented member reads on its own.
        '@stylistic/lines-around-comment': ['error', {
          beforeBlockComment: true,
          allowArrayStart: true,
          allowBlockStart: true,
          allowClassStart: true,
          allowEnumStart: true,
          allowInterfaceStart: true,
          allowModuleStart: true,
          allowObjectStart: true,
          allowTypeStart: true,
        }],
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/no-null': 'off',
        // The ` * ` prefix on every line of a documentation comment: it reads
        // better, and it is what editors continue and orval generates.
        'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
        'jsdoc/check-alignment': 'error',
        'jsdoc/require-asterisk-prefix': 'error',
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

    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      plugins: {vitest},
      rules: {
        ...vitest.configs.recommended.rules,
        // beforeAll/afterAll assigning suite-level state is the standard pattern
        'unicorn/no-top-level-assignment-in-function': 'off',
      },
    },

    // plain JS (config files)
    {
      files: ['**/*.js', '**/*.mjs'],
      extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
    },
  );
}
