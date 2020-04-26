module.exports = {
  setupFiles: ['<rootDir>/test/test-setup'],
  transform: {},
  bail: true, // doesn't seem to work?
  restoreMocks: true,
  moduleNameMapper: {
    '^macrome$': '<rootDir>',
  },
};
