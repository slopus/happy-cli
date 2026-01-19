/**
 * Export command for Happy CLI
 *
 * Exports archived sessions from Happy server to markdown files.
 * Uses the user's backup key to decrypt session data and messages,
 * then formats them as readable markdown documents.
 *
 * Features:
 * - Incremental export: tracks exported sessions to avoid re-processing
 * - Decrypts session metadata and messages using backup key derivation
 * - Generates markdown files with session info and conversation history
 */

import chalk from 'chalk';
import fs from 'node:fs';
import https from 'node:https';
import { parseBackupKey } from '@/utils/backupKey';
import { deriveKey } from '@/utils/deriveKey';
import { decryptBox, decryptWithDataKey, libsodiumKeyPairFromSeed, decodeBase64, encodeBase64 } from '@/api/encryption';
import { readCredentials } from '@/persistence';
import { configuration } from '@/configuration';

const OUTPUT_DIR = './happy-session-exports';
const STATUS_FILE = `${OUTPUT_DIR}/export-status.md`;

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  dataEncryptionKey?: string;
  metadata?: string;
}

interface Message {
  seq: number;
  createdAt: string;
  content: {
    t?: string;
    c?: string;
  };
}

interface ExportedSession {
  id: string;
  date: string;
  summary: string;
  messages: number | string;
  size: string;
}

function fetchJSON<T>(url: string, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    };

    https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON response: ${e instanceof Error ? e.message : 'Unknown error'}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject).end();
  });
}

function loadExportStatus(): Map<string, boolean> {
  if (!fs.existsSync(STATUS_FILE)) {
    return new Map();
  }

  const content = fs.readFileSync(STATUS_FILE, 'utf8');
  const status = new Map<string, boolean>();

  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\| ([a-z0-9]+) \|/);
    if (match && match[1] !== 'Session ID') {
      status.set(match[1], true);
    }
  }

  return status;
}

function saveExportStatus(sessions: ExportedSession[]): void {
  let content = '# Happy Session Export Status\n\n';
  content += `Last updated: ${new Date().toISOString()}\n\n`;
  content += `Total exported: ${sessions.length} sessions\n\n`;
  content += '| Session ID | Date | Summary | Messages | Size |\n';
  content += '|------------|------|---------|----------|------|\n';

  for (const s of sessions) {
    content += `| ${s.id} | ${s.date} | ${s.summary} | ${s.messages} | ${s.size} |\n`;
  }

  fs.writeFileSync(STATUS_FILE, content);
}

/** Content block type handlers for extracting text from various message formats */
const contentBlockHandlers: Record<string, (block: Record<string, unknown>) => string> = {
  text: (block) => (block.text as string) || '',
  tool_use: (block) => `> **Tool:** ${block.name}`,
  tool_result: () => '> Tool result',
};

function extractFromContent(content: unknown): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map(block => contentBlockHandlers[block.type]?.(block) ?? '')
      .filter(Boolean)
      .join('\n\n');
  }

  if (content && typeof content === 'object') {
    const obj = content as Record<string, unknown>;
    return contentBlockHandlers[obj.type as string]?.(obj) ?? (obj.text as string) ?? '';
  }

  return '';
}

/** Extracts readable text from decrypted message based on role and content type */
function extractText(dec: Record<string, unknown>): string {
  const content = dec.content as Record<string, unknown> | undefined;

  // User messages: direct content extraction
  if (dec.role === 'user') {
    return content ? extractFromContent(content) : '';
  }

  // Agent messages: handle output and event types
  if (dec.role === 'agent' && content) {
    const data = content.data as Record<string, unknown> | undefined;

    switch (content.type) {
      case 'output': {
        const dataType = data?.type as string;
        if (dataType === 'assistant' || dataType === 'user') {
          const message = data?.message as Record<string, unknown> | undefined;
          return message?.content ? extractFromContent(message.content) : '';
        }
        if (dataType === 'summary') {
          return (data?.summary as string) || '';
        }
        break;
      }
      case 'event': {
        const eventType = data?.type as string;
        if (eventType === 'message') return (data?.message as string) || '';
        if (eventType === 'switch') return `> Mode: ${data?.mode}`;
        break;
      }
    }
  }

  // Fallback: try direct content or nested message
  if (dec.content) return extractFromContent(dec.content);
  const message = dec.message as Record<string, unknown> | undefined;
  return message?.content ? extractFromContent(message.content) : '';
}

