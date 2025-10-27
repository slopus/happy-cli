/**
 * Resource Exposure API - Type Definitions
 *
 * Comprehensive types for exposing CLI commands, skills, and MCPs to mobile app
 */

// ============================================================================
// Command Types
// ============================================================================

export interface CommandArgument {
  name: string;
  required: boolean;
  description?: string;
  type?: 'string' | 'number' | 'boolean' | 'array';
  default?: any;
}

export interface CommandFlag {
  name: string;
  description?: string;
  type: 'boolean' | 'string' | 'number';
  default?: any;
  alias?: string;
}

export interface CommandMetadata {
  name: string;              // e.g., "build"
  path: string;              // Relative path from commands dir
  category: string;          // From markdown frontmatter
  description: string;       // From file content
  purpose?: string;          // From frontmatter
  waveEnabled?: boolean;     // From frontmatter
  performanceProfile?: 'optimization' | 'standard' | 'complex';
  arguments?: CommandArgument[];
  flags?: CommandFlag[];
  examples?: string[];
  relatedCommands?: string[];
}

export interface ListCommandsRequest {
  userId: string;            // User identifier for isolation
  filter?: {
    category?: string;       // e.g., "Development", "Quality"
    search?: string;         // Search in command names/descriptions
    waveEnabled?: boolean;   // Filter by wave support
  };
  limit?: number;            // Default: 100
  offset?: number;           // For pagination
  sortBy?: 'name' | 'category' | 'recent';
}

