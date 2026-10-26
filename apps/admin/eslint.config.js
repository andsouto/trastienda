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
      // Prettier formats templates and styles only in files of their own.
      '@angular-eslint/component-max-inline-declarations': ['error', {styles: 0, template: 0}],
      '@typescript-eslint/no-extraneous-class': ['error', {allowWithDecorator: true}],
    },
  },
  {
    // oauth4webapi marks allowInsecureRequests deprecated only so that it stands
    // out; the session owner sets it for a provider on http://localhost alone.
    files: ['src/app/core/auth/session/session-owner.ts'],
    rules: {
      '@typescript-eslint/no-deprecated': ['error', {
        allow: [{from: 'package', name: 'allowInsecureRequests', package: 'oauth4webapi'}],
      }],
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
