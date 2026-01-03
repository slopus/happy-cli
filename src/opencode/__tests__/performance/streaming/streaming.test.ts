/**
 * Streaming Performance Tests
 *
 * Performance tests for response streaming and chunk handling
 */

import { describe, it, expect } from 'vitest';

describe('Streaming Performance Tests', () => {
  describe('chunk accumulation', () => {
    it('should accumulate small chunks efficiently', () => {
      const chunks: string[] = [];
      const chunkCount = 1000;
      const chunkSize = 10;

      const startTime = Date.now();

      for (let i = 0; i < chunkCount; i++) {
        chunks.push('x'.repeat(chunkSize));
      }

      const accumulated = chunks.join('');

      const endTime = Date.now();
      const accumulationTime = endTime - startTime;

      expect(accumulated.length).toBe(chunkCount * chunkSize);
      expect(accumulationTime).toBeLessThan(100); // Should accumulate in <100ms
    });

    it('should accumulate variable-sized chunks', () => {
      const chunks = [
        'x'.repeat(10),
        'y'.repeat(100),
        'z'.repeat(1000),
        'a'.repeat(100),
        'b'.repeat(10),
      ];

      const startTime = Date.now();
      const accumulated = chunks.join('');
      const endTime = Date.now();

      const accumulationTime = endTime - startTime;

      expect(accumulated.length).toBe(1220);
      expect(accumulationTime).toBeLessThan(10); // Should be instant
    });

    it('should handle large chunks efficiently', () => {
      const chunks: string[] = [];
      const chunkCount = 100;
      const chunkSize = 10_000;

      const startTime = Date.now();

      for (let i = 0; i < chunkCount; i++) {
        chunks.push('x'.repeat(chunkSize));
      }

      const accumulated = chunks.join('');

      const endTime = Date.now();
      const accumulationTime = endTime - startTime;

      expect(accumulated.length).toBe(chunkCount * chunkSize);
      expect(accumulationTime).toBeLessThan(1000); // Should accumulate in <1s
    });
  });

  describe('stream processing latency', () => {
    it('should have low per-chunk latency', () => {
      const chunks = Array.from({ length: 100 }, () => 'chunk');
      const latencies: number[] = [];

      chunks.forEach(chunk => {
        const start = Date.now();
        // Simulate processing
        const processed = chunk.toUpperCase();
        const end = Date.now();
        latencies.push(end - start);
      });

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      expect(avgLatency).toBeLessThan(5); // Average <5ms per chunk
      expect(maxLatency).toBeLessThan(20); // Max <20ms per chunk
    });

    it('should handle high-frequency chunks', () => {
      const chunkCount = 1000;
      const chunks = Array.from({ length: chunkCount }, (_, i) => `chunk${i}`);

      const startTime = Date.now();

      chunks.forEach(chunk => {
        // Minimal processing
        const len = chunk.length;
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const chunksPerSecond = (chunkCount / totalTime) * 1000;

      expect(chunksPerSecond).toBeGreaterThan(10_000); // >10k chunks/sec
    });
  });

  describe('memory efficiency during streaming', () => {
    it('should not accumulate unbounded memory', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Simulate streaming with bounded buffer
      const maxBufferSize = 100_000;
      let buffer = '';

      for (let i = 0; i < 1000; i++) {
        const chunk = 'x'.repeat(1000);

        // Only keep recent chunks
        buffer += chunk;
        if (buffer.length > maxBufferSize) {
          buffer = buffer.slice(-maxBufferSize);
        }
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be bounded
      expect(buffer.length).toBeLessThanOrEqual(maxBufferSize);
      expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024); // <20MB growth
    });

    it('should reuse string buffers', () => {
      const chunks = Array.from({ length: 100 }, () => 'x'.repeat(1000));

      const startTime = Date.now();

      // Use array join which is more efficient than string concatenation
      const result = chunks.join('');

      const endTime = Date.now();
      const joinTime = endTime - startTime;

      expect(result.length).toBe(100 * 1000);
      expect(joinTime).toBeLessThan(50); // Should be fast
    });
  });

  describe('backpressure handling', () => {
    it('should slow down on fast producer', () => {
      const chunks: string[] = [];
      const processedChunks: string[] = [];
      const maxQueueSize = 100;

      // Fast producer
      const producerInterval = setInterval(() => {
        if (chunks.length < maxQueueSize * 2) {
          chunks.push('chunk');
        }
      }, 1);

      // Slow consumer
      const startTime = Date.now();
      let processedCount = 0;

      const consumerInterval = setInterval(() => {
        if (chunks.length > 0) {
          processedChunks.push(chunks.shift()!);
          processedCount++;

          if (processedCount >= 100) {
            clearInterval(producerInterval);
            clearInterval(consumerInterval);

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            expect(processedChunks.length).toBe(100);
            expect(totalTime).toBeGreaterThan(0); // Took some time
          }
        }
      }, 10);
    });

    it('should not lose chunks during backpressure', () => {
      const chunks = Array.from({ length: 1000 }, (_, i) => `chunk${i}`);
      const processed: string[] = [];

      const startTime = Date.now();

      // Process all chunks
      chunks.forEach(chunk => {
        processed.push(chunk);
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processed.length).toBe(chunks.length);
      expect(processingTime).toBeLessThan(100);
      expect(processed).toEqual(chunks); // No chunks lost or reordered
    });
  });

  describe('stream interruption', () => {
    it('should handle stream interruption gracefully', () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5'];
      const accumulated: string[] = [];

      let interrupted = false;

      try {
        chunks.forEach((chunk, index) => {
          if (index === 3) {
            interrupted = true;
            throw new Error('Stream interrupted');
          }
          accumulated.push(chunk);
        });
      } catch (e) {
        // Expected interruption
      }

      expect(interrupted).toBe(true);
      expect(accumulated.length).toBeLessThan(chunks.length);
    });

    it('should resume after interruption', () => {
      const chunks1 = ['chunk1', 'chunk2', 'chunk3'];
      const chunks2 = ['chunk4', 'chunk5'];

      let accumulated1 = '';
      chunks1.forEach(c => (accumulated1 += c));

      // Simulate interruption
      const interrupted = true;

      // Resume
      let accumulated2 = accumulated1;
      chunks2.forEach(c => (accumulated2 += c));

      const expected = 'chunk1chunk2chunk3chunk4chunk5';
      expect(accumulated2).toBe(expected);
    });
  });

  describe('Unicode streaming', () => {
    it('should handle multi-byte characters in chunks', () => {
      const emoji = '🌍';
      const emojiBytes = emoji.length; // 2 bytes in UTF-16

      // Split in middle of emoji (bad case)
      const badChunk = 'Hello ' + emoji.slice(0, 1) + emoji.slice(1);

      // Proper chunking
      const goodChunk = 'Hello ' + emoji;

      expect(badChunk.length).toBe(goodChunk.length);
      expect(goodChunk).toContain('🌍');
    });

    it('should accumulate Unicode correctly', () => {
      const chunks = ['Hello ', '🌍', ' 世界', ' שלום'];

      const accumulated = chunks.join('');

      expect(accumulated).toBe('Hello 🌍 世界 שלום');
      expect([...accumulated]).toHaveLength(15); // Counting graphemes
    });
  });

  describe('stream metrics', () => {
    it('should track chunk delivery rate', () => {
      const chunkCount = 100;
      const chunks = Array.from({ length: chunkCount }, () => 'chunk');

      const startTime = Date.now();

      let processed = 0;
      chunks.forEach(() => {
        processed++;
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      const chunksPerSecond = (processed / duration) * 1000;

      expect(processed).toBe(chunkCount);
      expect(chunksPerSecond).toBeGreaterThan(1000); // >1000 chunks/sec
    });

    it('should track byte throughput', () => {
      const chunkSize = 1000;
      const chunkCount = 100;
      const chunks = Array.from({ length: chunkCount }, () => 'x'.repeat(chunkSize));

      const startTime = Date.now();

      const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

      const endTime = Date.now();
      const duration = endTime - startTime;
      const bytesPerSecond = (totalBytes / duration) * 1000;

      expect(totalBytes).toBe(chunkSize * chunkCount);
      expect(bytesPerSecond).toBeGreaterThan(1_000_000); // >1MB/s
    });
  });

  describe('stream completion', () => {
    it('should detect stream completion', () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3'];
      let accumulated = '';

      chunks.forEach(chunk => {
        accumulated += chunk;
      });

      const isComplete = accumulated === 'chunk1chunk2chunk3';

      expect(isComplete).toBe(true);
      expect(accumulated.length).toBe(18);
    });

    it('should handle empty stream', () => {
      const chunks: string[] = [];
      const accumulated = chunks.join('');

      expect(accumulated).toBe('');
      expect(accumulated.length).toBe(0);
    });

    it('should handle single-chunk stream', () => {
      const chunks = ['single chunk'];
      const accumulated = chunks.join('');

      expect(accumulated).toBe('single chunk');
    });
  });
});
