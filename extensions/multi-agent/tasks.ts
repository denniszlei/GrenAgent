// Normalize spawn_agent params into a uniform { task, model?, agent? }[] list.
export interface NormalizedTask {
  task: string;
  model?: string;
  agent?: string;
}

export type TaskInput = string | { task: string; model?: string; agent?: string };

export interface SpawnParams {
  task?: string;
  model?: string;
  agent?: string;
  tasks?: TaskInput[];
  chain?: Array<{ task?: string }>;
}

function clean(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

export function normalizeTasks(params: SpawnParams): NormalizedTask[] {
  const out: NormalizedTask[] = [];
  const single = clean(params.task);
  if (single) out.push({ task: single, model: clean(params.model), agent: clean(params.agent) });
  for (const t of params.tasks ?? []) {
    if (typeof t === "string") {
      const task = clean(t);
      if (task) out.push({ task, agent: clean(params.agent) });
    } else if (t && typeof t.task === "string") {
      const task = clean(t.task);
      if (task) out.push({ task, model: clean(t.model), agent: clean(t.agent) ?? clean(params.agent) });
    }
  }
  return out;
}

/**
 * Whether the call carries any runnable work. `chain` is a valid standalone mode
 * (sequential steps with {previous}) and must NOT require `task`/`tasks` — the
 * guard that uses this is what previously rejected chain-only calls with
 * "provide task or tasks".
 */
export function spawnHasWork(params: SpawnParams): boolean {
  return normalizeTasks(params).length > 0 || (params.chain?.length ?? 0) > 0;
}
