import { describe, it, expect } from 'vitest';
import {
  argSummary,
  extractText,
  getDetails,
  getDiff,
  langByPath,
  toolMeta,
} from './toolUtils';
import { Terminal, Wrench } from 'lucide-react';

describe('toolUtils', () => {
  it('extractText from content blocks', () => {
    expect(
      extractText({ content: [{ type: 'text', text: 'line1' }, { type: 'text', text: 'line2' }] }),
    ).toBe('line1\nline2');
  });

  it('extractText from string content', () => {
    expect(extractText({ content: 'hello' })).toBe('hello');
    expect(extractText('raw')).toBe('raw');
  });

  it('getDiff reads details.diff', () => {
    expect(getDiff({ details: { diff: '@@ -1 +1 @@\n-old\n+new' } })).toContain('@@');
    expect(getDiff({ details: {} })).toBeUndefined();
  });

  it('toolMeta maps bash to Terminal', () => {
    expect(toolMeta('bash').icon).toBe(Terminal);
    expect(toolMeta('unknown_tool').icon).toBe(Wrench);
  });

  it('argSummary shows first key value truncated', () => {
    expect(argSummary({ command: 'ls -la' })).toBe('command: ls -la');
    expect(argSummary({})).toBe('');
  });

  it('langByPath maps extensions', () => {
    expect(langByPath('src/foo.ts')).toBe('typescript');
    expect(langByPath('readme')).toBe('plaintext');
  });
});

describe('toolMeta extension icons', () => {
  it('returns distinct icons for extension tools', () => {
    for (const name of ['kb_search', 'kb_add', 'memory_save', 'memory_recall', 'generate_image', 'spawn_agent', 'fetch_url', 'speak']) {
      expect(toolMeta(name).icon).toBeTruthy();
    }
  });
});

describe('getDetails', () => {
  it('returns the details object when present', () => {
    expect(getDetails({ content: [], details: { path: '/a.png' } })).toEqual({ path: '/a.png' });
  });
  it('returns undefined when missing or invalid', () => {
    expect(getDetails(null)).toBeUndefined();
    expect(getDetails('x')).toBeUndefined();
    expect(getDetails({ content: [] })).toBeUndefined();
  });
});
