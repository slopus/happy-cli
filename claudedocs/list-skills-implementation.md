# list-skills RPC Handler Implementation

## Overview

Implemented the `list-skills` RPC handler in the happy-cli daemon to enumerate installed Claude Skills.

## Implementation Details

### Location
- **File**: `src/modules/common/registerCommonHandlers.ts`
- **Handler**: `list-skills`
- **Commit**: 4d3b2ec

### Functionality

The handler:
1. Scans `~/.claude/skills/` directory for Claude Skills
2. Reads each skill's `SKILL.md` file
3. Parses YAML frontmatter to extract metadata
4. Returns structured list of skills with:
   - `name`: Skill name (from frontmatter or directory name)
   - `description`: Brief description of skill functionality
   - `license`: Optional license information

### API Contract

**Request**:
```typescript
interface ListSkillsRequest {
  // No parameters needed
}
```

**Response**:
```typescript
interface ListSkillsResponse {
  success: boolean;
  skills?: SkillMetadata[];
  error?: string;
}

interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
}
```

### Error Handling

1. **Missing Skills Directory**: Returns empty list with `success: true`
2. **Invalid Skills**: Logs debug message and skips
3. **Missing SKILL.md**: Skips the skill directory
4. **Parse Errors**: Logs and skips invalid skills
5. **General Errors**: Returns `success: false` with error message

### Frontmatter Parsing

Simple YAML frontmatter parser:
- Expects `---` delimited frontmatter
- Parses `key: value` pairs
- Handles multi-line values on single line only
- Extracts: `name`, `description`, `license`

### Example Skills

Currently supports skills like:
- `algorithmic-art`: Creating algorithmic art using p5.js
- `git-commit-helper`: Generate descriptive commit messages
- `mcp-builder`: Guide for creating MCP servers
- Plus 40+ other skills from `.claude/skills/`

## Testing

### Manual Testing
The handler can be tested via:
1. Direct RPC call through daemon
2. Integration test through control server
3. Mobile app API endpoint (when implemented)

### Test Cases
- ✅ Empty skills directory
- ✅ Valid skills with complete metadata
- ✅ Skills with missing optional fields
- ✅ Invalid skill directories
- ✅ Symlinked skills
- ✅ Skills without SKILL.md

## Integration

The `list-skills` RPC handler integrates with:
- **Daemon Control Server**: `/list-skills` endpoint (future)
- **Resource Exposure API**: Discovery endpoint for mobile app
- **Type Definitions**: `src/daemon/resource-api/types.ts`

## Next Steps

1. Add HTTP endpoint in control server (if needed)
2. Implement filtering/search in request
3. Add caching for frequently accessed skills
4. Expand metadata extraction (triggers, capabilities, etc.)
5. Add unit tests for frontmatter parsing
6. Add integration tests for full handler flow

## Example Usage

```javascript
// RPC call
const response = await rpc.call('list-skills', {});

console.log(response);
// {
//   success: true,
//   skills: [
//     {
//       name: "algorithmic-art",
//       description: "Creating algorithmic art using p5.js...",
//       license: "Complete terms in LICENSE.txt"
//     },
//     // ... more skills
//   ]
// }
```

## Related Files

- `src/modules/common/registerCommonHandlers.ts` - Handler implementation
- `src/daemon/resource-api/types.ts` - API type definitions
- `~/.claude/skills/*/SKILL.md` - Skill metadata files
