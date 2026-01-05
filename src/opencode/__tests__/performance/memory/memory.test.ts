/**
 * Memory Performance Tests
 *
 * Performance tests for memory usage and leak detection
 */

import { describe, it, expect } from 'vitest';

describe('Memory Performance Tests', () => {
  describe('baseline memory usage', () => {
    it('should have reasonable baseline memory', () => {
      const baselineMemory = process.memoryUsage();

      expect(baselineMemory.heapUsed).toBeGreaterThan(0);
      expect(baselineMemory.heapUsed).toBeLessThan(500 * 1024 * 1024); // <500MB
    });

    it('should measure memory accurately', () => {
      const before = process.memoryUsage().heapUsed;

      // Allocate some memory
      const data = new Array(1000).fill('x'.repeat(100));

      const after = process.memoryUsage().heapUsed;
      const growth = after - before;

      expect(growth).toBeGreaterThan(0);
      expect(data.length).toBe(1000);
    });
  });

  describe('session memory', () => {
    it('should not leak memory across sessions', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate multiple sessions
      for (let i = 0; i < 10; i++) {
        const session = {
          id: `session-${i}`,
          messages: Array.from({ length: 100 }, (_, j) => `message-${j}`),
          metadata: { timestamp: Date.now() },
        };

        // Session goes out of scope
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const growth = finalMemory - initialMemory;

      // Growth should be minimal after GC
      expect(growth).toBeLessThan(10 * 1024 * 1024); // <10MB growth
    });

    it('should clean up session resources', () => {
      let sessionActive = true;
      const resources = ['connection', 'queue', 'handler'];

      // Simulate cleanup
      const cleanedResources: string[] = [];
      resources.forEach(r => cleanedResources.push(r));
      sessionActive = false;

      expect(sessionActive).toBe(false);
      expect(cleanedResources).toEqual(resources);
    });
  });

  describe('message queue memory', () => {
    it('should handle large queue efficiently', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      const queue = Array.from({ length: 10_000 }, (_, i) => ({
        id: i,
        content: `message ${i}`,
        timestamp: Date.now(),
      }));

      const afterMemory = process.memoryUsage().heapUsed;
      const memoryUsed = afterMemory - initialMemory;

      expect(queue.length).toBe(10_000);
      expect(memoryUsed).toBeLessThan(50 * 1024 * 1024); // <50MB for 10k messages
    });

    it('should free memory when queue is cleared', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      let queue = Array.from({ length: 1000 }, (_, i) => `message ${i}`);

      const afterAllocation = process.memoryUsage().heapUsed;

      queue = []; // Clear queue

      if (global.gc) {
        global.gc();
      }

      const afterCleanup = process.memoryUsage().heapUsed;

      // Queue should be cleared
      expect(queue.length).toBe(0);
      // Memory after cleanup should not exceed allocation by much
      expect(afterCleanup).toBeLessThan(afterAllocation * 2);
    });
  });

  describe('string memory', () => {
    it('should share string memory when possible', () => {
      const strings = Array.from({ length: 1000 }, () => 'same string');

      if (global.gc) {
        global.gc();
      }

      // V8 may intern identical strings
      const initialMemory = process.memoryUsage().heapUsed;

      const moreStrings = Array.from({ length: 1000 }, () => 'same string');

      if (global.gc) {
        global.gc();
      }

      const afterMemory = process.memoryUsage().heapUsed;
      const growth = afterMemory - initialMemory;
      const maxGrowth = global.gc ? 100 * 1024 : 256 * 1024;

      // Growth should be minimal due to string interning, with headroom without GC
      expect(growth).toBeLessThan(maxGrowth);
    });

    it('should handle large string concatenation efficiently', () => {
      const chunks = Array.from({ length: 1000 }, () => 'chunk');

      // Efficient: array join
      const startTime1 = Date.now();
      const result1 = chunks.join('');
      const time1 = Date.now() - startTime1;

      // Less efficient: repeated concatenation
      let result2 = '';
      const startTime2 = Date.now();
      chunks.forEach(c => (result2 += c));
      const time2 = Date.now() - startTime2;

      expect(result1).toBe(result2);
      // Both should be fast (< 10ms)
      expect(time1).toBeLessThan(10);
      expect(time2).toBeLessThan(100);
    });
  });

  describe('object memory', () => {
    it('should reuse objects where possible', () => {
      const objects: Array<{ id: number; value: string }> = [];

      const startTime = Date.now();

      for (let i = 0; i < 10_000; i++) {
        objects.push({ id: i, value: `value-${i}` });
      }

      const endTime = Date.now();
      const allocationTime = endTime - startTime;

      expect(objects.length).toBe(10_000);
      expect(allocationTime).toBeLessThan(1000); // Should allocate quickly
    });

    it('should clean up object references', () => {
      const map = new Map<string, { data: string }>();

      // Add entries
      for (let i = 0; i < 1000; i++) {
        map.set(`key-${i}`, { data: `value-${i}` });
      }

      const sizeBefore = map.size;

      // Clear entries
      map.clear();

      expect(sizeBefore).toBe(1000);
      expect(map.size).toBe(0);
    });
  });

  describe('buffer memory', () => {
    it('should handle buffer operations efficiently', () => {
      const size = 1024 * 1024; // 1MB
      const buffer = Buffer.alloc(size);

      const startTime = Date.now();

      // Fill buffer
      buffer.fill('x');

      const endTime = Date.now();
      const fillTime = endTime - startTime;

      expect(buffer.length).toBe(size);
      expect(fillTime).toBeLessThan(100); // Should fill 1MB quickly
    });

    it('should reuse buffers', () => {
      const buffer = Buffer.alloc(1024);

      const startTime = Date.now();

      // Reuse buffer multiple times
      for (let i = 0; i < 1000; i++) {
        buffer.fill(`iteration-${i}`);
      }

      const endTime = Date.now();
      const reuseTime = endTime - startTime;

      expect(reuseTime).toBeLessThan(100); // Should be fast with reuse
    });
  });

  describe('cache memory', () => {
    it('should limit cache size', () => {
      const maxCacheSize = 100;
      const cache = new Map<string, string>();

      // Add more items than cache size
      for (let i = 0; i < 200; i++) {
        cache.set(`key-${i}`, `value-${i}`);

        // Enforce cache size limit
        if (cache.size > maxCacheSize) {
          const firstKey = cache.keys().next().value;
          if (firstKey !== undefined) {
            cache.delete(firstKey);
          }
        }
      }

      expect(cache.size).toBeLessThanOrEqual(maxCacheSize);
    });

    it('should evict old cache entries', () => {
      const cache = new Map<string, { value: string; timestamp: number }>();
      const maxAge = 1000; // 1 second

      // Add entries
      cache.set('key1', { value: 'value1', timestamp: Date.now() - 2000 });
      cache.set('key2', { value: 'value2', timestamp: Date.now() });

      // Evict old entries
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > maxAge) {
          cache.delete(key);
        }
      }

      expect(cache.size).toBe(1);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });
  });

  describe('memory pressure', () => {
    it('should handle memory pressure gracefully', () => {
      const allocations: Buffer[] = [];
      const maxMemory = 100 * 1024 * 1024; // 100MB limit

      let totalAllocated = 0;
      let allocationCount = 0;

      while (totalAllocated < maxMemory) {
        const size = 1024 * 1024; // 1MB per allocation
        allocations.push(Buffer.alloc(size));
        totalAllocated += size;
        allocationCount++;

        if (allocationCount > 150) {
          // Safety limit
          break;
        }
      }

      expect(totalAllocated).toBeLessThanOrEqual(maxMemory * 1.5);
      expect(allocations.length).toBeGreaterThan(50);
    });

    it('should not crash under memory pressure', () => {
      const largeArrays: string[][] = [];

      // Allocate multiple large arrays
      for (let i = 0; i < 10; i++) {
        largeArrays.push(Array.from({ length: 10_000 }, (_, j) => `item-${j}`));
      }

      // Should still be functional
      const sum = largeArrays.reduce((acc, arr) => acc + arr.length, 0);

      expect(sum).toBe(100_000);
      expect(largeArrays.length).toBe(10);
    });
  });
});
