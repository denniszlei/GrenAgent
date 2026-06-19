import { describe, expect, it } from "vitest";
import { buildSrtSettings } from "./srt.js";

describe("buildSrtSettings", () => {
  it("allows writing the cwd + /tmp, denies network by default", () => {
    const s = buildSrtSettings({ cwd: "D:\\proj" }, "/mnt/d/proj");
    expect(s.filesystem.allowWrite).toEqual(["/mnt/d/proj", "/tmp"]);
    expect(s.network.allowedDomains).toEqual([]);
  });
  it("maps extra writableRoots and allowlist domains", () => {
    const s = buildSrtSettings(
      { cwd: "D:\\proj", writableRoots: ["D:\\proj", "D:\\out"], network: { allowDomains: ["api.github.com"] } },
      "/mnt/d/proj",
    );
    expect(s.filesystem.allowWrite).toEqual(["/mnt/d/proj", "/mnt/d/out", "/tmp"]);
    expect(s.network.allowedDomains).toEqual(["api.github.com"]);
  });
});
