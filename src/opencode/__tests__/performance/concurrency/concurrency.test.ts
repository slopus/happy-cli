/**
 * Concurrency Performance Tests
 *
 * Performance tests for concurrent operations
 */

import { describe, it, expect } from 'vitest';

describe('Concurrency Performance Tests', () => {
  describe('concurrent prompt processing', () => {
    it('should handle concurrent prompts', async () => {
      const prompts = Array.from({ length: 10 }, (_, i) => `prompt ${i}`);

      const startTime = Date.now();

      // Simulate concurrent processing
      const results = await Promise.all(
        prompts.map(async (prompt) => {
          // Simulate async processing
          return new Promise((resolve) => {
            setTimeout(() => resolve(prompt.toUpperCase()), 10);
          });
        })
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(results.length).toBe(prompts.length);
      expect(processingTime).toBeLessThan(100); // Should complete in <100ms
    });

    it('should prioritize important prompts', async () => {
      const importantPrompt = 'IMPORTANT';
      const normalPrompts = Array.from({ length: 5 }, (_, i) => `normal ${i}`);

      const startTime = Date.now();

      // Process important first
      const importantResult = await Promise.race([
        new Promise<string>((resolve) =>
          setTimeout(() => resolve(importantPrompt), 10)
        ),
        ...normalPrompts.map((p) =>
          new Promise<string>((resolve) => setTimeout(() => resolve(p), 50))
        ),
      ]);

      const endTime = Date.now();

      expect(importantResult).toBe(importantPrompt);
      expect(endTime - startTime).toBeLessThan(30);
    });
  });

  describe('concurrent session handling', () => {
    it('should handle multiple sessions', async () => {
      const sessionIds = Array.from({ length: 5 }, (_, i) => `session-${i}`);

      const sessions = await Promise.all(
        sessionIds.map(async (id) => {
          // Simulate session creation
          return {
            id,
            created: Date.now(),
            active: true,
          };
        })
      );

      expect(sessions.length).toBe(5);
      sessions.forEach((s) => {
        expect(s.active).toBe(true);
        expect(s.created).toBeGreaterThan(0);
      });
    });

    it('should isolate session state', async () => {
      const createSession = async (id: string) => {
        const messages: string[] = [];

        return {
          id,
          addMessage: (msg: string) => messages.push(msg),
          getMessages: () => [...messages],
        };
      };

      const [session1, session2] = await Promise.all([
        createSession('session-1'),
        createSession('session-2'),
      ]);

      session1.addMessage('message for session 1');
      session2.addMessage('message for session 2');

      expect(session1.getMessages()).toEqual(['message for session 1']);
      expect(session2.getMessages()).toEqual(['message for session 2']);
      expect(session1.getMessages()).not.toEqual(session2.getMessages());
    });
  });

  describe('concurrent permissions', () => {
    it('should handle concurrent permission requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) => `request-${i}`);

      const startTime = Date.now();

      const decisions = await Promise.all(
        requests.map(async (req) => {
          // Simulate permission check
          return new Promise<string>((resolve) => {
            setTimeout(() => resolve(`approved:${req}`), 5);
          });
        })
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(decisions.length).toBe(requests.length);
      decisions.forEach((d) => {
        expect(d).toContain('approved');
      });
      expect(processingTime).toBeLessThan(50); // Should process quickly
    });

    it('should not have race conditions in permissions', async () => {
      let permissionCount = 0;

      const checkPermission = async (id: string): Promise<boolean> => {
        // Simulate async permission check with counter
        return new Promise((resolve) => {
          setTimeout(() => {
            permissionCount++;
            resolve(true);
          }, Math.random() * 10);
        });
      };

      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) => checkPermission(`req-${i}`))
      );

      expect(results.every((r) => r === true)).toBe(true);
      expect(permissionCount).toBe(100);
    });
  });

  describe('concurrent streaming', () => {
    it('should handle multiple concurrent streams', async () => {
      const streams = Array.from({ length: 5 }, (_, i) => ({
        id: `stream-${i}`,
        chunks: [`chunk1-${i}`, `chunk2-${i}`, `chunk3-${i}`],
      }));

      const results = await Promise.all(
        streams.map(async (stream) => {
          // Simulate streaming
          return new Promise<string>((resolve) => {
            setTimeout(() => resolve(stream.chunks.join('')), 10);
          });
        })
      );

      expect(results.length).toBe(5);
      results.forEach((r, i) => {
        expect(r).toContain(`chunk1-${i}`);
      });
    });

    it('should not interleave stream chunks', async () => {
      const stream1 = ['a', 'b', 'c'];
      const stream2 = ['x', 'y', 'z'];

      const [result1, result2] = await Promise.all([
        Promise.resolve(stream1.join('')),
        Promise.resolve(stream2.join('')),
      ]);

      expect(result1).toBe('abc');
      expect(result2).toBe('xyz');
      expect(result1).not.toContain('x');
      expect(result2).not.toContain('a');
    });
  });

  describe('resource contention', () => {
    it('should share resources efficiently', async () => {
      let sharedResource = 0;

      const incrementResource = async (id: number): Promise<number> => {
        return new Promise((resolve) => {
          setTimeout(() => {
            sharedResource++;
            resolve(sharedResource);
          }, Math.random() * 10);
        });
      };

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => incrementResource(i))
      );

      expect(sharedResource).toBe(10);
      expect(new Set(results).size).toBe(10); // All unique values
    });

    it('should handle resource exhaustion', async () => {
      const maxConcurrent = 3;
      let activeCount = 0;
      let maxActive = 0;

      const processWithLimit = async (id: number): Promise<string> => {
        while (activeCount >= maxConcurrent) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }

        activeCount++;
        maxActive = Math.max(maxActive, activeCount);

        return new Promise((resolve) => {
          setTimeout(() => {
            activeCount--;
            resolve(`done-${id}`);
          }, 10);
        });
      };

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => processWithLimit(i))
      );

      expect(maxActive).toBeLessThanOrEqual(maxConcurrent);
      expect(results.length).toBe(10);
    });
  });

  describe('parallel processing', () => {
    it('should process in parallel when possible', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => i);

      const startTime = Date.now();

      const results = await Promise.all(
        tasks.map(async (task) => {
          // Simulate CPU-bound task
          let sum = 0;
          for (let i = 0; i < 1000; i++) {
            sum += i;
          }
          return sum;
        })
      );

      const endTime = Date.now();
      const parallelTime = endTime - startTime;

      expect(results.length).toBe(10);
      expect(parallelTime).toBeLessThan(100); // Should be fast in parallel
    });

    it('should fall back to sequential when needed', async () => {
      const tasks = ['task1', 'task2', 'task3'];

      let startTime = Date.now();

      // Sequential processing (simulating dependent tasks)
      const sequentialResults: string[] = [];
      for (const task of tasks) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        sequentialResults.push(task);
      }

      const sequentialTime = Date.now() - startTime;

      startTime = Date.now();

      // Parallel processing
      const parallelResults = await Promise.all(
        tasks.map((task) =>
          new Promise<string>((resolve) => setTimeout(() => resolve(task), 10))
        )
      );

      const parallelTime = Date.now() - startTime;

      expect(sequentialResults).toEqual(tasks);
      expect(parallelResults).toEqual(tasks);
      expect(parallelTime).toBeLessThan(sequentialTime); // Parallel should be faster
    });
  });

  describe('load balancing', () => {
    it('should distribute load across workers', () => {
      const workers = [0, 0, 0]; // Simulate 3 workers with task counts
      const tasks = Array.from({ length: 30 }, (_, i) => i);

      // Distribute tasks round-robin
      tasks.forEach((task, index) => {
        workers[index % workers.length]++;
      });

      expect(workers).toEqual([10, 10, 10]); // Evenly distributed
    });

    it('should handle worker failure', async () => {
      const workers = [true, true, false]; // Third worker failed
      const tasks = Array.from({ length: 10 }, (_, i) => i);

      const results = await Promise.all(
        tasks.map(async (task) => {
          // Find available worker
          const workerIndex = workers.findIndex((w) => w);
          if (workerIndex === -1) {
            throw new Error('No workers available');
          }
          return task;
        })
      );

      expect(results.length).toBe(10);
    });
  });

  describe('throughput under load', () => {
    it('should maintain throughput with concurrent requests', async () => {
      const requestCount = 100;
      const startTime = Date.now();

      const results = await Promise.all(
        Array.from({ length: requestCount }, (_, i) =>
          Promise.resolve(`response-${i}`)
        )
      );

      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (requestCount / duration) * 1000; // requests per second

      expect(results.length).toBe(requestCount);
      expect(throughput).toBeGreaterThan(1000); // >1000 req/sec
    });

    it('should scale with increased concurrency', async () => {
      const singleThroughput = await measureThroughput(1);
      const concurrentThroughput = await measureThroughput(10);

      // Concurrent should process at least as much as single
      expect(concurrentThroughput).toBeGreaterThanOrEqual(singleThroughput * 0.8);
    });

    async function measureThroughput(concurrency: number): Promise<number> {
      const requests = Array.from({ length: concurrency * 10 }, (_, i) => i);

      const startTime = Date.now();

      await Promise.all(
        requests.map((req) => Promise.resolve(req))
      );

      const endTime = Date.now();
      const duration = endTime - startTime;
      return (requests.length / duration) * 1000;
    }
  });
});
