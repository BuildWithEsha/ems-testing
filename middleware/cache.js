// Simple in-memory cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cacheMiddleware = (key, ttl = CACHE_TTL) => {
  return (req, res, next) => {
    const cacheKey = `${key}_${JSON.stringify(req.query)}`;
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`Cache hit for ${cacheKey}`);
      return res.json(cached.data);
    }

    const originalJson = res.json;

    res.json = function (data) {
      cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      // Clean up old cache entries periodically
      if (cache.size > 100) {
        const now = Date.now();
        for (const [k, value] of cache.entries()) {
          if (now - value.timestamp > ttl) {
            cache.delete(k);
          }
        }
      }

      return originalJson.call(this, data);
    };

    next();
  };
};

// Utility to invalidate cache entries by prefix
const invalidateCache = (prefix) => {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};

module.exports = { cacheMiddleware, invalidateCache, cache };
