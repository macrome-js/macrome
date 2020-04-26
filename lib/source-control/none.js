class SourceControlNone {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  acquireLock() {}

  releaseLock() {}
}

module.exports = { SourceControlNone };
