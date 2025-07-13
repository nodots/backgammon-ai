import js from '@eslint/js'
import typescript from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,

      // Custom rule to prevent local imports for nodots-backgammon packages
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*./core/**', '**/core'],
              message:
                'Do not use relative imports for core. This creates circular dependencies.',
            },
            {
              group: ['**/api/**', '**/api'],
              message:
                'Do not use relative imports for api. This creates circular dependencies.',
            },
          ],
          paths: [
            {
              name: '../../core/src/utils',
              message:
                'Do not import from ../../core/src/utils. This creates circular dependencies.',
            },
          ],
        },
      ],

      // Relax some strict rules for better development experience
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,

      // Custom rule to prevent local imports for nodots-backgammon packages
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*./core/**', '**/core'],
              message:
                'Do not use relative imports for core. This creates circular dependencies.',
            },
            {
              group: ['**/api/**', '**/api'],
              message:
                'Do not use relative imports for api. This creates circular dependencies.',
            },
          ],
          paths: [
            {
              name: '../../core/src/utils',
              message:
                'Do not import from ../../core/src/utils. This creates circular dependencies.',
            },
          ],
        },
      ],

      // Relax some strict rules for tests
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
      },
    },
  },
]
