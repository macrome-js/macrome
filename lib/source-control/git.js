const fs = require('fs');
const { join } = require('path');

class SourceControlGit {
  constructor(rootDir, watcher) {
    this.rootDir = rootDir;
    this._lockPath = join(this.rootDir, '.git', 'index.lock');
    this._locked;
    this._lockedExternally;
  }

  static get lockPath() {
    return this._lockPath;
  }

  acquireLock() {
    if (this._lockedExternally) {
      return;
    }
    try {
      fs.writeFileSync(SourceControlGit.lockPath, process.pid.toString(), {
        mode: 0o644,
        flag: 'wx',
      });
      this._locked = true;
      this._lockedExternally = false;
    } catch (e) {
      e.message = `Failed to acquire .git/index.lock\n${e.message}`;
      throw e;
    }
  }

  releaseLock() {
    try {
      fs.unlinkSync(SourceControlGit.lockPath);
      this._locked = false;
      this.lockedExternally = false;
    } catch (e) {
      e.message = `Failed to release .git/index.lock\n${e.message}`;
      throw e;
    }
  }
}

module.exports = { SourceControlGit };
