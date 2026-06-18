import { describe, expect, it } from 'vitest';
import { parseMessageTags } from './messageTags';

describe('parseMessageTags', () => {
  it('splits a file mention from surrounding text', () => {
    const segs = parseMessageTags('看一下 @src/foo.ts 这个文件');
    expect(segs).toEqual([
      { type: 'text', text: '看一下 ' },
      { type: 'file', path: 'src/foo.ts' },
      { type: 'text', text: ' 这个文件' },
    ]);
  });

  it('handles a mention at the very start', () => {
    const segs = parseMessageTags('@README.md is the entry');
    expect(segs[0]).toEqual({ type: 'file', path: 'README.md' });
    expect(segs[1]).toEqual({ type: 'text', text: ' is the entry' });
  });

  it('keeps multiple mentions', () => {
    const segs = parseMessageTags('@a.ts and @b/c.ts');
    expect(segs.filter((s) => s.type === 'file')).toEqual([
      { type: 'file', path: 'a.ts' },
      { type: 'file', path: 'b/c.ts' },
    ]);
  });

  it('does not treat an email address as a mention', () => {
    const segs = parseMessageTags('mail me at user@host.com please');
    expect(segs.every((s) => s.type === 'text')).toBe(true);
  });

  it('returns a single text segment when there is no mention', () => {
    expect(parseMessageTags('plain text')).toEqual([{ type: 'text', text: 'plain text' }]);
  });
});