export async function handleExportCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    showExportHelp();
    return;
  }

  // Get backup key from argument or environment
  let backupKey = args[0] || process.env.HAPPY_BACKUP_KEY;

  if (!backupKey) {
    console.error(chalk.red('Error: No backup key provided.'));
    console.error('');
    showExportHelp();
    process.exit(1);
  }

  // Parse backup key
  let masterSecret: Uint8Array;
  try {
    masterSecret = parseBackupKey(backupKey);
  } catch (error) {
    console.error(chalk.red('Error: Invalid backup key format'));
    process.exit(1);
  }

  // Get credentials for API access
  const credentials = await readCredentials();
  if (!credentials?.token) {
    console.error(chalk.red('Error: Not authenticated. Run "happy auth login" first.'));
    process.exit(1);
  }

  // Derive content keypair from backup key
  const contentDataKey = await deriveKey(masterSecret, 'Happy EnCoder', ['content']);
  const contentKeyPair = libsodiumKeyPairFromSeed(contentDataKey);

  // Fetch sessions
  const serverUrl = configuration.serverUrl;
  const { sessions } = await fetchJSON<{ sessions: Session[] }>(
    `${serverUrl}/v1/sessions`,
    credentials.token
  );

  const archived = sessions.filter(s => s.active === false);
  console.log('Archived sessions:', archived.length);

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Load existing export status
  const existingStatus = loadExportStatus();
  const alreadyExported = archived.filter(s => existingStatus.has(s.id));
  const toExport = archived.filter(s => !existingStatus.has(s.id));

  console.log(`Already exported: ${alreadyExported.length}`);
  console.log(`New to export: ${toExport.length}`);
  console.log('');

  if (toExport.length === 0) {
    console.log('No new sessions to export.');
    return;
  }

  // Track all exported sessions
  const exportedSessions: ExportedSession[] = [];

  // Add existing sessions to tracking
  for (const s of alreadyExported) {
    const date = new Date(s.createdAt).toISOString().split('T')[0];
    const filename = `${OUTPUT_DIR}/${date}-${s.id.substring(0, 10)}.md`;
    if (fs.existsSync(filename)) {
      const stat = fs.statSync(filename);
      exportedSessions.push({
        id: s.id,
        date,
        summary: '(previously exported)',
        messages: '-',
        size: `${Math.round(stat.size / 1024)} KB`
      });
    }
  }

  let exported = 0;
  let failed = 0;

  for (let i = 0; i < toExport.length; i++) {
    const session = toExport[i];
    const progress = `[${i + 1}/${toExport.length}]`;

    if (!session.dataEncryptionKey) {
      console.log(`${progress} Skipping ${session.id.substring(0, 10)}... (no encryption key)`);
      failed++;
      continue;
    }

    const encryptedKey = decodeBase64(session.dataEncryptionKey);
    const bundle = encryptedKey.slice(1); // Skip version byte
    const unwrappedKey = decryptBox(bundle, contentKeyPair.secretKey);

    if (!unwrappedKey) {
      console.log(`${progress} Skipping ${session.id.substring(0, 10)}... (key unwrap failed)`);
      failed++;
      continue;
    }

    try {
      // Decrypt metadata
      let metadata: Record<string, unknown> | null = null;
      if (session.metadata) {
        const metadataBytes = decodeBase64(session.metadata);
        metadata = decryptWithDataKey(metadataBytes, unwrappedKey);
      }

      // Fetch messages
      const { messages } = await fetchJSON<{ messages: Message[] }>(
        `${serverUrl}/v1/sessions/${session.id}/messages`,
        credentials.token
      );

      // Build markdown
      let markdown = '# Session Export\n\n';
      markdown += '| Property | Value |\n|----------|-------|\n';
      markdown += `| Session ID | ${session.id} |\n`;
      markdown += `| Created | ${new Date(session.createdAt).toISOString()} |\n`;
      markdown += `| Updated | ${new Date(session.updatedAt).toISOString()} |\n`;
      markdown += `| Host | ${(metadata?.host as string) || 'N/A'} |\n`;
      markdown += `| Path | ${(metadata?.path as string) || 'N/A'} |\n`;
      const metadataSummary = metadata?.summary as Record<string, unknown> | undefined;
      if (metadataSummary?.text) {
        markdown += `| Summary | ${metadataSummary.text} |\n`;
      }
      markdown += '\n---\n\n';

      // Sort and decrypt messages
      const sorted = messages.sort((a, b) => a.seq - b.seq);
      let decryptedCount = 0;

      for (const msg of sorted) {
        if (msg.content?.t === 'encrypted' && msg.content?.c) {
          const enc = decodeBase64(msg.content.c);
          const dec = decryptWithDataKey(enc, unwrappedKey);
          if (dec) {
            decryptedCount++;
            const role = (dec.role || dec.type || 'unknown');
            const time = new Date(msg.createdAt).toLocaleTimeString();
            const content = extractText(dec);

            if (role === 'user') {
              markdown += `## User (${time})\n\n${content}\n\n---\n\n`;
            } else {
              markdown += `## Claude (${time})\n\n${content}\n\n---\n\n`;
            }
          }
        }
      }

      // Write to file
      const date = new Date(session.createdAt).toISOString().split('T')[0];
      const filename = `${OUTPUT_DIR}/${date}-${session.id.substring(0, 10)}.md`;
      fs.writeFileSync(filename, markdown);

      const summary = (metadataSummary?.text as string) || (metadata?.path as string) || 'No summary';
      const shortSummary = summary.length > 40 ? summary.substring(0, 40) + '...' : summary;
      const sizeKB = Math.round(markdown.length / 1024);

      exportedSessions.push({
        id: session.id,
        date,
        summary: shortSummary.replace(/\|/g, '\\|'),
        messages: decryptedCount,
        size: `${sizeKB} KB`
      });

      console.log(`${progress} Exported: ${date} - ${shortSummary} (${decryptedCount} msgs, ${sizeKB} KB)`);
      exported++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.log(`${progress} Error on ${session.id.substring(0, 10)}...: ${errorMessage}`);
      failed++;
    }
  }

  // Save export status
  saveExportStatus(exportedSessions);

  console.log('');
  console.log('=== Export Complete ===');
  console.log(`Exported: ${exported} new sessions`);
  console.log(`Previously exported: ${alreadyExported.length} sessions`);
  console.log(`Failed: ${failed} sessions`);
  console.log(`Total: ${exportedSessions.length} sessions`);
  console.log(`Output: ${OUTPUT_DIR}/`);
  console.log(`Status: ${STATUS_FILE}`);
}

function showExportHelp(): void {
  console.log(`
${chalk.bold('happy export')} - Export archived sessions to markdown files

${chalk.bold('Usage:')}
  happy export <backup-key>     Export sessions using the provided backup key
  happy export help             Show this help message

${chalk.bold('Environment Variables:')}
  HAPPY_BACKUP_KEY              Backup key (alternative to command line argument)

${chalk.bold('Description:')}
  Exports all archived sessions from Happy server to markdown files.
  Each session is saved as a separate .md file in ./happy-session-exports/

  The backup key can be found in your Happy mobile app settings.
  Format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XX

${chalk.bold('Output:')}
  ./happy-session-exports/YYYY-MM-DD-<session-id>.md
  ./happy-session-exports/export-status.md (tracks exported sessions)

${chalk.bold('Examples:')}
  happy export "7CPWT-AOYEW-OMBEN-2BW5G-..."
  HAPPY_BACKUP_KEY="7CPWT-..." happy export
`);
}
