import { createStaticStyles, cssVar } from 'antd-style';

/** 共享的 ChatItem 外壳 / 气泡 / ContentBlock 样式（对齐 lobehub 间距，无头像）。 */
export const chatStyles = createStaticStyles(({ css }) => ({
  item: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-block: 8px;
    max-width: 100%;
  `,
  itemUser: css`
    align-items: flex-end;
    padding-inline-start: 36px;
  `,
  body: css`
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 100%;
    overflow: hidden;
  `,
  bodyAssistant: css`
    width: 100%;
  `,
  bubble: css`
    padding: 8px 12px;
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorFillTertiary};
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  `,
}));
