import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentStoreContext } from '../../stores/AgentStoreContext';
import { pi } from '../../lib/pi';

const AUTOSAVE_DEBOUNCE_MS = 600;

export interface SettingsForm {
  values: Record<string, string>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setValue: (key: string, value: string) => void;
  /** 立即把设置持久化到磁盘（写 runtime-settings.json，不重启 sidecar）。 */
  persist: () => Promise<void>;
  /** 重启 sidecar 使设置生效（仅 restart 类设置需要）。 */
  save: () => Promise<void>;
}

export function useSettingsForm(): SettingsForm {
  const { workspace } = useAgentStoreContext();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef(workspace);
  wsRef.current = workspace;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void pi
      .getSettings()
      .then((s) => {
        if (alive) setValues(s ?? {});
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 卸载时清防抖，避免对已卸载组件 setState / 多余写盘。
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const persistValues = useCallback(async (v: Record<string, string>) => {
    setError(null);
    try {
      await pi.setSettings(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const setValue = useCallback(
    (key: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value };
        valuesRef.current = next;
        return next;
      });
      // 防抖即时落盘：后端写 runtime-settings.json → 扩展 fs.watch 热更新，无需重启。
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void persistValues(valuesRef.current);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persistValues],
  );

  const persist = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await persistValues(valuesRef.current);
  }, [persistValues]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await pi.setSettings(valuesRef.current);
      // restart 类设置：close + open 重启 sidecar 使其生效。
      const ws = wsRef.current;
      await pi.closeWorkspace(ws);
      await pi.openWorkspace(ws);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, []);

  return { values, loading, saving, error, setValue, persist, save };
}
