import { Modal } from '@lobehub/ui';
import { useEffect, useState } from 'react';
import { extensionUiRespond, onPiUiRequest, type PiUiRequestEnvelope } from '../../lib/pi';
import { usePlanModeStore } from '../../stores/planModeStore';

/**
 * Renders extension UI requests (confirm/select) emitted by Pi extensions over
 * `pi://ui-request` and sends the user's answer back via `extension_ui_respond`.
 *
 * The response MUST carry `type: "extension_ui_response"`, otherwise the Pi
 * sidecar never resolves the pending `ctx.ui.*` promise and the agent turn hangs.
 */
export function ExtensionUiHost() {
  const [item, setItem] = useState<PiUiRequestEnvelope | null>(null);

  useEffect(() => {
    let un: undefined | (() => void);
    void onPiUiRequest((e) => {
      const method = e.request.method;
      if (method === 'setStatus') {
        const r = e.request as { statusKey?: unknown; statusText?: unknown };
        if (r.statusKey === 'plan-mode') {
          usePlanModeStore.getState().setStatus(typeof r.statusText === 'string' ? r.statusText : undefined);
        }
        return;
      }
      if (method === 'confirm' || method === 'select' || method === 'input') {
        setItem(e);
      }
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
  }, []);

  if (!item) return null;
  const { workspace = '.', request } = item;
  const isConfirm = request.method === 'confirm';
  const options: string[] = isConfirm
    ? ['确定', '取消']
    : Array.isArray(request.options)
      ? request.options
      : ['确定', '取消'];

  // confirm → { confirmed }; select/input → { value }; dismiss → { cancelled }.
  const send = (payload: Record<string, unknown>) => {
    void extensionUiRespond(workspace, { type: 'extension_ui_response', id: request.id, ...payload });
    setItem(null);
  };
  const pick = (opt: string) => send(isConfirm ? { confirmed: opt === '确定' } : { value: opt });
  const dismiss = () => send(isConfirm ? { confirmed: false } : { cancelled: true });

  // confirm's prompt lives in `message`; select/input's prompt lives in `title`
  // (rendered in the body to avoid a multi-line Modal header).
  const heading = isConfirm ? request.title ?? '确认' : '请确认操作';
  const body = isConfirm ? request.message ?? request.title ?? '' : request.title ?? '';

  return (
    <Modal footer={null} onCancel={dismiss} open title={heading}>
      <div style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{body}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {options.map((opt, i) => (
          <button data-testid={`ext-ui-opt-${i}`} key={opt} onClick={() => pick(opt)} type="button">
            {opt}
          </button>
        ))}
      </div>
    </Modal>
  );
}
