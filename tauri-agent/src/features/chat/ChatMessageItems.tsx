import { lazy, Suspense, type ReactNode } from 'react';
import type { DisplayMessage } from './groupMessages';
import { UserMessage } from './UserMessage';
import { TurnTimeline } from './TurnTimeline';
import { NoticePill } from './NoticePill';
import { AnswerCard } from './AnswerCard';
import { PlanCard } from './PlanCard';
import { QuestionsCard } from './QuestionsCard';
import { LazyMount } from './LazyMount';
import { expandSubAgents, subAgentMode, taskLabel } from '../panels/subagentUtils';
import type { NumberedUnit } from './SubAgentGroupInline';

const ToolExecution = lazy(() =>
  import('../tools/ToolExecution').then((m) => ({ default: m.ToolExecution })),
);
const SubAgentInline = lazy(() =>
  import('./SubAgentInline').then((m) => ({ default: m.SubAgentInline })),
);
const SubAgentGroupInline = lazy(() =>
  import('./SubAgentGroupInline').then((m) => ({ default: m.SubAgentGroupInline })),
);

interface ChatMessageItemsProps {
  messages: DisplayMessage[];
  /** 开启「可见才渲染」虚拟化（主对话用）：每条消息用 LazyMount 包裹，切换时只渲染可见的几条。 */
  lazy?: boolean;
}

/** 共享的对话气泡渲染：主对话与子代理对话复用同一套 user/assistant/tool/notice 组件。 */
export function ChatMessageItems({ messages, lazy: lazyRender = false }: ChatMessageItemsProps) {
  // 把每次 spawn_agent 调用展开成「逐个子代理」，并赋全局连续序号（#N，跨调用累加）。
  const unitsByMessage = new Map<string, NumberedUnit[]>();
  let counter = 0;
  for (const msg of messages) {
    if (msg.kind === 'tool' && msg.toolName === 'spawn_agent') {
      const units = expandSubAgents(msg.id, msg.args, msg.result, msg.status).map((unit) => ({
        unit,
        no: ++counter,
      }));
      unitsByMessage.set(msg.id, units);
    }
  }

  // 提问卡「已答」判定：其后若已出现用户消息，则该卡定格为只读已答态（最后一张未答的仍可交互）。
  const answeredQuestions = new Set<string>();
  let seenUserAfter = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === 'user') seenUserAfter = true;
    else if (m.kind === 'notice' && m.customType === 'agent-questions' && seenUserAfter) {
      answeredQuestions.add(m.id);
    }
  }

  const renderBody = (msg: DisplayMessage): ReactNode => {
    switch (msg.kind) {
      case 'user':
        return <UserMessage key={msg.id} text={msg.text} images={msg.images} />;
      case 'turn':
        return <TurnTimeline key={msg.id} segments={msg.segments} />;
      case 'tool':
        if (msg.toolName === 'spawn_agent') {
          const numbered = unitsByMessage.get(msg.id) ?? [];
          // 单任务 → 一张状态卡；并行/链式 → 展开成每个子代理一行的组。
          if (numbered.length <= 1) {
            const only = numbered[0];
            return (
              <Suspense key={msg.id} fallback={null}>
                <SubAgentInline
                  messageId={msg.id}
                  toolCallId={msg.toolCallId}
                  index={only?.no ?? 1}
                  task={only?.unit.task ?? taskLabel(msg.args)}
                  result={msg.result}
                  status={msg.status}
                />
              </Suspense>
            );
          }
          return (
            <Suspense key={msg.id} fallback={null}>
              <SubAgentGroupInline
                messageId={msg.id}
                toolCallId={msg.toolCallId}
                mode={subAgentMode(msg.args)}
                status={msg.status}
                units={numbered}
              />
            </Suspense>
          );
        }
        return (
          <Suspense key={msg.id} fallback={null}>
            <ToolExecution
              toolName={msg.toolName}
              toolCallId={msg.toolCallId}
              args={msg.args}
              result={msg.result}
              status={msg.status}
            />
          </Suspense>
        );
      case 'notice':
        // 选择题留痕（askChoice）→ AnswerCard；规划 → PlanCard；提问 → QuestionsCard；其余 → NoticePill。
        if (msg.customType === 'agent-answer') {
          return <AnswerCard key={msg.id} content={msg.content} />;
        }
        if (msg.customType === 'agent-plan') {
          return <PlanCard key={msg.id} content={msg.content} />;
        }
        if (msg.customType === 'agent-questions') {
          return (
            <QuestionsCard
              key={msg.id}
              answered={answeredQuestions.has(msg.id)}
              content={msg.content}
            />
          );
        }
        return <NoticePill key={msg.id} customType={msg.customType} content={msg.content} />;
      default:
        return null;
    }
  };

  return (
    <>
      {messages.map((msg, i) => {
        const node = renderBody(msg);
        if (!lazyRender || !node) return node;
        // 末尾若干条（切换后通常可见的底部）立即渲染：避免切换时底部出现「占位空帧→内容」的
        // 过渡闪动；上方 off-screen 的老消息才走 LazyMount，进视口再渲染。
        const eager = i >= messages.length - EAGER_TAIL;
        return eager ? node : <LazyMount key={msg.id}>{node}</LazyMount>;
      })}
    </>
  );
}

/**
 * 末尾立即渲染的消息条数：取「刚好覆盖切换后视口可见的底部」——太大(如 15)会在切换时同步渲染过多
 * 重型 markdown 阻塞主线程(卡顿)，太小则底部会闪一帧占位。6 约等于一屏可见量，兼顾不闪与不卡；
 * 其余 off-screen 老消息走 LazyMount 进视口再渲染。
 */
const EAGER_TAIL = 6;
