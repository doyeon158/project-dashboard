import { useEffect, useRef, useState } from "react";

/**
 * 클릭해서 바로 고치는 텍스트.
 *   · 평소에는 글씨. 마우스를 올리면 점선 밑줄이 생겨 고칠 수 있는 곳임을 알려준다
 *   · 클릭하면 실제 <input> 으로 바뀌고 기존 내용이 선택된 상태가 된다
 *   · Enter 또는 다른 곳 클릭 → 저장,  Esc → 취소
 *
 * contentEditable 을 쓰지 않는 이유: 한글 IME 조합 중 Enter 를 누르면 조합이 확정되기
 * 전에 편집이 끝나 입력이 사라진다. 아래처럼 isComposing 을 확인하는 <input> 이 안전하다.
 */
export default function Editable({
  value,
  onCommit,
  className,
  style,
  placeholder,
  maxLength,
  transform,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  maxLength?: number;
  /** 저장 직전 값 가공 (예: 코드 대문자화) */
  transform?: (v: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    let v = draft.trim().replace(/\s+/g, " ");
    if (transform) v = transform(v);
    if (!v || v === value) return; // 빈 값으로는 지우지 않는다
    onCommit(v);
  }

  if (editing) {
    // 한글은 글자당 폭이 약 2배라 입력창 너비를 그만큼 잡아준다
    const width = [...draft].reduce((a, c) => a + (c.charCodeAt(0) > 0x1100 ? 2 : 1), 0);
    return (
      <input
        ref={ref}
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
            setDraft(value);
            setEditing(false);
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
      title="클릭해서 수정"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setDraft(value);
          setEditing(true);
        }
      }}
      className={`${className || ""} cursor-text border-b border-dashed border-transparent hover:border-[#c0c0be] outline-none focus:border-[#0f0f0f]`}
      style={style}
    >
      {value || placeholder || "—"}
    </span>
  );
}
