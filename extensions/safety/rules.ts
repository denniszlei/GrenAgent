const DANGEROUS_BASH = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive)/i,
  /\bsudo\b/i,
  /\b(chmod|chown)\b[^\n]*\b777\b/i,
  /\bmkfs\b/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // fork bomb
  />\s*\/dev\/sd[a-z]/i,
];

export function isDangerousBash(command: string): boolean {
  return DANGEROUS_BASH.some((re) => re.test(command));
}

const PROTECTED = [
  /(^|[\\/])\.env(\.|$)/i,
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])node_modules([\\/]|$)/i,
  /\.(pem|key)$/i,
];

export function matchProtectedPath(p: string): boolean {
  if (!p) return false;
  return PROTECTED.some((re) => re.test(p));
}

export function extractPath(input: Record<string, unknown>): string | undefined {
  const v = input?.path ?? input?.file_path ?? input?.filePath;
  return typeof v === "string" ? v : undefined;
}
