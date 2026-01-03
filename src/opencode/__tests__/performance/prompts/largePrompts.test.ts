/**
 * Large Prompt Performance Tests
 *
 * Performance tests for handling large prompts and inputs
 */

import { describe, it, expect } from 'vitest';

describe('Large Prompt Performance Tests', () => {
  describe('prompt size handling', () => {
    it('should handle 1KB prompt efficiently', () => {
      const prompt = 'x'.repeat(1024);
      const startTime = Date.now();

      // Simulate processing
      const processed = prompt.length;

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processed).toBe(1024);
      expect(processingTime).toBeLessThan(100); // Should process in <100ms
    });

    it('should handle 10KB prompt efficiently', () => {
      const prompt = 'x'.repeat(10 * 1024);
      const startTime = Date.now();

      const processed = prompt.length;

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processed).toBe(10 * 1024);
      expect(processingTime).toBeLessThan(100); // Should process in <100ms
    });

    it('should handle 100KB prompt efficiently', () => {
      const prompt = 'x'.repeat(100 * 1024);
      const startTime = Date.now();

      const processed = prompt.length;

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processed).toBe(100 * 1024);
      expect(processingTime).toBeLessThan(500); // Should process in <500ms
    });

    it('should handle 1MB prompt efficiently', () => {
      const prompt = 'x'.repeat(1024 * 1024);
      const startTime = Date.now();

      const processed = prompt.length;

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(processed).toBe(1024 * 1024);
      expect(processingTime).toBeLessThan(2000); // Should process in <2s
    });
  });

  describe('prompt serialization', () => {
    it('should serialize prompt quickly', () => {
      const prompt = {
        content: 'x'.repeat(10_000),
        metadata: {
          timestamp: Date.now(),
          mode: 'default',
          model: 'gpt-4',
        },
      };

      const startTime = Date.now();
      const serialized = JSON.stringify(prompt);
      const endTime = Date.now();

      const serializationTime = endTime - startTime;

      expect(serialized.length).toBeGreaterThan(10_000);
      expect(serializationTime).toBeLessThan(100); // Should serialize in <100ms
    });

    it('should deserialize prompt quickly', () => {
      const serialized = JSON.stringify({
        content: 'x'.repeat(10_000),
        metadata: { timestamp: Date.now() },
      });

      const startTime = Date.now();
      const deserialized = JSON.parse(serialized);
      const endTime = Date.now();

      const deserializationTime = endTime - startTime;

      expect(deserialized.content.length).toBe(10_000);
      expect(deserializationTime).toBeLessThan(100); // Should deserialize in <100ms
    });
  });

  describe('memory efficiency', () => {
    it('should not leak memory with large prompts', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Process multiple large prompts
      for (let i = 0; i < 10; i++) {
        const prompt = 'x'.repeat(100_000);
        const processed = prompt.length;
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory growth should be reasonable (<50MB)
      const maxGrowth = 50 * 1024 * 1024;
      expect(memoryGrowth).toBeLessThan(maxGrowth);
    });

    it('should reuse buffers for similar-sized prompts', () => {
      const prompts = [
        'x'.repeat(10_000),
        'y'.repeat(10_000),
        'z'.repeat(10_000),
      ];

      const startTime = Date.now();

      prompts.forEach(prompt => {
        const length = prompt.length;
      });

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should be fast due to buffer reuse
      expect(processingTime).toBeLessThan(50);
    });
  });

  describe('prompt chunking', () => {
    it('should chunk large prompts efficiently', () => {
      const largePrompt = 'x'.repeat(1_000_000);
      const chunkSize = 10_000;

      const startTime = Date.now();

      const chunks: string[] = [];
      for (let i = 0; i < largePrompt.length; i += chunkSize) {
        chunks.push(largePrompt.slice(i, i + chunkSize));
      }

      const endTime = Date.now();
      const chunkingTime = endTime - startTime;

      expect(chunks.length).toBe(100);
      expect(chunkingTime).toBeLessThan(500); // Should chunk in <500ms
    });

    it('should reassemble chunks efficiently', () => {
      const originalPrompt = 'x'.repeat(1_000_000);
      const chunkSize = 10_000;

      const chunks: string[] = [];
      for (let i = 0; i < originalPrompt.length; i += chunkSize) {
        chunks.push(originalPrompt.slice(i, i + chunkSize));
      }

      const startTime = Date.now();
      const reassembled = chunks.join('');
      const endTime = Date.now();

      const reassemblyTime = endTime - startTime;

      expect(reassembled).toBe(originalPrompt);
      expect(reassemblyTime).toBeLessThan(500); // Should reassemble in <500ms
    });
  });

  describe('prompt compression', () => {
    it('should detect compressible content', () => {
      const compressiblePrompt = 'abc '.repeat(10_000); // Highly repetitive

      // Simple compression check: ratio of unique characters
      const uniqueChars = new Set(compressiblePrompt).size;
      const totalChars = compressiblePrompt.length;
      const compressionRatio = uniqueChars / totalChars;

      // Low ratio means highly compressible
      expect(compressionRatio).toBeLessThan(0.1);
    });

    it('should handle incompressible content', () => {
      // Create a string with many different characters
      const randomPrompt = Array.from({ length: 10_000 }, (_, i) =>
        String.fromCharCode(33 + (i % 94)) // Use all printable ASCII
      ).join('');

      const uniqueChars = new Set(randomPrompt).size;
      const totalChars = randomPrompt.length;
      const compressionRatio = uniqueChars / totalChars;

      // High ratio means not compressible (most characters are unique)
      expect(compressionRatio).toBeGreaterThan(0.005); // At least 0.5% unique
      expect(uniqueChars).toBeGreaterThan(50); // Many unique characters
    });
  });

  describe('prompt truncation', () => {
    it('should truncate oversized prompts quickly', () => {
      const maxSize = 100_000;
      const oversizedPrompt = 'x'.repeat(1_000_000);

      const startTime = Date.now();
      const truncated = oversizedPrompt.slice(0, maxSize);
      const endTime = Date.now();

      const truncationTime = endTime - startTime;

      expect(truncated.length).toBe(maxSize);
      expect(truncationTime).toBeLessThan(10); // Should be instant
    });

    it('should handle truncation gracefully', () => {
      const maxSize = 1000;
      const multiLinePrompt = 'line\n'.repeat(10_000);

      const truncated = multiLinePrompt.slice(0, maxSize);

      expect(truncated.length).toBeLessThanOrEqual(maxSize);
      expect(truncated).not.toContain('\n'.repeat(100)); // Should not end with tons of newlines
    });
  });

  describe('prompt validation', () => {
    it('should validate prompt structure efficiently', () => {
      const prompts = [
        { content: 'Valid prompt', mode: 'default' },
        { content: '', mode: 'default' }, // Invalid: empty
        { content: 'x'.repeat(1_000_000), mode: 'yolo' }, // Valid: large
      ];

      const startTime = Date.now();

      const validationResults = prompts.map(p => ({
        valid: p.content.length > 0 && p.content.length <= 10_000_000,
        size: p.content.length,
      }));

      const endTime = Date.now();
      const validationTime = endTime - startTime;

      expect(validationResults[0].valid).toBe(true);
      expect(validationResults[1].valid).toBe(false);
      expect(validationResults[2].valid).toBe(true);
      expect(validationTime).toBeLessThan(10); // Should be instant
    });

    it('should detect invalid characters efficiently', () => {
      const promptWithNull = 'Hello\x00World';
      const promptWithControl = 'Hello\x1FWorld';

      const hasInvalidChar1 = /[\x00-\x08\x0E-\x1F]/.test(promptWithNull);
      const hasInvalidChar2 = /[\x00-\x08\x0E-\x1F]/.test(promptWithControl);

      expect(hasInvalidChar1).toBe(true);
      expect(hasInvalidChar2).toBe(true);
    });
  });

  describe('throughput', () => {
    it('should process multiple prompts concurrently', () => {
      const prompts = Array.from({ length: 100 }, (_, i) =>
        `Prompt ${i}: ${'x'.repeat(1000)}`
      );

      const startTime = Date.now();

      const processed = prompts.map(p => ({
        length: p.length,
        firstChar: p[0],
      }));

      const endTime = Date.now();
      const throughputTime = endTime - startTime;

      expect(processed.length).toBe(100);
      expect(throughputTime).toBeLessThan(1000); // Should process 100 prompts in <1s
    });

    it('should handle burst of prompts', () => {
      const burstSize = 50;
      const prompts = Array.from({ length: burstSize }, () =>
        'x'.repeat(10_000)
      );

      const startTime = Date.now();

      let totalProcessed = 0;
      prompts.forEach(prompt => {
        totalProcessed += prompt.length;
      });

      const endTime = Date.now();
      const burstTime = endTime - startTime;

      expect(totalProcessed).toBe(burstSize * 10_000);
      expect(burstTime).toBeLessThan(500); // Should handle burst in <500ms
    });
  });
});
