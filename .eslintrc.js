module.exports = {
  extends: ['standard', 'prettier', 'plugin:node/recommended'],
  plugins: ['jest', 'import'],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  ignorePatterns: ['**/test/sandbox/**'],
  rules: {
    'no-console': 'error',
    'no-process-exit': 'error',
    'node/process-exit-as-throw': 'error',
  },
  overrides: [
    {
      files: ['**/test/**', '**/__tests__/**'],
      extends: ['plugin:jest/recommended'],
      env: {
        'jest/globals': true,
      },
      rules: {
        'jest/no-export': 'off',
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