export interface ListCommandsResponse {
  commands: CommandMetadata[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Skill Types
// ============================================================================

export interface SkillMetadata {
  name: string;              // e.g., "cloudflare-d1"
  description: string;       // From markdown
  location: 'user' | 'project' | 'plugin';
  path: string;              // Full path to skill file
  triggers?: string[];       // When to activate
  capabilities?: string[];   // What it can do
  gitignored?: boolean;      // From location marker
  author?: string;
  version?: string;
  dependencies?: string[];
}

export interface ListSkillsRequest {
  userId: string;            // User identifier for isolation
  filter?: {
    location?: 'user' | 'project' | 'plugin';
    search?: string;
  };
  limit?: number;
  offset?: number;
}

export interface ListSkillsResponse {
  skills: SkillMetadata[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// MCP Server Types
// ============================================================================

export interface McpToolMetadata {
  name: string;
  description: string;
  inputSchema: any;          // JSON Schema
}

export interface McpResourceMetadata {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpServerTransport {
  type: 'stdio' | 'sse';
  command?: string;          // For stdio
  args?: string[];
  env?: Record<string, string>;
  url?: string;              // For sse
}

export interface McpServerMetadata {
  name: string;              // e.g., "filesystem", "sequential-thinking"
  enabled: boolean;
  transport: McpServerTransport;
  tools?: McpToolMetadata[];
  resources?: McpResourceMetadata[];
  prompts?: {
    name: string;
    description?: string;
  }[];
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

export interface ListMcpServersRequest {
  includeTools?: boolean;    // Default: true
  includeResources?: boolean; // Default: false
  includePrompts?: boolean;  // Default: false
  filter?: {
    enabled?: boolean;
    search?: string;
    hasTools?: boolean;
  };
}

export interface ListMcpServersResponse {
  servers: McpServerMetadata[];
  total: number;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecuteCommandRequest {
  userId: string;            // User identifier for isolation
  command: string;           // Command name
  args?: string[];           // Command arguments
  flags?: Record<string, any>;
  directory?: string;        // Working directory
  timeout?: number;          // Max execution time (ms), default: 300000
  sessionId?: string;        // Reuse existing Claude session
  streamOutput?: boolean;    // Enable real-time streaming
}

export type ExecutionStatus =
  | 'queued'
  | 'started'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

export interface ExecuteCommandResponse {
  executionId: string;       // Unique ID for this execution
  status: ExecutionStatus;
  sessionId?: string;        // Claude session ID if spawned
  output?: string;           // Command output (if completed)
  error?: string;            // Error message (if failed)
  exitCode?: number;
  startedAt: number;         // Unix timestamp
  completedAt?: number;
  estimatedDuration?: number; // Based on historical data
}

export interface InvokeSkillRequest {
  userId: string;            // User identifier for isolation
  skill: string;             // Skill name
  context?: {
    files?: string[];        // Files to include in context
    message?: string;        // User message to skill
    variables?: Record<string, string>;
  };
  sessionId?: string;        // Reuse existing Claude session
  streamOutput?: boolean;
}

export interface InvokeSkillResponse {
  executionId: string;
  status: ExecutionStatus;
  sessionId: string;         // Claude session ID
  output?: string;           // Skill output
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface ExecutionQueryRequest {
  executionId: string;
}

export interface ExecutionQueryResponse {
  executionId: string;
  status: ExecutionStatus;
  output?: string;
  error?: string;
  exitCode?: number;
  startedAt: number;
  completedAt?: number;
  progress?: {
    percentage: number;
    currentStep?: string;
  };
}

export interface ExecutionCancelRequest {
  executionId: string;
  force?: boolean;          // Kill process vs graceful shutdown
}

export interface ExecutionCancelResponse {
  executionId: string;
  cancelled: boolean;
  error?: string;
}

// ============================================================================
// Streaming Types
// ============================================================================

export type StreamMessageType =
  | 'stdout'
  | 'stderr'
  | 'status'
  | 'error'
  | 'complete'
  | 'progress';

export interface StreamMessage {
  executionId: string;
  type: StreamMessageType;
  data: string | {
    status: ExecutionStatus;
    exitCode?: number;
    error?: string;
    progress?: {
      percentage: number;
      currentStep?: string;
    };
  };
  timestamp: number;
  sequence?: number;        // For ordering
}

// ============================================================================
// Security Types
// ============================================================================

export interface SecurityConfig {
  whitelist?: {
    enabled: boolean;
    commands: string[];     // Only these commands allowed
  };
  blacklist?: {
    enabled: boolean;
    commands: string[];     // These commands forbidden
  };
  requireApproval?: {
    enabled: boolean;
    commands: string[];     // Commands needing user approval
  };
  maxConcurrentExecutions?: number;
  maxExecutionTime?: number; // Global timeout in ms
}

export interface RateLimitConfig {
  discovery: {
    windowMs: number;
    maxRequests: number;
  };
  execution: {
    windowMs: number;
    maxRequests: number;
  };
  streaming: {
    concurrent: number;
  };
}

export interface AuditLog {
  timestamp: number;
  userId: string;
  action:
    | 'list-commands'
    | 'list-skills'
    | 'list-mcp-servers'
    | 'execute-command'
    | 'invoke-skill'
    | 'cancel-execution';
  resource: string;
  success: boolean;
  error?: string;
  metadata?: {
    executionId?: string;
    duration?: number;
    exitCode?: number;
    command?: string;
    skill?: string;
  };
}

// ============================================================================
// Error Types
// ============================================================================

export enum ApiErrorCode {
  // Validation errors (400)
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_COMMAND = 'INVALID_COMMAND',
  INVALID_SKILL = 'INVALID_SKILL',
  MISSING_REQUIRED_ARG = 'MISSING_REQUIRED_ARG',

  // Auth errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Permission errors (403)
  COMMAND_BLACKLISTED = 'COMMAND_BLACKLISTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  REQUIRES_APPROVAL = 'REQUIRES_APPROVAL',

  // Resource errors (404)
  COMMAND_NOT_FOUND = 'COMMAND_NOT_FOUND',
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  MCP_SERVER_NOT_FOUND = 'MCP_SERVER_NOT_FOUND',
  EXECUTION_NOT_FOUND = 'EXECUTION_NOT_FOUND',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Execution errors (500)
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
  SESSION_SPAWN_FAILED = 'SESSION_SPAWN_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: any;
  timestamp: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ResourceApiConfig {
  enabled: boolean;
  commandsDir: string;       // e.g., "~/.claude/commands"
  skillsDir: string;         // e.g., "~/.claude/skills"
  mcpConfigPath?: string;    // Path to MCP config
  security: SecurityConfig;
  rateLimit: RateLimitConfig;
  execution: {
    timeout: number;         // Default timeout in ms
    maxConcurrent: number;
    retainLogs: boolean;     // Keep execution logs
    logRetentionDays?: number;
  };
  audit: {
    enabled: boolean;
    logPath?: string;
  };
}

// ============================================================================
// Internal Types (daemon use only)
// ============================================================================

export interface ExecutionContext {
  executionId: string;
  userId: string;
  type: 'command' | 'skill';
  resource: string;
  sessionId?: string;
  startedAt: number;
  timeout: number;
  stream?: boolean;
}

export interface ExecutionRecord extends ExecutionContext {
  status: ExecutionStatus;
  output?: string;
  error?: string;
  exitCode?: number;
  completedAt?: number;
  logs: string[];
}
