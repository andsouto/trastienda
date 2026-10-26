// @ts-check
// Shared ESLint ruleset: each app's eslint.config.js spreads baseConfig(), as
// each app's tsconfig.json extends tsconfig.base.json. Its imports resolve from
// this file, so the plugins it uses stay root devDependencies.
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import {defineConfig} from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
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
        unicorn.configs.unopinionated,
        // How documentation comments are written, not that they exist.
        jsdoc.configs['flat/stylistic-typescript-error'],
        jsdoc.configs['flat/logical-typescript-error'],
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
        // Order of imports, exports and class members. Private fields go
        // first: the public ones are often derived from them.
        'perfectionist/sort-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-imports': ['error', {type: 'natural'}],
        'perfectionist/sort-named-exports': ['error', {type: 'natural'}],
        'perfectionist/sort-classes': ['error', {
          type: 'unsorted',
          groups: [
            'index-signature',
            ['static-property', 'static-accessor-property'],
            'static-block',
            ['private-property', 'private-accessor-property'],
            ['property', 'accessor-property'],
            'constructor',
            'static-method',
            ['method', 'get-method', 'set-method'],
            ['private-method', 'private-get-method', 'private-set-method'],
            'unknown',
          ],
          newlinesBetween: 1,
          newlinesInside: 'ignore',
        }],

        // unicorn's recommended rules that unopinionated leaves out: first
        // bugs and newer APIs, then conventions the code follows.
        'unicorn/no-array-callback-reference': 'error',
        'unicorn/no-array-splice': 'error',
        'unicorn/no-loop-iterable-mutation': 'error',
        'unicorn/no-mismatched-map-key': 'error',
        'unicorn/no-object-methods-with-collections': 'error',
        'unicorn/no-optional-chaining-on-undeclared-variable': 'error',
        'unicorn/no-return-array-push': 'error',
        'unicorn/no-unsafe-json-serialization': 'error',
        'unicorn/no-unsafe-property-key': 'error',
        'unicorn/no-unsafe-string-replacement': 'error',
        'unicorn/prefer-abort-signal-timeout': 'error',
        'unicorn/prefer-private-class-fields': 'error',

        'unicorn/catch-error-name': 'error',
        'unicorn/filename-case': 'error',
        'unicorn/logical-assignment-operators': 'error',
        'unicorn/no-nested-ternary': 'error',
        'unicorn/no-useless-else': 'error',
        'unicorn/operator-assignment': 'error',
        'unicorn/switch-case-braces': 'error',

        // typescript-eslint's knows the type, and leaves string arrays alone.
        'unicorn/require-array-sort-compare': 'off',
        '@typescript-eslint/require-array-sort-compare': 'error',

        // Documentation comments: a blank line before each, one-liners too.
        'jsdoc/lines-before-block': ['error', {ignoreSingleLines: false}],
        'jsdoc/informative-docs': 'error',

        // A leading `_` marks a name as unused on purpose.
        '@typescript-eslint/no-unused-vars': ['error', {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }],
      },
    },

    // Tests.
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      plugins: {vitest},
      rules: vitest.configs.recommended.rules,
    },

    // Plain JS: config files, without type information.
    {
      files: ['**/*.js', '**/*.mjs'],
      extends: [eslint.configs.recommended, tseslint.configs.disableTypeChecked],
    },
  );
}
