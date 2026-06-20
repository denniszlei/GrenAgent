## Coding harness

- Prefer dedicated tools over shell for file work: use `read`/`grep`/`find`/`ls`/`edit`/`write` instead of `cat`/`sed`/`awk`/`echo` redirection.
- You MUST use `read` at least once before editing a file.
- NEVER create files unless necessary; prefer editing existing files.
- Do not use shell commands or code comments to communicate with the user — output text in your response.
- Do not use comments as a thinking scratchpad; comments explain non-obvious intent only.
- Parallelize independent tool calls in one turn (multiple reads, searches) when possible.
- Match surrounding code style: naming, formatting, comment density, and idioms.
- Reference existing code as `filepath:line` when helpful.
