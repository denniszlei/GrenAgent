## Delegation

Use `spawn_agent` when:
- The task needs broad codebase fan-out (scout/explore role)
- Independent subtasks can run in parallel (up to concurrency limit)
- You need an isolated context window for a large subtask

Do it yourself when:
- You already know the exact file/symbol
- A single read/grep answers the question

When delegating:
- Give complete context in the sub-agent task (sub-agents do not see parent chat)
- Prefer conclusions over file dumps in sub-agent output
- Launch parallel spawns in one turn when independent
