/**
 * Mock ACP Server
 *
 * In-memory ACP server for testing OpenCode backend
 */

import { createServer, Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { MockACPOptions, ACPMessage } from './types';

export class MockACPServer {
  private server: Server | null = null;
  private port: number;
  private responses: ACPMessage[] = [];
  private options: MockACPOptions;

  constructor(opts: MockACPOptions = {}) {
    this.port = opts.port ?? 0;
    this.options = {
      autoRespond: opts.autoRespond ?? true,
      latency: opts.latency ?? 10,
      ...opts,
    };
  }

  /**
   * Start the mock ACP server
   * @returns The actual port the server is listening on
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        // Handle ACP JSON-RPC requests
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const request = JSON.parse(body);
            const response = await this.handleRequest(request);

            // Add latency if configured
            if (this.options && this.options.latency && this.options.latency > 0) {
              await new Promise(r => setTimeout(r, this.options.latency));
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        const address = this.server!.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }

        // Type guard for AddressInfo object
        if (typeof address === 'object' && address !== null && 'port' in address) {
          this.port = (address as { port: number }).port;
        }

        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock ACP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Queue a response to be returned for the next request
   */
  queueResponse(response: ACPMessage): void {
    this.responses.push(response);
  }

  /**
   * Get the port the server is listening on
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Simulate a server crash
   */
  simulateCrash(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Handle an incoming ACP request
   */
  private async handleRequest(request: { method: string; params?: unknown }): Promise<unknown> {
    const { method, params } = request;

    switch (method) {
      case 'newSession':
        return {
          jsonrpc: '2.0',
          id: randomUUID(),
          result: {
            sessionId: randomUUID(),
          },
        };

      case 'sendPrompt':
        // Return queued response or default
        if (this.responses.length > 0) {
          return this.responses.shift();
        }

        return {
          jsonrpc: '2.0',
          id: randomUUID(),
          result: {
            content: 'Mock response',
            complete: true,
          },
        };

      case 'cancel':
        return {
          jsonrpc: '2.0',
          id: randomUUID(),
          result: { cancelled: true },
        };

      default:
        return {
          jsonrpc: '2.0',
          id: randomUUID(),
          error: { code: -32601, message: 'Method not found' },
        };
    }
  }
}

/**
 * Create a mock ACP server with default options
 */
export async function createMockACP(opts?: MockACPOptions): Promise<MockACPServer> {
  const server = new MockACPServer(opts);
  await server.start();
  return server;
}
