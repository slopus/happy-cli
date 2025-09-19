import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSessionScanner } from '../sessionScanner';
import { RawJSONLines } from '../../types';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Session Limit Detection', () => {
  let testDir: string;
  let projectDir: string;
  let mockOnMessage: any;
  let mockOnSessionLimit: any;

  beforeEach(async () => {
    testDir = join(tmpdir(), `session-limit-test-${Date.now()}`);
    
    // Set CLAUDE_CONFIG_DIR to use our test directory
    process.env.CLAUDE_CONFIG_DIR = join(testDir, '.claude');
    
    // Create the project directory structure that getProjectPath() generates
    // getProjectPath converts the working directory path to a project ID by replacing special chars with '-'
    const workingDir = join(testDir, 'project');
    await mkdir(workingDir, { recursive: true });
    
    const projectId = workingDir.replace(/[\\\/\.:]/g, '-');
    projectDir = join(testDir, '.claude', 'projects', projectId);
    await mkdir(projectDir, { recursive: true });
    
    mockOnMessage = vi.fn();
    mockOnSessionLimit = vi.fn();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    delete process.env.CLAUDE_CONFIG_DIR;
  });

  it('should detect 5-hour limit messages in Claude sessions', async () => {
    const sessionId = 'test-session-123';
    const sessionFile = join(projectDir, `${sessionId}.jsonl`);
    
    // Create realistic session file content with user message followed by limit error
    // This matches the actual format found in real Claude logs
    const userMessage: RawJSONLines = {
      parentUuid: null,
      isSidechain: false,
      userType: 'external',
      cwd: '/test/path',
      sessionId,
      version: '1.0.113',
      gitBranch: '',
      type: 'user',
      message: { role: 'user', content: 'Test message' },
      uuid: 'user-message-uuid',
      timestamp: '2025-09-15T21:41:29.355Z'
    };

    const limitMessage: RawJSONLines = {
      parentUuid: 'user-message-uuid',
      isSidechain: false,
      userType: 'external',
      cwd: '/test/path',
      sessionId,
      version: '1.0.113',
      gitBranch: '',
      type: 'assistant',
      uuid: 'limit-message-uuid',
      timestamp: '2025-09-15T21:41:29.746Z',
      message: {
        id: 'limit-msg-id',
        container: null,
        model: '<synthetic>',
        role: 'assistant',
        stop_reason: 'stop_sequence',
        stop_sequence: '',
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        },
        content: [{ type: 'text', text: '5-hour limit reached ∙ resets 5pm' }]
      },
      isApiErrorMessage: true
    };

    // Write both messages to the session file
    const fileContent = JSON.stringify(userMessage) + '\n' + JSON.stringify(limitMessage) + '\n';
    await writeFile(sessionFile, fileContent);

    const workingDir = join(testDir, 'project');
    const scanner = await createSessionScanner({
      sessionId: null,
      workingDirectory: workingDir,
      onMessage: mockOnMessage,
      onSessionLimit: mockOnSessionLimit
    });

    // Trigger the scanner to process the session
    scanner.onNewSession(sessionId);
    
    // Wait longer for the sync mechanism to process the files
    // The scanner runs sync every 3 seconds, so we need to wait for at least one cycle
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify the session limit was detected
    expect(mockOnSessionLimit).toHaveBeenCalledWith('5-hour limit reached ∙ resets 5pm');
    expect(mockOnMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'assistant',
      isApiErrorMessage: true
    }));

    await scanner.cleanup();
  });

  it('should not trigger session limit for regular assistant messages', async () => {
    const sessionId = 'test-session-456';
    const sessionFile = join(projectDir, `${sessionId}.jsonl`);
    
    // Create a mock session file with a regular message
    const regularMessage: RawJSONLines = {
      parentUuid: 'parent-uuid',
      isSidechain: false,
      userType: 'external',
      cwd: '/test/path',
      sessionId,
      version: '1.0.113',
      gitBranch: '',
      type: 'assistant',
      uuid: 'regular-message-uuid',
      timestamp: '2025-09-15T21:41:29.746Z',
      message: {
        id: 'regular-msg-id',
        container: null,
        model: 'claude-3-5-sonnet-20241022',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 10,
          output_tokens: 25,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          service_tier: 'standard'
        },
        content: [{ type: 'text', text: 'Hello! How can I help you today?' }]
      }
      // Note: no isApiErrorMessage field for regular messages
    };

    await writeFile(sessionFile, JSON.stringify(regularMessage) + '\n');

    const workingDir = join(testDir, 'project');
    const scanner = await createSessionScanner({
      sessionId: null,
      workingDirectory: workingDir,
      onMessage: mockOnMessage,
      onSessionLimit: mockOnSessionLimit
    });

    scanner.onNewSession(sessionId);
    
    // Wait a bit for the scanner to process
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the session limit was NOT triggered
    expect(mockOnSessionLimit).not.toHaveBeenCalled();
    expect(mockOnMessage).toHaveBeenCalledWith(regularMessage);

    await scanner.cleanup();
  });
});