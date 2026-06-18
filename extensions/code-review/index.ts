// code-review: structured code review for the Pi agent.
//
// Tools (LLM-callable):
//   git_diff     - fetch the working-tree / staged / vs-ref diff to review
//   review_note  - record one structured finding (severity + file + message)
// Command:
//   /review report | /review list | /review clear
//
// Notes are stored in <cwd>/.pi/reviews/reviews.db (node:sqlite).

import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { gitDiff } from "./git.js";
import { ReviewStore } from "./store.js";

const MAX_DIFF_CHARS = 50000;

export default function (pi: ExtensionAPI) {
  let store: ReviewStore | undefined;
  let storePath = "";

  const ensureStore = (cwd: string): ReviewStore => {
    if (!store) {
      storePath = join(cwd, ".pi", "reviews", "reviews.db");
      store = new ReviewStore(storePath);
      store.load();
    }
    return store;
  };

  pi.on("session_start", async (_event, ctx) => {
    ensureStore(ctx.cwd);
  });

  pi.registerTool({
    name: "git_diff",
    label: "Git Diff",
    description: "Get the git diff (working tree, staged, or vs a ref) so you can review the changes.",
    parameters: Type.Object({
      staged: Type.Optional(Type.Boolean({ description: "Diff staged changes (--staged)" })),
      base: Type.Optional(Type.String({ description: "Diff against a ref/branch/commit (e.g. main, HEAD~1)" })),
      path: Type.Optional(Type.String({ description: "Limit the diff to a path" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let diff: string;
      try {
        diff = await gitDiff(ctx.cwd, { staged: params.staged, base: params.base, path: params.path });
      } catch (e) {
        throw new Error(`git diff failed: ${(e as Error).message}`);
      }
      if (!diff.trim()) {
        return { content: [{ type: "text", text: "No changes in the requested diff." }], details: { empty: true } };
      }
      let truncated = false;
      if (diff.length > MAX_DIFF_CHARS) {
        diff = diff.slice(0, MAX_DIFF_CHARS);
        truncated = true;
      }
      return {
        content: [{ type: "text", text: truncated ? `${diff}\n\n[diff truncated to ${MAX_DIFF_CHARS} chars]` : diff }],
        details: { truncated },
      };
    },
  });

  pi.registerTool({
    name: "review_note",
    label: "Review Note",
    description: "Record one structured code-review finding. Call once per issue while reviewing a diff.",
    promptGuidelines: [
      "When reviewing code, record each finding via review_note with a severity: blocker | major | minor | nit | praise.",
      "After reviewing, run /review report to produce the grouped summary.",
    ],
    parameters: Type.Object({
      file: Type.String({ description: "File path the note refers to" }),
      severity: Type.String({ description: "blocker | major | minor | nit | praise" }),
      message: Type.String({ description: "The finding or suggestion" }),
      line: Type.Optional(Type.Number({ description: "Line number (optional)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const s = ensureStore(ctx.cwd);
      const id = s.addNote(params.file, params.line ?? null, params.severity, params.message);
      return {
        content: [
          {
            type: "text",
            text: `Recorded ${params.severity} note [${id}] on ${params.file}${params.line ? `:${params.line}` : ""}`,
          },
        ],
        details: { id, severity: params.severity },
      };
    },
  });

  pi.registerCommand("review", {
    description: "Code review notes: /review report | /review list | /review clear",
    handler: async (args, ctx) => {
      const s = ensureStore(ctx.cwd);
      const sub = args.trim().split(/\s+/)[0] || "report";

      if (sub === "report") {
        ctx.ui.notify(s.report(), "info");
        return;
      }
      if (sub === "list") {
        const notes = s.list();
        ctx.ui.notify(
          notes.length
            ? notes
                .map((n) => `[${n.id}] ${n.severity} ${n.file}${n.line ? `:${n.line}` : ""}: ${n.message}`)
                .join("\n")
            : `No notes. (db=${storePath})`,
          "info",
        );
        return;
      }
      if (sub === "clear") {
        s.clear();
        ctx.ui.notify("Review notes cleared.", "info");
        return;
      }
      ctx.ui.notify("Usage: /review report | /review list | /review clear", "warning");
    },
  });
}
