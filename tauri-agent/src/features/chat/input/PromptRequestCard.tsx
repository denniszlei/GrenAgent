import { memo, useCallback, useEffect, useState } from 'react';
import { Button, Icon } from '@lobehub/ui';
import { MessageCircleQuestion, X } from 'lucide-react';
import { createStaticStyles, cssVar } from 'antd-style';
import { extensionUiRespond } from '../../../lib/pi';
import { useAgentStoreContext } from '../../../stores/AgentStoreContext';
import { useUiPromptStore } from '../../../stores/uiPromptStore';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    margin-bottom: 8px;
    padding: 10px 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgElevated};
  `,
  head: css`
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  headTitle: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-weight: 500;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  close: css`
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: ${cssVar.colorTextTertiary};
    cursor: pointer;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  body: css`
    margin-block-start: 6px;
    font-size: 13px;
    line-height: 1.5;
    color: ${cssVar.colorTextSecondary};
    white-space: pre-wrap;
  `,
  options: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-block-start: 8px;
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
  row: css`
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-block-start: 10px;
  `,
  textarea: css`
    width: 100%;
    margin-block-start: 8px;
    padding: 8px 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
    color: ${cssVar.colorText};
    font-size: 13px;
    resize: vertical;
  `,
}));

/**
 * ChatInput 上方的内联「交互请求」卡片：渲染扩展经 ctx.ui.select / confirm / input 发起的请求
 * （由 ExtensionUiHost 写入 uiPromptStore），用户应答经 extension_ui_response 回传——取代原先的
 * 全局 Modal 弹窗，做成像 GoalPill 那样的输入框上方引导卡片，不打断、不弹窗。
 */
export const PromptRequestCard = memo(function PromptRequestCard() {
  const { workspace } = useAgentStoreContext();
  const item = useUiPromptStore((s) => s.byWorkspace[workspace]);
  const [text, setText] = useState('');

  const requestId = item?.request.id;
  useEffect(() => {
    setText(item?.request.prefill ? String(item.request.prefill) : '');
  }, [requestId, item?.request.prefill]);

  const respond = useCallback(
    (payload: Record<string, unknown>) => {
      if (!item) return;
      void extensionUiRespond(item.workspace, {
        type: 'extension_ui_response',
        id: item.request.id,
        ...payload,
      });
      useUiPromptStore.getState().clear(item.workspace, item.request.id);
    },
    [item],
  );

  if (!item) return null;
  const { request } = item;
  const isConfirm = request.method === 'confirm';
  const isInput = request.method === 'input';
  const options = request.options?.length ? request.options : ['确定', '取消'];

  // confirm 的提示在 message；select/input 的提示在 title（统一渲染到 body）。
  const heading = isConfirm ? (request.title ?? '确认') : '请确认';
  const body = isConfirm ? (request.message ?? request.title ?? '') : (request.title ?? '');

  const dismiss = () => respond(isConfirm ? { confirmed: false } : { cancelled: true });

  return (
    <div className={styles.card} data-testid="prompt-request-card">
      <div className={styles.head}>
        <Icon icon={MessageCircleQuestion} size={13} />
        <span className={styles.headTitle}>{heading}</span>
        <button
          className={styles.close}
          data-testid="prompt-request-dismiss"
          onClick={dismiss}
          title="取消"
          type="button"
        >
          <Icon icon={X} size={14} />
        </button>
      </div>
      {body ? <div className={styles.body}>{body}</div> : null}

      {isConfirm ? (
        <div className={styles.row}>
          <Button data-testid="prompt-request-cancel" onClick={() => respond({ confirmed: false })} size="small">
            取消
          </Button>
          <Button
            data-testid="prompt-request-confirm"
            onClick={() => respond({ confirmed: true })}
            size="small"
            type="primary"
          >
            确定
          </Button>
        </div>
      ) : isInput ? (
        <>
          <textarea
            className={styles.textarea}
            data-testid="prompt-request-input"
            onChange={(e) => setText(e.target.value)}
            placeholder={typeof request.placeholder === 'string' ? request.placeholder : undefined}
            rows={3}
            value={text}
          />
          <div className={styles.row}>
            <Button data-testid="prompt-request-cancel" onClick={dismiss} size="small">
              取消
            </Button>
            <Button
              data-testid="prompt-request-submit"
              onClick={() => respond({ value: text })}
              size="small"
              type="primary"
            >
              提交
            </Button>
          </div>
        </>
      ) : (
        <div className={styles.options}>
          {options.map((opt, i) => (
            <button
              className={styles.option}
              data-testid={`prompt-request-opt-${i}`}
              key={opt}
              onClick={() => respond({ value: opt })}
              type="button"
            >
              <span className={styles.letter}>{String.fromCharCode(65 + i)}</span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
