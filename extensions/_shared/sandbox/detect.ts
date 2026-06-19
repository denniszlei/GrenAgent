export interface WslDistro { name: string; state: string; version: number; default: boolean; }

// 解析 `wsl.exe -l -v`。wsl.exe 默认 UTF-16LE，调用方常 decode 后含 NUL，这里先剔除。
export function parseWslDistros(stdout: string): WslDistro[] {
  const clean = stdout.replace(/\u0000/g, "");
  const lines = clean.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const rows = lines.filter((l) => !/^\s*NAME\s+STATE\s+VERSION/i.test(l));
  const out: WslDistro[] = [];
  for (const line of rows) {
    const isDefault = line.trimStart().startsWith("*");
    const cols = line
      .replace(/^\s*\*?\s*/, "")
      .split(/\s{2,}|\t+/)
      .map((c) => c.trim())
      .filter(Boolean);
    if (cols.length < 3) continue;
    const version = Number(cols[2]) || 0;
    out.push({ name: cols[0], state: cols[1], version, default: isDefault });
  }
  return out;
}

// 选 distro：优先 preferred；否则第一个 v2、非 docker-desktop 的（优先 default）。
export function pickDistro(distros: WslDistro[], preferred?: string): WslDistro | undefined {
  if (preferred) {
    const hit = distros.find((d) => d.name === preferred);
    if (hit) return hit;
  }
  const usable = distros.filter((d) => d.version === 2 && d.name !== "docker-desktop");
  return usable.find((d) => d.default) ?? usable[0];
}
