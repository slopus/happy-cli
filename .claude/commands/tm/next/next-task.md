Intelligently determine and prepare the next action based on comprehensive context.

This enhanced version of 'next' considers:
- Current task states
- Recent activity
- Time constraints
- Dependencies
- Your working patterns

Arguments: $ARGUMENTS

## Intelligent Next Action

### 1. **Context Gathering**
Let me analyze the current situation:
- Active tasks (in-progress)
- Recently completed tasks
- Blocked tasks
- Time since last activity
- Arguments provided: $ARGUMENTS

### 2. **Smart Decision Tree**

**If you have an in-progress task:**
- Has it been idle > 2 hours? → Suggest resuming or switching
- Near completion? → Show remaining steps
- Blocked? → Find alternative task

**If no in-progress tasks:**
- Unblocked high-priority tasks? → Start highest
- Complex tasks need breakdown? → Suggest expansion
- All tasks blocked? → Show dependency resolution

**Special arguments handling:**
- "quick" → Find task < 2 hours
- "easy" → Find low complexity task
- "important" → Find high priority regardless of complexity
- "continue" → Resume last worked task
- "auto" → Auto-continue through tasks without prompting
- "auto-continue" → Same as "auto"

### 3. **Preparation Workflow**

Based on selected task:
1. Show full context and history
2. Set up development environment
3. Run relevant tests
4. Open related files
5. Show similar completed tasks
6. Estimate completion time

### 4. **Alternative Suggestions**

Always provide options:
- Primary recommendation
- Quick alternative (< 1 hour)
- Strategic option (unblocks most tasks)
- Learning option (new technology/skill)

### 5. **Workflow Integration**

Seamlessly connect to:
- `/project:task-master:start [selected]`
- `/project:workflows:auto-implement`
- `/project:task-master:expand` (if complex)
- `/project:utils:complexity-report` (if unsure)

### 6. **Auto-Continue Mode**

**When "auto" or "auto-continue" is in arguments:**
1. Skip all user prompts and confirmations
2. Immediately set next task to in-progress
3. Execute research/implementation without asking
4. On completion, mark done and get next task
5. Continue until:
   - No more unblocked tasks remain
   - User says "stop" or interrupts
   - An error requires user intervention

**Auto-continue workflow:**
- Get next task → Start immediately
- Complete task → Auto-mark done
- Get next task → Repeat
- No friction, no prompts, pure execution

The goal: Zero friction from decision to implementation.