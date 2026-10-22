import { useEffect, useState } from "react";
import Overview from "./Overview";
import ProjectHeader, { type TabKey } from "./ProjectHeader";
import ServerBar from "./ServerBar";
import Sidebar from "./Sidebar";
import WeeklyLog from "./WeeklyLog";
import FilesTab from "./tabs/FilesTab";
import NotesTab from "./tabs/NotesTab";
import RecordsTab from "./tabs/RecordsTab";
import TasksTab from "./tabs/TasksTab";
import { usePersistentState } from "./store";
import { MONO } from "./ui";
import type { Project } from "./types";
import { PALETTE, WEEKLY_VIEW, today, uid } from "./types";

const SIDEBAR_KEY = "project-dashboard-sidebar-collapsed";

/**
 * 화면 구성과 상태 보관만 담당한다.
 * 항목별 편집 로직은 각 탭 컴포넌트(TasksTab / NotesTab / RecordsTab)에 있다.
 */
export default function App() {
  const { state, status, update } = usePersistentState();

  // null = 한눈에 보기, WEEKLY_VIEW = 주간일지, 그 외에는 프로젝트 id
  const [view, setView] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("tasks");
  // 사이드바 접힘은 화면 취향이라 데이터 파일이 아니라 브라우저에 기억한다
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      // 사생활 보호 모드 등에서 저장이 막혀도 동작에는 문제 없다
    }
  }, [collapsed]);

  if (!state) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-[#aaaaaa]">
        불러오는 중…
      </div>
    );
  }

  const project =
    view && view !== WEEKLY_VIEW ? state.projects.find((p) => p.id === view) || null : null;

  function patchProject(projectId: string, patch: Partial<Project>) {
    update((s) => ({
      ...s,
      projects: s.projects.map((p) => (p.id === projectId ? { ...p, ...patch } : p)),
    }));
  }

  function addProject() {
    const pal = PALETTE[state!.projects.length % PALETTE.length];
    const p: Project = {
      id: uid(),
      name: "새 프로젝트",
      code: "NEW",
      sub: "설명",
      role: "내 역할",
      color: pal.color,
      colorBg: pal.colorBg,
      colorText: pal.color,
      notes: [],
      tasks: [],
      records: [],
    };
    update((s) => ({ ...s, projects: [...s.projects, p] }));
    setView(p.id);
    setActiveTab("tasks");
  }

  function deleteProject(p: Project) {
    if (!confirm(`'${p.name}' 프로젝트를 삭제할까요? 노트·업무·기록이 모두 지워집니다.`)) return;
    update((s) => ({ ...s, projects: s.projects.filter((x) => x.id !== p.id) }));
    setView(null);
  }

  return (
    <div className="flex flex-col h-full bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <ServerBar />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          state={state}
          view={view}
          status={status}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          onSelect={setView}
          onAddProject={addProject}
          onPatchProfile={(p) =>
            update((s) => ({ ...s, profile: { ...s.profile, ...p } }))
          }
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          {view === null ? (
            <>
              <header className="border-b border-[#e5e5e3] px-8 py-5 flex-shrink-0 flex items-baseline gap-3">
                <h1 className="text-[22px] font-semibold text-[#0f0f0f] tracking-tight">
                  한눈에 보기
                </h1>
                <span className="text-[12px] text-[#aaaaaa]" style={MONO}>
                  {today()}
                </span>
              </header>
              <div className="flex-1 overflow-y-auto">
                <Overview
                  state={state}
                  update={update}
                  onOpenProject={(id) => {
                    setView(id);
                    setActiveTab("tasks");
                  }}
                />
              </div>
            </>
          ) : view === WEEKLY_VIEW ? (
            <>
              <header className="border-b border-[#e5e5e3] px-8 py-5 flex-shrink-0 flex items-baseline gap-3">
                <h1 className="text-[22px] font-semibold text-[#0f0f0f] tracking-tight">주간일지</h1>
                <span className="text-[12px] text-[#aaaaaa]" style={MONO}>
                  월~일요일 기준 · 완료 업무 모아 보기
                </span>
              </header>
              <div className="flex-1 overflow-y-auto">
                <WeeklyLog state={state} />
              </div>
            </>
          ) : !project ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-[#aaaaaa]">
              프로젝트를 찾을 수 없습니다.
            </div>
          ) : (
            <>
              <ProjectHeader
                project={project}
                patch={(p) => patchProject(project.id, p)}
                onDelete={() => deleteProject(project)}
                activeTab={activeTab}
                onTab={setActiveTab}
              />
              <div className="flex-1 overflow-y-auto">
                {activeTab === "tasks" && (
                  <TasksTab
                    key={project.id}
                    project={project}
                    patch={(p) => patchProject(project.id, p)}
                  />
                )}
                {activeTab === "notes" && (
                  <NotesTab
                    key={project.id}
                    project={project}
                    patch={(p) => patchProject(project.id, p)}
                  />
                )}
                {activeTab === "records" && (
                  <RecordsTab
                    key={project.id}
                    project={project}
                    patch={(p) => patchProject(project.id, p)}
                  />
                )}
                {activeTab === "files" && <FilesTab key={project.id} project={project} />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
