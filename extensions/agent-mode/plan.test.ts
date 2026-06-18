import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPlanCard,
  derivePlanSummary,
  derivePlanTitle,
  makePlanId,
  renderPlanMarkdown,
  writePlanFile,
} from "./plan.js";
import type { TodoItem } from "./utils.js";

const SAMPLE = `# 重构鉴权层

把 session 校验抽到中间件，统一错误处理。

Plan:
1. 抽出 requireAuth 中间件
2. 替换各路由的内联校验
3. 补集成测试`;

describe("makePlanId", () => {
  it("formats as plan-YYYYMMDD-HHMMSS-rand", () => {
    expect(makePlanId(new Date(2026, 5, 17, 9, 8, 7), "abcd")).toBe("plan-20260617-090807-abcd");
  });
});

describe("derivePlanTitle", () => {
  it("uses the first markdown heading", () => {
    expect(derivePlanTitle(SAMPLE)).toBe("重构鉴权层");
  });
  it("falls back to the first non-empty, non-Plan line", () => {
    expect(derivePlanTitle("做点事情\n\nPlan:\n1. a")).toBe("做点事情");
  });
  it("falls back to a default when empty", () => {
    expect(derivePlanTitle("")).toBe("实施计划");
  });
});

describe("derivePlanSummary", () => {
  it("takes the paragraph between heading and Plan:", () => {
    expect(derivePlanSummary(SAMPLE)).toBe("把 session 校验抽到中间件，统一错误处理。");
  });
  it("gives a placeholder when there is no summary paragraph", () => {
    expect(derivePlanSummary("# 标题\n\nPlan:\n1. a")).toContain("View Plan");
  });
});

describe("buildPlanCard", () => {
  it("assembles card data from text + todos", () => {
    const todos: TodoItem[] = [
      { step: 1, text: "抽出中间件", completed: false },
      { step: 2, text: "替换校验", completed: true },
    ];
    const card = buildPlanCard("plan-x", SAMPLE, todos, ".pi/plans/plan-x.md");
    expect(card).toEqual({
      kind: "plan",
      id: "plan-x",
      title: "重构鉴权层",
      summary: "把 session 校验抽到中间件，统一错误处理。",
      todos: [
        { text: "抽出中间件", done: false },
        { text: "替换校验", done: true },
      ],
      planFile: ".pi/plans/plan-x.md",
      status: "draft",
    });
  });
});

describe("renderPlanMarkdown", () => {
  it("includes title, summary, steps and the raw plan text", () => {
    const todos: TodoItem[] = [{ step: 1, text: "抽出中间件", completed: false }];
    const card = buildPlanCard("plan-x", SAMPLE, todos, ".pi/plans/plan-x.md");
    const md = renderPlanMarkdown(card, SAMPLE);
    expect(md).toContain("# 重构鉴权层");
    expect(md).toContain("## 步骤");
    expect(md).toContain("1. 抽出中间件");
    expect(md).toContain("## 规划原文");
    expect(md).toContain("requireAuth");
  });
});

describe("writePlanFile", () => {
  it("writes .pi/plans/<id>.md and returns a posix relative path", () => {
    const dir = mkdtempSync(join(tmpdir(), "plan-"));
    try {
      const rel = writePlanFile(dir, "plan-x", "# hi");
      expect(rel).toBe(".pi/plans/plan-x.md");
      expect(readFileSync(join(dir, ".pi", "plans", "plan-x.md"), "utf8")).toBe("# hi");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
