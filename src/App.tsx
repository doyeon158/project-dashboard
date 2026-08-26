import { useState } from "react";
import Overview from "./Overview";
import ProjectHeader, { type TabKey } from "./ProjectHeader";
import Sidebar from "./Sidebar";
import NotesTab from "./tabs/NotesTab";
import RecordsTab from "./tabs/RecordsTab";
import TasksTab from "./tabs/TasksTab";
import { usePersistentState } from "./store";
import { MONO } from "./ui";
import type { Project } from "./types";
import { PALETTE, today, uid } from "./types";

/**
 * 화면 구성과 상태 보관만 담당한다.
 * 항목별 편집 로직은 각 탭 컴포넌트(TasksTab / NotesTab / RecordsTab)에 있다.
 */
export default function App() {
  const { state, status, update } = usePersistentState();

  // null = 한눈에 보기, 그 외에는 프로젝트 id
  const [view, setView] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("tasks");

  if (!state) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-[#aaaaaa]">
        불러오는 중…
      </div>
    );
  }

  const project = view ? state.projects.find((p) => p.id === view) || null : null;

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
    <div className="flex h-full bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <Sidebar
        state={state}
        view={view}
        status={status}
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
            </div>
          </>
        )}
      </main>
    </div>
  );
}
