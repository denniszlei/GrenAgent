import { memo, useCallback, useState } from 'react';
import { Button, Icon } from '@lobehub/ui';
import { Check, MessageCircleQuestion } from 'lucide-react';
import { createStaticStyles, cssVar } from 'antd-style';
import { pi } from '../../lib/pi';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    width: 100%;
    max-width: 560px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    overflow: hidden;
  `,
  head: css`
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 12px 14px 0;
    color: ${cssVar.colorTextTertiary};
    font-size: 12px;
  `,
  question: css`
    padding: 10px 14px 0;
    font-size: 14px;
    font-weight: 600;
    color: ${cssVar.colorText};
  `,
  options: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 14px 0;
  `,
  option: css`
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
    color: ${cssVar.colorText};
    font-size: 13px;
    text-align: start;
    cursor: pointer;

    &:hover {
      border-color: ${cssVar.colorPrimary};
      background: ${cssVar.colorPrimaryBg};
    }
  `,
  optionSelected: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  optionDone: css`
    cursor: default;
    &:hover {
      border-color: ${cssVar.colorBorderSecondary};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  letter: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: ${cssVar.colorFillSecondary};
    font-size: 11px;
    font-weight: 600;
    color: ${cssVar.colorTextSecondary};
  `,
  optionLabel: css`
    flex: 1;
  `,
  check: css`
    flex: none;
    color: ${cssVar.colorPrimary};
  `,
  footer: css`
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    margin-block-start: 12px;
    padding: 10px 14px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorFillQuaternary};
  `,
  doneText: css`
    margin-block-start: 12px;
    padding: 10px 14px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    background: ${cssVar.colorFillQuaternary};
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

interface QuestionOption {
  id: string;
  label: string;
}

interface QuestionSpec {
  id: string;
  title: string;
  options: QuestionOption[];
  allowMultiple: boolean;
}

interface QuestionsData {
  kind: 'questions';
  id: string;
  questions: QuestionSpec[];
}

/** content 为 ask_user 写入的 QuestionsCardData JSON；非本结构返回 null（调用方回退）。 */
export function parseQuestions(content: string): QuestionsData | null {
  try {
    const d = JSON.parse(content) as Partial<QuestionsData>;
    if (d && d.kind === 'questions' && Array.isArray(d.questions)) {
      const questions: QuestionSpec[] = d.questions
        .filter((q): q is QuestionSpec => Boolean(q) && typeof q.title === 'string' && Array.isArray(q.options))
        .map((q) => ({
          id: String(q.id ?? ''),
          title: q.title,
          options: q.options.map((o) => ({ id: String(o?.id ?? ''), label: String(o?.label ?? '') })),
          allowMultiple: Boolean(q.allowMultiple),
        }));
      if (questions.length > 0) return { kind: 'questions', id: String(d.id ?? ''), questions };
    }
  } catch {
    /* not our JSON */
  }
  return null;
}

/** 把用户的选择拼成人类可读、AI 可解析的回传文本。 */
export function formatAnswers(data: QuestionsData, selected: Record<string, string[]>): string {
  const lines = data.questions.map((q, i) => {
    const labels = (selected[q.id] ?? [])
      .map((oid) => q.options.find((o) => o.id === oid)?.label)
      .filter((x): x is string => Boolean(x));
    return `${i + 1}. ${q.title}：${labels.length > 0 ? labels.join('、') : '(未选)'}`;
  });
  return `[我的选择]\n${lines.join('\n')}`;
}

/**
 * 对话流内的「提问卡」（对标 Cursor Plan Mode 的 Questions）：逐题渲染 A/B/C/D 选项（可多选），
 * 底部 Continue / Skip。Continue 经 pi.prompt 回传用户选择并触发 AI 下一轮，卡片随即转为已答态。
 * `answered`（由历史推断：卡片之后已有用户消息）使旧卡片定格为只读已答。
 */
export const QuestionsCard = memo(function QuestionsCard({
  content,
  answered,
}: {
  content: string;
  answered?: boolean;
}) {
  const { workspace } = useAgentStoreContext();
  const data = parseQuestions(content);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const done = Boolean(answered) || submitted || skipped;

  const toggle = useCallback(
    (q: QuestionSpec, optId: string) => {
      setSelected((prev) => {
        const cur = prev[q.id] ?? [];
        if (q.allowMultiple) {
          return { ...prev, [q.id]: cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId] };
        }
        return { ...prev, [q.id]: cur.includes(optId) ? [] : [optId] };
      });
    },
    [],
  );

  const onContinue = useCallback(async () => {
    if (!data) return;
    setSubmitted(true);
    try {
      await pi.prompt(workspace, formatAnswers(data, selected));
    } catch {
      setSubmitted(false);
    }
  }, [data, selected, workspace]);

  const onSkip = useCallback(async () => {
    setSkipped(true);
    try {
      await pi.prompt(workspace, '[跳过提问] 用户选择暂不回答上面的问题，请继续。');
    } catch {
      setSkipped(false);
    }
  }, [workspace]);

  if (!data) {
    return (
      <div className={styles.card} data-testid="questions-card">
        <div className={styles.question}>{content}</div>
      </div>
    );
  }

  // 有选项的题都至少选了一项，Continue 才可用（无选项的开放题不阻塞）。
  const canContinue = data.questions.every(
    (q) => q.options.length === 0 || (selected[q.id]?.length ?? 0) > 0,
  );

  return (
    <div className={styles.card} data-testid="questions-card">
      <div className={styles.head}>
        <Icon icon={MessageCircleQuestion} size={13} />
        <span>Questions{data.questions.length > 1 ? ` · ${data.questions.length}` : ''}</span>
      </div>

      {data.questions.map((q) => (
        <div key={q.id}>
          <div className={styles.question}>{q.title}</div>
          <div className={styles.options}>
            {q.options.map((o, oi) => {
              const isSel = (selected[q.id] ?? []).includes(o.id);
              return (
                <button
                  className={`${styles.option}${isSel ? ` ${styles.optionSelected}` : ''}${done ? ` ${styles.optionDone}` : ''}`}
                  data-testid={`question-opt-${q.id}-${o.id}`}
                  disabled={done}
                  key={o.id}
                  onClick={() => toggle(q, o.id)}
                  type="button"
                >
                  <span className={styles.letter}>{String.fromCharCode(65 + oi)}</span>
                  <span className={styles.optionLabel}>{o.label}</span>
                  {isSel ? <Icon className={styles.check} icon={Check} size={14} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {done ? (
        <div className={styles.doneText}>{skipped ? '已跳过' : '已回答'}</div>
      ) : (
        <div className={styles.footer}>
          <Button onClick={() => void onSkip()} size="small">
            Skip
          </Button>
          <Button disabled={!canContinue} onClick={() => void onContinue()} size="small" type="primary">
            Continue
          </Button>
        </div>
      )}
    </div>
  );
});
