import { describe, expect, it } from "vitest";
import { winToWslPath } from "./paths.js";

describe("winToWslPath", () => {
  it("maps drive paths to /mnt", () => {
    expect(winToWslPath("D:\\a\\b")).toBe("/mnt/d/a/b");
    expect(winToWslPath("C:\\Users\\x")).toBe("/mnt/c/Users/x");
  });
  it("lowercases only the drive letter, keeps the rest", () => {
    expect(winToWslPath("E:\\Foo Bar\\Baz")).toBe("/mnt/e/Foo Bar/Baz");
  });
  it("passes through already-posix paths", () => {
    expect(winToWslPath("/mnt/d/x")).toBe("/mnt/d/x");
  });
  it("throws on non-drive paths (UNC / network)", () => {
    expect(() => winToWslPath("\\\\server\\share")).toThrow();
  });
});
