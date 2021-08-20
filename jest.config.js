module.exports = {
  setupFiles: ['<rootDir>/test/test-setup'],
  bail: true,
  transform: {},
  restoreMocks: true,
  testMatch: ['**/*.test.js'],
  moduleNameMapper: {
    '^macrome$': '<rootDir>',
  },
};
