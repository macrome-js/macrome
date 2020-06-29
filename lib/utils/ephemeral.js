/**
 * An ephemeral set erases its own members after a certain number of accesses
 */
class EphemeralSet {
  constructor(ttl = 1) {
    this.ttl = ttl;
    this.cache = new Map();
  }

  has(key) {
    const { cache } = this;

    if (cache.has(key)) {
      const ttl = cache.get(key);

      ttl--;

      if (ttl === 0) {
        cache.delete(key);
      } else {
        cache.set(key, ttl);
      }
      return true;
    }
    return false;
  }

  add(key) {
    const { ttl } = this;

    this.set(key, ttl);
  }
}

module.exports = { EphemeralSet };
