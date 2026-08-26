/**
 * 화면 전체에서 되풀이되는 작은 조각들.
 * 여기 모아두지 않으면 같은 스타일이 파일마다 복사돼 손볼 때 빠뜨리기 쉽다.
 */
import type { SaveStatus } from "./store";

/** 숫자·코드처럼 폭이 일정해야 하는 글자 */
export const MONO = { fontFamily: "'JetBrains Mono', monospace" } as const;

/** 이 대시보드의 모서리 값 (거의 직각) */
export const RADIUS = "2px";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] text-[#737373] uppercase tracking-widest font-medium mb-2.5">
      {children}
    </div>
  );
}

/** 한눈에 보기 상단의 요약 숫자 칸 */
export function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-[#e5e5e3] px-4 py-3.5" style={{ borderRadius: RADIUS }}>
      <div className="text-[10.5px] text-[#737373] uppercase tracking-widest font-medium">
        {label}
      </div>
      <div className="text-[22px] font-semibold text-[#0f0f0f] leading-tight mt-1" style={MONO}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#aaaaaa] mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function ProgressBar({
  pct,
  color,
  className = "w-24",
}: {
  pct: number;
  color: string;
  className?: string;
}) {
  return (
    <div
      className={`h-1.5 bg-[#e5e5e3] overflow-hidden ${className}`}
      style={{ borderRadius: "999px" }}
    >
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color, borderRadius: "999px" }}
      />
    </div>
  );
}

/** 목록 위쪽의 "+ 노트 추가" 류 버튼 */
export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[12.5px] font-medium px-3 py-1.5 border border-[#e5e5e3] hover:border-[#0f0f0f] transition-colors text-[#0f0f0f]"
      style={{ borderRadius: RADIUS }}
    >
      {label}
    </button>
  );
}

/** 추가 폼 아래의 저장/취소 한 쌍 */
export function FormActions({
  color,
  onSave,
  onCancel,
  saveLabel = "저장",
}: {
  color: string;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onSave}
        className="text-[12px] font-semibold px-3 py-1.5 text-white"
        style={{ backgroundColor: color, borderRadius: RADIUS }}
      >
        {saveLabel}
      </button>
      <button
        onClick={onCancel}
        className="text-[12px] px-3 py-1.5 text-[#737373] border border-[#e5e5e3] hover:border-[#737373]"
        style={{ borderRadius: RADIUS }}
      >
        취소
      </button>
    </div>
  );
}

/** 마우스를 올렸을 때만 드러나는 삭제(×) */
export function DeleteX({
  onClick,
  always = false,
  title,
}: {
  onClick: (e: React.MouseEvent) => void;
  always?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      // before:-inset-2 로 보이는 크기는 그대로 두고 누를 수 있는 범위만 넓힌다
      className={`relative text-[13px] text-[#ccccca] hover:text-[#c84b31] transition-colors w-4 before:absolute before:-inset-2 before:content-[''] ${
        always ? "" : "opacity-0 group-hover:opacity-100"
      }`}
    >
      ×
    </button>
  );
}

/** 고정 토글. 고정되면 압정이 프로젝트 색으로 채워진다. */
export function PinButton({
  pinned,
  accentColor,
  onClick,
}: {
  pinned: boolean;
  accentColor: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={pinned ? "고정 해제" : "최상단에 고정"}
      aria-label={pinned ? "고정 해제" : "최상단에 고정"}
      className={`relative flex items-center justify-center w-4 h-4 transition-colors before:absolute before:-inset-2 before:content-[''] ${
        pinned ? "" : "text-[#ccccca] hover:text-[#0f0f0f]"
      }`}
      style={pinned ? { color: accentColor } : undefined}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <circle
          cx="6"
          cy="4"
          r="2.5"
          fill={pinned ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path d="M6 6.8V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** 사이드바 아래의 저장 상태 표시. dotOnly 는 접힌 사이드바용(점만) */
export function SaveBadge({ status, dotOnly = false }: { status: SaveStatus; dotOnly?: boolean }) {
  const map: Record<SaveStatus, { text: string; color: string; hint?: string }> = {
    loading: { text: "불러오는 중", color: "#aaaaaa" },
    saving: { text: "저장 중…", color: "#d97706" },
    saved: { text: "저장됨", color: "#2a7a4b" },
    error: { text: "저장 실패", color: "#c84b31", hint: "로컬 서버 응답이 없습니다." },
    local: {
      text: "임시저장",
      color: "#d97706",
      hint: "로컬 서버에 연결되지 않아 브라우저에만 저장됩니다. run.bat 으로 실행해 주세요.",
    },
  };
  const s = map[status];
  if (dotOnly) {
    return (
      <span
        className="w-1.5 h-1.5 rounded-full inline-block"
        style={{ backgroundColor: s.color }}
        title={s.hint ? `${s.text} — ${s.hint}` : s.text}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px]"
      style={{ ...MONO, color: s.color }}
      title={s.hint}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.text}
    </span>
  );
}
