import { describe, expect, it } from "vitest";
import { applyTodo, emptyTodoState, reconstructFromEntries } from "./todo.js";

describe("applyTodo", () => {
  it("add appends a todo and bumps nextId", () => {
    const r = applyTodo(emptyTodoState(), { action: "add", text: "write tests" });
    expect(r.state.todos).toEqual([{ id: 1, text: "write tests", done: false }]);
    expect(r.state.nextId).toBe(2);
    expect(r.error).toBeUndefined();
  });
  it("add without text returns an error and keeps state", () => {
    const r = applyTodo(emptyTodoState(), { action: "add" });
    expect(r.error).toBe("text required");
    expect(r.state.todos).toEqual([]);
  });
  it("toggle flips done", () => {
    const s1 = applyTodo(emptyTodoState(), { action: "add", text: "a" }).state;
    const r = applyTodo(s1, { action: "toggle", id: 1 });
    expect(r.state.todos[0].done).toBe(true);
  });
  it("toggle with missing id errors", () => {
    const r = applyTodo(emptyTodoState(), { action: "toggle", id: 9 });
    expect(r.error).toContain("not found");
  });
  it("clear empties and resets nextId", () => {
    const s1 = applyTodo(emptyTodoState(), { action: "add", text: "a" }).state;
    const r = applyTodo(s1, { action: "clear" });
    expect(r.state).toEqual({ todos: [], nextId: 1 });
  });
  it("list does not mutate state", () => {
    const s1 = applyTodo(emptyTodoState(), { action: "add", text: "a" }).state;
    const r = applyTodo(s1, { action: "list" });
    expect(r.state).toBe(s1);
    expect(r.message).toContain("#1");
  });
});

describe("reconstructFromEntries", () => {
  it("applies the latest todo toolResult details", () => {
    const entries = [
      { type: "message", message: { role: "toolResult", toolName: "todo", details: { todos: [{ id: 1, text: "a", done: false }], nextId: 2 } } },
      { type: "message", message: { role: "toolResult", toolName: "todo", details: { todos: [{ id: 1, text: "a", done: true }], nextId: 2 } } },
    ];
    const s = reconstructFromEntries(entries);
    expect(s.todos[0].done).toBe(true);
    expect(s.nextId).toBe(2);
  });
  it("ignores non-todo and non-message entries", () => {
    const entries = [
      { type: "message", message: { role: "assistant" } },
      { type: "compaction" },
      { type: "message", message: { role: "toolResult", toolName: "bash", details: { foo: 1 } } },
    ];
    expect(reconstructFromEntries(entries)).toEqual(emptyTodoState());
  });
});
