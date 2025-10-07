/**
 * Simple in-memory cache for Fever events and other data
 * Used as fallback when Neo4j is not available
 */

class SimpleCache {
  constructor() {
    this.cache = new Map();
  }

  async get(key) {
    return this.cache.get(key) || null;
  }

  async set(key, value) {
    this.cache.set(key, value);
    return true;
  }

  async delete(key) {
    return this.cache.delete(key);
  }

  async clear() {
    this.cache.clear();
    return true;
  }

  async has(key) {
    return this.cache.has(key);
  }

  async keys() {
    return Array.from(this.cache.keys());
  }
}

export default SimpleCache;

