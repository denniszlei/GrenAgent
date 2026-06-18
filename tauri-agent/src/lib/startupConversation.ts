import { isUnder, pathsEquivalent } from './pathUtils';

/** 记住「上次启动新建的空白对话 cwd」，供下次启动复用，避免每次启动堆积空 works 目录。 */
export const STARTUP_SCRATCH_KEY = 'gren.startupScratchCwd';

/**
 * 记住的空白对话是否仍可复用：必须在 works 目录下，且尚未出现在任何已落盘会话里
 *（即从未被真正使用过——一旦发过消息就会落盘、不再复用，下次启动改为新建）。
 */
export function canReuseScratch(
  remembered: string | null | undefined,
  worksDir: string,
  sessionCwds: Array<string | null | undefined>,
): boolean {
  if (!remembered) return false;
  if (worksDir && !isUnder(remembered, worksDir)) return false;
  return !sessionCwds.some((cwd) => !!cwd && pathsEquivalent(cwd, remembered));
}
