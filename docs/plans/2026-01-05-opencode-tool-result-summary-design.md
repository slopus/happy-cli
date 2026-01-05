# OpenCode Tool Result Summary Design

**Goal:** Show compact, single-line summaries for OpenCode tool results in the mobile app instead of raw JSON.

## Background
OpenCode ACP tool results are forwarded from `src/opencode/runOpenCode.ts` as `tool-call-result` messages with `output: msg.result`. The mobile app renders that output directly, so users see raw JSON for tools like search/read/write.

## Scope
- OpenCode only.
- No mobile app changes.
- No schema changes; keep `tool-call-result` and only modify the output content.
- Keep raw output in logs for debugging.

## Proposed Change
Add a formatter in `src/opencode/runOpenCode.ts`:
- `formatToolResultSummary(toolName: string, result: unknown): string`
- Use the summary for both the CLI `messageBuffer` result line and the mobile `tool-call-result` output.

## Formatting Rules
- Normalize whitespace to single spaces and cap to 160 chars.
- If `result` is a string: return truncated string.
- If `result` has `error`/`message`/`status: 'error'`: return `Error: <message>`.
- If `result` has `path` or `file`:
  - read: `Read <path> (<n> chars)` when content length is known.
  - write/edit: `Wrote <path>` or `Updated <path>`.
- If `result` has `matches`/`count`/`files`: `Found <n> matches in <m> files`.
- If `result` has `stdout`/`stderr`: `Completed <toolName>`; append short stderr only if no explicit error.
- Fallback: `Completed <toolName>`.

## Data Flow
`AcpSdkBackend` emits `tool-result` -> `runOpenCode` formats summary ->
- CLI: `messageBuffer.addMessage(summary, 'result')`
- Mobile: `session.sendCodexMessage({ type: 'tool-call-result', output: summary })`

## Testing
- Add OpenCode integration tests in `src/opencode/__tests__/integration/acp/acpFeatures.test.ts`:
  - tool result with `path` and `content` yields a summary string (no JSON braces).
  - tool result with `matches/files` yields a count summary.
  - tool result with `error` yields `Error: ...`.
- Run `npx vitest run src/opencode/__tests__/integration/acp/acpFeatures.test.ts`.

## Risks and Mitigations
- Risk: summary hides details.
  - Mitigation: keep raw output in logs, use clear status words.
