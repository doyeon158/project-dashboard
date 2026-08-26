export type Status = "pending" | "wip" | "done";
export type Priority = "high" | "mid" | "low";

export type Task = {
  id: string;
  text: string;
  status: Status;
  priority: Priority;
  progress: number; // 0~100
  date: string; // 등록일 (빈 값 허용)
  /** 대주제(부모) 업무의 id. 없으면 그 자체가 대주제이거나 단독 업무. */
  parentId?: string;
};

/** pinnedAt: 고정한 시각(ms). 없으면 고정 안 된 항목. */
export type Note = { id: string; title: string; body: string; date: string; pinnedAt?: number };
/**
 * 기록은 두 가지 형태를 쓴다.
 *   · 양식   — label(항목) + value(값).            예: "GPU 사용 시간" = "128h"
 *   · 무양식 — text 한 줄에 자유롭게.               예: "mAP (baseline) 65%, 현재 70%, 목표 90%"
 * text 가 있으면 무양식으로 표시한다.
 */
export type Rec = {
  id: string;
  label: string;
  value: string;
  date: string;
  pinnedAt?: number;
  text?: string;
};

export type Project = {
  id: string;
  name: string;
  code: string;
  sub: string;
  role: string;
  color: string;
  colorBg: string;
  colorText: string;
  notes: Note[];
  tasks: Task[];
  records: Rec[];
};

export type Deadline = { id: string; date: string; label: string };
export type Memo = { id: string; ts: string; html: string };
export type Profile = { name: string; team: string; email: string };

export type State = {
  version: number;
  profile: Profile;
  deadlines: Deadline[];
  memos: Memo[];
  projects: Project[];
};

export const STATUS_LABEL: Record<Status, string> = {
  pending: "대기",
  wip: "진행",
  done: "완료",
};

export const STATUS_NEXT: Record<Status, Status> = {
  pending: "wip",
  wip: "done",
  done: "pending",
};

export const STATUS_COLOR: Record<Status, string> = {
  pending: "#aaaaaa",
  wip: "#d97706",
  done: "#2a7a4b",
};

export const PRIORITY_LABEL: Record<Priority, string> = { high: "HIGH", mid: "MID", low: "LOW" };
export const PRIORITY_COLOR: Record<Priority, string> = {
  high: "#c84b31",
  mid: "#d97706",
  low: "#737373",
};

export const PALETTE: Array<{ color: string; colorBg: string }> = [
  { color: "#1a56db", colorBg: "#eff4ff" },
  { color: "#c84b31", colorBg: "#fff4f1" },
  { color: "#2a7a4b", colorBg: "#f0faf4" },
  { color: "#7c3aed", colorBg: "#f5f0ff" },
  { color: "#b45309", colorBg: "#fff8ed" },
  { color: "#0e7490", colorBg: "#eff9fb" },
];

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 대주제(하위 업무를 가진 업무) 목록 */
export function childrenOf(tasks: Task[], parentId: string) {
  return tasks.filter((t) => t.parentId === parentId);
}

export function hasChildren(tasks: Task[], id: string) {
  return tasks.some((t) => t.parentId === id);
}

/**
 * 진행률 계산에 쓰는 실제 작업 단위.
 * 대주제는 하위 업무의 평균이므로 중복 계산하지 않도록 제외한다.
 */
export function leafTasks(tasks: Task[]) {
  return tasks.filter((t) => !hasChildren(tasks, t.id));
}

export function taskProgress(t: Task) {
  return t.status === "done" ? 100 : clampPct(t.progress);
}

/** 대주제 진행률 = 하위 업무 진행률 평균 */
export function groupProgress(tasks: Task[], parentId: string) {
  const kids = childrenOf(tasks, parentId);
  if (!kids.length) return 0;
  return Math.round(kids.reduce((a, t) => a + taskProgress(t), 0) / kids.length);
}

/** 대주제 상태 = 하위 업무를 종합한 값 */
export function groupStatus(tasks: Task[], parentId: string): Status {
  const kids = childrenOf(tasks, parentId);
  if (!kids.length) return "pending";
  if (kids.every((t) => t.status === "done")) return "done";
  if (kids.some((t) => t.status !== "pending" || t.progress > 0)) return "wip";
  return "pending";
}

/** 프로젝트 전체 진행률 = 실제 작업(하위 업무·단독 업무) 진행률 평균 */
export function overall(p: Project) {
  const leaves = leafTasks(p.tasks);
  if (!leaves.length) return 0;
  return Math.round(leaves.reduce((a, t) => a + taskProgress(t), 0) / leaves.length);
}

/**
 * 붙여넣은 개요를 대주제/하위 업무로 해석한다.
 *
 *   * LLM 모델 성능 비교 및 선정        ← 들여쓰기 없음 = 대주제
 *      * Llama 계열 추론 테스트         ← 들여쓰기 = 하위 업무
 *
 * 글머리표(*, -, •, 1.)는 있어도 없어도 되고, 탭은 공백 4칸으로 센다.
 */
export function parseOutline(text: string): Array<{ text: string; depth: 0 | 1 }> {
  const out: Array<{ text: string; depth: 0 | 1 }> = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m = raw.match(/^([ \t]*)(?:[*\-•·]|\d+[.)])?[ \t]*(.*)$/);
    if (!m) continue;
    const body = m[2].trim();
    if (!body) continue;
    const indent = m[1].replace(/\t/g, "    ").length;
    // 첫 줄이 들여쓰기돼 있어도 붙일 대주제가 없으면 대주제로 본다
    const depth: 0 | 1 = indent >= 2 && out.some((x) => x.depth === 0) ? 1 : 0;
    out.push({ text: body, depth });
  }
  return out;
}

/**
 * 고정된 항목을 최상단으로 올린다.
 *   · 고정끼리는 최근에 고정한 것이 위 (방금 누른 게 맨 위로)
 *   · 고정 해제하면 원래 배열 순서(= 추가된 시간 순)로 되돌아간다
 */
export function orderPinned<T extends { pinnedAt?: number }>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ap = a.item.pinnedAt || 0;
      const bp = b.item.pinnedAt || 0;
      if (ap && bp) return bp - ap; // 둘 다 고정
      if (ap !== bp) return bp ? 1 : -1; // 고정된 쪽이 위
      return a.i - b.i; // 원래 순서 유지
    })
    .map((v) => v.item);
}

export function clampPct(v: unknown) {
  const n = Math.round(Number(v) || 0);
  return Math.max(0, Math.min(100, n));
}

/** 오늘 기준 D-day (음수면 지난 일정) */
export function dday(dateStr: string) {
  const a = new Date(today() + "T00:00:00");
  const b = new Date(dateStr + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function ddayLabel(n: number) {
  if (n === 0) return "D-DAY";
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
