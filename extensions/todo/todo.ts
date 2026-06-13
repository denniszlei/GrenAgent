export interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export interface TodoState {
  todos: Todo[];
  nextId: number;
}

export interface TodoInput {
  action: "list" | "add" | "toggle" | "clear";
  text?: string;
  id?: number;
}

export interface TodoResult {
  state: TodoState;
  message: string;
  error?: string;
}

/** 写入 tool result 的 details 形状（前端 TodoCard 读取）。 */
export interface TodoDetails {
  action: TodoInput["action"];
  todos: Todo[];
  nextId: number;
  error?: string;
}

export const emptyTodoState = (): TodoState => ({ todos: [], nextId: 1 });

export function applyTodo(state: TodoState, input: TodoInput): TodoResult {
  switch (input.action) {
    case "list":
      return {
        state,
        message: state.todos.length
          ? state.todos.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n")
          : "No todos",
      };
    case "add": {
      if (!input.text) return { state, message: "Error: text required for add", error: "text required" };
      const todo: Todo = { id: state.nextId, text: input.text, done: false };
      return {
        state: { todos: [...state.todos, todo], nextId: state.nextId + 1 },
        message: `Added todo #${todo.id}: ${todo.text}`,
      };
    }
    case "toggle": {
      if (input.id === undefined) return { state, message: "Error: id required for toggle", error: "id required" };
      if (!state.todos.some((t) => t.id === input.id)) {
        return { state, message: `Todo #${input.id} not found`, error: `#${input.id} not found` };
      }
      const todos = state.todos.map((t) => (t.id === input.id ? { ...t, done: !t.done } : t));
      const toggled = todos.find((t) => t.id === input.id) as Todo;
      return {
        state: { ...state, todos },
        message: `Todo #${toggled.id} ${toggled.done ? "completed" : "uncompleted"}`,
      };
    }
    case "clear":
      return { state: emptyTodoState(), message: `Cleared ${state.todos.length} todos` };
  }
}

/** 重建分支状态：扫描 session 条目，取最后一条 todo toolResult 的 details。 */
interface BranchEntryLike {
  type: string;
  message?: { role?: string; toolName?: string; details?: unknown };
}

export function reconstructFromEntries(entries: readonly BranchEntryLike[]): TodoState {
  let state = emptyTodoState();
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const msg = entry.message;
    if (!msg || msg.role !== "toolResult" || msg.toolName !== "todo") continue;
    const d = msg.details as { todos?: Todo[]; nextId?: number } | undefined;
    if (d && Array.isArray(d.todos) && typeof d.nextId === "number") {
      state = { todos: d.todos, nextId: d.nextId };
    }
  }
  return state;
}
