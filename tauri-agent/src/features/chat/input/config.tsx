import type { ComponentType } from 'react';
import ModelAction from './actions/ModelAction';
import ThinkingAction from './actions/ThinkingAction';
import CompactAction from './actions/CompactAction';
import NewSessionAction from './actions/NewSessionAction';
import UploadAction from './actions/UploadAction';
import KbAddAction from './actions/KbAddAction';
import GenerateImageAction from './actions/GenerateImageAction';
import SpeakAction from './actions/SpeakAction';

/**
 * 动作注册表：key -> 组件。
 * 新增一个工具按钮 = 在此登记一项 + 在 leftActions/rightActions 数组里加 key。
 */
export const actionMap = {
  model: ModelAction,
  thinking: ThinkingAction,
  compact: CompactAction,
  newSession: NewSessionAction,
  fileUpload: UploadAction,
  kbAdd: KbAddAction,
  generateImage: GenerateImageAction,
  speak: SpeakAction,
} satisfies Record<string, ComponentType>;

export type ActionKey = keyof typeof actionMap;

export const DEFAULT_LEFT_ACTIONS: ActionKey[] = [
  'model',
  'thinking',
  'fileUpload',
  'kbAdd',
  'generateImage',
  'speak',
  'compact',
  'newSession',
];
export const DEFAULT_RIGHT_ACTIONS: ActionKey[] = [];
