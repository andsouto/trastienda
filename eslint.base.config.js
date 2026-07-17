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
      plugins: {perfectionist},
      rules: {
        'perfectionist/sort-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-exports': ['error', {type: 'natural'}],
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/no-null': 'off',
        '@typescript-eslint/no-unused-vars': ['error', {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }],
      },
    },

    // prisma.config.ts loads .env at import time by design
    {
      files: ['**/prisma.config.ts'],
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
