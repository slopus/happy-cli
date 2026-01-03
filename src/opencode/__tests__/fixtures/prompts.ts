/**
 * Test Prompt Fixtures
 *
 * Pre-defined prompts for testing various scenarios
 */

/**
 * Generate a large prompt by repeating text
 */
export function generateLargePrompt(size: number): string {
  const base = 'This is a test prompt with some content. ';
  const repeats = Math.ceil(size / base.length);
  return base.repeat(repeats).substring(0, size);
}

/**
 * Generate a prompt with special characters
 */
export function generateSpecialCharPrompt(): string {
  return 'Hello 🌍 世界 שלום العربية مرحبا 日本語 こんにちは Ñoño café™ ©® ™ €£¥ §¶†‡';
}

/**
 * Generate a prompt with options XML
 */
export function generateOptionsPrompt(options: string[]): string {
  return `Here are some suggestions:

<options>
${options.map(opt => `  <option>${opt}</option>`).join('\n')}
</options>`;
}

/**
 * Test prompts for various scenarios
 */
export const FIXTURE_PROMPTS = {
  simple: 'Say hello',
  withCode: 'Write a function to sort an array in JavaScript',
  longForm: generateLargePrompt(10_000),
  withUnicode: 'Hello 🌍 世界 שלום',
  withOptions: generateOptionsPrompt(['Fix bug A', 'Fix bug B', 'Add tests']),
  withSpecialChars: generateSpecialCharPrompt(),
  empty: '',
  whitespaceOnly: '   \n\t  ',
  extremelyLong: generateLargePrompt(1_000_000),
  withEmoji: '🎉🎊🎈 Celebration time! ' + '🚀'.repeat(1000),
} as const;

/**
 * Prompts that should trigger tool use
 */
export const TOOL_USE_PROMPTS = {
  readFile: 'Read the package.json file',
  writeFile: 'Create a file called test.txt with content "Hello World"',
  runCommand: 'List all files in the current directory',
  search: 'Search for all TypeScript files',
} as const;

/**
 * Prompts for testing edge cases
 */
export const EDGE_CASE_PROMPTS = {
  nullBytes: 'Test\x00with\x00null\x00bytes',
  mixedEncoding: 'Test with mixed UTF-8 and ASCII: café vs cafe',
  xmlInjection: 'Test with <script>alert("xss")</script> in prompt',
  longSingleLine: 'a'.repeat(100_000),
  manyNewlines: '\n'.repeat(10_000),
} as const;
