module.exports = {
  setupFiles: ['<rootDir>/test/test-setup'],
  transform: {},
  restoreMocks: true,
  testMatch: ['**/*.test.js'],
  moduleNameMapper: {
    '^macrome$': '<rootDir>',
  },
};
