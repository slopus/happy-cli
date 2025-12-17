/**
 * Happy MCP server
 * Provides Happy CLI specific tools including chat session title management
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AddressInfo } from "node:net";
import { z } from "zod";
import { logger } from "@/ui/logger";
import { ApiSessionClient } from "@/api/apiSession";
import { randomUUID } from "node:crypto";

export async function startHappyServer(client: ApiSessionClient) {
    // Handler that sends title updates via the client
    const handler = async (title: string) => {
        logger.debug('[happyMCP] Changing title to:', title);
        try {
            // Send title as a summary message, similar to title generator
            client.sendClaudeSessionMessage({
                type: 'summary',
                summary: title,
                leafUuid: randomUUID()
            });

            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    };

    //
    // Create the MCP server
    //

    const mcp = new McpServer({
        name: "Happy MCP",
        version: "1.0.0",
    });

    mcp.registerTool('change_title', {
        description: 'Change the title of the current chat session',
        title: 'Change Chat Title',
        inputSchema: {
            title: z.string().describe('The new title for the chat session'),
        },
    }, async (args) => {
        const response = await handler(args.title);
        logger.debug('[happyMCP] Response:', response);

        if (response.success) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Successfully changed chat title to: "${args.title}"`,
                    },
                ],
                isError: false,
            };
        } else {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to change chat title: ${response.error || 'Unknown error'}`,
                    },
                ],
                isError: true,
            };
        }
    });

    // Add notify_user tool
    mcp.registerTool('notify_user', {
        description: 'Send a notification message to the user on their mobile device',
        title: 'Notify User',
        inputSchema: {
            message: z.string().describe('The message to send to the user'),
            level: z.enum(['info', 'warning', 'error']).optional().describe('Notification level'),
        },
    }, async (args) => {
        try {
            // Send as a session event/message
            client.sendSessionEvent({
                type: 'message',
                message: `📱 [IDE Notification] ${args.level ? `[${args.level.toUpperCase()}] ` : ''}${args.message}`
            });

            return {
                content: [{ type: 'text', text: `Notification sent to user device: "${args.message}"` }],
                isError: false,
            };
        } catch (error) {
            return {
                content: [{ type: 'text', text: `Failed to send notification: ${String(error)}` }],
                isError: true,
            };
        }
    });

    const transport = new StreamableHTTPServerTransport({
        // NOTE: Returning session id here will result in claude
        // sdk spawn to fail with `Invalid Request: Server already initialized`
        sessionIdGenerator: undefined
    });
    await mcp.connect(transport);

    //
    // Create the HTTP server
    //

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res);
        } catch (error) {
            logger.debug("Error handling request:", error);
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
        }
    });

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address() as AddressInfo;
            resolve(new URL(`http://127.0.0.1:${addr.port}`));
        });
    });

    // Write URL to a file so other tools can find it easily if needed, or just log it
    // For now, we rely on the main process logging it

    return {
        url: baseUrl.toString(),
        toolNames: ['change_title', 'notify_user'],
        stop: () => {
            logger.debug('[happyMCP] Stopping server');
            mcp.close();
            server.close();
        }
    }
}
