module.exports = {
  extends: ['standard', 'prettier', 'plugin:node/recommended'],
  plugins: ['jest', 'import'],
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    requireConfigFile: false,
  },
  ignorePatterns: ['**/test/sandbox/**'],
  rules: {
    'no-console': 'error',
    'no-process-exit': 'error',
    'node/process-exit-as-throw': 'error',
  },
  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      extends: ['plugin:@typescript-eslint/recommended'],
      plugins: ['@typescript-eslint'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-misused-new': 'off', // There may not be an alternative
        'node/no-unsupported-features/es-syntax': 'off',
        '@typescript-eslint/no-explicit-any': 'off', // Sometimes I need the any type
        'node/no-missing-import': 'off', // TS checks/resolves imports
        '@typescript-eslint/no-non-null-assertion': 'off', // I think these are fine sometimes
        '@typescript-eslint/ban-ts-comment': 'off', // when you need it you need it
        'lines-between-class-members': 'off', // breaks for some TS property declarations
        camelcase: 'off',
        'node/no-unpublished-import': [
          'error',
          {
            tryExtensions: ['.d.ts', '.ts', '.js', '.json'],
          },
        ],
        '@typescript-eslint/naming-convention': [
          'error',
          {
            selector: 'default',
            format: ['camelCase'],
            leadingUnderscore: 'allowSingleOrDouble',
            trailingUnderscore: 'allowSingleOrDouble',
          },

          {
            selector: 'variable',
            format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
            leadingUnderscore: 'allow',
            trailingUnderscore: 'allow',
          },

          {
            selector: 'typeLike',
            format: ['PascalCase'],
          },

          {
            selector: 'property',
            /* Watchman uses snake case objects */
            format: ['camelCase', 'snake_case'],
            leadingUnderscore: 'allowSingleOrDouble',
            trailingUnderscore: 'allowSingleOrDouble',
          },
        ],
      },
    },
    {
      files: 'bin/**.js',
      rules: {
        'no-process-exit': 'off',
        'no-console': 'off',
      },
    },
    {
      files: ['**/test/**', '**/__tests__/**'],
      extends: ['plugin:jest/recommended'],
      env: {
        'jest/globals': true,
      },
      rules: {
        'jest/no-export': 'off',
        'jest/no-standalone-expect': ['error', { additionalTestBlockFunctions: ['it.each'] }],
      },
    },
    {
      files: ['**/__tests__/**'],
      rules: {
        'jest/no-export': 'error',
      },
    },
  ],
  env: { es6: true },
};
