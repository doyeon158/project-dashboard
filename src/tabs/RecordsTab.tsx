import { useState } from "react";
import Editable from "../Editable";
import { AddButton, DeleteX, FormActions, MONO, PinButton, RADIUS } from "../ui";
import type { Project, Rec } from "../types";
import { orderPinned, today, uid } from "../types";

const COLS = "1fr 1fr auto auto auto";

/** 기록 탭 — 양식(항목+값)과 무양식(자유 한 줄)을 섞어 쓰는 표 */
export default function RecordsTab({
  project,
  patch,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"form" | "free">("form");
  const [draft, setDraft] = useState({ label: "", value: "", free: "" });

  const records = project.records;
  const freeLines = draft.free.split(/\r?\n/).filter((l) => l.trim());

  /** 양식은 한 건, 무양식은 줄마다 한 건씩 등록 */
  function submit() {
    let created: Rec[] = [];
    if (mode === "free") {
      created = freeLines.map((l) => ({
        id: uid(),
        label: "",
        value: "",
        text: l.trim(),
        date: today(),
      }));
    } else {
      if (!draft.label.trim()) return;
      created = [
        { id: uid(), label: draft.label.trim(), value: draft.value.trim(), date: today() },
      ];
    }
    if (!created.length) return;
    patch({ records: [...created, ...records] });
    setDraft({ label: "", value: "", free: "" });
    setAdding(false);
  }

  function patchRec(id: string, p: Partial<Rec>) {
    patch({ records: records.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  }

  function togglePin(id: string) {
    patch({
      records: records.map((r) =>
        r.id === id ? { ...r, pinnedAt: r.pinnedAt ? undefined : Date.now() } : r,
      ),
    });
  }

  return (
    <div className="px-8 py-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div className="text-[12px] text-[#737373] uppercase tracking-widest font-medium">
          기록 목록
        </div>
        <AddButton label="+ 기록 추가" onClick={() => setAdding(true)} />
      </div>

      {adding && (
        <div
          className="mb-4 border border-[#e5e5e3] p-4 flex flex-col gap-3"
          style={{ borderRadius: RADIUS }}
        >
          {/* 입력 방식 */}
          <div className="flex items-center gap-2">
            {(
              [
                ["form", "양식"],
                ["free", "자유"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-[11.5px] font-medium px-2.5 py-1 border transition-colors ${
                  mode === m
                    ? "border-[#0f0f0f] bg-[#0f0f0f] text-white"
                    : "border-[#e5e5e3] text-[#737373] hover:border-[#0f0f0f]"
                }`}
                style={{ borderRadius: RADIUS }}
              >
                {label}
              </button>
            ))}
            <span className="text-[11.5px] text-[#aaaaaa]">
              {mode === "form"
                ? "항목과 값을 나눠서 (예: GPU 사용 시간 = 128h)"
                : "형식 없이 한 줄로 (예: mAP baseline 65%, 현재 70%, 목표 90%)"}
            </span>
          </div>

          {mode === "form" ? (
            <div className="flex gap-3">
              <input
                autoFocus
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="항목명 (예: 진행률)"
                className="flex-1 text-[13.5px] text-[#0f0f0f] bg-transparent border-b border-[#e5e5e3] pb-2 focus:border-[#0f0f0f] transition-colors"
              />
              <input
                value={draft.value}
                onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                placeholder="값 (예: 72%)"
                className="flex-1 text-[13.5px] text-[#0f0f0f] bg-transparent border-b border-[#e5e5e3] pb-2 focus:border-[#0f0f0f] transition-colors"
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") setAdding(false);
                }}
              />
            </div>
          ) : (
            <>
              <textarea
                autoFocus
                value={draft.free}
                onChange={(e) => setDraft((d) => ({ ...d, free: e.target.value }))}
                rows={3}
                placeholder={
                  "mAP (baseline) 65%, 현재 70%, 목표 90%\n" +
                  "여러 줄을 쓰면 줄마다 한 건씩 등록됩니다."
                }
                className="w-full text-[13.5px] text-[#0f0f0f] bg-transparent border-b border-[#e5e5e3] pb-2 focus:border-[#0f0f0f] transition-colors leading-relaxed"
                style={{ resize: "vertical" }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
                  if (e.key === "Escape") setAdding(false);
                }}
              />
              {freeLines.length > 1 && (
                <div className="text-[11.5px] text-[#737373]" style={MONO}>
                  {freeLines.length}건 등록됩니다 (Ctrl+Enter 저장)
                </div>
              )}
            </>
          )}

          <FormActions color={project.color} onSave={submit} onCancel={() => setAdding(false)} />
        </div>
      )}

      {records.length === 0 && !adding && (
        <div className="text-[13px] text-[#aaaaaa] py-12 text-center">아직 기록이 없습니다.</div>
      )}

      {records.length > 0 && (
        <div className="border border-[#e5e5e3]" style={{ borderRadius: RADIUS }}>
          <div
            className="grid text-[11px] font-semibold tracking-wider uppercase text-[#737373] border-b border-[#e5e5e3] px-5 py-2.5"
            style={{ ...MONO, gridTemplateColumns: COLS }}
          >
            <span>항목</span>
            <span>값</span>
            <span>날짜</span>
            <span />
            <span />
          </div>
          {orderPinned(records).map((rec, i, arr) => (
            <div
              key={rec.id}
              className={`grid items-center px-5 py-3.5 group hover:bg-[#f9f9f7] transition-colors ${
                i < arr.length - 1 ? "border-b border-[#e5e5e3]" : ""
              }`}
              style={{
                gridTemplateColumns: COLS,
                backgroundColor: rec.pinnedAt ? project.colorBg : undefined,
              }}
            >
              {rec.text !== undefined ? (
                // 무양식: 항목·값 칸을 합쳐 한 줄로
                <span style={{ gridColumn: "1 / span 2" }} className="pr-4">
                  <Editable
                    value={rec.text}
                    onCommit={(v) => patchRec(rec.id, { text: v })}
                    className="text-[13.5px] text-[#0f0f0f]"
                  />
                </span>
              ) : (
                <>
                  <Editable
                    value={rec.label}
                    onCommit={(v) => patchRec(rec.id, { label: v })}
                    className="text-[13.5px] text-[#0f0f0f] font-medium"
                  />
                  <Editable
                    value={rec.value}
                    placeholder="—"
                    onCommit={(v) => patchRec(rec.id, { value: v })}
                    className="text-[13.5px] font-semibold"
                    style={{ ...MONO, color: project.color }}
                  />
                </>
              )}
              <span className="text-[11px] text-[#aaaaaa] mr-3" style={MONO}>
                {rec.date}
              </span>
              <span className="mr-2">
                <PinButton
                  pinned={!!rec.pinnedAt}
                  accentColor={project.color}
                  onClick={() => togglePin(rec.id)}
                />
              </span>
              <DeleteX onClick={() => patch({ records: records.filter((r) => r.id !== rec.id) })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
