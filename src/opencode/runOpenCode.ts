/**
 * OpenCode CLI Entry Point
 *
 * This module provides the main entry point for running the OpenCode agent
 * through Happy CLI. It manages the agent lifecycle, session state, and
 * communication with the Happy server and mobile app.
 *
 * Based on the Gemini implementation but simplified for OpenCode.
 */

import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { join, resolve } from 'node:path';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { AgentState, Metadata } from '@/api/types';
import { initialMachineMetadata } from '@/daemon/run';
import { configuration } from '@/configuration';
import packageJson from '../../package.json';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { projectPath } from '@/projectPath';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { MessageBuffer } from '@/ui/ink/messageBuffer';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { startCaffeinate, stopCaffeinate } from '@/utils/caffeinate';

import { createOpenCodeBackend } from '@/agent/acp/opencode';
import type { AgentBackend, AgentMessage } from '@/agent/AgentBackend';
import { createSessionTracker } from './hooks/sessionTracker';
import { OpenCodeDisplay } from '@/ui/ink/OpenCodeDisplay';
import { OpenCodePermissionHandler } from '@/opencode/utils/permissionHandler';
import type { PermissionMode, OpenCodeMode, CodexMessagePayload } from '@/opencode/types';
import { readOpenCodeModel, writeOpenCodeModel } from './utils/config';
import {
  parseOptionsFromText,
  hasIncompleteOptions,
  formatOptionsXml,
} from './utils/optionsParser';
import { OpenCodeReasoningProcessor } from './utils/reasoningProcessor';
import {
  getLastSessionForDirectory,
  saveSessionForDirectory,
} from './utils/sessionPersistence';

/**
 * Main entry point for the opencode command with ink UI
 */
