/**
 * CodeBuddy CLI Entry Point
 * 
 * This module provides the main entry point for running the CodeBuddy agent
 * through Happy CLI. It manages the agent lifecycle, session state, and
 * communication with the Happy server and mobile app.
 */

import { render } from 'ink';
import React from 'react';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { ApiClient } from '@/api/api';
import { logger } from '@/ui/logger';
import { Credentials, readSettings } from '@/persistence';
import { createSessionMetadata } from '@/utils/createSessionMetadata';
import { initialMachineMetadata } from '@/daemon/run';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { projectPath } from '@/projectPath';
import { startHappyServer } from '@/claude/utils/startHappyServer';
import { MessageBuffer } from '@/ui/ink/messageBuffer';
import { notifyDaemonSessionStarted } from '@/daemon/controlClient';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import { stopCaffeinate } from '@/utils/caffeinate';
import { connectionState } from '@/utils/serverConnectionErrors';
import { setupOfflineReconnection } from '@/utils/setupOfflineReconnection';
import type { ApiSessionClient } from '@/api/apiSession';

import { createCodebuddyBackend } from '@/agent/acp/codebuddy';
import type { AgentBackend, AgentMessage } from '@/agent/AgentBackend';
import { CodebuddyDisplay } from '@/ui/ink/CodebuddyDisplay';
import { CodebuddyPermissionHandler } from '@/codebuddy/utils/permissionHandler';
import { CodebuddyReasoningProcessor } from '@/codebuddy/utils/reasoningProcessor';
import { CodebuddyDiffProcessor } from '@/codebuddy/utils/diffProcessor';
import type { CodebuddyMode, CodexMessagePayload } from '@/codebuddy/types';
import type { PermissionMode } from '@/api/types';
import { CODEBUDDY_MODEL_ENV, DEFAULT_CODEBUDDY_MODEL, CHANGE_TITLE_INSTRUCTION } from '@/codebuddy/constants';
import { 
  readCodebuddyLocalConfig, 
  determineCodebuddyModel, 
  saveCodebuddyModelToConfig,
  getInitialCodebuddyModel 
} from '@/codebuddy/utils/config';
import {
  parseOptionsFromText,
  hasIncompleteOptions,
  formatOptionsXml,
} from '@/codebuddy/utils/optionsParser';


/**
 * Main entry point for the codebuddy command with ink UI
 */
