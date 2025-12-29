import { z } from 'zod'
import { UsageSchema } from '@/claude/types'
import { PermissionMode } from '@/claude/loop'

/**
 * Usage data type from Claude
 */
export type Usage = z.infer<typeof UsageSchema>

/**
 * Base message content structure for encrypted messages
 */
export const SessionMessageContentSchema = z.object({
  c: z.string(), // Base64 encoded encrypted content
  t: z.literal('encrypted')
})

export type SessionMessageContent = z.infer<typeof SessionMessageContentSchema>

/**
 * Update body for new messages
 */
export const UpdateBodySchema = z.object({
  message: z.object({
    id: z.string(),
    seq: z.number(),
    content: SessionMessageContentSchema
  }),
  sid: z.string(), // Session ID
  t: z.literal('new-message')
})

export type UpdateBody = z.infer<typeof UpdateBodySchema>

export const UpdateSessionBodySchema = z.object({
  t: z.literal('update-session'),
  sid: z.string(),
  metadata: z.object({
    version: z.number(),
    value: z.string()
  }).nullish(),
  agentState: z.object({
    version: z.number(),
    value: z.string()
  }).nullish()
})

export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>

/**
 * Update body for machine updates
 */
export const UpdateMachineBodySchema = z.object({
  t: z.literal('update-machine'),
  machineId: z.string(),
  metadata: z.object({
    version: z.number(),
    value: z.string()
  }).nullish(),
  daemonState: z.object({
    version: z.number(),
    value: z.string()
  }).nullish()
})

export type UpdateMachineBody = z.infer<typeof UpdateMachineBodySchema>

/**
 * Update event from server
 */
export const UpdateSchema = z.object({
  id: z.string(),
  seq: z.number(),
  body: z.union([
    UpdateBodySchema,
    UpdateSessionBodySchema,
    UpdateMachineBodySchema,
  ]),
  createdAt: z.number()
})

export type Update = z.infer<typeof UpdateSchema>

/**
 * Socket events from server to client
 */
export interface ServerToClientEvents {
  update: (data: Update) => void
  'rpc-request': (data: { method: string, params: string }, callback: (response: string) => void) => void
  'rpc-registered': (data: { method: string }) => void
  'rpc-unregistered': (data: { method: string }) => void
  'rpc-error': (data: { type: string, error: string }) => void
  ephemeral: (data: { type: 'activity', id: string, active: boolean, activeAt: number, thinking: boolean }) => void
  auth: (data: { success: boolean, user: string }) => void
  error: (data: { message: string }) => void
}


/**
 * Socket events from client to server
 */
export interface ClientToServerEvents {
  message: (data: { sid: string, message: any }) => void
  'session-alive': (data: {
    sid: string;
    time: number;
    thinking: boolean;
    mode?: 'local' | 'remote';
  }) => void
  'session-end': (data: { sid: string, time: number }) => void,
  'update-metadata': (data: { sid: string, expectedVersion: number, metadata: string }, cb: (answer: {
    result: 'error'
  } | {
    result: 'version-mismatch'
    version: number,
    metadata: string
  } | {
    result: 'success',
    version: number,
    metadata: string
  }) => void) => void,
  'update-state': (data: { sid: string, expectedVersion: number, agentState: string | null }, cb: (answer: {
    result: 'error'
  } | {
    result: 'version-mismatch'
    version: number,
    agentState: string | null
  } | {
    result: 'success',
    version: number,
    agentState: string | null
  }) => void) => void,
  'ping': (callback: () => void) => void
  'rpc-register': (data: { method: string }) => void
  'rpc-unregister': (data: { method: string }) => void
  'rpc-call': (data: { method: string, params: string }, callback: (response: {
    ok: boolean
    result?: string
    error?: string
  }) => void) => void
  'usage-report': (data: {
    key: string
    sessionId: string
    tokens: {
      total: number
      [key: string]: number
    }
    cost: {
      total: number
      [key: string]: number
    }
  }) => void
}

/**
 * Session information
 */
export type Session = {
  id: string,
  seq: number,
  encryptionKey: Uint8Array;
  encryptionVariant: 'legacy' | 'dataKey';
  metadata: Metadata,
  metadataVersion: number,
  agentState: AgentState | null,
  agentStateVersion: number,
}

/**
 * Machine metadata - static information (rarely changes)
 */
export const MachineMetadataSchema = z.object({
  host: z.string(),
  platform: z.string(),
  happyCliVersion: z.string(),
  homeDir: z.string(),
  happyHomeDir: z.string(),
  happyLibDir: z.string()
})

export type MachineMetadata = z.infer<typeof MachineMetadataSchema>

/**
 * Daemon state - dynamic runtime information (frequently updated)
 */
export const DaemonStateSchema = z.object({
  status: z.union([
    z.enum(['running', 'shutting-down']),
    z.string() // Forward compatibility
  ]),
  pid: z.number().optional(),
  httpPort: z.number().optional(),
  startedAt: z.number().optional(),
  shutdownRequestedAt: z.number().optional(),
  shutdownSource:
    z.union([
      z.enum(['mobile-app', 'cli', 'os-signal', 'unknown']),
      z.string() // Forward compatibility
    ]).optional()
})

export type DaemonState = z.infer<typeof DaemonStateSchema>

export type Machine = {
  id: string,
  encryptionKey: Uint8Array;
  encryptionVariant: 'legacy' | 'dataKey';
  metadata: MachineMetadata,
  metadataVersion: number,
  daemonState: DaemonState | null,
  daemonStateVersion: number,
}

