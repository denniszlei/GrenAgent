import { memo } from 'react';
import { Icon } from '@lobehub/ui';
import { CircleHelp } from 'lucide-react';
import { createStaticStyles, cssVar } from 'antd-style';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    width: 100%;
    max-width: 520px;
    padding: 10px 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    background: ${cssVar.colorBgContainer};
  `,
  head: css`
    display: flex;
    gap: 6px;
    align-items: center;
    margin-block-end: 6px;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  question: css`
    margin-block-end: 4px;
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
  answer: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
    white-space: pre-wrap;
  `,
}));

interface ParsedAnswer {
  title: string;
  answer: string;
}

/** content 为 askChoice 写入的 JSON：{ title, answer }；解析失败返回 null（调用方回退）。 */
export function parseAnswer(content: string): ParsedAnswer | null {
  try {
    const d = JSON.parse(content) as Partial<ParsedAnswer>;
    if (d && typeof d.title === 'string') return { title: d.title, answer: String(d.answer ?? '') };
  } catch {
    /* not our JSON */
  }
  return null;
}

/** 对话流内的「问题 + 答案」卡片（对应一次选择题的结果，持久留痕，参考 Cursor 的 Answer 卡）。 */
export const AnswerCard = memo(function AnswerCard({ content }: { content: string }) {
  const data = parseAnswer(content);
  // 解析失败（非预期 JSON）时回退为纯文本展示，避免消息「凭空消失」。
  if (!data) {
    return (
      <div className={styles.card} data-testid="answer-card">
        <div className={styles.answer}>{content}</div>
      </div>
    );
  }
  return (
    <div className={styles.card} data-testid="answer-card">
      <div className={styles.head}>
        <Icon icon={CircleHelp} size={13} />
        <span>Answer</span>
      </div>
      <div className={styles.question}>{data.title}</div>
      <div className={styles.answer}>{data.answer}</div>
    </div>
  );
});
