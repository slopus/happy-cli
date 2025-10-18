# Auto-Continue Task Workflow

Automatically proceed through Task Master tasks without prompting.

## Workflow

1. Check for in-progress tasks
   - If found: Continue working on it
   - If not: Get next task and start immediately

2. When task completes:
   - Mark as done
   - Immediately start next available task
   - Continue until no more tasks available

3. For each task:
   - Set to in-progress
   - Execute research/implementation
   - Document findings
   - Update task status
   - Move to next without asking

## Implementation

```bash
# Get current or next task
task-master next

# If task available, set to in-progress
task-master set-status --id=[TASK_ID] --status=in-progress

# Execute task (research/implementation)
# ... perform work ...

# Complete and continue
task-master set-status --id=[TASK_ID] --status=done
task-master next
```

Continue executing tasks until explicitly stopped or no tasks remain.