/**
 * Command registry for exposing available CLI commands via RPC
 * Provides structured metadata about all happy-cli commands
 */

export interface CommandMetadata {
  name: string;
  description: string;
  usage: string;
  examples?: string[];
  subcommands?: CommandMetadata[];
}

/**
 * Complete catalog of happy-cli commands
 * Organized by category for clear API exposure
 */
export const COMMAND_REGISTRY: CommandMetadata[] = [
  {
    name: 'daemon',
    description: 'Daemon management and session control',
    usage: 'happy daemon [subcommand]',
    examples: [
      'happy daemon start',
      'happy daemon stop',
      'happy daemon status'
    ],
    subcommands: [
      {
        name: 'start',
        description: 'Start the daemon (detached)',
        usage: 'happy daemon start',
        examples: ['happy daemon start']
      },
      {
        name: 'stop',
        description: 'Stop the daemon (sessions stay alive)',
        usage: 'happy daemon stop',
        examples: ['happy daemon stop']
      },
      {
        name: 'status',
        description: 'Show daemon status and health information',
        usage: 'happy daemon status',
        examples: ['happy daemon status']
      },
      {
        name: 'list',
        description: 'List all active sessions managed by daemon',
        usage: 'happy daemon list',
        examples: ['happy daemon list']
      },
      {
        name: 'stop-session',
        description: 'Stop a specific session by ID',
        usage: 'happy daemon stop-session [sessionId]',
        examples: ['happy daemon stop-session abc123']
      },
      {
        name: 'logs',
        description: 'Show path to latest daemon log file',
        usage: 'happy daemon logs',
        examples: ['happy daemon logs']
      },
      {
        name: 'install',
        description: 'Install daemon as system service',
        usage: 'happy daemon install',
        examples: ['happy daemon install']
      },
      {
        name: 'uninstall',
        description: 'Uninstall daemon system service',
        usage: 'happy daemon uninstall',
        examples: ['happy daemon uninstall']
      }
    ]
  },
  {
    name: 'auth',
    description: 'Authentication management for Claude and Codex',
    usage: 'happy auth [subcommand]',
    examples: [
      'happy auth login',
      'happy auth logout',
      'happy auth status'
    ],
    subcommands: [
      {
        name: 'login',
        description: 'Authenticate with Happy service',
        usage: 'happy auth login',
        examples: ['happy auth login']
      },
      {
        name: 'logout',
        description: 'Logout and clear credentials',
        usage: 'happy auth logout',
        examples: ['happy auth logout']
      },
      {
        name: 'status',
        description: 'Show authentication status',
        usage: 'happy auth status',
        examples: ['happy auth status']
      }
    ]
  },
  {
    name: 'connect',
    description: 'Connect and configure AI model providers',
    usage: 'happy connect [provider]',
    examples: [
      'happy connect claude',
      'happy connect codex',
      'happy connect gemini'
    ],
    subcommands: [
      {
        name: 'claude',
        description: 'Connect to Claude AI',
        usage: 'happy connect claude',
        examples: ['happy connect claude']
      },
      {
        name: 'codex',
        description: 'Connect to GPT-5 Codex',
        usage: 'happy connect codex',
        examples: ['happy connect codex']
      },
      {
        name: 'gemini',
        description: 'Connect to Google Gemini',
        usage: 'happy connect gemini',
        examples: ['happy connect gemini']
      }
    ]
  },
  {
    name: 'codex',
    description: 'Start GPT-5 Codex interactive session',
    usage: 'happy codex [--started-by daemon|terminal]',
    examples: [
      'happy codex',
      'happy codex --started-by daemon'
    ]
  },
  {
    name: 'doctor',
    description: 'Diagnose and fix Happy CLI issues',
    usage: 'happy doctor [subcommand]',
    examples: [
      'happy doctor',
      'happy doctor clean'
    ],
    subcommands: [
      {
        name: 'clean',
        description: 'Clean up runaway happy processes',
        usage: 'happy doctor clean',
        examples: ['happy doctor clean']
      }
    ]
  },
  {
    name: 'notify',
    description: 'Send system notifications',
    usage: 'happy notify [message]',
    examples: ['happy notify "Task complete"']
  },
  {
    name: 'logout',
    description: 'Logout (deprecated, use "happy auth logout")',
    usage: 'happy logout',
    examples: ['happy logout']
  },
  {
    name: 'claude',
    description: 'Start Claude interactive session (default command)',
    usage: 'happy [claude] [options]',
    examples: [
      'happy',
      'happy claude',
      'happy --model sonnet'
    ]
  }
];

/**
 * Get all commands in a flat structure
 */
export function getAllCommands(): CommandMetadata[] {
  return COMMAND_REGISTRY;
}

/**
 * Get command by name
 */
export function getCommand(name: string): CommandMetadata | undefined {
  return COMMAND_REGISTRY.find(cmd => cmd.name === name);
}

/**
 * Get all subcommands for a command
 */
export function getSubcommands(commandName: string): CommandMetadata[] {
  const command = getCommand(commandName);
  return command?.subcommands || [];
}

/**
 * Search commands by keyword
 */
export function searchCommands(keyword: string): CommandMetadata[] {
  const lowerKeyword = keyword.toLowerCase();
  const results: CommandMetadata[] = [];

  for (const cmd of COMMAND_REGISTRY) {
    if (cmd.name.toLowerCase().includes(lowerKeyword) ||
        cmd.description.toLowerCase().includes(lowerKeyword)) {
      results.push(cmd);
    }

    // Search subcommands
    if (cmd.subcommands) {
      for (const subcmd of cmd.subcommands) {
        if (subcmd.name.toLowerCase().includes(lowerKeyword) ||
            subcmd.description.toLowerCase().includes(lowerKeyword)) {
          results.push({
            ...subcmd,
            name: `${cmd.name} ${subcmd.name}`
          });
        }
      }
    }
  }

  return results;
}
