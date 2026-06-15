import { Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import { pi } from '../../lib/pi';
import { useSessionStore } from '../../store/session';
import { parseModels, type ModelInfo } from '../chat/input/modelUtils';

interface ModelSelectFieldProps {
  value: string;
  placeholder?: string;
  testId?: string;
  onChange: (v: string) => void;
}

/**
 * 全局功能模型选择（标题/子代理/记忆等）：
 * 选项来自 pi.getAvailableModels(当前 activeWorkspace)——模型列表对全局通用，借当前对话取即可，
 * App 启动必有 activeWorkspace，故不存在“鸡生蛋”死锁。值用 config 约定的 "provider/id"。
 * 拿不到列表（无对话 / 失败 / 空）时回退手填 Input。
 */
export function ModelSelectField({ value, placeholder, testId, onChange }: ModelSelectFieldProps) {
  const workspace = useSessionStore((s) => s.activeWorkspace);
  const [models, setModels] = useState<ModelInfo[] | null>(null);

  useEffect(() => {
    if (!workspace) {
      setModels(null);
      return;
    }
    let cancelled = false;
    void pi
      .getAvailableModels(workspace)
      .then((raw) => {
        if (!cancelled) setModels(parseModels(raw));
      })
      .catch(() => {
        if (!cancelled) setModels(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  // 拿不到可用模型列表时回退手填，避免无对话时无法配置。
  if (!models || models.length === 0) {
    return (
      <Input
        data-testid={testId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const options = models.map((m) => ({ label: m.name ?? m.id, value: `${m.provider}/${m.id}` }));
  // 当前值若不在列表（历史手填 / 列表变动），补一项保留显示，避免被清空。
  if (value && !options.some((o) => o.value === value)) {
    options.unshift({ label: value, value });
  }

  return (
    <Select
      data-testid={testId}
      value={value || undefined}
      options={options}
      placeholder={placeholder}
      style={{ minWidth: 220 }}
      allowClear
      showSearch
      optionFilterProp="label"
      onChange={(v) => onChange(v ?? '')}
    />
  );
}
