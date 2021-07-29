const { REMOVE } = require('./operations');

class MetadataCache {
  constructor() {
    this.cache = new Map();
    this.generated = new Map();
  }

  get() {}

  update({ path, metadata, operation }) {
    const { cache, generated } = this;
    if (metadata) {
      const { generatedfrom } = metadata;

      cache.set(path, metadata);

      if (!generated.has(generatedfrom)) {
        generated.set(generatedfrom, new Set());
      }
      generated.get(generatedfrom).add(path);
    } else {
      cache.delete(path);
      if (operation === REMOVE) {
        generated.delete(path);
      }
    }
  }
}

/*
Updating a file/graph
*/

module.exports = { MetadataCache };
