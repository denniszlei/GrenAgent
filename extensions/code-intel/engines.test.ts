import { describe, expect, it } from "vitest";
import { getEngine, listEngineNames, matchesEngineSignature } from "./engines.js";

describe("code-intel engines", () => {
  it("codegraph builds a stdio McpServerConfig pointing at the bundle launcher (unix)", () => {
    const cfg = getEngine("codegraph")!.buildConfig("/pkg", "linux");
    expect(cfg.name).toBe("codegraph");
    expect(cfg.transport).toBe("stdio");
    expect(cfg.command).toBe("/pkg/codegraph/bin/codegraph");
    expect(cfg.args).toEqual(["serve", "--mcp", "--path", "${workspaceFolder}"]);
    expect(cfg.cwd).toBe("/pkg/codegraph");
  });

  it("codegraph on win32 runs the bundled node.exe against a RELATIVE entry under cwd=bundle", () => {
    const cfg = getEngine("codegraph")!.buildConfig("C:/pkg", "win32");
    expect(cfg.command).toBe("C:/pkg/codegraph/node.exe");
    // 入口相对、cwd=bundle：规避含空格绝对路径在 piped spawn worker 时被截断。
    expect(cfg.args).toEqual([
      "--liftoff-only",
      "lib/dist/bin/codegraph.js",
      "serve",
      "--mcp",
      "--path",
      "${workspaceFolder}",
    ]);
    expect(cfg.cwd).toBe("C:/pkg/codegraph");
  });

  it("trims trailing slashes from pkgDir", () => {
    expect(getEngine("codegraph")!.buildConfig("/pkg/", "linux").command).toBe("/pkg/codegraph/bin/codegraph");
  });

  it("unknown engine returns undefined", () => {
    expect(getEngine("nope")).toBeUndefined();
  });

  it("lists known engine names", () => {
    expect(listEngineNames()).toContain("codegraph");
  });

  it("recognizes a user server exposing codegraph_* tools as the codegraph signature", () => {
    expect(matchesEngineSignature("codegraph", ["codegraph_explore", "codegraph_search"])).toBe(true);
    expect(matchesEngineSignature("codegraph", ["read_file"])).toBe(false);
  });

  it("an unknown engine never matches a signature", () => {
    expect(matchesEngineSignature("nope", ["anything"])).toBe(false);
  });
});
