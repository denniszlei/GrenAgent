import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getConfig } from "../_shared/runtime-config.js";
import { DEFAULT_AGENT_TEMPLATES } from "./default-agents.js";

const enabled = () => (getConfig("FABLE_BEHAVIOR_SEED_AGENTS") ?? "1") !== "0";

/** Seed enriched agent templates into ~/.pi/agent/agents/ when missing. */
export function seedFableAgents(): void {
  if (!enabled()) return;
  try {
    const dir = join(getAgentDir(), "agents");
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(DEFAULT_AGENT_TEMPLATES)) {
      const file = join(dir, `${name}.md`);
      if (!existsSync(file)) writeFileSync(file, content, "utf8");
    }
  } catch {
    /* best-effort */
  }
}
