// @ts-check
import angular from 'angular-eslint';
import {defineConfig, globalIgnores} from 'eslint/config';

import {baseConfig} from '../../eslint.base.config.js';

export default defineConfig(
  globalIgnores(['dist/', '.angular/', 'coverage/', 'src/app/core/api/']),

  ...baseConfig(import.meta.dirname),

  {
    files: ['**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': ['error', {type: 'attribute', prefix: 'app', style: 'camelCase'}],
      '@angular-eslint/component-selector': ['error', {type: 'element', prefix: 'app', style: 'kebab-case'}],
      // A component's class is often empty: its template and decorator are the component.
      '@typescript-eslint/no-extraneous-class': ['error', {allowWithDecorator: true}],
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
  },
);
