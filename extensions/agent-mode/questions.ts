// 对话流提问卡（Questions）：把 AI 的提问规范化为结构化卡数据，经
// sendMessage(customType:"agent-questions") 产出，前端 QuestionsCard 渲染为对话流内的
// 多选卡片（不弹窗）。纯逻辑无 I/O，便于单测。

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionSpec {
  id: string;
  title: string;
  options: QuestionOption[];
  allowMultiple: boolean;
}

export interface QuestionsCardData {
  kind: "questions";
  id: string;
  questions: QuestionSpec[];
}

// AI 经 ask_user 工具传入的原始问题（宽松形状，运行时规范化）。
export interface RawQuestion {
  question?: string;
  options?: Array<{ id?: string; label?: string } | string>;
  allowMultiple?: boolean;
}

// 生成提问卡 id：q-<base36 时间戳>-<rand>。
export function makeQuestionsId(now: Date = new Date(), rand: string = Math.random().toString(36).slice(2, 6)): string {
  return `q-${now.getTime().toString(36)}-${rand}`;
}

// 规范化：补全问题/选项 id、去空白、过滤空项；无任何合法问题时返回 null（调用方据此报错）。
export function normalizeQuestions(raw: RawQuestion[], id: string): QuestionsCardData | null {
  const questions: QuestionSpec[] = [];
  raw.forEach((q) => {
    const title = (q?.question ?? "").trim();
    if (!title) return;
    const options: QuestionOption[] = [];
    (q.options ?? []).forEach((o) => {
      const label = (typeof o === "string" ? o : (o?.label ?? "")).trim();
      if (!label) return;
      const rawId = typeof o === "string" ? "" : (o?.id ?? "").trim();
      // 按「有效项顺序」连续编号（跳过的空项不占号），保证 q1/q2、o1/o2 连续。
      options.push({ id: rawId || `o${options.length + 1}`, label });
    });
    questions.push({
      id: `q${questions.length + 1}`,
      title,
      options,
      allowMultiple: Boolean(q.allowMultiple),
    });
  });
  if (questions.length === 0) return null;
  return { kind: "questions", id, questions };
}
