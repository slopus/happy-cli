/**
 * Memory Monitor
 *
 * Track memory usage during tests to detect leaks
 */

import type { MemorySnapshot } from './types';

export class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private monitoring = false;

  /**
   * Start monitoring memory usage
   */
  start(): void {
    this.monitoring = true;
    this.snapshots = [];
    this.snapshot();
  }

  /**
   * Take a snapshot of current memory usage
   */
  snapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get memory growth between first and last snapshot
   */
  getGrowth(): number {
    if (this.snapshots.length < 2) {
      return 0;
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    return last.heapUsed - first.heapUsed;
  }

  /**
   * Get peak memory usage
   */
  getPeak(): number {
    return Math.max(...this.snapshots.map(s => s.heapUsed));
  }

  /**
   * Assert that memory hasn't leaked beyond threshold
   * @param maxGrowthMB Maximum allowed growth in MB
   */
  assertNoLeaks(maxGrowthMB: number): void {
    const growth = this.getGrowth();
    const maxBytes = maxGrowthMB * 1024 * 1024;

    if (growth > maxBytes) {
      throw new Error(
        `Memory leak detected: grew by ${(growth / 1024 / 1024).toFixed(2)}MB ` +
        `(threshold: ${maxGrowthMB}MB)`
      );
    }
  }

  /**
   * Stop monitoring and return summary
   */
  stop(): {
    snapshots: number;
    growth: number;
    growthMB: number;
    peakMB: number;
  } {
    this.monitoring = false;

    const growth = this.getGrowth();
    const peak = this.getPeak();

    return {
      snapshots: this.snapshots.length,
      growth,
      growthMB: growth / 1024 / 1024,
      peakMB: peak / 1024 / 1024,
    };
  }
}

/**
 * Create a memory monitor and start monitoring
 */
export function createMemoryMonitor(): MemoryMonitor {
  const monitor = new MemoryMonitor();
  monitor.start();
  return monitor;
}
