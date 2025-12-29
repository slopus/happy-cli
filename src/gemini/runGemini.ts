/**
 * Gemini CLI Entry Point
 * 
 * This module provides the main entry point for running the Gemini agent
 * through Happy CLI. It manages the agent lifecycle, session state, and
 * communication with the Happy server and mobile app.
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
import { stopCaffeinate } from '@/utils/caffeinate';

import { createGeminiBackend } from '@/agent/acp/gemini';
import type { AgentBackend, AgentMessage } from '@/agent/AgentBackend';
import { GeminiDisplay } from '@/ui/ink/GeminiDisplay';
import { GeminiPermissionHandler } from '@/gemini/utils/permissionHandler';
import { GeminiReasoningProcessor } from '@/gemini/utils/reasoningProcessor';
import { GeminiDiffProcessor } from '@/gemini/utils/diffProcessor';
import type { PermissionMode, GeminiMode, CodexMessagePayload } from '@/gemini/types';
import type { GeminiSession } from '@/gemini/session';
import { GEMINI_MODEL_ENV, DEFAULT_GEMINI_MODEL, CHANGE_TITLE_INSTRUCTION } from '@/gemini/constants';
import { 
  readGeminiLocalConfig, 
  determineGeminiModel, 
  saveGeminiModelToConfig,
  getInitialGeminiModel 
} from '@/gemini/utils/config';
import {
  parseOptionsFromText,
  hasIncompleteOptions,
  formatOptionsXml,
} from '@/gemini/utils/optionsParser';


/**
 * Main entry point for the gemini command with ink UI
 */
export async function runGemini(opts: {
  credentials: Credentials;
  startedBy?: 'daemon' | 'terminal';
  startingMode?: 'local' | 'remote';
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
  // Fetch Gemini cloud token (from 'happy connect gemini')
  //
  let cloudToken: string | undefined = undefined;
  try {
    const vendorToken = await api.getVendorToken('gemini');
    if (vendorToken?.oauth?.access_token) {
      cloudToken = vendorToken.oauth.access_token;
      logger.debug('[Gemini] Using OAuth token from Happy cloud');
    }
  } catch (error) {
    logger.debug('[Gemini] Failed to fetch cloud token:', error);
  }

  //
  // Create session
  //

  const state: AgentState = {
    controlledByUser: false,
  };
  const metadata: Metadata = {
    path: process.cwd(),
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
    flavor: 'gemini'
  };
  const response = await api.getOrCreateSession({ tag: sessionTag, metadata, state });
  const session = api.sessionSyncClient(response);

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

  const messageQueue = new MessageQueue2<GeminiMode>((mode) => hashObject({
    permissionMode: mode.permissionMode,
    model: mode.model,
  }));

  // Variable to track current session instance (updated via onSessionReady callback)
  // Used by hook server to notify GeminiSession when Gemini changes session ID
  let currentSession: GeminiSession | null = null;

  // Use geminiLoop for both local and remote modes
  // Default to remote mode if no mode is specified
  const startingMode = opts.startingMode || 'remote';
  logger.debug(`[Gemini] Starting in ${startingMode} mode with loop`);
  const { geminiLoop } = await import('./loop');
  const { startHookServer } = await import('@/claude/utils/startHookServer');
  const { addGeminiHookToProject, removeGeminiHookFromProject } = await import('./utils/generateGeminiHookSettings');

  // Start hook server for session tracking (needed for local mode)
  const hookServer = await startHookServer({
    onSessionHook: (sessionId, data) => {
      logger.debug(`[Gemini] SessionStart hook received: ${sessionId}`);
      logger.debug(`[Gemini] Transcript path: ${data.transcript_path}`);

      // Update session ID and transcript path in the GeminiSession instance
      if (currentSession) {
        const previousSessionId = currentSession.sessionId;
        if (previousSessionId !== sessionId) {
          logger.debug(`[Gemini] Session ID changed: ${previousSessionId} -> ${sessionId}`);
          currentSession.onSessionFound(sessionId);
        }

        if (data.transcript_path) {
          logger.debug(`[Gemini] Transcript path: ${data.transcript_path}`);
          currentSession.onTranscriptPathFound(data.transcript_path);
        }
      }
    }
  });

  try {
    // Add hook to project settings (for local mode)
    addGeminiHookToProject(hookServer.port, metadata.path);

    // Run the loop
    await geminiLoop({
      path: metadata.path,
      model: undefined, // TODO: get from initial config
      approvalMode: 'default', // TODO: map permission mode
      startingMode: startingMode,
      onModeChange: (mode) => {
        logger.debug(`[Gemini] Mode changed to: ${mode}`);
      },
      session,
      api,
      messageQueue,
      cloudToken,
      allowedTools: undefined, // TODO: get from config
      onSessionReady: (sessionInstance) => {
        // Store reference for hook server callback
        currentSession = sessionInstance;
      }
    });
  } finally {
    // Cleanup hook
    removeGeminiHookFromProject(metadata.path);
    hookServer.stop();
  }
}
