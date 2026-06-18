import { describe, expect, it } from 'vitest';
import { formatAnswers, parseQuestions } from './QuestionsCard';

describe('parseQuestions', () => {
  it('parses a well-formed questions payload', () => {
    const payload = {
      kind: 'questions',
      id: 'q-1',
      questions: [
        {
          id: 'q1',
          title: '选哪个？',
          options: [
            { id: 'o1', label: 'A' },
            { id: 'o2', label: 'B' },
          ],
          allowMultiple: false,
        },
      ],
    };
    expect(parseQuestions(JSON.stringify(payload))).toEqual(payload);
  });

  it('coerces missing fields and filters invalid questions', () => {
    const parsed = parseQuestions(
      JSON.stringify({ kind: 'questions', questions: [{ title: 'T', options: [{ label: 'x' }] }, { foo: 1 }] }),
    );
    expect(parsed).toEqual({
      kind: 'questions',
      id: '',
      questions: [{ id: '', title: 'T', options: [{ id: '', label: 'x' }], allowMultiple: false }],
    });
  });

  it('returns null for non-questions json or non-json', () => {
    expect(parseQuestions('not json')).toBeNull();
    expect(parseQuestions(JSON.stringify({ kind: 'plan' }))).toBeNull();
    expect(parseQuestions(JSON.stringify({ kind: 'questions', questions: [] }))).toBeNull();
  });
});

describe('formatAnswers', () => {
  const data = {
    kind: 'questions' as const,
    id: 'q-1',
    questions: [
      {
        id: 'q1',
        title: '选方案',
        options: [
          { id: 'o1', label: 'A' },
          { id: 'o2', label: 'B' },
        ],
        allowMultiple: true,
      },
      { id: 'q2', title: '确认', options: [{ id: 'y', label: '是' }], allowMultiple: false },
    ],
  };

  it('joins multiple selected labels', () => {
    expect(formatAnswers(data, { q1: ['o1', 'o2'], q2: ['y'] })).toBe('[我的选择]\n1. 选方案：A、B\n2. 确认：是');
  });

  it('marks unselected questions', () => {
    expect(formatAnswers(data, { q1: ['o1'] })).toBe('[我的选择]\n1. 选方案：A\n2. 确认：(未选)');
  });
});
