import { useEffect, useState } from "react";
import Editable from "./Editable";
import { MONO, SaveBadge } from "./ui";
import type { SaveStatus } from "./store";
import type { Profile, Project, State } from "./types";
import { WEEKLY_VIEW, leafTasks, overall, today } from "./types";

const DONE_OPEN_KEY = "project-dashboard-done-open";

/** 한눈에 보기 아이콘 (네 칸) */
function OverviewIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" className="flex-shrink-0">
      <rect x="0" y="0" width="4.5" height="4.5" fill="#0f0f0f" />
      <rect x="6.5" y="0" width="4.5" height="4.5" fill="#c0c0be" />
      <rect x="0" y="6.5" width="4.5" height="4.5" fill="#c0c0be" />
      <rect x="6.5" y="6.5" width="4.5" height="4.5" fill="#0f0f0f" />
    </svg>
  );
}

/** 주간일지 아이콘 (한 주가 담긴 달력) */
function WeeklyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" className="flex-shrink-0">
      <rect x="0.5" y="1.5" width="10" height="9" stroke="#0f0f0f" strokeWidth="1" fill="none" />
      <path d="M0.5 4.5h10" stroke="#0f0f0f" strokeWidth="1" />
      <path d="M3 0.5v2M8 0.5v2" stroke="#0f0f0f" strokeWidth="1" strokeLinecap="round" />
      <rect x="2" y="6" width="7" height="2" fill="#c0c0be" />
    </svg>
  );
}

/** 완료된 프로젝트 묶음 아이콘 (체크) */
function DoneIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="flex-shrink-0">
      <path
        d="M1.5 5.8L4.2 8.5L9.5 2.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const CHEVRON_PATH = {
  left: "M7.5 2.5L4 6l3.5 3.5",
  right: "M4.5 2.5L8 6l-3.5 3.5",
  down: "M2.5 4.5L6 8l3.5-3.5",
} as const;

