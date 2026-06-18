import { describe, expect, it } from 'vitest';
import { autoFixMermaid } from './mermaidAutofix';

describe('autoFixMermaid', () => {
  it('gantt：移除会被当日期的连字符数字伪 id（87-88 → 仅保留时长）', () => {
    const code = [
      'gantt',
      '    title demo',
      '    dateFormat YYYY-MM-DD',
      '    section S',
      '    品牌icon :87-88, 1d',
    ].join('\n');
    const fixed = autoFixMermaid(code) ?? '';
    expect(fixed).not.toContain('87-88');
    expect(fixed).toContain('品牌icon :1d');
  });

  it('gantt：移除多个连字符伪 id', () => {
    const code = [
      'gantt',
      '    section S',
      '    a :94-95, 1d',
      '    b :96-98, 1d',
    ].join('\n');
    const fixed = autoFixMermaid(code) ?? '';
    expect(fixed).not.toContain('94-95');
    expect(fixed).not.toContain('96-98');
    expect(fixed).toContain('a :1d');
    expect(fixed).toContain('b :1d');
  });

  it('不误伤 dateFormat / axisFormat 里的连字符', () => {
    const code = [
      'gantt',
      '    dateFormat YYYY-MM-DD',
      '    axisFormat %m-%d',
      '    section S',
      '    a :85, 2026-06-16, 1d',
    ].join('\n');
    // 该图本身没有「连字符数字 id」需要修，返回 null
    expect(autoFixMermaid(code)).toBeNull();
  });

  it('非 gantt 图返回 null', () => {
    expect(autoFixMermaid('graph LR\n  A-->B')).toBeNull();
  });

  it('正常 gantt（task id 合法）返回 null', () => {
    const code = ['gantt', '    section S', '    a :done, t1, 1d'].join('\n');
    expect(autoFixMermaid(code)).toBeNull();
  });
});
