# Fable Behavior Fusion — System Prompt Layer

- Date: 2026-06-20
- Status: approved, implementing
- Sources: `CLAUDE-FABLE-5-full.md`, [asgeirtj/system_prompts_leaks](https://github.com/asgeirtj/system_prompts_leaks) (Claude Code, Cursor, Copilot, Codex, OpenCode)
- Delivery: extension `extensions/fable-behavior/` with Tier C priority injection

## Goal

Distill general behavioral DNA (Fable 5) plus coding-agent harness rules (leaks repo) into a modular English prompt layer for Pi/GrenAgent, without forking `buildSystemPrompt`.

## Architecture

```
buildSystemPrompt()           # unchanged
  -> fable-behavior extension
       Tier-1  before_agent_start (every turn)
       Tier-2  before_agent_start (compressed, every turn when enabled)
       Mode    ask/plan/debug slices from session agent-mode entry
       Tier-3  one-line summaries appended when FABLE_BEHAVIOR_TIER3_GUIDELINES=1
  -> existing extensions (diagram-hint, safety, agent-mode, ...)
```

## Config

| Key | Default | Meaning |
|-----|---------|---------|
| `FABLE_BEHAVIOR` | `1` | Master switch |
| `FABLE_BEHAVIOR_TIER2` | `1` | Include Tier-2 modules |
| `FABLE_BEHAVIOR_TIER3_GUIDELINES` | `1` | Append Tier-3 summary block |
| `FABLE_BEHAVIOR_SEED_AGENTS` | `1` | Seed enriched sub-agent templates if absent |

## Module map

### Tier-1 (every turn)

| File | Source |
|------|--------|
| `identity.md` | Pi identity (not Anthropic product copy) |
| `tone.md` | Fable tone_and_formatting |
| `mistakes.md` | Fable responding_to_mistakes |
| `file-verify.md` | Fable file-presence check |
| `coding-harness.md` | Claude Code harness + Cursor tool_calling |
| `autonomy.md` | Codex GPT-5.5 autonomy |

### Tier-2 (compressed every turn)

| File | Source |
|------|--------|
| `tool-discipline.md` | Cursor + Claude grep-tool + Copilot priority |
| `grep-strategy.md` | Claude Code grep-tool (output modes, regex, filter) |
| `refusal.md` | Fable refusal_handling (malware etc.) |
| `skills-first.md` | Fable computer_use/skills + Pi skills |
| `file-workflow.md` | Fable file_creation + Cursor read-before-edit |
| `conventions-first.md` | OpenCode core mandates |
| `git-hygiene.md` | Codex dirty worktree + Cursor git |
| `editing-constraints.md` | Codex auto-review editing constraints |
| `delegation.md` | Claude Code Agent + Copilot explore/manager mode |
| `terminal-harness.md` | OpenCode CLI visibility, bash, risky-action gates |
| `knowledge-search-triggers.md` | Fable knowledge_cutoff triggers |

### Tier-3 (summaries / sub-agent bodies)

`search-full.md`, `copyright.md`, `wellbeing.md`, `evenhandedness.md`, `citing-code.md`, `frontend-design.md`

### Mode slices

| Mode | Extra |
|------|-------|
| ask | search tier-3 summary |
| plan | explore-first reminder (also in enhanced PLAN_PROMPT) |
| debug | verification loop reminder |
| agent | none |

## Boundaries

- Complements `diagram-hint`, `safety`, `loop-guard`, `agent-mode` — does not replace.
- Excludes: Anthropic product ads, artifact storage API, tool JSON schemas, browser GIF rules.
- Sub-agent seed: skip if `~/.pi/agent/agents/<name>.md` already exists.

## Tests

- `loader.test.ts`: module assembly, mode slices, empty when disabled
- Smoke: `FABLE_BEHAVIOR=1` yields non-empty `before_agent_start` message
