# Happy CLI - Code Style & Conventions

## TypeScript Style

### Strict Typing
- **NO untyped code** - "I despise untyped code" (from CLAUDE.md)
- Explicit parameter and return types required
- Clean function signatures with full type annotations
- Comprehensive type definitions in dedicated `types.ts` files

### Class vs Functions
- **Prefer functions over classes** - "As little as possible classes"
- Use classes only when necessary (e.g., API clients, stateful managers)
- Functional programming patterns preferred

### Imports
- **Use `@/` alias** for src imports: `import { logger } from '@/ui/logger'`
- **ALL imports at top of file** - NEVER import mid-code
- Named exports preferred over default exports
- File extensions: `.ts` for TypeScript files

### Documentation
- **Comprehensive JSDoc comments** on each file explaining responsibilities
- Each file includes header comments with purpose
- Function documentation with parameter and return descriptions
- Example:
  ```typescript
  /**
   * Main query implementation for Claude Code SDK
   * Handles spawning Claude process and managing message streams
   */
  ```

### Error Handling
- Graceful error handling with proper error messages
- Use try-catch blocks with specific error logging
- Abort controllers for cancellable operations
- Careful handling of process lifecycle and cleanup
- File-based logging to avoid disturbing Claude sessions

### Code Organization
- One primary responsibility per file
- Related functionality grouped in directories
- Clear separation of concerns (API, UI, Claude integration, utils)
- Avoid deep nesting - prefer early returns

## Anti-Patterns to AVOID

### DO NOT:
1. **Create stupid small functions/getters/setters** - Keep functions meaningful
2. **Excessive `if` statements** - Avoid control flow changes with better design
3. **Import modules mid-code** - ALL imports must be at top
4. **Untyped code** - Everything must have explicit types
5. **Deep nesting** - Prefer flat, readable code with early returns

## Naming Conventions
- **camelCase** for variables and functions
- **PascalCase** for types, interfaces, classes
- **UPPER_SNAKE_CASE** for constants
- Descriptive names that convey purpose
- Avoid abbreviations unless commonly understood

## File Structure
```typescript
/**
 * File header explaining purpose
 */

// Imports (all at top)
import { x } from '@/path'

// Types
export interface MyType {
    field: string
}

// Constants
const MY_CONSTANT = 'value'

// Main implementation
export function myFunction(param: string): ReturnType {
    // Implementation
}
```

## Testing Conventions
- Unit tests using **Vitest**
- **No mocking** - tests make real API calls
- Test files colocated with source: `.test.ts` suffix
- Descriptive test names
- Proper async handling with async/await
- Run with: `yarn test`

## Logging
- All debugging through **file logs** (never console during Claude sessions)
- Console output only for user-facing messages
- Use `logger.debug()`, `logger.info()`, etc. from `@/ui/logger`
- Special handling for large JSON with `logger.debugLargeJson()`
- Logs stored in `~/.happy-dev/logs/` or `$HAPPY_HOME_DIR/logs/`