/**
 * Session message from API
 */
export const SessionMessageSchema = z.object({
  content: SessionMessageContentSchema,
  createdAt: z.number(),
  id: z.string(),
  seq: z.number(),
  updatedAt: z.number()
})

export type SessionMessage = z.infer<typeof SessionMessageSchema>

/**
 * Message metadata schema
 */
export const MessageMetaSchema = z.object({
  sentFrom: z.string().optional(), // Source identifier
  permissionMode: z.string().optional(), // Permission mode for this message
  model: z.string().nullable().optional(), // Model name for this message (null = reset)
  fallbackModel: z.string().nullable().optional(), // Fallback model for this message (null = reset)
  customSystemPrompt: z.string().nullable().optional(), // Custom system prompt for this message (null = reset)
  appendSystemPrompt: z.string().nullable().optional(), // Append to system prompt for this message (null = reset)
  allowedTools: z.array(z.string()).nullable().optional(), // Allowed tools for this message (null = reset)
  disallowedTools: z.array(z.string()).nullable().optional() // Disallowed tools for this message (null = reset)
})

export type MessageMeta = z.infer<typeof MessageMetaSchema>

/**
 * API response types
 */
export const CreateSessionResponseSchema = z.object({
  session: z.object({
    id: z.string(),
    tag: z.string(),
    seq: z.number(),
    createdAt: z.number(),
    updatedAt: z.number(),
    metadata: z.string(),
    metadataVersion: z.number(),
    agentState: z.string().nullable(),
    agentStateVersion: z.number()
  })
})

export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>

export const UserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.object({
    type: z.literal('text'),
    text: z.string()
  }),
  localKey: z.string().optional(), // Mobile messages include this
  meta: MessageMetaSchema.optional()
})

export type UserMessage = z.infer<typeof UserMessageSchema>

/**
 * Gemini message data schema - aligned with ACP protocol
 * Used for dedicated Gemini message type (separate from Codex)
 */
export const GeminiMessageDataSchema = z.discriminatedUnion('type', [
  // Text output from model
  z.object({
    type: z.literal('model-output'),
    textDelta: z.string().optional(),
    id: z.string()
  }),

  // Tool call
  z.object({
    type: z.literal('tool-call'),
    toolName: z.string(),
    args: z.any(),
    callId: z.string(),
    id: z.string()
  }),

  // Tool result
  z.object({
    type: z.literal('tool-result'),
    toolName: z.string(),
    result: z.any(),
    callId: z.string(),
    isError: z.boolean().optional(),
    id: z.string()
  }),

  // Status update
  z.object({
    type: z.literal('status'),
    status: z.enum(['starting', 'running', 'idle', 'stopped', 'error']),
    id: z.string()
  }),

  // Token usage
  z.object({
    type: z.literal('token-count'),
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number().optional(),
    id: z.string()
  }),

  // Thinking/reasoning
  z.object({
    type: z.literal('thinking'),
    text: z.string(),
    id: z.string()
  }),

  // File edit
  z.object({
    type: z.literal('file-edit'),
    description: z.string(),
    diff: z.string(),
    path: z.string().optional(),
    id: z.string()
  }),

  // Terminal output
  z.object({
    type: z.literal('terminal-output'),
    data: z.string(),
    id: z.string()
  }),

  // Permission request
  z.object({
    type: z.literal('permission-request'),
    permissionId: z.string(),
    reason: z.string(),
    payload: z.any().optional(),
    id: z.string()
  }),

  // Generic message
  z.object({
    type: z.literal('message'),
    message: z.string(),
    id: z.string()
  })
]);

export type GeminiMessageData = z.infer<typeof GeminiMessageDataSchema>

export const AgentMessageSchema = z.object({
  role: z.literal('agent'),
  content: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('output'),
      data: z.any()  // Claude messages
    }),
    z.object({
      type: z.literal('codex'),
      data: z.any()  // Codex/OpenAI messages
    }),
    z.object({
      type: z.literal('gemini'),  // Gemini messages
      data: GeminiMessageDataSchema
    })
  ]),
  meta: MessageMetaSchema.optional()
})

export type AgentMessage = z.infer<typeof AgentMessageSchema>

export const MessageContentSchema = z.union([UserMessageSchema, AgentMessageSchema])

export type MessageContent = z.infer<typeof MessageContentSchema>

export type Metadata = {
  path: string,
  host: string,
  version?: string,
  name?: string,
  os?: string,
  summary?: {
    text: string,
    updatedAt: number
  },
  machineId?: string,
  claudeSessionId?: string, // Claude Code session ID
  tools?: string[],
  slashCommands?: string[],
  homeDir: string,
  happyHomeDir: string,
  happyLibDir: string,
  happyToolsDir: string,
  startedFromDaemon?: boolean,
  hostPid?: number,
  startedBy?: 'daemon' | 'terminal',
  // Lifecycle state management
  lifecycleState?: 'running' | 'archiveRequested' | 'archived' | string,
  lifecycleStateSince?: number,
  archivedBy?: string,
  archiveReason?: string,
  flavor?: string
};

export type AgentState = {
  controlledByUser?: boolean | null | undefined
  requests?: {
    [id: string]: {
      tool: string,
      arguments: any,
      createdAt: number
    }
  }
  completedRequests?: {
    [id: string]: {
      tool: string,
      arguments: any,
      createdAt: number,
      completedAt: number,
      status: 'canceled' | 'denied' | 'approved',
      reason?: string,
      mode?: PermissionMode,
      decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
      allowTools?: string[]
    }
  }
}
