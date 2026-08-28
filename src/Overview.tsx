import { useState } from "react";
import Editable from "./Editable";
import { DeleteX, MONO, ProgressBar, RADIUS, SectionTitle, Tile } from "./ui";
import type { Deadline, Memo, Note, Project, State } from "./types";
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  dday,
  ddayLabel,
  doneStamp,
  escapeHtml,
  leafTasks,
  overall,
  today,
  uid,
} from "./types";

/** 한눈에 보기 — 전체 프로젝트·일정·우선 업무·메모를 한 화면에 */
export default function Overview({
  state,
  update,
  onOpenProject,
}: {
  state: State;
  update: (fn: (s: State) => State) => void;
  onOpenProject: (projectId: string) => void;
}) {
  const [newDl, setNewDl] = useState({ date: "", label: "" });
  const [memoText, setMemoText] = useState("");

  const projects = state.projects;
  // 대주제는 하위 업무의 집계값이므로 세지 않는다 (leafTasks = 실제 작업 단위)
  const allTasks = projects.flatMap((p) => leafTasks(p.tasks).map((t) => ({ t, p })));
  const openTasks = allTasks.filter((x) => x.t.status !== "done");
  const avg = projects.length
    ? Math.round(projects.reduce((a, p) => a + overall(p), 0) / projects.length)
    : 0;

  const deadlines = [...state.deadlines]
    .map((d) => ({ ...d, dd: dday(d.date) }))
    .sort((a, b) => a.dd - b.dd);
  const nextDl = deadlines.find((d) => d.dd >= 0);

  // 우선 처리: 진행 중 → HIGH → 진행률 높은 순
  const prioOrder = { high: 0, mid: 1, low: 2 } as const;
  const focus = [...openTasks]
    .sort((a, b) => {
      const s = (a.t.status === "wip" ? 0 : 1) - (b.t.status === "wip" ? 0 : 1);
      if (s !== 0) return s;
      const p = prioOrder[a.t.priority] - prioOrder[b.t.priority];
      if (p !== 0) return p;
      return b.t.progress - a.t.progress;
    })
    .slice(0, 8);

  function addDeadline() {
    if (!newDl.date || !newDl.label.trim()) return;
    const d: Deadline = { id: uid(), date: newDl.date, label: newDl.label.trim() };
    update((s) => ({ ...s, deadlines: [...s.deadlines, d] }));
    setNewDl({ date: "", label: "" });
  }

  function delDeadline(id: string) {
    update((s) => ({ ...s, deadlines: s.deadlines.filter((d) => d.id !== id) }));
  }

  function addMemo() {
    const text = memoText.trim();
    if (!text) return;
    const ts = new Date().toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const memo: Memo = { id: uid(), ts, html: escapeHtml(text).replace(/\n/g, "<br>") };
    update((s) => ({ ...s, memos: [memo, ...s.memos] }));
    setMemoText("");
  }

  function delMemo(id: string) {
    update((s) => ({ ...s, memos: s.memos.filter((m) => m.id !== id) }));
  }

  /**
   * 메모를 프로젝트 노트로 옮긴다.
   * 첫 줄이 노트 제목, 나머지가 본문. 옮긴 메모는 이 목록에서 사라진다.
   */
  function assignMemo(memoId: string, projectId: string) {
    update((s) => {
      const memo = s.memos.find((m) => m.id === memoId);
      if (!memo) return s;
      const text = htmlToText(memo.html);
      const lines = text.split("\n");
      const first = lines.find((l) => l.trim()) || "메모"; // 첫 내용 줄이 제목
      const rest = lines.slice(lines.indexOf(first) + 1).join("\n").trim();
      // 제목이 너무 길면 잘라 쓰고, 본문에 전체 내용을 남긴다
      const tooLong = first.length > 60;
      const note: Note = {
        id: memo.id,
        title: tooLong ? first.slice(0, 60) + "…" : first,
        body: tooLong ? text : rest,
        date: memoDate(memo.ts),
      };
      return {
        ...s,
        memos: s.memos.filter((m) => m.id !== memoId),
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, notes: [note, ...p.notes] } : p,
        ),
      };
    });
  }

  function completeTask(projectId: string, taskId: string) {
    update((s) => ({
      ...s,
      projects: s.projects.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              tasks: p.tasks.map((t) =>
                t.id !== taskId ? t : { ...t, status: "done", progress: 100, ...doneStamp("done") },
              ),
            },
      ),
    }));
  }

  function patchProject(projectId: string, patch: Partial<Project>) {
    update((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
    }));
  }

  return (
    <div className="px-8 py-6 max-w-5xl">
      {/* 요약 타일 */}
      <div className="grid grid-cols-4 gap-3 mb-7">
        <Tile label="프로젝트" value={String(projects.length)} />
        <Tile label="평균 진행률" value={`${avg}%`} />
        <Tile label="미완료 업무" value={String(openTasks.length)} />
        <Tile
          label="다음 마감"
          value={nextDl ? ddayLabel(nextDl.dd) : "—"}
          sub={nextDl ? nextDl.label : "등록된 일정 없음"}
        />
      </div>

      {/* 다가오는 일정 */}
      <SectionTitle>다가오는 일정</SectionTitle>
      <div className="border border-[#e5e5e3] mb-7" style={{ borderRadius: RADIUS }}>
        {deadlines.length === 0 && (
          <div className="px-5 py-6 text-[13px] text-[#aaaaaa] text-center">
            등록된 일정이 없습니다.
          </div>
        )}
        {deadlines.map((d, i) => {
          const tone =
            d.dd < 0 ? "#aaaaaa" : d.dd <= 2 ? "#c84b31" : d.dd <= 7 ? "#d97706" : "#0f0f0f";
          return (
            <div
              key={d.id}
              className={`flex items-center gap-3 px-5 py-3 group hover:bg-[#f9f9f7] transition-colors ${
                i < deadlines.length - 1 ? "border-b border-[#e5e5e3]" : ""
              }`}
            >
              <span
                className="text-[12px] font-semibold w-[62px] flex-shrink-0"
                style={{ ...MONO, color: tone }}
              >
                {ddayLabel(d.dd)}
              </span>
              <span
                className={`flex-1 text-[13.5px] ${d.dd < 0 ? "text-[#aaaaaa]" : "text-[#0f0f0f]"}`}
              >
                {d.label}
              </span>
              <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
                {d.date}
              </span>
              <DeleteX onClick={() => delDeadline(d.id)} />
            </div>
          );
        })}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[#e5e5e3] bg-[#fafafa]">
          <input
            type="date"
            value={newDl.date}
            onChange={(e) => setNewDl((v) => ({ ...v, date: e.target.value }))}
            className="text-[12px] text-[#0f0f0f] bg-white border border-[#e5e5e3] px-2 py-1"
            style={{ ...MONO, borderRadius: RADIUS }}
          />
          <input
            value={newDl.label}
            onChange={(e) => setNewDl((v) => ({ ...v, label: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && addDeadline()}
            placeholder="일정 이름"
            className="flex-1 text-[13px] text-[#0f0f0f] bg-white border border-[#e5e5e3] px-2.5 py-1"
            style={{ borderRadius: RADIUS }}
          />
          <button
            onClick={addDeadline}
            className="text-[12px] font-semibold px-3 py-1.5 text-white bg-[#0f0f0f] hover:bg-[#333]"
            style={{ borderRadius: RADIUS }}
          >
            추가
          </button>
        </div>
      </div>

      {/* 프로젝트 현황 */}
      <SectionTitle>프로젝트 현황</SectionTitle>
      <div className="grid grid-cols-2 gap-3 mb-7">
        {projects.map((p) => {
          const ov = overall(p);
          const leaves = leafTasks(p.tasks);
          const done = leaves.filter((t) => t.status === "done").length;
          const top = leaves
            .filter((t) => t.status !== "done")
            .sort((a, b) => b.progress - a.progress)
            .slice(0, 3);
          return (
            <div
              key={p.id}
              className="border border-[#e5e5e3] hover:border-[#c0c0be] transition-colors flex flex-col"
              style={{ borderRadius: RADIUS }}
            >
              <div className="px-5 pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="text-[10.5px] font-semibold tracking-[0.12em] uppercase px-1.5 py-0.5"
                    style={{
                      ...MONO,
                      backgroundColor: p.colorBg,
                      color: p.colorText,
                      borderRadius: RADIUS,
                    }}
                  >
                    {p.code}
                  </span>
                  <Editable
                    value={p.name}
                    onCommit={(v) => patchProject(p.id, { name: v })}
                    className="text-[15px] font-semibold text-[#0f0f0f] leading-tight"
                  />
                </div>
                <Editable
                  value={p.sub}
                  placeholder="설명 입력"
                  onCommit={(v) => patchProject(p.id, { sub: v })}
                  className="block text-[12.5px] text-[#737373] leading-snug"
                />
                <Editable
                  value={p.role}
                  placeholder="내 역할"
                  onCommit={(v) => patchProject(p.id, { role: v })}
                  className="block text-[11.5px] text-[#aaaaaa] mt-1"
                />

                <div className="flex items-center gap-2 mt-3">
                  <ProgressBar pct={ov} color={p.color} className="flex-1" />
                  <span className="text-[12px] font-semibold text-[#0f0f0f]" style={MONO}>
                    {ov}%
                  </span>
                </div>
                <div className="flex gap-3 mt-2 text-[11px] text-[#737373]" style={MONO}>
                  <span>
                    업무 {done}/{leaves.length}
                  </span>
                  <span>노트 {p.notes.length}</span>
                  <span>기록 {p.records.length}</span>
                </div>
              </div>

              <div className="border-t border-[#f0f0ee] px-5 py-2.5 flex-1">
                {top.length === 0 ? (
                  <div className="text-[12px] text-[#aaaaaa] py-1">미완료 업무 없음</div>
                ) : (
                  top.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 py-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: STATUS_COLOR[t.status] }}
                      />
                      <span className="flex-1 text-[12.5px] text-[#4a4a4a] truncate">{t.text}</span>
                      <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
                        {t.progress}%
                      </span>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => onOpenProject(p.id)}
                className="text-left px-5 py-2.5 border-t border-[#f0f0ee] text-[12px] font-medium text-[#737373] hover:text-[#0f0f0f] hover:bg-[#f9f9f7] transition-colors"
              >
                자세히 보기 →
              </button>
            </div>
          );
        })}
      </div>

      {/* 우선 처리 업무 */}
      <SectionTitle>우선 처리 업무</SectionTitle>
      <div className="border border-[#e5e5e3] mb-7" style={{ borderRadius: RADIUS }}>
        {focus.length === 0 && (
          <div className="px-5 py-6 text-[13px] text-[#aaaaaa] text-center">
            미완료 업무가 없습니다.
          </div>
        )}
        {focus.map((x, i) => (
          <div
            key={x.t.id}
            className={`flex items-center gap-3 px-5 py-3 group hover:bg-[#f9f9f7] transition-colors ${
              i < focus.length - 1 ? "border-b border-[#e5e5e3]" : ""
            }`}
          >
            <button
              onClick={() => completeTask(x.p.id, x.t.id)}
              title="완료 처리"
              className="w-4 h-4 border border-[#c0c0be] flex-shrink-0 hover:border-[#0f0f0f] transition-colors"
              style={{ borderRadius: RADIUS }}
            />
            <button
              onClick={() => onOpenProject(x.p.id)}
              className="text-[10.5px] font-semibold tracking-[0.1em] uppercase px-1.5 py-0.5 flex-shrink-0 hover:opacity-75"
              style={{
                ...MONO,
                backgroundColor: x.p.colorBg,
                color: x.p.colorText,
                borderRadius: RADIUS,
              }}
            >
              {x.p.code}
            </button>
            <span className="flex-1 text-[13.5px] text-[#0f0f0f] truncate">{x.t.text}</span>
            <span
              className="text-[10.5px] font-semibold flex-shrink-0"
              style={{ ...MONO, color: STATUS_COLOR[x.t.status] }}
            >
              {STATUS_LABEL[x.t.status]}
            </span>
            <span
              className="text-[10.5px] font-semibold w-9 text-right flex-shrink-0"
              style={{ ...MONO, color: PRIORITY_COLOR[x.t.priority] }}
            >
              {PRIORITY_LABEL[x.t.priority]}
            </span>
            <span className="text-[11px] text-[#aaaaaa] w-9 text-right flex-shrink-0" style={MONO}>
              {x.t.progress}%
            </span>
          </div>
        ))}
      </div>

      {/* 메모 */}
      <SectionTitle>메모</SectionTitle>
      <div className="border border-[#e5e5e3] mb-3" style={{ borderRadius: RADIUS }}>
        <textarea
          value={memoText}
          onChange={(e) => setMemoText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addMemo();
          }}
          rows={3}
          placeholder="빠르게 남길 메모… (Ctrl+Enter 로 저장)"
          className="w-full px-5 py-3.5 text-[13px] text-[#0f0f0f] leading-relaxed bg-transparent"
        />
        <div className="flex items-center gap-2 px-5 py-2.5 border-t border-[#e5e5e3] bg-[#fafafa]">
          <span className="text-[11px] text-[#aaaaaa] flex-1" style={MONO}>
            {today()}
          </span>
          <button
            onClick={addMemo}
            className="text-[12px] font-semibold px-3 py-1.5 text-white bg-[#0f0f0f] hover:bg-[#333]"
            style={{ borderRadius: RADIUS }}
          >
            메모 저장
          </button>
        </div>
      </div>
      <div className="grid gap-2 pb-4">
        {state.memos.length === 0 && (
          <div className="text-[13px] text-[#aaaaaa] py-6 text-center">저장된 메모가 없습니다.</div>
        )}
        {state.memos.map((m) => (
          <div
            key={m.id}
            className="border border-[#f0f0ee] px-4 py-3 group hover:border-[#e5e5e3] transition-colors"
            style={{ borderRadius: RADIUS }}
          >
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
                {m.ts}
              </span>
              <div className="flex items-center gap-2">
                {/* 프로젝트를 고르면 이 메모가 그 프로젝트의 노트로 옮겨간다 */}
                <select
                  value=""
                  onChange={(e) => e.target.value && assignMemo(m.id, e.target.value)}
                  title="선택한 프로젝트의 노트로 옮깁니다"
                  disabled={projects.length === 0}
                  className="text-[11px] text-[#737373] bg-white border border-[#e5e5e3] hover:border-[#0f0f0f] px-1.5 py-0.5 cursor-pointer disabled:cursor-default"
                  style={{ borderRadius: RADIUS }}
                >
                  <option value="">프로젝트 지정 →</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} 노트로
                    </option>
                  ))}
                </select>
                <DeleteX onClick={() => delMemo(m.id)} />
              </div>
            </div>
            <div
              className="text-[13px] text-[#4a4a4a] leading-relaxed break-words"
              dangerouslySetInnerHTML={{ __html: m.html }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}



/** 메모 HTML → 평문 (구버전 대시보드에서 옮겨온 메모는 HTML 로 저장돼 있다) */
function htmlToText(html: string) {
  const NL = String.fromCharCode(10);
  return html
    .replace(/<br\s*\/?>/gi, NL)
    // 블록 태그는 여는 쪽·닫는 쪽 모두 줄바꿈으로. 여는 태그를 빼먹으면
    // "앞줄<div>뒷줄</div>" 같은 메모에서 두 줄이 한 줄로 붙는다.
    .replace(/<\/?(div|p|li|tr|h[1-6]|blockquote|ul|ol|table)[^>]*>/gi, NL)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, NL + NL)
    .trim();
}

/** 메모 시각("08. 07. 오후 04:48") → 노트 날짜("2026-08-07"). 해석 실패하면 오늘 */
function memoDate(ts: string) {
  const m = ts.match(/(\d{1,2})\.\s*(\d{1,2})\./);
  if (!m) return today();
  const year = today().slice(0, 4);
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
