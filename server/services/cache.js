import { createClient } from 'redis';

/**
 * Unified Cache Service with Redis and In-Memory Fallback
 * 
 * Features:
 * - Primary Redis caching with in-memory fallback
 * - Automatic failover and reconnection
 * - TTL support for both cache types
 * - JSON serialization/deserialization
 * - Health monitoring and metrics
 * - Configurable cache strategies
 */
class CacheService {
  constructor(config = {}) {
    this.config = {
      // Redis configuration
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      redisEnabled: config.redisEnabled !== false && process.env.ENABLE_CACHE === 'true',
      
      // Cache TTL configuration
      defaultTTL: config.defaultTTL || parseInt(process.env.CACHE_TTL) || 3600000, // 1 hour
      
      // In-memory cache configuration
      memoryCleanupInterval: config.memoryCleanupInterval || 300000, // 5 minutes
      maxMemoryEntries: config.maxMemoryEntries || 1000,
      
      // Retry and timeout configuration
      redisRetryAttempts: config.redisRetryAttempts || 3,
      redisTimeout: config.redisTimeout || 5000,
      
      // Logging
      enableLogging: config.enableLogging !== false
    };
    
    // Cache state
    this.redisClient = null;
    this.redisConnected = false;
    this.memoryCache = new Map();
    
    // Metrics
    this.metrics = {
      redisHits: 0,
      redisMisses: 0,
      memoryHits: 0,
      memoryMisses: 0,
      redisErrors: 0,
      lastRedisError: null,
      uptime: Date.now()
    };
    
    this.log('Cache service initializing...', {
      redisEnabled: this.config.redisEnabled,
      redisUrl: this.config.redisUrl.replace(/redis:\/\/.*@/, 'redis://***@'), // Hide credentials
      defaultTTL: this.config.defaultTTL
    });
    
    this.init();
  }
  
  /**
   * Initialize the cache service
   */
  async init() {
    if (this.config.redisEnabled) {
      await this.connectRedis();
    }
    
    this.setupMemoryCache();
    this.log('Cache service initialized');
  }
  
  /**
   * Connect to Redis with retry logic
   */
  async connectRedis() {
    try {
      this.log('Connecting to Redis...', { url: this.config.redisUrl.replace(/redis:\/\/.*@/, 'redis://***@') });
      
      this.redisClient = createClient({
        url: this.config.redisUrl,
        socket: {
          connectTimeout: this.config.redisTimeout,
          lazyConnect: true
        }
      });
      
      // Redis event handlers
      this.redisClient.on('connect', () => {
        this.log('Redis connection established');
      });
      
      this.redisClient.on('ready', () => {
        this.redisConnected = true;
        this.log('Redis client ready');
      });
      
      this.redisClient.on('error', (err) => {
        this.redisConnected = false;
        this.metrics.redisErrors++;
        this.metrics.lastRedisError = err.message;
        this.log('Redis error', { error: err.message }, 'error');
      });
      
      this.redisClient.on('end', () => {
        this.redisConnected = false;
        this.log('Redis connection ended');
      });
      
      this.redisClient.on('reconnecting', () => {
        this.log('Redis reconnecting...');
      });
      
      // Connect to Redis
      await this.redisClient.connect();
      
    } catch (error) {
      this.metrics.redisErrors++;
      this.metrics.lastRedisError = error.message;
      this.log('Failed to connect to Redis, falling back to memory cache', { error: error.message }, 'warn');
      this.redisConnected = false;
    }
  }
  
  /**
   * Setup in-memory cache with cleanup
   */
  setupMemoryCache() {
    // Periodic cleanup of expired entries
    setInterval(() => {
      this.cleanupMemoryCache();
    }, this.config.memoryCleanupInterval);
    
    this.log('Memory cache initialized', {
      cleanupInterval: this.config.memoryCleanupInterval,
      maxEntries: this.config.maxMemoryEntries
    });
  }
  
  /**
   * Clean up expired entries from memory cache
   */
  cleanupMemoryCache() {
    try {
      const now = Date.now();
      let cleanedEntries = 0;
      
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiry && now > entry.expiry) {
          this.memoryCache.delete(key);
          cleanedEntries++;
        }
      }
      
      // Limit memory cache size
      if (this.memoryCache.size > this.config.maxMemoryEntries) {
        const entries = Array.from(this.memoryCache.entries());
        const entriesToRemove = this.memoryCache.size - this.config.maxMemoryEntries;
        
        // Remove oldest entries (simple LRU)
        for (let i = 0; i < entriesToRemove; i++) {
          this.memoryCache.delete(entries[i][0]);
          cleanedEntries++;
        }
      }
      
