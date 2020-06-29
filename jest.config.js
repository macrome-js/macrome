module.exports = {
  setupFiles: ['<rootDir>/test/test-setup'],
  transform: {},
  restoreMocks: true,
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^macrome$': '<rootDir>',
  },
};
