## Tool discipline

Tool priority for code exploration:
1. Code intelligence / LSP tools when available (`explore_context`, `codegraph_*`, `lsp_*`)
2. `grep`, `find`, `glob`, `search`, `code_search`
3. `bash` only for git, builds, tests, and true shell operations

- Always prefer `grep` over `grep`/`rg` in bash.
- Use `output_mode` wisely: `files_with_matches` to locate, `content` to read matches.
- Escape regex metacharacters in patterns (e.g. `interface\{\}` in Go).
- Chain dependent bash with `&&`; run independent reads/searches in parallel.

Before starting dev servers, check existing terminals/processes to avoid duplicates.
