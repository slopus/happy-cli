# Slash Commands Hot-Reload Feature

## Overview

The slash commands hot-reload feature allows Happy CLI to automatically detect and update slash commands when files in the `.claude/commands` directory are added, removed, or modified - without requiring a session restart.

## How It Works

### Architecture

1. **Directory Watcher** (`startDirectoryWatcher.ts`)
   - Uses Node.js built-in `fs/promises` `watch` API
   - Monitors a directory recursively for file system changes
   - Debounces rapid changes to avoid excessive processing
   - Auto-restarts on errors for robustness

2. **Slash Commands Watcher** (`slashCommandsWatcher.ts`)
   - Wraps the directory watcher specifically for `.claude/commands`
   - Triggers metadata re-extraction when changes are detected
   - Updates session metadata with new slash command list
   - Gracefully handles missing directories

3. **Integration** (`runClaude.ts`)
   - Starts the watcher during session initialization
   - Connects watcher callbacks to session metadata updates
   - Properly cleans up watcher on session termination

### Flow

```
File change in .claude/commands/
    ↓
Directory watcher detects change (debounced)
    ↓
Slash commands watcher triggers re-scan
    ↓
extractSDKMetadata() reads all .md files
    ↓
Session metadata updated via session.updateMetadata()
    ↓
Mobile/remote clients receive updated slash command list
```

## Configuration

### Debounce Settings

The watcher uses debouncing to batch rapid file changes:

- **Directory Watcher**: 100ms default (configurable)
- **Slash Commands Watcher**: 300ms default (configurable)

This means if you save multiple files within 300ms, only one metadata update will occur.

### Customization

You can customize debounce timing when starting the watcher:

```typescript
const stopWatcher = startSlashCommandsWatcher({
    cwd: workingDirectory,
    onSlashCommandsChange: (commands) => { /* ... */ },
    debounceMs: 500  // Custom 500ms debounce
});
```

## Usage

### For Users

**No action required!** The feature works automatically once you update to a version that includes it.

1. Start a Happy CLI session normally
2. Edit, add, or remove files in `.claude/commands/`
3. Changes are detected and applied automatically
4. Your mobile/remote client will see updated slash commands immediately

### For Developers

**Starting the Watcher:**

The watcher is automatically started in `runClaude.ts` during session initialization. No manual intervention needed.

**Stopping the Watcher:**

The watcher is automatically stopped when:
- Session terminates normally
- Process receives SIGTERM/SIGINT
- Cleanup function is called

**Accessing Logs:**

All watcher activity is logged with the `[DIR_WATCHER]` and `[slashCommandsWatcher]` prefixes:

```bash
tail -f ~/.happy-dev/logs/<timestamp>-daemon.log | grep -E "DIR_WATCHER|slashCommandsWatcher"
```

## Testing

### Automated Tests

Two test suites ensure the feature works correctly:

1. **`startDirectoryWatcher.test.ts`**
   - Tests basic directory watching functionality
   - Verifies debouncing behavior
   - Tests recursive directory monitoring
   - Tests cleanup/stop functionality

2. **`slashCommandsWatcher.test.ts`**
   - Tests slash command detection
   - Tests adding/removing commands
   - Tests nested directory structures
   - Tests handling of missing directories

Run tests with:

```bash
npm run build
npx tsx --env-file .env.integration-test node_modules/.bin/vitest run src/modules/watcher/startDirectoryWatcher.test.ts
npx tsx --env-file .env.integration-test node_modules/.bin/vitest run src/claude/sdk/slashCommandsWatcher.test.ts
```

### Manual Testing

1. **Test Adding a Command:**
   ```bash
   # Start Happy CLI session
   ./bin/happy.mjs

   # In another terminal:
   echo "# New Command\nDo something" > .claude/commands/new-command.md

   # Check session metadata or mobile app - should see /new-command
   ```

2. **Test Removing a Command:**
   ```bash
   rm .claude/commands/new-command.md

   # Command should disappear from the list
   ```

3. **Test Nested Commands:**
   ```bash
   mkdir -p .claude/commands/nested/deep
   echo "# Deep Command" > .claude/commands/nested/deep/cmd.md

   # Should see /nested/deep/cmd
   ```

## Performance Considerations

### Resource Usage

- **CPU**: Minimal - only processes changes, not continuous polling
- **Memory**: Negligible - watcher uses native OS file system events
- **I/O**: Only reads `.claude/commands` directory on changes

### Scalability

The watcher scales well with:
- Large numbers of slash commands (100+ commands tested)
- Deep directory structures (10+ levels tested)
- Rapid file changes (debouncing prevents overload)

### Edge Cases Handled

1. **Missing Directory**: Watcher gracefully skips initialization if `.claude/commands` doesn't exist
2. **Directory Created Later**: If directory is created after session starts, changes won't be detected (requires restart)
3. **Watcher Errors**: Auto-restarts after 1 second delay
4. **Rapid Changes**: Debounced to single update
5. **Session Cleanup**: Properly stops watcher to prevent resource leaks

## Troubleshooting

### Slash Commands Not Updating

1. Check logs for watcher errors:
   ```bash
   tail -f ~/.happy-dev/logs/*.log | grep slashCommandsWatcher
   ```

2. Verify `.claude/commands` directory exists in your working directory

3. Check file permissions on `.claude/commands`

4. Ensure files have `.md` extension

### High CPU Usage

If you notice high CPU usage:

1. Check for file system loops (symlinks)
2. Increase debounce time in configuration
3. Check for rapid automated file changes

### Watcher Not Starting

Check logs for initialization messages:

```bash
grep "Starting watcher for" ~/.happy-dev/logs/*.log
```

If missing, the `.claude/commands` directory may not exist.

## Implementation Details

### Files Created/Modified

**New Files:**
- `src/modules/watcher/startDirectoryWatcher.ts` - Generic directory watcher
- `src/modules/watcher/startDirectoryWatcher.test.ts` - Directory watcher tests
- `src/claude/sdk/slashCommandsWatcher.ts` - Slash commands specific watcher
- `src/claude/sdk/slashCommandsWatcher.test.ts` - Slash commands watcher tests

**Modified Files:**
- `src/claude/runClaude.ts` - Integration point for watcher

### Dependencies

No new dependencies added! Uses Node.js built-in APIs:
- `fs/promises` - For file system watching
- `path` - For path manipulation
- `fs/promises` again for readdir/stat

### Type Safety

All code is fully typed with TypeScript:
- Explicit parameter types
- Return type annotations
- Proper error handling with typed errors
- JSDoc comments for all public interfaces

## Future Enhancements

Potential improvements for future versions:

1. **Watch for Directory Creation**: Detect when `.claude/commands` is created after session starts
2. **File Content Validation**: Validate markdown syntax before updating
3. **Selective Updates**: Only update changed commands instead of full rescan
4. **Performance Metrics**: Track watcher performance and alert on issues
5. **Configuration File**: Allow users to customize watcher behavior via config

## Related Documentation

- [Claude SDK Documentation](../CLAUDE.md)
- [Session Management](./sessions.md)
- [File Watchers](../src/modules/watcher/README.md)
