import { describe, expect, it } from "vitest";
import { parseWslDistros, pickDistro } from "./detect.js";

const OUT = [
  "  NAME            STATE           VERSION",
  "* Ubuntu          Running         2",
  "  docker-desktop  Stopped         2",
].join("\r\n");

describe("parseWslDistros", () => {
  it("parses name/state/version and default marker", () => {
    const d = parseWslDistros(OUT);
    expect(d).toEqual([
      { name: "Ubuntu", state: "Running", version: 2, default: true },
      { name: "docker-desktop", state: "Stopped", version: 2, default: false },
    ]);
  });
  it("tolerates UTF-16 NUL bytes from wsl.exe", () => {
    const noisy = OUT.split("").join("\u0000");
    expect(parseWslDistros(noisy).length).toBe(2);
  });
});

describe("pickDistro", () => {
  const list = parseWslDistros(OUT);
  it("prefers the requested distro when present", () => {
    expect(pickDistro(list, "docker-desktop")?.name).toBe("docker-desktop");
  });
  it("falls back to default v2, skipping docker-desktop", () => {
    expect(pickDistro(list)?.name).toBe("Ubuntu");
  });
});
