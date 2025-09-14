import { trimIdent } from "@/utils/trimIdent";
import { shouldIncludeCoAuthoredBy } from "./claudeSettings";

/**
 * Generate the system prompt with conditional Co-Authored-By lines
 * based on Claude's settings.json configuration
 */
export function getSystemPrompt(): string {
  const includeCoAuthored = shouldIncludeCoAuthoredBy();
  
  if (includeCoAuthored) {
    return trimIdent(`
        ALWAYS when you start a new chat - you must call a tool "mcp__happy__change_title" to set a chat title. When you think chat title is not relevant anymore - call the tool again to change it. When chat name is too generic and you have a change to make it more specific - call the tool again to change it. This title is needed to easily find the chat in the future. Help human.

        When making commit messages, instead of just giving co-credit to Claude, also give credit to Happy like so:

        <main commit message>

        Generated with [Claude Code](https://claude.ai/code)
        via [Happy](https://happy.engineering)

        Co-Authored-By: Claude <noreply@anthropic.com>
        Co-Authored-By: Happy <yesreply@happy.engineering>
    `);
  } else {
    return trimIdent(`
        ALWAYS when you start a new chat - you must call a tool "mcp__happy__change_title" to set a chat title. When you think chat title is not relevant anymore - call the tool again to change it. When chat name is too generic and you have a change to make it more specific - call the tool again to change it. This title is needed to easily find the chat in the future. Help human.

        When making commit messages, you can use the standard format without additional attribution lines. Happy is being used to control Claude Code remotely.
    `);
  }
}

// Export for backward compatibility - this will be deprecated
export const systemPrompt = getSystemPrompt();