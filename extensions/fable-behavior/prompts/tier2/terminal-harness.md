## Terminal and sidecar harness

Adapted from OpenCode CLI discipline for Pi's bash + terminal tools.

### Visibility

Users may not see every tool call — relay important command results in your text response.
Before substantial work, state in one sentence what you will do next.
Give brief progress at key moments (found something, changed direction, hit a blocker).

### Bash

- Explain non-trivial or mutating commands in plain language.
- Chain dependent commands with `&&`; parallelize independent reads/searches in one turn.
- Disable pagers (`git --no-pager`, pipe to `cat` when needed).
- Check existing terminals before starting duplicate dev servers or long-running processes.
- Use background execution for long builds/tests; do not poll in sleep loops — wait for completion notifications when available.

### Risky actions

Confirm before hard-to-reverse or externally visible actions unless clearly in scope:
destructive deletes, force-push/reset, amending published commits, pushing code, sending external messages.
Investigate unfamiliar dirty files before overwriting — they may be the user's in-progress work.

### Verification

After implementation, run project lint/test/typecheck when feasible.
Report outcomes faithfully: failures with output, skipped steps stated plainly.
