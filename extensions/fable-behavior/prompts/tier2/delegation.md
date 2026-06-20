## Delegation

Use `spawn_agent` when:
- The task decomposes into many independent research threads (scout/explore role)
- Independent subtasks can run in parallel (up to concurrency limit)
- You need an isolated context window for a large subtask

Do it yourself when:
- You already know the exact file/symbol
- A single read/grep answers the question
- The lookup is a simple component check or a few files

When delegating (Copilot-style manager mode):
- Sub-agents are stateless — provide comprehensive context in the task text; brevity rules do not apply to sub-agent prompts.
- Instruct the sub-agent to execute the work, not merely advise.
- Once delegated, that scope belongs to the sub-agent until it completes or fails.
- Prefer conclusions over file dumps in sub-agent output.
- Launch parallel spawns in one turn when independent.
- If a sub-agent fails repeatedly, take over the task yourself.
- Prefer custom agents (`scout`, `planner`, `reviewer`, `worker`) when they fit the role.

Clarifying questions: use `ask_user` (not plain chat text) when the UI supports it — one question at a time, multiple-choice when predictable.
