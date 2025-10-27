/**
 * HTTP control server for daemon management
 * Provides endpoints for listing sessions, stopping sessions, daemon shutdown, command execution, and skill management
 */

import fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { logger } from '@/ui/logger';
import { Metadata } from '@/api/types';
import { TrackedSession } from './types';
import { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import { listSkills, readSkillContent, validateSkill, getSkillMetadata } from '@/utils/skillManager';
import { listConfiguredMCPServers } from '@/claude/utils/mcpServerDiscovery';
import { spawn } from 'child_process';
import { getAllCommands, getCommand, searchCommands } from './commandRegistry';
import {
  validateCommandForUser,
  isSkillAllowedForUser,
  isCommandAllowedForUser,
  logUserAction
} from './resource-api/userIsolation';

// Command whitelist for security - ONLY safe, read-only commands allowed
// Removed: node, npm, yarn, git (can execute arbitrary code or modify repository)
const ALLOWED_COMMANDS = new Set([
  'ls',
  'pwd',
  'echo',
  'date',
  'whoami',
  'hostname',
  'uname'
]);

// Rate limiting: track command executions per minute
const commandExecutionTracker = new Map<string, number[]>();
const MAX_COMMANDS_PER_MINUTE = 30;

// Concurrent execution limiting: track active executions per user
// Maps userId to set of active execution IDs
const activeExecutions = new Map<string, Set<string>>();
const MAX_CONCURRENT_EXECUTIONS = 5;

/**
 * Check if command execution is allowed based on per-user rate limiting
 *
 * @param userId - User identifier for per-user rate limiting
 * @returns true if within rate limit, false if exceeded
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  // Use userId as the rate limit key for per-user isolation
  const rateLimitKey = `user:${userId}`;

  // Get or create execution history for this user
  let executions = commandExecutionTracker.get(rateLimitKey) || [];

  // Remove executions older than 1 minute
  executions = executions.filter(timestamp => timestamp > oneMinuteAgo);

  // Check if limit exceeded
  if (executions.length >= MAX_COMMANDS_PER_MINUTE) {
    logger.debug(`[USER ISOLATION] Rate limit exceeded for user ${userId}: ${executions.length} commands in last minute`);
    return false;
  }

  // Add current execution
  executions.push(now);
  commandExecutionTracker.set(rateLimitKey, executions);

  return true;
}

/**
 * Check if concurrent execution limit is reached for a user
 */
function checkConcurrentLimit(userId: string = 'global'): boolean {
  const userExecutions = activeExecutions.get(userId);

  if (!userExecutions) {
    return true; // No active executions, allowed
  }

  return userExecutions.size < MAX_CONCURRENT_EXECUTIONS;
}

/**
 * Register a new execution and get its ID
 */
function registerExecution(userId: string = 'global'): string {
  const executionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  let userExecutions = activeExecutions.get(userId);
  if (!userExecutions) {
    userExecutions = new Set();
    activeExecutions.set(userId, userExecutions);
  }

  userExecutions.add(executionId);
  return executionId;
}

/**
 * Unregister an execution when complete
 */
function unregisterExecution(userId: string, executionId: string): void {
  const userExecutions = activeExecutions.get(userId);
  if (userExecutions) {
    userExecutions.delete(executionId);

    // Clean up empty sets
    if (userExecutions.size === 0) {
      activeExecutions.delete(userId);
    }
  }
}

/**
 * Validate and sanitize command for security
 */
function validateCommand(command: string, args: string[]): { valid: boolean; error?: string } {
  // Extract base command (handle paths like /usr/bin/ls)
  const baseCommand = command.split('/').pop() || command;

  // Check whitelist
  if (!ALLOWED_COMMANDS.has(baseCommand)) {
    return {
      valid: false,
      error: `Command '${baseCommand}' not allowed. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`
    };
  }

  // Validate arguments don't contain shell injection attempts
  const dangerousPatterns = [
    /[;&|`$()]/,  // Shell metacharacters
    /\.\.\//,     // Directory traversal
  ];

  for (const arg of args) {
    for (const pattern of dangerousPatterns) {
      if (pattern.test(arg)) {
        return {
          valid: false,
          error: 'Arguments contain potentially dangerous characters'
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Execute a command safely with timeout
 */
async function executeCommand(
  command: string,
  args: string[],
  cwd?: string,
  timeoutMs: number = 60000
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    let timedOut = false;
    let stdoutData = '';
    let stderrData = '';

    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      shell: false, // IMPORTANT: Never use shell to prevent injection
      timeout: timeoutMs
    });

    // Capture stdout
    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
      // Limit output size to prevent memory issues (1MB max)
      if (stdoutData.length > 1048576) {
        child.kill();
        stdoutData += '\n[Output truncated - exceeded 1MB limit]';
      }
    });

    // Capture stderr
    child.stderr.on('data', (data) => {
      stderrData += data.toString();
      // Limit output size to prevent memory issues (1MB max)
      if (stderrData.length > 1048576) {
        child.kill();
        stderrData += '\n[Output truncated - exceeded 1MB limit]';
      }
    });

    // Handle timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000);
    }, timeoutMs);

    // Handle exit
    child.on('close', (exitCode, signal) => {
      clearTimeout(timeoutHandle);
      resolve({
        stdout: stdoutData,
        stderr: stderrData,
        exitCode,
        signal,
        timedOut
      });
    });

    // Handle spawn errors
    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      resolve({
        stdout: stdoutData,
        stderr: `Failed to execute command: ${error.message}`,
        exitCode: -1,
        signal: null,
        timedOut: false
      });
    });
  });
}

export function startDaemonControlServer({
  getChildren,
  stopSession,
  spawnSession,
  requestShutdown,
  onHappySessionWebhook
}: {
  getChildren: () => TrackedSession[];
  stopSession: (sessionId: string) => boolean;
  spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
  requestShutdown: () => void;
  onHappySessionWebhook: (sessionId: string, metadata: Metadata) => void;
}): Promise<{ port: number; stop: () => Promise<void> }> {
  return new Promise((resolve) => {
    const app = fastify({
      logger: false // We use our own logger
    });

    // Set up Zod type provider
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>();

    // Session reports itself after creation
    // List available commands
    typed.post('/list-commands', {
      schema: {
        body: z.object({
          userId: z.string(), // REQUIRED: User identifier for isolation
          query: z.string().optional(),
          commandName: z.string().optional()
        }),
        response: {
          200: z.object({
            commands: z.array(z.object({
              name: z.string(),
              description: z.string(),
              usage: z.string(),
              examples: z.array(z.string()).optional(),
              subcommands: z.array(z.object({
                name: z.string(),
                description: z.string(),
                usage: z.string(),
                examples: z.array(z.string()).optional()
              })).optional()
            }))
          })
        }
      }
    }, async (request) => {
      const { userId, query, commandName } = request.body;

      logger.debug(`[CONTROL SERVER] list-commands request:`, {
        userId,
        query,
        commandName
      });

      // Audit log command list request
      logUserAction({
        timestamp: Date.now(),
        userId,
        action: 'list-commands',
        resource: commandName || query || 'all',
        success: true,
        metadata: { query, commandName }
      });

      let commands: any[];

      if (commandName) {
        // Get specific command
        const cmd = getCommand(commandName);
        // Validate user access to command
        if (cmd && !isCommandAllowedForUser(commandName, userId)) {
          commands = []; // Don't expose inaccessible commands
        } else {
          commands = cmd ? [cmd] : [];
        }
      } else if (query) {
        // Search commands
        const allCommands = searchCommands(query);
        // Filter to only commands accessible by user
        commands = allCommands.filter(cmd => isCommandAllowedForUser(cmd.name, userId));
      } else {
        // Get all commands accessible by user
        const allCommands = getAllCommands();
        commands = allCommands.filter(cmd => isCommandAllowedForUser(cmd.name, userId));
      }

      return { commands };
    });

    typed.post('/session-started', {
      schema: {
        body: z.object({
          sessionId: z.string(),
          metadata: z.any() // Metadata type from API
        }),
        response: {
          200: z.object({
            status: z.literal('ok')
          })
        }
      }
    }, async (request) => {
      const { sessionId, metadata } = request.body;

      logger.debug(`[CONTROL SERVER] Session started: ${sessionId}`);
      onHappySessionWebhook(sessionId, metadata);

      return { status: 'ok' as const };
    });

    // List all tracked sessions
    typed.post('/list', {
      schema: {
        response: {
          200: z.object({
            children: z.array(z.object({
              startedBy: z.string(),
              happySessionId: z.string(),
              pid: z.number()
            }))
          })
        }
      }
    }, async () => {
      const children = getChildren();
      logger.debug(`[CONTROL SERVER] Listing ${children.length} sessions`);
      return {
        children: children
          .filter(child => child.happySessionId !== undefined)
          .map(child => ({
            startedBy: child.startedBy,
            happySessionId: child.happySessionId!,
            pid: child.pid
          }))
      }
    });


    // List configured MCP servers
    typed.post('/list-mcp-servers', {
      schema: {
        response: {
          200: z.object({
            servers: z.array(z.object({
              name: z.string(),
              config: z.any(),
              status: z.enum(['configured', 'unknown']),
              tools: z.array(z.string()).optional(),
              resources: z.array(z.string()).optional(),
              prompts: z.array(z.string()).optional()
            }))
          })
        }
      }
    }, async () => {
      logger.debug('[CONTROL SERVER] List MCP servers request');

      try {
        const servers = listConfiguredMCPServers();
        logger.debug(`[CONTROL SERVER] Found ${servers.length} configured MCP server(s)`);

        return {
          servers: servers.map(server => ({
            name: server.name,
            config: server.config,
            status: server.status,
            tools: server.tools,
            resources: server.resources,
            prompts: server.prompts
          }))
        };
      } catch (error) {
        logger.debug('[CONTROL SERVER] Error listing MCP servers:', error);
        return { servers: [] };
      }
    });

    // Stop specific session
    typed.post('/stop-session', {
      schema: {
        body: z.object({
          sessionId: z.string()
        }),
        response: {
          200: z.object({
            success: z.boolean()
          })
        }
      }
    }, async (request) => {
      const { sessionId } = request.body;

      logger.debug(`[CONTROL SERVER] Stop session request: ${sessionId}`);
      const success = stopSession(sessionId);
      return { success };
    });

    // Spawn new session
    typed.post('/spawn-session', {
      schema: {
        body: z.object({
          directory: z.string(),
          sessionId: z.string().optional()
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            sessionId: z.string().optional(),
            approvedNewDirectoryCreation: z.boolean().optional()
          }),
          409: z.object({
            success: z.boolean(),
            requiresUserApproval: z.boolean().optional(),
            actionRequired: z.string().optional(),
            directory: z.string().optional()
          }),
          500: z.object({
            success: z.boolean(),
            error: z.string().optional()
          })
        }
      }
    }, async (request, reply) => {
      const { directory, sessionId } = request.body;

      logger.debug(`[CONTROL SERVER] Spawn session request: dir=${directory}, sessionId=${sessionId || 'new'}`);
      const result = await spawnSession({ directory, sessionId });

      switch (result.type) {
        case 'success':
          // Check if sessionId exists, if not return error
          if (!result.sessionId) {
            reply.code(500);
            return {
              success: false,
              error: 'Failed to spawn session: no session ID returned'
            };
          }
          return {
            success: true,
            sessionId: result.sessionId,
            approvedNewDirectoryCreation: true
          };

        case 'requestToApproveDirectoryCreation':
          reply.code(409); // Conflict - user input needed
          return {
            success: false,
            requiresUserApproval: true,
            actionRequired: 'CREATE_DIRECTORY',
            directory: result.directory
          };

        case 'error':
          reply.code(500);
          return {
            success: false,
            error: result.errorMessage
          };
      }
    });

    // Execute command - NEW ENDPOINT
    typed.post('/execute-command', {
      schema: {
        body: z.object({
          userId: z.string(), // REQUIRED: User identifier for isolation
          command: z.string(),
          args: z.array(z.string()).optional().default([]),
          cwd: z.string().optional(),
          timeoutMs: z.number().optional().default(60000).refine(
            val => val > 0 && val <= 300000, // Max 5 minutes
            { message: 'Timeout must be between 1ms and 300000ms (5 minutes)' }
          )
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            stdout: z.string().optional(),
            stderr: z.string().optional(),
            exitCode: z.number().nullable().optional(),
            signal: z.string().nullable().optional(),
            timedOut: z.boolean().optional()
          }),
          429: z.object({
            success: z.boolean(),
            error: z.string()
          }),
          400: z.object({
            success: z.boolean(),
            error: z.string()
          }),
          500: z.object({
            success: z.boolean(),
            error: z.string()
          })
        }
      }
    }, async (request, reply) => {
      const { userId, command, args = [], cwd, timeoutMs = 60000 } = request.body;

      // Audit log all command execution attempts
      logUserAction({
        timestamp: Date.now(),
        userId,
        action: 'execute-command',
        resource: command,
        success: false, // Will update on success
        metadata: { args, cwd, timeoutMs }
      });

      logger.debug(`[CONTROL SERVER] Execute command request: ${command} ${args.join(' ')}`, {
        userId,
        cwd,
        timeoutMs,
        timestamp: new Date().toISOString()
      });

      // Validate user access to paths
      const userValidation = validateCommandForUser(command, args, cwd, userId);
      if (!userValidation.valid) {
        logger.debug(`[CONTROL SERVER] User path validation failed: ${userValidation.error}`);
        reply.code(400);
        logUserAction({
          timestamp: Date.now(),
          userId,
          action: 'execute-command',
          resource: command,
          success: false,
          error: userValidation.error
        });
        return {
          success: false,
          error: userValidation.error || 'Path access denied for user'
        };
      }

      // Check rate limit (per-user)
      if (!checkRateLimit(userId)) {
        logger.debug(`[CONTROL SERVER] Rate limit exceeded for user ${userId}`);
        reply.code(429);
        logUserAction({
          timestamp: Date.now(),
          userId,
          action: 'execute-command',
          resource: command,
          success: false,
          error: 'Rate limit exceeded'
        });
        return {
          success: false,
          error: `Rate limit exceeded. Maximum ${MAX_COMMANDS_PER_MINUTE} commands per minute allowed.`
        };
      }

      // Check concurrent execution limit
      if (!checkConcurrentLimit(userId)) {
        logger.debug(`[CONTROL SERVER] Concurrent execution limit reached for user: ${userId}`);
        reply.code(429);
        return {
          success: false,
          error: `Concurrent execution limit reached. Maximum ${MAX_CONCURRENT_EXECUTIONS} concurrent executions allowed.`
        };
      }

      // Validate command
      const validation = validateCommand(command, args);
      if (!validation.valid) {
        logger.debug(`[CONTROL SERVER] Command validation failed: ${validation.error}`);
        reply.code(400);
        return {
          success: false,
          error: validation.error || 'Command validation failed'
        };
      }

      // Register execution and get ID for tracking
      const executionId = registerExecution(userId);

      // Execute command
      try {
        const result = await executeCommand(command, args, cwd, timeoutMs);

        // Audit log execution result
        logger.debug(`[CONTROL SERVER] Command executed:`, {
          userId,
          command,
          args,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          stdoutLength: result.stdout.length,
          stderrLength: result.stderr.length
        });

        // Log successful execution
        logUserAction({
          timestamp: Date.now(),
          userId,
          action: 'execute-command',
          resource: command,
          success: true,
          metadata: {
            exitCode: result.exitCode,
            timedOut: result.timedOut
          }
        });

        return {
          success: true,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut
        };
      } catch (error) {
        logger.debug(`[CONTROL SERVER] Command execution error:`, error);
        reply.code(500);
        logUserAction({
          timestamp: Date.now(),
          userId,
          action: 'execute-command',
          resource: command,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error during command execution'
        };
      } finally {
        // Always unregister execution when complete
        unregisterExecution(userId, executionId);
      }
    });

    // List all available skills
    typed.post('/skill-list', {
      schema: {
        body: z.object({
          userId: z.string() // REQUIRED: User identifier for isolation
        }),
        response: {
          200: z.object({
            skills: z.array(z.object({
              name: z.string(),
              description: z.string().optional(),
              license: z.string().optional(),
              path: z.string(),
              hasSkillMd: z.boolean(),
              templates: z.array(z.string()).optional()
            }))
          })
        }
      }
    }, async (request) => {
      const { userId } = request.body;
      logger.debug('[CONTROL SERVER] Skill list request', { userId });

      // Audit log skill list request
      logUserAction({
        timestamp: Date.now(),
        userId,
        action: 'list-skills',
        resource: 'all',
        success: true
      });

      const allSkills = await listSkills();

      // Filter skills accessible by user
      const skills = allSkills.filter(skill => isSkillAllowedForUser(skill.name, userId));

      return { skills };
    });

    // Get specific skill details
    typed.post('/skill-get', {
      schema: {
        body: z.object({
          skillName: z.string()
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            metadata: z.object({
              name: z.string(),
              description: z.string().optional(),
              license: z.string().optional(),
              path: z.string(),
              hasSkillMd: z.boolean(),
              templates: z.array(z.string()).optional()
            }).optional()
          }),
          404: z.object({
            success: z.boolean(),
            error: z.string()
          })
        }
      }
    }, async (request, reply) => {
      const { skillName } = request.body;
      logger.debug(`[CONTROL SERVER] Skill get request: ${skillName}`);

      const metadata = await getSkillMetadata(skillName);

      if (!metadata) {
        reply.code(404);
        return {
          success: false,
          error: `Skill '${skillName}' not found`
        };
      }

      return {
        success: true,
        metadata
      };
    });

    // Invoke a skill (read its content for execution)
    typed.post('/invoke-skill', {
      schema: {
        body: z.object({
          userId: z.string(), // REQUIRED: User identifier for isolation
          skillName: z.string(),
          context: z.any().optional(),
          parameters: z.any().optional()
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            skillMd: z.string().optional(),
            templates: z.record(z.string()).optional(),
            metadata: z.object({
              name: z.string(),
              description: z.string().optional(),
              license: z.string().optional(),
              path: z.string(),
              hasSkillMd: z.boolean(),
              templates: z.array(z.string()).optional()
            }).optional()
          }),
          400: z.object({
            success: z.boolean(),
            error: z.string()
          }),
          404: z.object({
            success: z.boolean(),
            error: z.string()
          }),
          500: z.object({
            success: z.boolean(),
            error: z.string()
          })
        }
      }
    }, async (request, reply) => {
      const { userId, skillName, context, parameters } = request.body;

      logger.debug(`[CONTROL SERVER] Invoke skill request: ${skillName}`, {
        userId,
        hasContext: !!context,
        hasParameters: !!parameters
      });

      // Audit log skill invocation attempt
      logUserAction({
        timestamp: Date.now(),
        userId,
        action: 'invoke-skill',
        resource: skillName,
        success: false, // Will update on success
        metadata: { hasContext: !!context, hasParameters: !!parameters }
      });

      // Validate user access to skill
      if (!isSkillAllowedForUser(skillName, userId)) {
        reply.code(400);
        logUserAction({
          timestamp: Date.now(),
          userId,
          action: 'invoke-skill',
          resource: skillName,
          success: false,
          error: 'Skill access denied for user'
        });
        return {
          success: false,
          error: `Skill '${skillName}' access denied for user ${userId}`
        };
      }

      try {
        // Validate skill structure
        const validation = await validateSkill(skillName);
        if (!validation.valid) {
          reply.code(400);
          logUserAction({
            timestamp: Date.now(),
            userId,
            action: 'invoke-skill',
            resource: skillName,
            success: false,
            error: validation.error || 'Invalid skill structure'
          });
          return {
            success: false,
            error: validation.error || 'Invalid skill structure'
          };
        }

        // Read skill content
        const content = await readSkillContent(skillName);

        if (!content) {
          reply.code(404);
          logUserAction({
            timestamp: Date.now(),
            userId,
            action: 'invoke-skill',
            resource: skillName,
            success: false,
            error: 'Skill not found'
          });
          return {
            success: false,
            error: `Skill '${skillName}' not found or could not be read`
          };
        }

        logger.debug(`[CONTROL SERVER] Skill '${skillName}' invoked successfully`, {
          userId,
          hasSkillMd: !!content.skillMd,
          templateCount: Object.keys(content.templates).length
        });

        // Log successful invocation
        logUserAction({
          timestamp: Date.now(),
          userId,
          action: 'invoke-skill',
          resource: skillName,
          success: true
        });

        return {
          success: true,
          skillMd: content.skillMd,
          templates: content.templates,
          metadata: content.metadata
        };
      } catch (error) {
        logger.debug(`[CONTROL SERVER] Failed to invoke skill '${skillName}':`, error);
        reply.code(500);
        logUserAction({
          timestamp: Date.now(),
          userId,
          action: 'invoke-skill',
          resource: skillName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Stop daemon
    typed.post('/stop', {
      schema: {
        response: {
          200: z.object({
            status: z.string()
          })
        }
      }
    }, async () => {
      logger.debug('[CONTROL SERVER] Stop daemon request received');

      // Give time for response to arrive
      setTimeout(() => {
        logger.debug('[CONTROL SERVER] Triggering daemon shutdown');
        requestShutdown();
      }, 50);

      return { status: 'stopping' };
    });

    app.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
      if (err) {
        logger.debug('[CONTROL SERVER] Failed to start:', err);
        throw err;
      }

      const port = parseInt(address.split(':').pop()!);
      logger.debug(`[CONTROL SERVER] Started on port ${port}`);

      resolve({
        port,
        stop: async () => {
          logger.debug('[CONTROL SERVER] Stopping server');
          await app.close();
          logger.debug('[CONTROL SERVER] Server stopped');
        }
      });
    });
  });
}
