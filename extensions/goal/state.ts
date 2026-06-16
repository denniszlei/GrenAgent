export interface GoalState {
  condition: string;
  react: number;
}

interface CustomEntryLike {
  type: string;
  customType?: string;
  data?: unknown;
}

/**
 * Restore goal state from session entries: take the LAST custom entry with
 * customType "goal". A null/empty data (written on /goal clear) yields undefined.
 */
export function restoreFromEntries(entries: CustomEntryLike[]): GoalState | undefined {
  const entry = entries.filter((e) => e.type === "custom" && e.customType === "goal").pop();
  const data = entry?.data as Partial<GoalState> | null | undefined;
  if (data && typeof data.condition === "string" && data.condition.length > 0) {
    return { condition: data.condition, react: Number(data.react) || 0 };
  }
  return undefined;
}
