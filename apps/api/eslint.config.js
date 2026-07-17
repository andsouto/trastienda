// @ts-check
import {defineConfig, globalIgnores} from 'eslint/config';
import boundaries from 'eslint-plugin-boundaries';

import {baseConfig} from '../../eslint.base.config.js';

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', 'src/generated/']),

  ...baseConfig(import.meta.dirname),

  // Hexagonal layering (ADR-0004): domain is pure TS; application only sees
  // its own module's domain plus node builtins; infrastructure sees its own
  // module; no module reaches into another module's internals.
  {
    files: ['**/*.ts'],
    plugins: {boundaries},
    settings: {
      'boundaries/elements': [
        {type: 'domain', pattern: 'src/modules/*/domain/**', capture: ['module']},
        {type: 'application', pattern: 'src/modules/*/application/**', capture: ['module']},
        {type: 'infrastructure', pattern: 'src/modules/*/infrastructure/**', capture: ['module']},
        {type: 'shared', pattern: 'src/shared/**'},
        {type: 'config', pattern: 'src/config/**'},
        {type: 'plugins', pattern: 'src/plugins/**'},
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', {
        checkAllOrigins: true,
        default: 'disallow',
        policies: [
          {
            from: {element: {type: 'domain'}},
            allow: [
              {to: {element: {type: 'domain', captured: {module: '{{ from.element.captured.module }}'}}}},
              {to: {element: {type: 'shared'}}},
            ],
          },
          {
            from: {element: {type: 'application'}},
            allow: [
              {to: {element: {type: 'domain', captured: {module: '{{ from.element.captured.module }}'}}}},
              {to: {element: {type: 'application', captured: {module: '{{ from.element.captured.module }}'}}}},
              {to: {element: {type: 'shared'}}},
              {to: {module: {origin: 'core'}}},
            ],
          },
          {
            from: {element: {type: 'infrastructure'}},
            allow: [
              {to: {element: {type: 'domain', captured: {module: '{{ from.element.captured.module }}'}}}},
              {to: {element: {type: 'application', captured: {module: '{{ from.element.captured.module }}'}}}},
              {to: {element: {type: 'infrastructure', captured: {module: '{{ from.element.captured.module }}'}}}},
              {to: {element: {type: 'shared'}}},
              {to: {element: {type: 'config'}}},
              {to: {module: {origin: ['external', 'core']}}},
            ],
          },
          {
            from: {element: {type: 'shared'}},
            allow: [
              {to: {element: {type: 'shared'}}},
              {to: {module: {origin: 'core'}}},
            ],
          },
          {
            from: {element: {type: 'config'}},
            allow: [
              {to: {element: {type: 'shared'}}},
              {to: {element: {type: 'config'}}},
              {to: {module: {origin: ['external', 'core']}}},
            ],
          },
          {
            from: {element: {type: 'plugins'}},
            allow: [
              {to: {element: {type: 'shared'}}},
              {to: {element: {type: 'config'}}},
              {to: {element: {type: 'plugins'}}},
              {to: {module: {origin: ['external', 'core']}}},
            ],
          },
        ],
      }],
    },
  },
);
