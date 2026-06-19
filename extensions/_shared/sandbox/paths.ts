// D:\a\b → /mnt/d/a/b。仅支持本地盘符路径；UNC/网络盘抛错（WSL /mnt 不可达）。
export function winToWslPath(p: string): string {
  if (p.startsWith("/")) return p;
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) throw new Error(`无法转换为 WSL 路径（需本地盘符绝对路径）：${p}`);
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}
