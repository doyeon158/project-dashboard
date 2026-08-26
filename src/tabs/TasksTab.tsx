import { useEffect, useRef, useState } from "react";
import Editable from "../Editable";
import { AddButton, DeleteX, FormActions, MONO, ProgressBar, RADIUS } from "../ui";
import type { Project, Status, Task } from "../types";
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_NEXT,
  childrenOf,
  clampPct,
  groupProgress,
  groupStatus,
  hasChildren,
  leafTasks,
  parseOutline,
  today,
  uid,
} from "../types";

/** 업무 탭 — 대주제 + 하위 업무 목록과 등록 폼 */
export default function TasksTab({
  project,
  patch,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ text: "", priority: "mid" as Task["priority"] });
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [subText, setSubText] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (adding) textRef.current?.focus();
  }, [adding]);

  const tasks = project.tasks;
  const leaves = leafTasks(tasks);
  const doneCount = leaves.filter((t) => t.status === "done").length;

  function patchTask(taskId: string, p: Partial<Task>) {
    patch({ tasks: tasks.map((t) => (t.id === taskId ? { ...t, ...p } : t)) });
  }

  /** 입력한 개요를 대주제/하위 업무로 만들어 한 번에 등록. 한 줄이면 업무 하나. */
  function submit() {
    const rows = parseOutline(draft.text);
    if (!rows.length) return;
    const created: Task[] = [];
    let parentId: string | undefined;
    for (const row of rows) {
      const id = uid();
      if (row.depth === 0) parentId = id;
      created.push({
        id,
        text: row.text,
        status: "pending",
        priority: draft.priority,
        progress: 0,
        date: today(),
        ...(row.depth === 1 && parentId ? { parentId } : {}),
      });
    }
    patch({ tasks: [...tasks, ...created] });
    setDraft({ text: "", priority: "mid" });
    setAdding(false);
  }

  function addSubTask(parentId: string, text: string) {
    if (!text.trim()) return;
    const next = [...tasks];
    // 같은 대주제의 마지막 하위 업무 뒤에 넣는다
    let at = next.findIndex((t) => t.id === parentId);
    for (let i = at + 1; i < next.length; i++) {
      if (next[i].parentId === parentId) at = i;
    }
    next.splice(at + 1, 0, {
      id: uid(),
      text: text.trim(),
      status: "pending",
      priority: "mid",
      progress: 0,
      date: today(),
      parentId,
    });
    patch({ tasks: next });
    setSubText("");
  }

  function cycleStatus(t: Task) {
    const next: Status = STATUS_NEXT[t.status];
    const progress =
      next === "done" ? 100 : next === "pending" ? 0 : t.progress === 100 ? 50 : t.progress;
    patchTask(t.id, { status: next, progress });
  }

  function setProgress(t: Task, raw: string) {
    const v = clampPct(raw);
    const status: Status =
      v >= 100 ? "done" : v > 0 ? "wip" : t.status === "done" ? "wip" : t.status;
    patchTask(t.id, { progress: v, status });
  }

  /** 대주제를 지우면 하위 업무도 함께 */
  function deleteGroup(parentId: string, label: string, childCount: number) {
    if (childCount > 0 && !confirm(`'${label}' 과 하위 업무 ${childCount}건을 지울까요?`)) return;
    patch({ tasks: tasks.filter((t) => t.id !== parentId && t.parentId !== parentId) });
  }

  const rowProps = (task: Task) => ({
    task,
    accentColor: project.color,
    onCycle: () => cycleStatus(task),
    onProgress: (v: string) => setProgress(task, v),
    onPriority: (p: Task["priority"]) => patchTask(task.id, { priority: p }),
    onText: (v: string) => patchTask(task.id, { text: v }),
    onDelete: () => patch({ tasks: tasks.filter((t) => t.id !== task.id) }),
  });

  const tops = tasks.filter((t) => !t.parentId);
  const doneRank = (t: Task) =>
    hasChildren(tasks, t.id)
      ? groupStatus(tasks, t.id) === "done"
        ? 1
        : 0
      : t.status === "done"
        ? 1
        : 0;

  return (
    <div className="px-8 py-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div className="text-[12px] text-[#737373] uppercase tracking-widest font-medium">
          업무 목록 · 완료 {doneCount}/{leaves.length}
        </div>
        <AddButton label="+ 업무 추가" onClick={() => setAdding(true)} />
      </div>

      {adding && (
        <div
          className="mb-4 border border-[#e5e5e3] p-4 flex flex-col gap-3"
          style={{ borderRadius: RADIUS }}
        >
          <textarea
            ref={textRef}
            value={draft.text}
            onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
            rows={7}
            placeholder={
              "업무 내용 입력. 여러 줄을 붙여넣으면 대주제/하위 업무로 나뉩니다.\n\n" +
              "* LLM 모델 성능 비교 및 선정\n" +
              "   * Llama 계열 및 Qwen 계열 모델 추론 테스트\n" +
              "   * 한국어 응답 품질 비교\n" +
              "* RAG 기반 질의응답 기능 개발\n" +
              "   * 문서 전처리 및 Chunking"
            }
            className="w-full text-[13.5px] text-[#0f0f0f] bg-transparent border-b border-[#e5e5e3] pb-2 focus:border-[#0f0f0f] transition-colors leading-relaxed"
            style={{ resize: "vertical" }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <div className="text-[11.5px] text-[#aaaaaa] leading-relaxed">
            들여쓰기(공백 2칸 이상 또는 탭)된 줄이 바로 위 대주제의 하위 업무가 됩니다. 글머리표{" "}
            <code>*</code> <code>-</code> <code>1.</code> 는 있어도 없어도 됩니다. 저장은{" "}
            <b>Ctrl+Enter</b> 또는 아래 버튼.
          </div>
          {(() => {
            const rows = parseOutline(draft.text);
            if (!rows.length) return null;
            const groups = rows.filter((r) => r.depth === 0).length;
            return (
              <div className="text-[11.5px] text-[#737373]" style={MONO}>
                대주제 {groups}개 · 하위 업무 {rows.length - groups}개 등록됩니다
              </div>
            );
          })()}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#737373]">우선순위:</span>
            {(["high", "mid", "low"] as Task["priority"][]).map((p) => (
              <button
                key={p}
                onClick={() => setDraft((d) => ({ ...d, priority: p }))}
                className={`text-[11px] font-medium px-2.5 py-1 border transition-colors ${
                  draft.priority === p
                    ? "border-[#0f0f0f] bg-[#0f0f0f] text-white"
                    : "border-[#e5e5e3] text-[#737373] hover:border-[#0f0f0f]"
                }`}
                style={{ ...MONO, borderRadius: RADIUS }}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
          <FormActions color={project.color} onSave={submit} onCancel={() => setAdding(false)} />
        </div>
      )}

      {tasks.length === 0 && !adding && (
        <div className="text-[13px] text-[#aaaaaa] py-12 text-center">아직 업무가 없습니다.</div>
      )}

      {[...tops]
        .sort((a, b) => doneRank(a) - doneRank(b))
        .map((top) => {
          const kids = childrenOf(tasks, top.id);
          if (!kids.length) return <TaskRow key={top.id} {...rowProps(top)} />;

          const gp = groupProgress(tasks, top.id);
          const gs = groupStatus(tasks, top.id);
          const kidsDone = kids.filter((t) => t.status === "done").length;
          const sorted = [...kids].sort(
            (a, b) =>
              (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) ||
              a.progress - b.progress,
          );
          return (
            <div key={top.id} className="mb-4">
              {/* 대주제 */}
              <div className="flex items-center gap-3 py-2 border-b border-[#e5e5e3] group">
                <span
                  className="w-1.5 h-1.5 flex-shrink-0"
                  style={{ backgroundColor: STATUS_COLOR[gs] }}
                />
                <Editable
                  value={top.text}
                  onCommit={(v) => patchTask(top.id, { text: v })}
                  className="flex-1 min-w-0 text-[13.5px] font-semibold text-[#0f0f0f]"
                />
                <span className="text-[11px] text-[#737373]" style={MONO}>
                  {kidsDone}/{kids.length}
                </span>
                <ProgressBar pct={gp} color={project.color} className="w-16 flex-shrink-0" />
                <span className="text-[11.5px] font-semibold w-9 text-right" style={MONO}>
                  {gp}%
                </span>
                <DeleteX
                  title="대주제와 하위 업무 삭제"
                  onClick={() => deleteGroup(top.id, top.text, kids.length)}
                />
              </div>

              {/* 하위 업무 */}
              <div className="pl-4">
                {sorted.map((kid) => (
                  <TaskRow key={kid.id} {...rowProps(kid)} />
                ))}

                {addingSubFor === top.id ? (
                  <div className="flex items-center gap-2 py-2">
                    <input
                      autoFocus
                      value={subText}
                      onChange={(e) => setSubText(e.target.value)}
                      placeholder="하위 업무 내용"
                      className="flex-1 text-[13px] text-[#0f0f0f] bg-transparent border-b border-[#e5e5e3] focus:border-[#0f0f0f] pb-1"
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === "Enter") addSubTask(top.id, subText);
                        if (e.key === "Escape") {
                          setAddingSubFor(null);
                          setSubText("");
                        }
                      }}
                    />
                    <button
                      onClick={() => addSubTask(top.id, subText)}
                      className="text-[11.5px] font-semibold px-2.5 py-1 text-white"
                      style={{ backgroundColor: project.color, borderRadius: RADIUS }}
                    >
                      추가
                    </button>
                    <button
                      onClick={() => {
                        setAddingSubFor(null);
                        setSubText("");
                      }}
                      className="text-[11.5px] px-2 py-1 text-[#737373]"
                    >
                      완료
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAddingSubFor(top.id);
                      setSubText("");
                    }}
                    className="text-[11.5px] text-[#aaaaaa] hover:text-[#0f0f0f] transition-colors py-1.5"
                  >
                    + 하위 업무
                  </button>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function TaskRow({
  task,
  accentColor,
  onCycle,
  onProgress,
  onPriority,
  onText,
  onDelete,
}: {
  task: Task;
  accentColor: string;
  onCycle: () => void;
  onProgress: (v: string) => void;
  onPriority: (p: Task["priority"]) => void;
  onText: (v: string) => void;
  onDelete: () => void;
}) {
  const done = task.status === "done";
  return (
    <div
      className={`flex items-center gap-3 py-3 px-2 -mx-1 border-b border-[#f0f0ee] group hover:bg-[#fafafa] transition-colors ${
        done ? "opacity-55" : ""
      }`}
    >
      <button
        onClick={onCycle}
        title={`상태 변경 (현재: ${STATUS_LABEL[task.status]})`}
        className="relative w-4 h-4 border flex-shrink-0 flex items-center justify-center transition-colors before:absolute before:-inset-2 before:content-['']"
        style={{
          borderRadius: RADIUS,
          backgroundColor: done ? accentColor : "transparent",
          borderColor: done ? accentColor : task.status === "wip" ? STATUS_COLOR.wip : "#c0c0be",
        }}
      >
        {done && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path
              d="M1 3.5L3.5 6L8 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        {task.status === "wip" && (
          <span className="w-1.5 h-1.5" style={{ backgroundColor: STATUS_COLOR.wip }} />
        )}
      </button>

      <Editable
        value={task.text}
        onCommit={onText}
        className={`flex-1 min-w-0 text-[13.5px] ${
          done ? "line-through text-[#aaaaaa]" : "text-[#0f0f0f]"
        }`}
      />

      <button
        onClick={onCycle}
        className="text-[10.5px] font-semibold w-8 text-center flex-shrink-0 py-2 -my-2"
        style={{ ...MONO, color: STATUS_COLOR[task.status] }}
      >
        {STATUS_LABEL[task.status]}
      </button>

      <button
        onClick={() =>
          onPriority(task.priority === "high" ? "mid" : task.priority === "mid" ? "low" : "high")
        }
        title="우선순위 변경"
        className="text-[10.5px] font-semibold w-9 text-center flex-shrink-0 py-2 -my-2"
        style={{ ...MONO, color: PRIORITY_COLOR[task.priority] }}
      >
        {PRIORITY_LABEL[task.priority]}
      </button>

      <span className="flex items-center gap-0.5 flex-shrink-0">
        <input
          type="number"
          min={0}
          max={100}
          value={task.progress}
          onChange={(e) => onProgress(e.target.value)}
          className="w-12 text-[11.5px] text-right text-[#0f0f0f] bg-transparent border border-transparent hover:border-[#e5e5e3] focus:border-[#0f0f0f] px-1 py-0.5"
          style={{ ...MONO, borderRadius: RADIUS }}
        />
        <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
          %
        </span>
      </span>

      <span className="text-[11px] text-[#aaaaaa] w-20 text-right flex-shrink-0" style={MONO}>
        {task.date}
      </span>

      <DeleteX onClick={onDelete} />
    </div>
  );
}