export async function runCodebuddy(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
}): Promise<void> {
  //
  // Define session
  //

  const sessionTag = randomUUID();

  // Set backend for offline warnings (before any API calls)
  connectionState.setBackend('CodeBuddy');

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
  // Fetch CodeBuddy cloud token (if available)
  //
  let cloudToken: string | undefined = undefined;
  try {
    const vendorToken = await api.getVendorToken('codebuddy');
    if (vendorToken?.oauth?.access_token) {
      cloudToken = vendorToken.oauth.access_token;
      logger.debug('[CodeBuddy] Using OAuth token from Happy cloud');
    }
  } catch (error) {
    logger.debug('[CodeBuddy] Failed to fetch cloud token:', error);
  }

  //
  // Create session
  //

  const { state, metadata } = createSessionMetadata({
    flavor: 'codebuddy',
    machineId,
    startedBy: opts.startedBy
  });
  const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });

  // Handle server unreachable case - create offline stub with hot reconnection
  let session: ApiSessionClient;
  let permissionHandler: CodebuddyPermissionHandler;
  const { session: initialSession, reconnectionHandle } = setupOfflineReconnection({
    api,
    sessionTag,
    metadata,
    state,
    response,
    onSessionSwap: (newSession) => {
      session = newSession;
      if (permissionHandler) {
        permissionHandler.updateSession(newSession);
      }
    }
  });
  session = initialSession;

  // Report to daemon (only if we have a real session)
  if (response) {
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
  }

  const messageQueue = new MessageQueue2<CodebuddyMode>((mode) => hashObject({
    permissionMode: mode.permissionMode,
    model: mode.model,
  }));

  // Track current overrides to apply per message
  let currentPermissionMode: PermissionMode | undefined = undefined;
  let currentModel: string | undefined = undefined;

  session.onUserMessage((message) => {
    // Resolve permission mode (validate)
    let messagePermissionMode = currentPermissionMode;
    if (message.meta?.permissionMode) {
      const validModes: PermissionMode[] = ['default', 'read-only', 'safe-yolo', 'yolo'];
      if (validModes.includes(message.meta.permissionMode as PermissionMode)) {
        messagePermissionMode = message.meta.permissionMode as PermissionMode;
        currentPermissionMode = messagePermissionMode;
        updatePermissionMode(messagePermissionMode);
        logger.debug(`[CodeBuddy] Permission mode updated from user message to: ${currentPermissionMode}`);
      } else {
        logger.debug(`[CodeBuddy] Invalid permission mode received: ${message.meta.permissionMode}`);
      }
    } else {
      logger.debug(`[CodeBuddy] User message received with no permission mode override, using current: ${currentPermissionMode ?? 'default (effective)'}`);
    }
    
    // Initialize permission mode if not set yet
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
        updateDisplayedModel(messageModel, true);
        messageBuffer.addMessage(`Model changed to: ${messageModel}`, 'system');
      }
    }

    // Build the full prompt with appendSystemPrompt if provided
    const originalUserMessage = message.content.text;
    let fullPrompt = originalUserMessage;
    if (isFirstMessage && message.meta?.appendSystemPrompt) {
      fullPrompt = message.meta.appendSystemPrompt + '\n\n' + originalUserMessage + '\n\n' + CHANGE_TITLE_INSTRUCTION;
      isFirstMessage = false;
    }

    const mode: CodebuddyMode = {
      permissionMode: messagePermissionMode || 'default',
      model: messageModel,
      originalUserMessage,
    };
    messageQueue.push(fullPrompt, mode);
  });

  let thinking = false;
  session.keepAlive(thinking, 'remote');
  const keepAliveInterval = setInterval(() => {
    session.keepAlive(thinking, 'remote');
  }, 2000);

  let isFirstMessage = true;

  const sendReady = () => {
    session.sendSessionEvent({ type: 'ready' });
    try {
      api.push().sendToAllDevices(
        "It's ready!",
        'CodeBuddy is waiting for your command',
        { sessionId: session.sessionId }
      );
    } catch (pushError) {
      logger.debug('[CodeBuddy] Failed to send ready push', pushError);
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
  let codebuddyBackend: AgentBackend | null = null;
  let acpSessionId: string | null = null;
  let wasSessionCreated = false;

  async function handleAbort() {
    logger.debug('[CodeBuddy] Abort requested - stopping current task');
    
    session.sendCodexMessage({
      type: 'turn_aborted',
      id: randomUUID(),
    });
    
    reasoningProcessor.abort();
    diffProcessor.reset();
    
    try {
      abortController.abort();
      messageQueue.reset();
      if (codebuddyBackend && acpSessionId) {
        await codebuddyBackend.cancel(acpSessionId);
      }
      logger.debug('[CodeBuddy] Abort completed - session remains active');
    } catch (error) {
      logger.debug('[CodeBuddy] Error during abort:', error);
    } finally {
      abortController = new AbortController();
    }
  }

  const handleKillSession = async () => {
    logger.debug('[CodeBuddy] Kill session requested - terminating process');
    await handleAbort();
    logger.debug('[CodeBuddy] Abort completed, proceeding with termination');

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

      if (codebuddyBackend) {
        await codebuddyBackend.dispose();
      }

      logger.debug('[CodeBuddy] Session termination complete, exiting');
      process.exit(0);
    } catch (error) {
      logger.debug('[CodeBuddy] Error during session termination:', error);
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

  let displayedModel: string | undefined = getInitialCodebuddyModel();
  
  const localConfig = readCodebuddyLocalConfig();
  logger.debug(`[codebuddy] Initial model setup: env[CODEBUDDY_MODEL]=${process.env[CODEBUDDY_MODEL_ENV] || 'not set'}, localConfig=${localConfig.model || 'not set'}, displayedModel=${displayedModel}`);

  const updateDisplayedModel = (model: string | undefined, saveToConfig: boolean = false) => {
    if (model === undefined) {
      logger.debug(`[codebuddy] updateDisplayedModel called with undefined, skipping update`);
      return;
    }
    
    const oldModel = displayedModel;
    displayedModel = model;
    logger.debug(`[codebuddy] updateDisplayedModel called: oldModel=${oldModel}, newModel=${model}, saveToConfig=${saveToConfig}`);
    
    if (saveToConfig) {
      saveCodebuddyModelToConfig(model);
    }
    
    if (hasTTY && oldModel !== model) {
      logger.debug(`[codebuddy] Adding model update message to buffer: [MODEL:${model}]`);
      messageBuffer.addMessage(`[MODEL:${model}]`, 'system');
    } else if (hasTTY) {
      logger.debug(`[codebuddy] Model unchanged, skipping update message`);
    }
  };

  if (hasTTY) {
    console.clear();
    const DisplayComponent = () => {
      const currentModelValue = displayedModel || DEFAULT_CODEBUDDY_MODEL;
      return React.createElement(CodebuddyDisplay, {
        messageBuffer,
        logPath: process.env.DEBUG ? logger.getLogPath() : undefined,
        currentModel: currentModelValue,
        onExit: async () => {
          logger.debug('[codebuddy]: Exiting agent via Ctrl-C');
          shouldExit = true;
          await handleAbort();
        }
      });
    };
    
    inkInstance = render(React.createElement(DisplayComponent), {
      exitOnCtrlC: false,
      patchConsole: false
    });
    
    const initialModelName = displayedModel || DEFAULT_CODEBUDDY_MODEL;
    logger.debug(`[codebuddy] Sending initial model to UI: ${initialModelName}`);
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
  // Start Happy MCP server and create CodeBuddy backend
  //

  const happyServer = await startHappyServer(session);
  const bridgeCommand = join(projectPath(), 'bin', 'happy-mcp.mjs');
  const mcpServers = {
    happy: {
      command: bridgeCommand,
      args: ['--url', happyServer.url]
    }
  };

  permissionHandler = new CodebuddyPermissionHandler(session);
  
  const reasoningProcessor = new CodebuddyReasoningProcessor((message) => {
    session.sendCodexMessage(message);
  });
  
  const diffProcessor = new CodebuddyDiffProcessor((message) => {
    session.sendCodexMessage(message);
  });
  
  const updatePermissionMode = (mode: PermissionMode) => {
    permissionHandler.setPermissionMode(mode);
  };

  let accumulatedResponse = '';
  let isResponseInProgress = false;
  let currentResponseMessageId: string | null = null;

  function setupCodebuddyMessageHandler(backend: AgentBackend): void {
    backend.onMessage((msg: AgentMessage) => {

    switch (msg.type) {
      case 'model-output':
        if (msg.textDelta) {
          if (!isResponseInProgress) {
            messageBuffer.removeLastMessage('system');
            messageBuffer.addMessage(msg.textDelta, 'assistant');
            isResponseInProgress = true;
            logger.debug(`[codebuddy] Started new response, first chunk length: ${msg.textDelta.length}`);
          } else {
            messageBuffer.updateLastMessage(msg.textDelta, 'assistant');
            logger.debug(`[codebuddy] Updated response, chunk length: ${msg.textDelta.length}, total accumulated: ${accumulatedResponse.length + msg.textDelta.length}`);
          }
          accumulatedResponse += msg.textDelta;
        }
        break;

      case 'status':
        logger.debug(`[codebuddy] Status changed: ${msg.status}${msg.detail ? ` - ${msg.detail}` : ''}`);
        
        if (msg.status === 'error') {
          logger.debug(`[codebuddy] Error status received: ${msg.detail || 'Unknown error'}`);
          
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
          if (thinking) {
            thinking = false;
          }
          thinking = false;
          session.keepAlive(thinking, 'remote');
          
          const reasoningCompleted = reasoningProcessor.complete();
          
          if (reasoningCompleted || isResponseInProgress) {
            session.sendCodexMessage({
              type: 'task_complete',
              id: randomUUID(),
            });
          }
          
          if (isResponseInProgress && accumulatedResponse.trim()) {
            const { text: messageText, options } = parseOptionsFromText(accumulatedResponse);
            
            let finalMessageText = messageText;
            if (options.length > 0) {
              const optionsXml = formatOptionsXml(options);
              finalMessageText = messageText + optionsXml;
              logger.debug(`[codebuddy] Found ${options.length} options in response:`, options);
            } else if (hasIncompleteOptions(accumulatedResponse)) {
              logger.debug(`[codebuddy] Warning: Incomplete options block detected but sending message anyway`);
            }
            
            const messageId = randomUUID();
            
            const messagePayload: CodexMessagePayload = {
              type: 'message',
              message: finalMessageText,
              id: messageId,
              ...(options.length > 0 && { options }),
            };
            
            logger.debug(`[codebuddy] Sending complete message to mobile (length: ${finalMessageText.length})`);
            session.sendCodexMessage(messagePayload);
            accumulatedResponse = '';
            isResponseInProgress = false;
          }
        } else if (msg.status === 'error') {
          thinking = false;
          session.keepAlive(thinking, 'remote');
          accumulatedResponse = '';
          isResponseInProgress = false;
          currentResponseMessageId = null;
          
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
        
        logger.debug(`[codebuddy] Tool call received: ${msg.toolName} (${msg.callId})`);
        
        messageBuffer.addMessage(`Executing: ${msg.toolName}${toolArgs ? ` ${toolArgs}${toolArgs.length >= 100 ? '...' : ''}` : ''}`, 'tool');
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
        
        const resultSize = typeof msg.result === 'string' 
          ? msg.result.length 
          : JSON.stringify(msg.result).length;
        
        logger.debug(`[codebuddy] ${isError ? 'Error' : 'Success'} Tool result: ${msg.toolName} (${msg.callId}) - Size: ${resultSize} bytes`);
        
        if (!isError) {
          diffProcessor.processToolResult(msg.toolName, msg.result, msg.callId);
        }
        
        if (isError) {
          const errorMsg = (msg.result as any).error || 'Tool call failed';
          logger.debug(`[codebuddy] Tool call error: ${errorMsg.substring(0, 300)}`);
          messageBuffer.addMessage(`Error: ${errorMsg}`, 'status');
        } else {
          if (resultSize > 1000) {
            logger.debug(`[codebuddy] Large tool result (${resultSize} bytes) - first 200 chars: ${truncatedResult}`);
          }
          messageBuffer.addMessage(`Result: ${truncatedResult}`, 'result');
        }
        
        session.sendCodexMessage({
          type: 'tool-call-result',
          callId: msg.callId,
          output: msg.result,
          id: randomUUID(),
        });
        break;

      case 'fs-edit':
        messageBuffer.addMessage(`File edit: ${msg.description}`, 'tool');
        
        diffProcessor.processFsEdit(msg.path || '', msg.description, msg.diff);
        
        session.sendCodexMessage({
          type: 'file-edit',
          description: msg.description,
          diff: msg.diff,
          path: msg.path,
          id: randomUUID(),
        });
        break;

      case 'terminal-output':
        messageBuffer.addMessage(msg.data, 'result');
        session.sendCodexMessage({
          type: 'terminal-output',
          data: msg.data,
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
        if (msg.name === 'thinking') {
          const thinkingPayload = msg.payload as { text?: string } | undefined;
          const thinkingText = (thinkingPayload && typeof thinkingPayload === 'object' && 'text' in thinkingPayload)
            ? String(thinkingPayload.text || '')
            : '';
          if (thinkingText) {
            reasoningProcessor.processChunk(thinkingText);
            
            logger.debug(`[codebuddy] Thinking chunk received: ${thinkingText.length} chars`);
            
            if (!thinkingText.startsWith('**')) {
              const thinkingPreview = thinkingText.substring(0, 100);
              messageBuffer.updateLastMessage(`[Thinking] ${thinkingPreview}...`, 'system');
            }
          }
          session.sendCodexMessage({
            type: 'thinking',
            text: thinkingText,
            id: randomUUID(),
          });
        }
        break;

      default:
        if ((msg as any).type === 'token-count') {
          session.sendCodexMessage({
            type: 'token_count',
            ...(msg as any),
            id: randomUUID(),
          });
        }
        break;
    }
    });
  }

  let first = true;

  try {
    let currentModeHash: string | null = null;
    let pending: { message: string; mode: CodebuddyMode; isolate: boolean; hash: string } | null = null;

    while (!shouldExit) {
      let message: { message: string; mode: CodebuddyMode; isolate: boolean; hash: string } | null = pending;
      pending = null;

      if (!message) {
        logger.debug('[codebuddy] Main loop: waiting for messages from queue...');
        const waitSignal = abortController.signal;
        const batch = await messageQueue.waitForMessagesAndGetAsString(waitSignal);
        if (!batch) {
          if (waitSignal.aborted && !shouldExit) {
            logger.debug('[codebuddy] Main loop: wait aborted, continuing...');
            continue;
          }
          logger.debug('[codebuddy] Main loop: no batch received, breaking...');
          break;
        }
        logger.debug(`[codebuddy] Main loop: received message from queue (length: ${batch.message.length})`);
        message = batch;
      }

      if (!message) {
        break;
      }

      // Handle mode change - restart session if permission mode or model changed
      if (wasSessionCreated && currentModeHash && message.hash !== currentModeHash) {
        logger.debug('[CodeBuddy] Mode changed – restarting CodeBuddy session');
        messageBuffer.addMessage('═'.repeat(40), 'status');
        messageBuffer.addMessage('Starting new CodeBuddy session (mode changed)...', 'status');
        
        permissionHandler.reset();
        reasoningProcessor.abort();
        
        if (codebuddyBackend) {
          await codebuddyBackend.dispose();
          codebuddyBackend = null;
        }
        
        const modelToUse = message.mode?.model === undefined ? undefined : (message.mode.model || null);
        codebuddyBackend = createCodebuddyBackend({
          cwd: process.cwd(),
          mcpServers,
          permissionHandler,
          cloudToken,
          model: modelToUse,
        });
        
        setupCodebuddyMessageHandler(codebuddyBackend);
        
        const localConfigForModel = readCodebuddyLocalConfig();
        const actualModel = determineCodebuddyModel(modelToUse, localConfigForModel);
        logger.debug(`[codebuddy] Model change - modelToUse=${modelToUse}, actualModel=${actualModel}`);
        
        logger.debug('[codebuddy] Starting new ACP session with model:', actualModel);
        const { sessionId } = await codebuddyBackend.startSession();
        acpSessionId = sessionId;
        logger.debug(`[codebuddy] New ACP session started: ${acpSessionId}`);
        
        logger.debug(`[codebuddy] Calling updateDisplayedModel with: ${actualModel}`);
        updateDisplayedModel(actualModel, false);
        
        updatePermissionMode(message.mode.permissionMode);
        
        wasSessionCreated = true;
        currentModeHash = message.hash;
        first = false;
      }

      currentModeHash = message.hash;
      const userMessageToShow = message.mode?.originalUserMessage || message.message;
      messageBuffer.addMessage(userMessageToShow, 'user');

      try {
        if (first || !wasSessionCreated) {
          if (!codebuddyBackend) {
            const modelToUse = message.mode?.model === undefined ? undefined : (message.mode.model || null);
            codebuddyBackend = createCodebuddyBackend({
              cwd: process.cwd(),
              mcpServers,
              permissionHandler,
              cloudToken,
              model: modelToUse,
            });
            
            setupCodebuddyMessageHandler(codebuddyBackend);
            
            const localConfigForModel = readCodebuddyLocalConfig();
            const actualModel = determineCodebuddyModel(modelToUse, localConfigForModel);
            
            const modelSource = modelToUse !== undefined 
              ? 'message' 
              : process.env[CODEBUDDY_MODEL_ENV] 
                ? 'env-var' 
                : localConfigForModel.model 
                  ? 'local-config' 
                  : 'default';
            
            logger.debug(`[codebuddy] Backend created, model will be: ${actualModel} (from ${modelSource})`);
            logger.debug(`[codebuddy] Calling updateDisplayedModel with: ${actualModel}`);
            updateDisplayedModel(actualModel, false);
          }
          
          if (!acpSessionId) {
            logger.debug('[codebuddy] Starting ACP session...');
            updatePermissionMode(message.mode.permissionMode);
            const { sessionId } = await codebuddyBackend.startSession();
            acpSessionId = sessionId;
            logger.debug(`[codebuddy] ACP session started: ${acpSessionId}`);
            wasSessionCreated = true;
            currentModeHash = message.hash;
            
            logger.debug(`[codebuddy] Displaying model in UI: ${displayedModel || DEFAULT_CODEBUDDY_MODEL}`);
          }
        }
        
        if (!acpSessionId) {
          throw new Error('ACP session not started');
        }
        
        accumulatedResponse = '';
        isResponseInProgress = false;
        
        if (!codebuddyBackend || !acpSessionId) {
          throw new Error('CodeBuddy backend or session not initialized');
        }
        
        const promptToSend = message.message;
        
        logger.debug(`[codebuddy] Sending prompt to CodeBuddy (length: ${promptToSend.length})`);
        await codebuddyBackend.sendPrompt(acpSessionId, promptToSend);
        logger.debug('[codebuddy] Prompt sent successfully');
        
        if (first) {
          first = false;
        }
      } catch (error) {
        logger.debug('[codebuddy] Error in codebuddy session:', error);
        const isAbortError = error instanceof Error && error.name === 'AbortError';

        if (isAbortError) {
          messageBuffer.addMessage('Aborted by user', 'status');
          session.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
        } else {
          let errorMsg = 'Process error occurred';
          
          if (typeof error === 'object' && error !== null) {
            const errObj = error as any;
            
            const errorDetails = errObj.data?.details || errObj.details || '';
            const errorCode = errObj.code || errObj.status || (errObj.response?.status);
            const errorMessage = errObj.message || errObj.error?.message || '';
            const errorString = String(error);
            
            if (errorCode === 404 || errorDetails.includes('notFound') || errorDetails.includes('404') || 
                errorMessage.includes('not found') || errorMessage.includes('404')) {
              const currentModel = displayedModel || DEFAULT_CODEBUDDY_MODEL;
              errorMsg = `Model "${currentModel}" not found.`;
            }
            else if (errorCode === 429 || 
                     errorDetails.includes('429') || errorMessage.includes('429') || errorString.includes('429') ||
                     errorDetails.includes('rateLimitExceeded') || errorDetails.includes('RESOURCE_EXHAUSTED') ||
                     errorMessage.includes('Rate limit exceeded') || errorMessage.includes('Resource exhausted')) {
              errorMsg = 'API rate limit exceeded. Please wait a moment and try again.';
            }
            else if (errorDetails.includes('quota') || errorMessage.includes('quota') || errorString.includes('quota')) {
              errorMsg = 'API daily quota exceeded. Please wait until quota resets.';
            }
            else if (Object.keys(error).length === 0) {
              errorMsg = 'Failed to start CodeBuddy. Is "codebuddy" CLI installed?';
            }
            else if (errObj.message || errorMessage) {
              errorMsg = errorDetails || errorMessage || errObj.message;
            }
          } else if (error instanceof Error) {
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
        diffProcessor.reset();
        
        thinking = false;
        session.keepAlive(thinking, 'remote');
        
        emitReadyIfIdle();
        
        logger.debug(`[codebuddy] Main loop: turn completed, continuing to next iteration (queue size: ${messageQueue.size()})`);
      }
    }

  } finally {
    logger.debug('[codebuddy]: Final cleanup start');

    if (reconnectionHandle) {
      logger.debug('[codebuddy]: Cancelling offline reconnection');
      reconnectionHandle.cancel();
    }

    try {
      session.sendSessionDeath();
      await session.flush();
      await session.close();
    } catch (e) {
      logger.debug('[codebuddy]: Error while closing session', e);
    }

    if (codebuddyBackend) {
      await codebuddyBackend.dispose();
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

    logger.debug('[codebuddy]: Final cleanup completed');
  }
}
