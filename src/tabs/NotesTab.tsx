import { useEffect, useRef, useState } from "react";
import Editable from "../Editable";
import { AddButton, DeleteX, FormActions, MONO, PinButton, RADIUS } from "../ui";
import type { Note, Project } from "../types";
import { orderPinned, today, uid } from "../types";

/** 노트 탭 — 제목 + 본문 카드 목록 */
export default function NotesTab({
  project,
  patch,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) titleRef.current?.focus();
  }, [adding]);

  const notes = project.notes;

  function submit() {
    if (!draft.title.trim()) return;
    const note: Note = {
      id: uid(),
      title: draft.title.trim(),
      body: draft.body.trim(),
      date: today(),
    };
    patch({ notes: [note, ...notes] });
    setDraft({ title: "", body: "" });
    setAdding(false);
  }

  function remove(id: string) {
    patch({ notes: notes.filter((n) => n.id !== id) });
    if (expanded === id) setExpanded(null);
  }

  function togglePin(id: string) {
    patch({
      notes: notes.map((n) =>
        n.id === id ? { ...n, pinnedAt: n.pinnedAt ? undefined : Date.now() } : n,
      ),
    });
  }

  return (
    <div className="px-8 py-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <div className="text-[12px] text-[#737373] uppercase tracking-widest font-medium">
          노트 목록
        </div>
        <AddButton label="+ 노트 추가" onClick={() => setAdding(true)} />
      </div>

      {adding && (
        <div className="mb-4 border border-[#e5e5e3] p-4" style={{ borderRadius: RADIUS }}>
          <input
            ref={titleRef}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="노트 제목"
            className="w-full text-[14px] font-semibold text-[#0f0f0f] mb-2 bg-transparent border-b border-[#e5e5e3] pb-2 focus:border-[#0f0f0f] transition-colors"
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <textarea
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="내용 입력…"
            rows={4}
            className="w-full text-[13px] text-[#4a4a4a] bg-transparent leading-relaxed"
          />
          <div className="mt-3">
            <FormActions color={project.color} onSave={submit} onCancel={() => setAdding(false)} />
          </div>
        </div>
      )}

      {notes.length === 0 && !adding && (
        <div className="text-[13px] text-[#aaaaaa] py-12 text-center">아직 노트가 없습니다.</div>
      )}

      <div className="grid gap-3">
        {orderPinned(notes).map((note) => (
          <div
            key={note.id}
            className="border hover:border-[#c0c0be] transition-colors cursor-pointer"
            style={{
              borderRadius: RADIUS,
              borderColor: note.pinnedAt ? project.color : "#e5e5e3",
              backgroundColor: note.pinnedAt ? project.colorBg : undefined,
            }}
            onClick={() => setExpanded(expanded === note.id ? null : note.id)}
            title={expanded === note.id ? "클릭해서 접기" : "클릭해서 전체 보기"}
          >
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                {/* 제목·본문 클릭은 수정이므로 카드의 펼치기/접기로 번지지 않게 막는다 */}
                <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <Editable
                    value={note.title}
                    onCommit={(v) => patch({ notes: notes.map((n) => (n.id === note.id ? { ...n, title: v } : n)) })}
                    className="block text-[14px] font-semibold text-[#0f0f0f] leading-snug break-words"
                  />
                  {expanded === note.id ? (
                    <div className="mt-2">
                      <Editable
                        multiline
                        value={note.body}
                        placeholder="내용 입력"
                        onCommit={(v) => patch({ notes: notes.map((n) => (n.id === note.id ? { ...n, body: v } : n)) })}
                        className="block text-[13px] text-[#4a4a4a] leading-relaxed whitespace-pre-wrap break-words"
                      />
                    </div>
                  ) : (
                    note.body && (
                      // 접혀도 줄바꿈은 그대로 두고 세 줄까지만 보여준다
                      <div
                        className="mt-1 text-[13px] text-[#737373] leading-snug whitespace-pre-wrap break-words line-clamp-3 cursor-pointer"
                        onClick={() => setExpanded(note.id)}
                      >
                        {note.body}
                      </div>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  {note.body && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded(expanded === note.id ? null : note.id);
                      }}
                      className="text-[11.5px] text-[#aaaaaa] hover:text-[#0f0f0f] transition-colors"
                    >
                      {expanded === note.id ? "접기" : "전체 보기"}
                    </button>
                  )}
                  <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
                    {note.date}
                  </span>
                  <PinButton
                    pinned={!!note.pinnedAt}
                    accentColor={project.color}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(note.id);
                    }}
                  />
                  <DeleteX
                    always
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(note.id);
                    }}
                  />
                </div>
              </div>
            </div>
            {expanded === note.id && (
              <div className="h-1 w-full" style={{ backgroundColor: project.color, opacity: 0.6 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