function Chevron({ dir, size = 12 }: { dir: keyof typeof CHEVRON_PATH; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path
        d={CHEVRON_PATH[dir]}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 왼쪽 사이드바 — 한눈에 보기 / 프로젝트 목록 / 프로필·저장 상태.
 * 접으면 좁은 띠로 바뀌어 프로젝트 이동은 그대로 할 수 있다.
 * 완료 표시한 프로젝트는 목록 맨 아래 '완료됨' 묶음으로 모아 기본으로 접어 둔다.
 */
export default function Sidebar({
  state,
  view,
  status,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onAddProject,
  onPatchProfile,
}: {
  state: State;
  view: string | null;
  status: SaveStatus;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (view: string | null) => void;
  onAddProject: () => void;
  onPatchProfile: (p: Partial<Profile>) => void;
}) {
  // 완료 묶음 펼침도 사이드바 접힘처럼 화면 취향이라 브라우저에 기억한다
  const [doneOpen, setDoneOpen] = useState(() => {
    try {
      return localStorage.getItem(DONE_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DONE_OPEN_KEY, doneOpen ? "1" : "0");
    } catch {
      // 저장이 막혀도 동작에는 문제 없다
    }
  }, [doneOpen]);

  const activeProjects = state.projects.filter((p) => !p.completedAt);
  // 최근에 끝낸 프로젝트가 위
  const doneProjects = state.projects
    .filter((p) => p.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  // 접혀 있어도 지금 보고 있는 완료 프로젝트는 보여 줘야 어디 있는지 안다
  const shownDone = doneOpen ? doneProjects : doneProjects.filter((p) => p.id === view);

  function doneRow(p: Project) {
    const isActive = view === p.id;
    return (
      <button
        key={p.id}
        onClick={() => onSelect(p.id)}
        title={`${p.name} · ${p.completedAt!.slice(0, 10)} 완료`}
        className={`w-full text-left px-4 py-2 transition-colors ${
          isActive ? "bg-white border-r-2" : "hover:bg-white/60"
        }`}
        style={isActive ? { borderRightColor: p.color } : {}}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0 opacity-40"
            style={{ backgroundColor: p.color }}
          />
          <span
            className={`text-[13px] leading-tight truncate ${
              isActive ? "text-[#4a4a4a]" : "text-[#aaaaaa]"
            }`}
          >
            {p.name}
          </span>
          <span className="ml-auto text-[10.5px] text-[#c0c0be] flex-shrink-0" style={MONO}>
            {p.completedAt!.slice(5, 10).replace("-", ".")}
          </span>
        </div>
      </button>
    );
  }

  if (collapsed) {
    return (
      <aside className="w-[46px] min-w-[46px] border-r border-[#e5e5e3] flex flex-col items-center bg-[#f9f9f7]">
        <button
          onClick={onToggleCollapsed}
          title="사이드바 펼치기"
          className="w-full py-4 flex justify-center text-[#aaaaaa] hover:text-[#0f0f0f] transition-colors border-b border-[#e5e5e3]"
        >
          <Chevron dir="right" />
        </button>

        <nav className="flex-1 w-full py-3 overflow-y-auto flex flex-col items-center gap-1">
          <button
            onClick={() => onSelect(null)}
            title="한눈에 보기"
            className={`w-full py-2.5 flex justify-center transition-colors ${
              view === null ? "bg-white border-r-2 border-r-[#0f0f0f]" : "hover:bg-white/60"
            }`}
          >
            <OverviewIcon />
          </button>

          <button
            onClick={() => onSelect(WEEKLY_VIEW)}
            title="주간일지"
            className={`w-full py-2.5 flex justify-center transition-colors ${
              view === WEEKLY_VIEW ? "bg-white border-r-2 border-r-[#0f0f0f]" : "hover:bg-white/60"
            }`}
          >
            <WeeklyIcon />
          </button>

          {activeProjects.map((p) => {
            const leaves = leafTasks(p.tasks);
            const done = leaves.filter((t) => t.status === "done").length;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                title={`${p.name} · ${overall(p)}% · ${done}/${leaves.length} 완료`}
                className={`w-full py-2.5 flex justify-center transition-colors ${
                  view === p.id ? "bg-white border-r-2" : "hover:bg-white/60"
                }`}
                style={view === p.id ? { borderRightColor: p.color } : {}}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
              </button>
            );
          })}

          <button
            onClick={onAddProject}
            title="프로젝트 추가"
            className="w-full py-2 text-[15px] text-[#aaaaaa] hover:text-[#0f0f0f] hover:bg-white/60 transition-colors leading-none"
          >
            +
          </button>

          {doneProjects.length > 0 && (
            <div className="mt-auto pt-3 w-full flex flex-col items-center gap-1">
              {/* 좁은 띠에서는 목록 대신 개수만. 누르면 펼친 사이드바에서 묶음을 연다 */}
              <button
                onClick={() => {
                  setDoneOpen(true);
                  onToggleCollapsed();
                }}
                title={`완료된 프로젝트 ${doneProjects.length}개 보기`}
                className="w-full py-2 flex flex-col items-center gap-0.5 text-[#aaaaaa] hover:text-[#0f0f0f] hover:bg-white/60 transition-colors"
              >
                <DoneIcon />
                <span className="text-[10px] leading-none" style={MONO}>
                  {doneProjects.length}
                </span>
              </button>
              {doneProjects
                .filter((p) => p.id === view)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    title={`${p.name} · ${p.completedAt!.slice(0, 10)} 완료`}
                    className="w-full py-2.5 flex justify-center bg-white border-r-2"
                    style={{ borderRightColor: p.color }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full opacity-40"
                      style={{ backgroundColor: p.color }}
                    />
                  </button>
                ))}
            </div>
          )}
        </nav>

        <div className="w-full py-3 border-t border-[#e5e5e3] flex justify-center">
          <span title={`${state.profile.name} · ${state.profile.team}`}>
            <SaveBadge status={status} dotOnly />
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[220px] min-w-[220px] border-r border-[#e5e5e3] flex flex-col bg-[#f9f9f7]">
      <div className="px-5 py-5 border-b border-[#e5e5e3] flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.15em] text-[#737373] uppercase">
            Workspace
          </div>
          <div className="text-[15px] font-semibold text-[#0f0f0f] mt-0.5 leading-tight">
            내 프로젝트
          </div>
        </div>
        <button
          onClick={onToggleCollapsed}
          title="사이드바 접기"
          className="text-[#ccccca] hover:text-[#0f0f0f] transition-colors -mt-1 -mr-2 p-2"
        >
          <Chevron dir="left" />
        </button>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto flex flex-col">
        <button
          onClick={() => onSelect(null)}
          className={`w-full text-left px-4 py-2.5 transition-colors ${
            view === null ? "bg-white border-r-2 border-r-[#0f0f0f]" : "hover:bg-white/60"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <OverviewIcon />
            <span
              className={`text-[13.5px] font-medium ${
                view === null ? "text-[#0f0f0f]" : "text-[#4a4a4a]"
              }`}
            >
              한눈에 보기
            </span>
          </div>
        </button>

        <button
          onClick={() => onSelect(WEEKLY_VIEW)}
          className={`w-full text-left px-4 py-2.5 transition-colors ${
            view === WEEKLY_VIEW ? "bg-white border-r-2 border-r-[#0f0f0f]" : "hover:bg-white/60"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <WeeklyIcon />
            <span
              className={`text-[13.5px] font-medium ${
                view === WEEKLY_VIEW ? "text-[#0f0f0f]" : "text-[#4a4a4a]"
              }`}
            >
              주간일지
            </span>
          </div>
        </button>

        <div className="mt-3 mb-1 px-4 text-[10.5px] font-semibold tracking-[0.15em] text-[#aaaaaa] uppercase">
          프로젝트
        </div>

        {activeProjects.map((p) => {
          const isActive = view === p.id;
          const leaves = leafTasks(p.tasks);
          const done = leaves.filter((t) => t.status === "done").length;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                isActive ? "bg-white border-r-2" : "hover:bg-white/60"
              }`}
              style={isActive ? { borderRightColor: p.color } : {}}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span
                  className={`text-[13.5px] font-medium leading-tight truncate ${
                    isActive ? "text-[#0f0f0f]" : "text-[#4a4a4a]"
                  }`}
                >
                  {p.name}
                </span>
              </div>
              <div className="mt-1.5 ml-[18px] flex items-center gap-3">
                <span className="text-[11px] text-[#737373]" style={MONO}>
                  {overall(p)}%
                </span>
                <span className="text-[11px] text-[#737373]" style={MONO}>
                  {done}/{leaves.length} 완료
                </span>
              </div>
            </button>
          );
        })}

        <button
          onClick={onAddProject}
          className="w-full text-left px-4 py-2.5 mt-1 text-[12.5px] text-[#737373] hover:text-[#0f0f0f] hover:bg-white/60 transition-colors"
        >
          + 프로젝트 추가
        </button>

        {doneProjects.length > 0 && (
          // mt-auto: 목록이 짧으면 사이드바 맨 아래(프로필 바로 위)에 붙는다
          <div className="mt-auto pt-4">
            <button
              onClick={() => setDoneOpen((v) => !v)}
              title={doneOpen ? "완료된 프로젝트 접기" : "완료된 프로젝트 펼치기"}
              className="w-full flex items-center gap-1.5 px-4 py-2 border-t border-[#e5e5e3] text-[10.5px] font-semibold tracking-[0.15em] text-[#aaaaaa] uppercase hover:text-[#0f0f0f] transition-colors"
            >
              <Chevron dir={doneOpen ? "down" : "right"} size={10} />
              완료됨
              <span className="tracking-normal" style={MONO}>
                {doneProjects.length}
              </span>
            </button>
            {shownDone.map(doneRow)}
          </div>
        )}
      </nav>

      <div className="px-5 py-4 border-t border-[#e5e5e3]">
        <Editable
          value={state.profile.name}
          placeholder="이름"
          onCommit={(v) => onPatchProfile({ name: v })}
          className="block text-[12.5px] font-semibold text-[#0f0f0f]"
        />
        <Editable
          value={state.profile.team}
          placeholder="소속"
          onCommit={(v) => onPatchProfile({ team: v })}
          className="block text-[11px] text-[#737373]"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
            {today()}
          </span>
          <SaveBadge status={status} />
        </div>
      </div>
    </aside>
  );
}
