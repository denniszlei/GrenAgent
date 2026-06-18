import { describe, expect, it } from 'vitest';
import {
  expandSubAgents,
  subAgentMode,
  subAgentUnitView,
  taskLabel,
} from './subagentUtils';

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> } | undefined)?.content;
  return content?.map((b) => b.text ?? '').join('') ?? '';
}

describe('taskLabel', () => {
  it('single task (with optional agent prefix)', () => {
    expect(taskLabel({ task: '分析渲染' })).toBe('分析渲染');
    expect(taskLabel({ task: '分析', agent: 'scout' })).toBe('scout: 分析');
  });
  it('chain / parallel aggregate labels', () => {
    expect(taskLabel({ chain: [{ task: 'a' }, { task: 'b' }] })).toBe('2 步链式');
    expect(taskLabel({ tasks: ['a', 'b', 'c'] })).toBe('3 个并行任务');
  });
});

describe('subAgentMode', () => {
  it('classifies single / parallel / chain', () => {
    expect(subAgentMode({ task: 'x' })).toBe('single');
    expect(subAgentMode({ tasks: ['x'] })).toBe('single'); // 单元素 tasks 等价单任务
    expect(subAgentMode({ tasks: ['x', 'y'] })).toBe('parallel');
    expect(subAgentMode({ chain: [{ task: 'a' }, { task: 'b' }] })).toBe('chain');
  });
});

describe('expandSubAgents', () => {
  it('single → one unit with null subIndex reusing the message', () => {
    const units = expandSubAgents('m1', { task: 'solo' }, {}, 'done');
    expect(units).toEqual([{ key: 'm1', subIndex: null, task: 'solo', status: 'done' }]);
  });

  it('parallel done → per-unit status from details.results', () => {
    const units = expandSubAgents(
      'm2',
      { tasks: ['a', 'b'] },
      { details: { results: [{ task: 'a', ok: true }, { task: 'b', ok: false, error: 'boom' }] } },
      'done',
    );
    expect(units).toEqual([
      { key: 'm2#0', subIndex: 0, task: 'a', status: 'done' },
      { key: 'm2#1', subIndex: 1, task: 'b', status: 'error' },
    ]);
  });

  it('chain stopped early → later steps are pending', () => {
    const units = expandSubAgents(
      'm3',
      { chain: [{ task: 's1' }, { task: 's2' }, { task: 's3' }] },
      { details: { mode: 'chain', stoppedAt: 2, results: [{ step: 1, task: 's1', ok: true }, { step: 2, task: 's2', ok: false }] } },
      'error',
    );
    expect(units.map((u) => u.status)).toEqual(['done', 'error', 'pending']);
    expect(units.map((u) => u.task)).toEqual(['s1', 's2', 's3']);
  });

  it('running → all units running regardless of (absent) results', () => {
    const units = expandSubAgents('m4', { tasks: ['a', 'b'] }, {}, 'running');
    expect(units.map((u) => u.status)).toEqual(['running', 'running']);
  });
});

describe('subAgentUnitView', () => {
  it('single (subIndex null) passes the whole message result through', () => {
    const result = { details: { transcript: 'x' } };
    const view = subAgentUnitView({ task: 'solo' }, result, 'done', null);
    expect(view).toEqual({ task: 'solo', result, status: 'done' });
  });

  it('parallel unit → that unit final output + status', () => {
    const result = { details: { results: [{ task: 'a', ok: true, output: 'a out' }, { task: 'b', ok: false, error: 'boom' }] } };
    const ok = subAgentUnitView({ tasks: ['a', 'b'] }, result, 'done', 0);
    expect(ok.task).toBe('a');
    expect(ok.status).toBe('done');
    expect(textOf(ok.result)).toContain('a out');

    const bad = subAgentUnitView({ tasks: ['a', 'b'] }, result, 'done', 1);
    expect(bad.status).toBe('error');
    expect(textOf(bad.result)).toContain('boom');
  });

  it('pending chain step → explanatory text', () => {
    const result = { details: { results: [{ step: 1, task: 's1', ok: false }] } };
    const view = subAgentUnitView({ chain: [{ task: 's1' }, { task: 's2' }] }, result, 'error', 1);
    expect(view.task).toBe('s2');
    expect(textOf(view.result)).toContain('未执行');
  });

  it('running unit → no result yet', () => {
    const view = subAgentUnitView({ tasks: ['a', 'b'] }, {}, 'running', 0);
    expect(view.status).toBe('running');
    expect(view.result).toBeUndefined();
  });
});
