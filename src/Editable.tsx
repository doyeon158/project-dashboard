import { useEffect, useRef, useState } from "react";

/**
 * 클릭해서 바로 고치는 텍스트.
 *   · 평소에는 글씨. 마우스를 올리면 점선 밑줄이 생겨 고칠 수 있는 곳임을 알려준다
 *   · 클릭하면 실제 입력칸으로 바뀌고 기존 내용이 선택된 상태가 된다
 *   · 한 줄: Enter 저장 / 여러 줄(multiline): Enter 는 줄바꿈, Ctrl+Enter 저장
 *   · 어느 쪽이든 다른 곳 클릭 → 저장, Esc → 취소
 *
 * contentEditable 을 쓰지 않는 이유: 한글 IME 조합 중 Enter 를 누르면 조합이 확정되기
 * 전에 편집이 끝나 입력이 사라진다. 아래처럼 isComposing 을 확인하는 입력칸이 안전하다.
 */
export default function Editable({
  value,
  onCommit,
  className,
  style,
  placeholder,
  maxLength,
  transform,
  multiline = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  maxLength?: number;
  /** 저장 직전 값 가공 (예: 코드 대문자화) */
  transform?: (v: string) => string;
  /** 여러 줄 입력 (노트 본문처럼 줄바꿈을 살려야 하는 곳) */
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    ref.current?.focus();
    // 여러 줄은 전체 선택하면 실수로 다 지우기 쉬워 커서만 끝으로 보낸다
    if (multiline) {
      const el = ref.current as HTMLTextAreaElement | null;
      el?.setSelectionRange(el.value.length, el.value.length);
    } else {
      ref.current?.select();
    }
  }, [editing, multiline]);

  function start() {
    setDraft(value);
    setEditing(true);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  function commit() {
    setEditing(false);
    // 여러 줄은 줄바꿈을 살려야 하므로 앞뒤 공백만 정리한다
    let v = multiline ? draft.replace(/[ \t]+$/gm, "").trim() : draft.trim().replace(/\s+/g, " ");
    if (transform) v = transform(v);
    if (!v || v === value) return; // 빈 값으로는 지우지 않는다
    onCommit(v);
  }

  if (editing && multiline) {
    const rows = Math.min(Math.max(draft.split("\n").length + 1, 4), 24);
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        rows={rows}
        className={`${className || ""} w-full bg-white border border-[#0f0f0f] outline-none px-2 py-1.5`}
        style={{ ...style, resize: "vertical" }}
      />
    );
  }

  if (editing) {
    // 한글은 글자당 폭이 약 2배라 입력창 너비를 그만큼 잡아준다
    const width = [...draft].reduce((a, c) => a + (c.charCodeAt(0) > 0x1100 ? 2 : 1), 0);
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return; // 한글 조합 중에는 아무 것도 하지 않는다
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className={`${className || ""} bg-white border-b border-[#0f0f0f] outline-none`}
        style={{ ...style, width: `${Math.min(Math.max(width + 2, 6), 60)}ch` }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title={multiline ? "클릭해서 수정 (Ctrl+Enter 저장)" : "클릭해서 수정"}
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          start();
        }
      }}
      className={`${className || ""} cursor-text border-b border-dashed border-transparent hover:border-[#c0c0be] outline-none focus:border-[#0f0f0f]`}
      style={style}
    >
      {value || placeholder || "—"}
    </span>
  );
}