export async function runOpenCode(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  cwd?: string;
  model?: string;
  initialPrompt?: string;
  /** Explicit session ID to resume */
  resumeSessionId?: string;
  /** Force new session even if previous exists */
  forceNewSession?: boolean;
}): Promise<void> {
  //
  // Define session
  //

  const sessionTag = randomUUID();
  const api = await ApiClient.create(opts.credentials);

  //
  // Machine
  //

  const settings = await readSettings();
  const machineId = settings?.machineId;
  if (!machineId) {
    console.error(`[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on https://github.com/slopus/happy-cli/issues`);
    process.exit(1);
  }
  logger.debug(`Using machineId: ${machineId}`);
  await api.getOrCreateMachine({
    machineId,
    metadata: initialMachineMetadata
  });

  //
  // Create session
  //

  const state: AgentState = {
    controlledByUser: false,
  };
  const metadata: Metadata = {
    path: opts.cwd || process.cwd(),
    host: os.hostname(),
    version: packageJson.version,
    os: os.platform(),
    machineId: machineId,
    homeDir: os.homedir(),
    happyHomeDir: configuration.happyHomeDir,
    happyLibDir: projectPath(),
    happyToolsDir: resolve(projectPath(), 'tools', 'unpacked'),
    startedFromDaemon: opts.startedBy === 'daemon',
    hostPid: process.pid,
    startedBy: opts.startedBy || 'terminal',
    lifecycleState: 'running',
    lifecycleStateSince: Date.now(),
    flavor: 'opencode'
  };
  const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
  const session = api.sessionSyncClient(response);

  //
  // Session resumption
  //

  const workingDirectory = opts.cwd || process.cwd();

  // Determine session ID to resume
  let sessionIdToResume: string | undefined = opts.resumeSessionId;

  // Auto-resume: check for previous session in this directory
  if (!sessionIdToResume && !opts.forceNewSession) {
    const lastSession = await getLastSessionForDirectory(workingDirectory);
    if (lastSession) {
      logger.debug(`[OpenCode] Found previous session for directory: ${lastSession.opencodeSessionId}`);
      sessionIdToResume = lastSession.opencodeSessionId;
    }
  }

  if (sessionIdToResume) {
    logger.debug(`[OpenCode] Will attempt to resume session: ${sessionIdToResume}`);
  }

  // Report to daemon
  try {
    logger.debug(`[START] Reporting session ${response.id} to daemon`);
    const result = await notifyDaemonSessionStarted(response.id, metadata);
    if (result.error) {
      logger.debug(`[START] Failed to report to daemon (may not be running):`, result.error);
    } else {
      logger.debug(`[START] Reported session ${response.id} to daemon`);
    }
  } catch (error) {
    logger.debug('[START] Failed to report to daemon (may not be running):', error);
  }

  const messageQueue = new MessageQueue2<OpenCodeMode>((mode) => hashObject({
    permissionMode: mode.permissionMode,
    model: mode.model,
  }));

  // Track current overrides to apply per message
  let currentPermissionMode: PermissionMode | undefined = undefined;
  let currentModel: string | undefined = opts.model;

  session.onUserMessage((message) => {
    // Resolve permission mode
    let messagePermissionMode = currentPermissionMode;
    if (message.meta?.permissionMode) {
      const validModes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];
      if (validModes.includes(message.meta.permissionMode as PermissionMode)) {
        messagePermissionMode = message.meta.permissionMode as PermissionMode;
        currentPermissionMode = messagePermissionMode;
        updatePermissionMode(messagePermissionMode);
        logger.debug(`[OpenCode] Permission mode updated from user message to: ${currentPermissionMode}`);
      }
    }

    if (currentPermissionMode === undefined) {
      currentPermissionMode = 'default';
      updatePermissionMode('default');
    }

    // Resolve model
    let messageModel = currentModel;
    if (message.meta?.hasOwnProperty('model')) {
      if (message.meta.model === null) {
        messageModel = undefined;
        currentModel = undefined;
      } else if (message.meta.model) {
        messageModel = message.meta.model;
        currentModel = messageModel;
        messageBuffer.addMessage(`Model changed to: ${messageModel}`, 'system');
      }
    }

    const mode: OpenCodeMode = {
      permissionMode: messagePermissionMode || 'default',
      model: messageModel,
    };
    messageQueue.push(message.content.text, mode);
  });

  let thinking = false;
  session.keepAlive(thinking, 'remote');
  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, 'remote');
  }, 2000);

  // Start caffeinate to prevent sleep on macOS during long-running tasks
  const caffeinateStarted = startCaffeinate();
  if (caffeinateStarted) {
    logger.debug('[OpenCode] Sleep prevention enabled (macOS)');
  }

  const sendReady = () => {
    session.sendSessionEvent({ type: 'ready' });
    try {
      api.push().sendToAllDevices(
        "It's ready!",
        'OpenCode is waiting for your command',
        { sessionId: session.sessionId }
      );
    } catch (pushError) {
      logger.debug('[OpenCode] Failed to send ready push', pushError);
    }
  };

  const emitReadyIfIdle = (): boolean => {
    if (shouldExit) return false;
    if (thinking) return false;
    if (isResponseInProgress) return false;
    if (messageQueue.size() > 0) return false;

    sendReady();
    return true;
  };

  //
  // Abort handling
  //

  let abortController = new AbortController();
  let shouldExit = false;
  let opencodeBackend: AgentBackend | null = null;
  let acpSessionId: string | null = null;
  let wasSessionCreated = false;

  //
  // Session tracking
  //

  const sessionTracker = createSessionTracker({
    onSessionId: (sessionId: string) => {
      logger.debug(`[opencode] Session ID captured: ${sessionId}`);
      // Update session metadata with OpenCode session ID
      session.updateMetadata((currentMetadata) => ({
        ...currentMetadata,
        opencodeSessionId: sessionId,
      }));
    },
  });

  async function handleAbort() {
    logger.debug('[OpenCode] Abort requested - stopping current task');

    session.sendCodexMessage({
      type: 'turn_aborted',
      id: randomUUID(),
    });

    try {
      abortController.abort();
      messageQueue.reset();
      reasoningProcessor.abort();
      if (opencodeBackend && acpSessionId) {
        await opencodeBackend.cancel(acpSessionId);
      }
      logger.debug('[OpenCode] Abort completed - session remains active');
    } catch (error) {
      logger.debug('[OpenCode] Error during abort:', error);
    } finally {
      abortController = new AbortController();
    }
  }

  const handleKillSession = async () => {
    logger.debug('[OpenCode] Kill session requested - terminating process');
    await handleAbort();

    try {
      if (session) {
        session.updateMetadata((currentMetadata) => ({
          ...currentMetadata,
          lifecycleState: 'archived',
          lifecycleStateSince: Date.now(),
          archivedBy: 'cli',
          archiveReason: 'User terminated'
        }));

        session.sendSessionDeath();
        await session.flush();
        await session.close();
      }

      stopCaffeinate();
      happyServer.stop();

      if (opencodeBackend) {
        await opencodeBackend.dispose();
      }

      logger.debug('[OpenCode] Session termination complete, exiting');
      process.exit(0);
    } catch (error) {
      logger.debug('[OpenCode] Error during session termination:', error);
      process.exit(1);
    }
  };

  session.rpcHandlerManager.registerHandler('abort', handleAbort);
  registerKillSessionHandler(session.rpcHandlerManager, handleKillSession);

  //
  // Initialize Ink UI
  //

  const messageBuffer = new MessageBuffer();
  const hasTTY = process.stdout.isTTY && process.stdin.isTTY;
  let inkInstance: ReturnType<typeof render> | null = null;

  // Track current model for UI display
  let displayedModel: string | undefined = currentModel;

  const updateDisplayedModel = (model: string | undefined) => {
    if (model === undefined) return;
    displayedModel = model;
    if (hasTTY) {
      messageBuffer.addMessage(`[MODEL:${model}]`, 'system');
    }
  };

  if (hasTTY) {
    console.clear();
    const DisplayComponent = () => {
      const currentModelValue = displayedModel || 'opencode';
      return React.createElement(OpenCodeDisplay, {
        messageBuffer,
        logPath: process.env.DEBUG ? logger.getLogPath() : undefined,
        currentModel: currentModelValue,
        onExit: async () => {
          logger.debug('[opencode]: Exiting agent via Ctrl-C');
          shouldExit = true;
          await handleAbort();
        }
      });
    };

    inkInstance = render(React.createElement(DisplayComponent), {
      exitOnCtrlC: false,
      patchConsole: false
    });

    const initialModelName = displayedModel || 'opencode';
    messageBuffer.addMessage(`[MODEL:${initialModelName}]`, 'system');
  }

  if (hasTTY) {
    process.stdin.resume();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.setEncoding('utf8');
  }

  //
  // Start Happy MCP server and create OpenCode backend
  //

  const happyServer = await startHappyServer(session);
  const bridgeCommand = join(projectPath(), 'bin', 'happy-mcp.mjs');
  const mcpServers = {
    happy: {
      command: bridgeCommand,
      args: ['--url', happyServer.url]
    }
  };

  // Create permission handler for tool approval
  const permissionHandler = new OpenCodePermissionHandler(session);

  const updatePermissionMode = (mode: PermissionMode) => {
    permissionHandler.setPermissionMode(mode);
  };

  // Create reasoning processor for handling thinking events
  const reasoningProcessor = new OpenCodeReasoningProcessor((message) => {
    session.sendCodexMessage(message);
  });

  // Accumulate OpenCode response text
  let accumulatedResponse = '';
  let isResponseInProgress = false;

  /**
   * Set up message handler for OpenCode backend
   */
  function setupOpenCodeMessageHandler(backend: AgentBackend): void {
    backend.onMessage((msg: AgentMessage) => {
      switch (msg.type) {
        case 'model-output':
          if (msg.textDelta) {
            if (!isResponseInProgress) {
              messageBuffer.removeLastMessage('system');
              messageBuffer.addMessage(msg.textDelta, 'assistant');
              isResponseInProgress = true;
            } else {
              messageBuffer.updateLastMessage(msg.textDelta, 'assistant');
            }
            accumulatedResponse += msg.textDelta;
          }
          break;

        case 'status':
          logger.debug(`[opencode] Status changed: ${msg.status}${msg.detail ? ` - ${msg.detail}` : ''}`);

          if (msg.status === 'error') {
            logger.debug(`[opencode] Error status received: ${msg.detail || 'Unknown error'}`);
            session.sendCodexMessage({
              type: 'turn_aborted',
              id: randomUUID(),
            });
          }

          if (msg.status === 'running') {
            thinking = true;
            session.keepAlive(thinking, 'remote');
            session.sendCodexMessage({
              type: 'task_started',
              id: randomUUID(),
            });
            messageBuffer.addMessage('Thinking...', 'system');
          } else if (msg.status === 'idle' || msg.status === 'stopped') {
            thinking = false;
            session.keepAlive(thinking, 'remote');

            // Complete reasoning processor when status becomes idle
            reasoningProcessor.complete();

            if (isResponseInProgress && accumulatedResponse.trim()) {
              const messageId = randomUUID();

              // Parse options from response text
              const { text: messageText, options } = parseOptionsFromText(accumulatedResponse);

              // Re-add options XML to message for mobile app parsing
              const finalMessageText = messageText + formatOptionsXml(options);

              const messagePayload: CodexMessagePayload = {
                type: 'message',
                message: finalMessageText,
                id: messageId,
                ...(options.length > 0 && { options }),
              };
              session.sendCodexMessage(messagePayload);

              if (options.length > 0) {
                logger.debug(`[opencode] Sending message with ${options.length} options`);
              }

              accumulatedResponse = '';
              isResponseInProgress = false;
            }
          } else if (msg.status === 'error') {
            thinking = false;
            session.keepAlive(thinking, 'remote');
            accumulatedResponse = '';
            isResponseInProgress = false;

            const errorMessage = msg.detail || 'Unknown error';
            messageBuffer.addMessage(`Error: ${errorMessage}`, 'status');
            session.sendCodexMessage({
              type: 'message',
              message: `Error: ${errorMessage}`,
              id: randomUUID(),
            });
          }
          break;

        case 'tool-call':
          const toolArgs = msg.args ? JSON.stringify(msg.args).substring(0, 100) : '';
          logger.debug(`[opencode] Tool call received: ${msg.toolName} (${msg.callId})`);
          messageBuffer.addMessage(`Executing: ${msg.toolName}${toolArgs ? ` ${toolArgs}...` : ''}`, 'tool');
          session.sendCodexMessage({
            type: 'tool-call',
            name: msg.toolName,
            callId: msg.callId,
            input: msg.args,
            id: randomUUID(),
          });
          break;

        case 'tool-result':
          const isError = msg.result && typeof msg.result === 'object' && 'error' in msg.result;
          const resultText = typeof msg.result === 'string'
            ? msg.result.substring(0, 200)
            : JSON.stringify(msg.result).substring(0, 200);
          const truncatedResult = resultText + (typeof msg.result === 'string' && msg.result.length > 200 ? '...' : '');

          logger.debug(`[opencode] ${isError ? '❌' : '✅'} Tool result received: ${msg.toolName} (${msg.callId})`);

          if (isError) {
            const errorMsg = (msg.result as any).error || 'Tool call failed';
            messageBuffer.addMessage(`Error: ${errorMsg}`, 'status');
          } else {
            messageBuffer.addMessage(`Result: ${truncatedResult}`, 'result');
          }

          session.sendCodexMessage({
            type: 'tool-call-result',
            callId: msg.callId,
            output: msg.result,
            id: randomUUID(),
          });
          break;

        case 'permission-request':
          session.sendCodexMessage({
            type: 'permission-request',
            permissionId: msg.id,
            reason: msg.reason,
            payload: msg.payload,
            id: randomUUID(),
          });
          break;

        case 'event':
          // Handle thinking events from ACP backend
          if (msg.name === 'thinking') {
            const thinkingPayload = msg.payload as { text?: string } | undefined;
            const thinkingText = (thinkingPayload && typeof thinkingPayload === 'object' && 'text' in thinkingPayload)
              ? String(thinkingPayload.text || '')
              : '';
            
            if (thinkingText) {
              // Process thinking chunk through reasoning processor
              // This will identify titled reasoning sections (**Title**) and convert them to tool calls
              reasoningProcessor.processChunk(thinkingText);

              // Log thinking chunks for debugging
              logger.debug(`[opencode] 💭 Thinking chunk received: ${thinkingText.length} chars - Preview: ${thinkingText.substring(0, 100)}...`);

              // Show thinking message in UI (truncated)
              // For titled reasoning (starts with **), ReasoningProcessor will show it as tool call
              // But we still show progress for long operations
              if (!thinkingText.startsWith('**')) {
                // Update existing "Thinking..." message or add new one for untitled reasoning
                const thinkingPreview = thinkingText.substring(0, 100);
                messageBuffer.updateLastMessage(`[Thinking] ${thinkingPreview}...`, 'system');
              }

              // Forward to mobile for UI feedback
              session.sendCodexMessage({
                type: 'thinking',
                text: thinkingText,
                id: randomUUID(),
              });
            }
          }
          break;

        default:
          // Handle other message types
          break;
      }
    });
  }

  let first = true;

  try {
    let currentModeHash: string | null = null;
    let pending: { message: string; mode: OpenCodeMode; isolate: boolean; hash: string } | null = null;

    // Save original model and set new model if specified
    const originalModel = await readOpenCodeModel();

    try {
      if (currentModel) {
        logger.debug('[OpenCode] Setting model in config:', currentModel);
        await writeOpenCodeModel(currentModel);
      }

      // Main loop
      while (!shouldExit) {
        let message: { message: string; mode: OpenCodeMode; isolate: boolean; hash: string } | null = pending;
        pending = null;

        if (!message) {
          logger.debug('[opencode] Main loop: waiting for messages from queue...');
          const waitSignal = abortController.signal;
          const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
          if (!batch) {
            if (waitSignal.aborted && !shouldExit) {
              logger.debug('[opencode] Main loop: wait aborted, continuing...');
              continue;
            }
            logger.debug('[opencode] Main loop: no batch received, breaking...');
            break;
          }
          logger.debug(`[opencode] Main loop: received message from queue (length: ${batch.message.length})`);
          message = batch;
        }

        if (!message) {
          break;
        }

        currentModeHash = message.hash;
        const userMessageToShow = message.message;
        messageBuffer.addMessage(userMessageToShow, 'user');

        try {
          if (first || !wasSessionCreated) {
            if (!opencodeBackend) {
              opencodeBackend = createOpenCodeBackend({
                cwd: workingDirectory,
                mcpServers,
                permissionHandler,
                model: message.mode.model,
                resumeSessionId: sessionIdToResume,
              });

              setupOpenCodeMessageHandler(opencodeBackend);
            }

            if (!acpSessionId) {
              logger.debug('[opencode] Starting ACP session...');
              updatePermissionMode(message.mode.permissionMode || 'default');
              const { sessionId } = await opencodeBackend.startSession();
              acpSessionId = sessionId;
              logger.debug(`[opencode] ACP session started: ${acpSessionId}`);
              wasSessionCreated = true;
              currentModeHash = message.hash;

              // Capture session ID for tracking
              sessionTracker.captureSessionId(sessionId);

              // Persist session ID for future auto-resume
              if (acpSessionId) {
                saveSessionForDirectory(workingDirectory, {
                  opencodeSessionId: acpSessionId,
                  updatedAt: Date.now(),
                }).catch(err => logger.debug('[OpenCode] Failed to save session:', err));
              }
            }
          }

          if (!acpSessionId) {
            throw new Error('ACP session not started');
          }

          accumulatedResponse = '';
          isResponseInProgress = false;

          if (!opencodeBackend || !acpSessionId) {
            throw new Error('OpenCode backend or session not initialized');
          }

          const promptToSend = message.message;
          logger.debug(`[opencode] Sending prompt (length: ${promptToSend.length})`);
          await opencodeBackend.sendPrompt(acpSessionId, promptToSend);
          logger.debug('[opencode] Prompt sent successfully');

          if (first) {
            first = false;
          }
        } catch (error) {
          logger.debug('[opencode] Error in opencode session:', error);
          const isAbortError = error instanceof Error && error.name === 'AbortError';

          if (isAbortError) {
            messageBuffer.addMessage('Aborted by user', 'status');
            session.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
          } else {
            let errorMsg = 'Process error occurred';
            if (error instanceof Error) {
              errorMsg = error.message;
            }
            messageBuffer.addMessage(errorMsg, 'status');
            session.sendCodexMessage({
              type: 'message',
              message: errorMsg,
              id: randomUUID(),
            });
          }
        } finally {
          permissionHandler.reset();
          reasoningProcessor.abort();
          thinking = false;
          session.keepAlive(thinking, 'remote');
          emitReadyIfIdle();
        }
      }
    } finally {
      // Restore original model if we changed it
      if (currentModel && originalModel !== undefined) {
        try {
          await writeOpenCodeModel(originalModel);
          logger.debug('[OpenCode] Restored original model:', originalModel);
        } catch (error) {
          logger.warn('[OpenCode] Failed to restore original model:', error);
        }
      }
    }

  } finally {
    // Clean up resources
    logger.debug('[opencode]: Final cleanup start');
    try {
      session.sendSessionDeath();
      await session.flush();
      await session.close();
    } catch (e) {
      logger.debug('[opencode]: Error while closing session', e);
    }

    if (opencodeBackend) {
      await opencodeBackend.dispose();
    }

    happyServer.stop();

    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch { /* ignore */ }
    }
    if (hasTTY) {
      try { process.stdin.pause(); } catch { /* ignore */ }
    }

    clearInterval(keepAliveInterval);
    if (inkInstance) {
      inkInstance.unmount();
    }
    messageBuffer.clear();

    logger.debug('[opencode]: Final cleanup completed');
  }
}

/**
 * Check if OpenCode is installed and available
 *
 * @returns Promise<boolean> - true if OpenCode is available
 */
export async function isOpenCodeInstalled(): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  try {
    await execAsync('opencode --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Options for running OpenCode (legacy, for backward compatibility)
 */
export interface RunOpenCodeOptions {
  /** Working directory */
  cwd: string;

  /** Model to use (e.g., 'anthropic/claude-sonnet-4-20250514', 'gpt-4o') */
  model?: string;

  /** Initial prompt to send */
  initialPrompt?: string;
}
