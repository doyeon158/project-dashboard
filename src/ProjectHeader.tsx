import Editable from "./Editable";
import { MONO, ProgressBar, RADIUS } from "./ui";
import type { Project } from "./types";
import { PALETTE, leafTasks, overall } from "./types";

export type TabKey = "tasks" | "notes" | "records";
const TAB_LABEL: Record<TabKey, string> = { tasks: "업무", notes: "노트", records: "기록" };

/** 프로젝트 화면 머리말 — 코드·이름·설명·역할 수정, 색상 선택, 탭 */
export default function ProjectHeader({
  project,
  patch,
  onDelete,
  activeTab,
  onTab,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
  onDelete: () => void;
  activeTab: TabKey;
  onTab: (t: TabKey) => void;
}) {
  const pct = overall(project);
  const counts: Record<TabKey, number> = {
    // 대주제는 집계값이라 제외 (업무 탭 목록 헤더와 같은 기준)
    tasks: leafTasks(project.tasks).length,
    notes: project.notes.length,
    records: project.records.length,
  };

  return (
    <header className="border-b border-[#e5e5e3] px-8 pt-6 pb-0 flex-shrink-0">
      <div className="flex items-baseline gap-3 mb-1">
        <Editable
          value={project.code}
          maxLength={5}
          transform={(v) => v.toUpperCase()}
          onCommit={(v) => patch({ code: v })}
          className="text-[11px] font-semibold tracking-[0.15em] uppercase px-2 py-0.5"
          style={{
            ...MONO,
            backgroundColor: project.colorBg,
            color: project.colorText,
            borderRadius: RADIUS,
          }}
        />
        <h1 className="text-[22px] font-semibold text-[#0f0f0f] tracking-tight">
          <Editable value={project.name} onCommit={(v) => patch({ name: v })} />
        </h1>
        <div className="ml-auto flex items-center gap-3">
          <ProgressBar pct={pct} color={project.color} />
          <span className="text-[12px] text-[#737373]" style={MONO}>
            {pct}%
          </span>
          <button
            onClick={onDelete}
            className="text-[11.5px] text-[#ccccca] hover:text-[#c84b31] transition-colors"
          >
            프로젝트 삭제
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <Editable
          value={project.sub}
          placeholder="설명 입력"
          onCommit={(v) => patch({ sub: v })}
          className="text-[12.5px] text-[#737373]"
        />
        <span className="text-[12.5px] text-[#ccccca]">·</span>
        <Editable
          value={project.role}
          placeholder="내 역할 입력"
          onCommit={(v) => patch({ role: v })}
          className="text-[12.5px] text-[#aaaaaa]"
        />
        <span className="ml-3 flex items-center gap-1.5" title="프로젝트 색상">
          {PALETTE.map((pal) => (
            <button
              key={pal.color}
              onClick={() =>
                patch({ color: pal.color, colorBg: pal.colorBg, colorText: pal.color })
              }
              aria-label={`색상 ${pal.color}`}
              className="w-3 h-3 rounded-full transition-transform hover:scale-125"
              style={{
                backgroundColor: pal.color,
                outline: project.color === pal.color ? `1.5px solid ${pal.color}` : "none",
                outlineOffset: "2px",
              }}
            />
          ))}
        </span>
      </div>

      <div className="flex gap-0">
        {(["tasks", "notes", "records"] as TabKey[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onTab(tab)}
              className={`px-5 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-b-[#0f0f0f] text-[#0f0f0f]"
                  : "border-transparent text-[#737373] hover:text-[#0f0f0f]"
              }`}
            >
              {TAB_LABEL[tab]}
              <span
                className="ml-1.5 text-[11px]"
                style={{ ...MONO, color: isActive ? project.color : "#aaaaaa" }}
              >
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
