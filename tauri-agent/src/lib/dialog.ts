import { open } from '@tauri-apps/plugin-dialog';

/**
 * 打开系统目录选择器。用户取消返回 null。
 * 选择器内可新建文件夹，因此同时承载「新建空白项目」与「使用现有文件夹」。
 */
export async function pickDirectory(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return typeof result === 'string' ? result : null;
}
