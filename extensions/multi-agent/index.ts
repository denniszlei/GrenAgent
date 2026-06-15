// multi-agent: delegate work to isolated pi sub-agents (separate processes,
// each with its own context window). Single task or several in parallel.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawnPiAgent } from "./runner.js";
import { normalizeTasks } from "./tasks.js";

const MAX_CONCURRENCY = 4;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn Sub-agent",
    description:
      "Delegate a task to an isolated sub-agent (a separate pi process with its own context window). " +
      "Provide `task` for one, or `tasks` for several run in parallel. Returns the sub-agent output(s).",
    promptGuidelines: [
      "Use spawn_agent to parallelize independent sub-tasks or to isolate a large exploration from the main context.",
      "Each sub-agent starts fresh — include all context it needs in the task text.",
    ],
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "A single task for one sub-agent" })),
      model: Type.Optional(Type.String({ description: "Model (provider/id) for `task`. Omit → SUBAGENT_MODEL or main default." })),
      tasks: Type.Optional(
        Type.Array(
          Type.Union([
            Type.String(),
            Type.Object({ task: Type.String(), model: Type.Optional(Type.String()) }),
          ]),
          { description: "Multiple tasks in parallel; each item may be a string or { task, model }." },
        ),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const list = normalizeTasks(params);
      if (!list.length) throw new Error("provide `task` or `tasks`");

      if (list.length === 1) {
        const { task, model } = list[0];
        const r = await spawnPiAgent(ctx.cwd, task, {
          model,
          signal: signal ?? undefined,
          onUpdate: onUpdate
            ? (u) =>
                onUpdate({
                  content: [{ type: "text", text: u.text }],
                  details: { streaming: true, transcript: u.transcript },
                })
            : undefined,
        });
        if (!r.ok) throw new Error(`sub-agent failed (exit ${r.exitCode}): ${r.error ?? "unknown error"}`);
        return {
          content: [{ type: "text", text: r.output || "(no output)" }],
          details: { exitCode: r.exitCode, transcript: r.transcript },
        };
      }

      const results: Array<{ task: string; ok: boolean; output: string; error?: string }> = [];
      for (let i = 0; i < list.length; i += MAX_CONCURRENCY) {
        const batch = list.slice(i, i + MAX_CONCURRENCY);
        const settled = await Promise.all(
          batch.map((t) => spawnPiAgent(ctx.cwd, t.task, { model: t.model, signal: signal ?? undefined })),
        );
        settled.forEach((r, j) => results.push({ task: batch[j].task, ok: r.ok, output: r.output, error: r.error }));
      }

      const body = results
        .map(
          (r, i) =>
            `## Sub-agent ${i + 1}${r.ok ? "" : " (failed)"}\nTask: ${r.task}\n\n${r.ok ? r.output || "(no output)" : `Error: ${r.error}`}`,
        )
        .join("\n\n---\n\n");

      return {
        content: [{ type: "text", text: body }],
        details: { count: results.length, failed: results.filter((r) => !r.ok).length },
      };
    },
  });
}