      if (cleanedEntries > 0) {
        this.log(`Memory cache cleanup: removed ${cleanedEntries} entries`, {
          remaining: this.memoryCache.size
        });
      }
      
    } catch (error) {
      this.log('Memory cache cleanup error', { error: error.message }, 'error');
    }
  }
  
  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  async set(key, value, ttl = null) {
    const actualTTL = ttl || this.config.defaultTTL;
    const serializedValue = JSON.stringify(value);
    const expiry = Date.now() + actualTTL;
    
    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        const ttlSeconds = Math.ceil(actualTTL / 1000);
        await this.redisClient.setEx(key, ttlSeconds, serializedValue);
        this.log(`Redis SET: ${key}`, { ttl: actualTTL });
        return true;
      } catch (error) {
        this.metrics.redisErrors++;
        this.log(`Redis SET failed for key ${key}`, { error: error.message }, 'warn');
      }
    }
    
    // Fallback to memory cache
    this.memoryCache.set(key, {
      value: serializedValue,
      timestamp: Date.now(),
      expiry: expiry
    });
    
    this.log(`Memory SET: ${key}`, { ttl: actualTTL });
    return true;
  }
  
  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any} Cached value or null if not found
   */
  async get(key) {
    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        const value = await this.redisClient.get(key);
        if (value !== null) {
          this.metrics.redisHits++;
          this.log(`Redis HIT: ${key}`);
          return JSON.parse(value);
        } else {
          this.metrics.redisMisses++;
          this.log(`Redis MISS: ${key}`);
        }
      } catch (error) {
        this.metrics.redisErrors++;
        this.log(`Redis GET failed for key ${key}`, { error: error.message }, 'warn');
      }
    }
    
    // Try memory cache
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      // Check if expired
      if (memoryEntry.expiry && Date.now() > memoryEntry.expiry) {
        this.memoryCache.delete(key);
        this.metrics.memoryMisses++;
        this.log(`Memory MISS (expired): ${key}`);
        return null;
      }
      
      this.metrics.memoryHits++;
      this.log(`Memory HIT: ${key}`);
      return JSON.parse(memoryEntry.value);
    }
    
    this.metrics.memoryMisses++;
    this.log(`Memory MISS: ${key}`);
    return null;
  }
  
  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  async has(key) {
    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        const exists = await this.redisClient.exists(key);
        if (exists) {
          return true;
        }
      } catch (error) {
        this.log(`Redis EXISTS failed for key ${key}`, { error: error.message }, 'warn');
      }
    }
    
    // Check memory cache
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      // Check if expired
      if (memoryEntry.expiry && Date.now() > memoryEntry.expiry) {
        this.memoryCache.delete(key);
        return false;
      }
      return true;
    }
    
    return false;
  }
  
  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  async delete(key) {
    // Delete from Redis
    if (this.redisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
        this.log(`Redis DEL: ${key}`);
      } catch (error) {
        this.log(`Redis DEL failed for key ${key}`, { error: error.message }, 'warn');
      }
    }
    
    // Delete from memory cache
    const deleted = this.memoryCache.delete(key);
    if (deleted) {
      this.log(`Memory DEL: ${key}`);
    }
    
    return deleted;
  }
  
  /**
   * Clear all cache entries
   */
  async clear() {
    // Clear Redis
    if (this.redisConnected && this.redisClient) {
      try {
        await this.redisClient.flushDb();
        this.log('Redis cache cleared');
      } catch (error) {
        this.log('Redis clear failed', { error: error.message }, 'warn');
      }
    }
    
    // Clear memory cache
    this.memoryCache.clear();
    this.log('Memory cache cleared');
  }
  
  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    return {
      redis: {
        connected: this.redisConnected,
        hits: this.metrics.redisHits,
        misses: this.metrics.redisMisses,
        errors: this.metrics.redisErrors,
        lastError: this.metrics.lastRedisError
      },
      memory: {
        size: this.memoryCache.size,
        maxSize: this.config.maxMemoryEntries,
        hits: this.metrics.memoryHits,
        misses: this.metrics.memoryMisses
      },
      combined: {
        totalHits: this.metrics.redisHits + this.metrics.memoryHits,
        totalMisses: this.metrics.redisMisses + this.metrics.memoryMisses,
        hitRate: this.calculateHitRate(),
        uptime: Date.now() - this.metrics.uptime
      },
      config: {
        redisEnabled: this.config.redisEnabled,
        defaultTTL: this.config.defaultTTL
      }
    };
  }
  
  /**
   * Calculate cache hit rate
   * @returns {number} Hit rate as percentage
   */
  calculateHitRate() {
    const totalHits = this.metrics.redisHits + this.metrics.memoryHits;
    const totalRequests = totalHits + this.metrics.redisMisses + this.metrics.memoryMisses;
    
    return totalRequests > 0 ? ((totalHits / totalRequests) * 100).toFixed(2) : 0;
  }
  
  /**
   * Get cache health status
   * @returns {object} Health status
   */
  getHealth() {
    const stats = this.getStats();
    const isHealthy = this.config.redisEnabled ? this.redisConnected : true;
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      redis: {
        status: this.redisConnected ? 'connected' : 'disconnected',
        enabled: this.config.redisEnabled
      },
      memory: {
        status: 'active',
        usage: `${stats.memory.size}/${stats.memory.maxSize}`
      },
      performance: {
        hitRate: `${stats.combined.hitRate}%`,
        totalRequests: stats.combined.totalHits + stats.combined.totalMisses
      }
    };
  }
  
  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    this.log('Disconnecting cache service...');
    
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        this.log('Error disconnecting Redis', { error: error.message }, 'warn');
      }
    }
    
    this.memoryCache.clear();
    this.log('Cache service disconnected');
  }
  
  /**
   * Internal logging method
   * @param {string} message - Log message
   * @param {object} data - Additional data
   * @param {string} level - Log level
   */
  log(message, data = {}, level = 'info') {
    if (!this.config.enableLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: 'CacheService',
      message,
      ...data
    };
    
    switch (level) {
      case 'error':
        console.error(`[Cache] ${message}`, data);
        break;
      case 'warn':
        console.warn(`[Cache] ${message}`, data);
        break;
      default:
        console.log(`[Cache] ${message}`, data);
    }
  }
}

export default CacheService;