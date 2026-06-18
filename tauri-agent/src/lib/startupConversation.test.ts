import { describe, expect, it } from 'vitest';
import { canReuseScratch } from './startupConversation';

const works = 'C:/Users/me/.pi/agent/works';

describe('canReuseScratch', () => {
  it('reuses a remembered scratch that is under works and never persisted', () => {
    expect(canReuseScratch(`${works}/abc`, works, [])).toBe(true);
    expect(canReuseScratch(`${works}/abc`, works, ['D:/proj', null])).toBe(true);
  });

  it('does not reuse once the scratch has been used (appears in sessions)', () => {
    // 大小写 / 分隔符差异也应判定为同一目录（已落盘 → 不复用）。
    expect(canReuseScratch(`${works}/abc`, works, [`${works}\\ABC`])).toBe(false);
  });

  it('does not reuse a path outside the works directory', () => {
    expect(canReuseScratch('D:/some/project', works, [])).toBe(false);
  });

  it('returns false when nothing is remembered', () => {
    expect(canReuseScratch('', works, [])).toBe(false);
    expect(canReuseScratch(null, works, [])).toBe(false);
    expect(canReuseScratch(undefined, works, [])).toBe(false);
  });

  it('falls back to under-check skip when worksDir unknown', () => {
    // worksDir 取不到时不卡 isUnder，仅靠「是否已落盘」判定。
    expect(canReuseScratch('C:/whatever/x', '', [])).toBe(true);
  });
});
