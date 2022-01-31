module.exports = {
  setupFiles: ['<rootDir>/test/test-setup'],
  transform: {},
  restoreMocks: true,
  // Tests must be run in series to avoid failures cause by contention for .git/index.lock
  maxWorkers: 1,
  testMatch: ['**/*.test.js'],
  moduleNameMapper: {
    '^macrome$': '<rootDir>',
  },
};
