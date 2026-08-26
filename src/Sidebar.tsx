import Editable from "./Editable";
import { MONO, SaveBadge } from "./ui";
import type { SaveStatus } from "./store";
import type { Profile, State } from "./types";
import { leafTasks, overall, today } from "./types";

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

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d={dir === "left" ? "M7.5 2.5L4 6l3.5 3.5" : "M4.5 2.5L8 6l-3.5 3.5"}
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

          {state.projects.map((p) => {
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
          className="text-[#ccccca] hover:text-[#0f0f0f] transition-colors mt-0.5"
        >
          <Chevron dir="left" />
        </button>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
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

        <div className="mt-3 mb-1 px-4 text-[10.5px] font-semibold tracking-[0.15em] text-[#aaaaaa] uppercase">
          프로젝트
        </div>

        {state.projects.map((p) => {
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
