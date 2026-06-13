import { describe, expect, it } from "vitest";
import { isDangerousBash, extractPath, matchProtectedPath } from "./rules.js";

describe("isDangerousBash", () => {
  it("flags rm -rf / sudo / chmod 777", () => {
    expect(isDangerousBash("rm -rf /tmp/x")).toBe(true);
    expect(isDangerousBash("sudo apt update")).toBe(true);
    expect(isDangerousBash("chmod 777 a")).toBe(true);
  });
  it("ignores safe commands", () => {
    expect(isDangerousBash("ls -la")).toBe(false);
    expect(isDangerousBash("git status")).toBe(false);
  });
});

describe("protected paths", () => {
  it("extractPath reads common field names", () => {
    expect(extractPath({ path: "a.txt" })).toBe("a.txt");
    expect(extractPath({ file_path: "b.txt" })).toBe("b.txt");
    expect(extractPath({ filePath: "c.txt" })).toBe("c.txt");
  });
  it("matches .env/.git/node_modules/keys", () => {
    expect(matchProtectedPath(".env")).toBe(true);
    expect(matchProtectedPath("repo/.git/config")).toBe(true);
    expect(matchProtectedPath("node_modules/x/y.js")).toBe(true);
    expect(matchProtectedPath("certs/server.pem")).toBe(true);
    expect(matchProtectedPath("src/app.ts")).toBe(false);
  });
});
