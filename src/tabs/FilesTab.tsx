import { useCallback, useEffect, useRef, useState } from "react";
import { MONO, RADIUS } from "../ui";
import type { Project } from "../types";
import { fmtDate } from "../types";

type Entry = { name: string; dir: boolean; size: number; mtime: number };
type Listing =
  | { status: "loading" }
  | { status: "ok"; dir: string; entries: Entry[] }
  | { status: "missing"; dir: string }
  | { status: "error"; message: string };
type SortKey = "name" | "mtime" | "kind" | "size";
type Notice = { text: string; error?: boolean };

const COLS = "minmax(0, 1fr) 140px 110px 80px";

/** 탭을 옮겼다 돌아와도 보던 폴더를 유지한다 (화면 상태라 데이터 파일에는 넣지 않는다) */
const lastPath = new Map<string, string[]>();

/** 확장자별 표시. 위에서부터 먼저 맞는 것을 쓴다 */
const KINDS: Array<{ exts: string[]; type: string; color: string; bg: string }> = [
  { exts: ["pdf"], type: "PDF 문서", color: "#c84b31", bg: "#fff4f1" },
  { exts: ["hwp", "hwpx"], type: "한글 문서", color: "#0e7490", bg: "#eff9fb" },
  { exts: ["doc", "docx", "rtf", "odt"], type: "Word 문서", color: "#1a56db", bg: "#eff4ff" },
  {
    exts: ["ppt", "pptx", "pps", "ppsx", "odp"],
    type: "PowerPoint",
    color: "#b45309",
    bg: "#fff8ed",
  },
  { exts: ["xls", "xlsx", "xlsm", "csv", "ods"], type: "Excel", color: "#2a7a4b", bg: "#f0faf4" },
  {
    exts: ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "heic", "tif", "tiff"],
    type: "이미지",
    color: "#7c3aed",
    bg: "#f5f0ff",
  },
  {
    exts: ["zip", "7z", "rar", "alz", "egg", "tar", "gz"],
    type: "압축 파일",
    color: "#737373",
    bg: "#f4f4f2",
  },
  { exts: ["txt", "md", "log", "json"], type: "텍스트", color: "#737373", bg: "#f4f4f2" },
];

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function kindOf(e: Entry) {
  if (e.dir) return { type: "폴더", color: "", bg: "" };
  const ext = extOf(e.name);
  const k = KINDS.find((k) => k.exts.includes(ext));
  return k || { type: ext ? `${ext.toUpperCase()} 파일` : "파일", color: "#aaaaaa", bg: "#f4f4f2" };
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function fmtTime(ms: number) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDate(d)} ${hh}:${mm}`;
}

/** 폴더는 항상 위 (탐색기와 같음). 같은 값이면 이름순 */
function sortEntries(list: Entry[], key: SortKey, desc: boolean) {
  const byName = (a: Entry, b: Entry) =>
    a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" });
  return [...list].sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    let c = 0;
    if (key === "mtime") c = a.mtime - b.mtime;
    else if (key === "size") c = a.size - b.size;
    else if (key === "kind") c = kindOf(a).type.localeCompare(kindOf(b).type, "ko");
    if (c === 0) c = byName(a, b);
    return desc ? -c : c;
  });
}

/** 예전 server.mjs 는 /api/files 를 몰라서 화면(index.html)을 돌려준다 */
class ServerOutdated extends Error {}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!(res.headers.get("content-type") || "").includes("application/json")) {
    throw new ServerOutdated();
  }
  return { status: res.status, data: await res.json() };
}

const RESTART_HINT =
  "실행 중인 서버가 예전 버전이라 자료함이 꺼져 있습니다. " +
  "바탕화면의 '프로젝트 대시보드'를 다시 실행해 주세요.";

/**
 * 자료함 탭 — 바탕화면 '자료함\<프로젝트 코드>' 폴더를 탐색기처럼 보여준다.
 * 더블클릭: 폴더면 들어가고, 파일이면 서버가 Windows 기본 프로그램으로 연다.
 * 파일을 넣고 빼는 건 탐색기에서 하고, 이 창으로 돌아오면 목록을 다시 읽는다.
 */
export default function FilesTab({ project }: { project: Project }) {
  const code = project.code;
  const [segs, setSegs] = useState<string[]>(() => lastPath.get(project.id) || []);
  const [listing, setListing] = useState<Listing>({ status: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [notice, setNotice] = useState<Notice | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const noticeTimer = useRef<number | undefined>(undefined);

  // 폴더를 옮길 때는 이전 목록을 둔 채로 새 목록을 읽는다 (깜빡임 방지)
  const load = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const q = new URLSearchParams({ code, path: segs.join("/") });
      const { status, data } = await api(`/api/files?${q}`);
      if (id !== reqId.current) return; // 그 사이 다른 폴더로 옮겼다
      if (status === 404 && segs.length) {
        setSegs([]); // 보던 폴더가 지워졌거나 코드가 바뀌었다 → 프로젝트 폴더로
        return;
      }
      if (!data.ok) throw new Error(data.error || `오류 ${status}`);
      setListing(
        data.exists
          ? { status: "ok", dir: data.dir, entries: data.entries }
          : { status: "missing", dir: data.dir },
      );
    } catch (e) {
      if (id !== reqId.current) return;
      setListing({
        status: "error",
        message: e instanceof ServerOutdated ? RESTART_HINT : String((e as Error).message || e),
      });
    }
  }, [code, segs]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    lastPath.set(project.id, segs);
  }, [project.id, segs]);

  // 탐색기에서 파일을 넣고 돌아오면 바로 보이도록
  useEffect(() => {
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const entries = listing.status === "ok" ? sortEntries(listing.entries, sort.key, sort.desc) : [];

  function flash(n: Notice) {
    window.clearTimeout(noticeTimer.current);
    setNotice(n);
    noticeTimer.current = window.setTimeout(() => setNotice(null), n.error ? 6000 : 2500);
  }

  /** openCode 가 빈 값이면 자료함 폴더 자체를 연다 */
  async function openOnPc(openCode: string, rel: string, done: string) {
    try {
      const { data } = await api("/api/files/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: openCode, path: rel }),
      });
      if (!data.ok) throw new Error(data.error || "열지 못했습니다");
      flash({ text: done });
    } catch (e) {
      if (e instanceof ServerOutdated) {
        flash({ text: RESTART_HINT, error: true });
        return;
      }
      flash({ text: String((e as Error).message || e), error: true });
      load(); // 그 사이 지워진 파일이었을 수 있다
    }
  }

  function goTo(next: string[]) {
    // 위로 올라가면 방금 나온 폴더를 선택해 둔다 (탐색기와 같음)
    setSelected(next.length < segs.length ? segs[next.length] : null);
    setSegs(next);
  }

  function openEntry(e: Entry) {
    if (e.dir) goTo([...segs, e.name]);
    else openOnPc(code, [...segs, e.name].join("/"), `열었습니다 · ${e.name}`);
  }

  function onKeyDown(ev: React.KeyboardEvent) {
    const idx = entries.findIndex((e) => e.name === selected);
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const next =
        ev.key === "ArrowDown" ? Math.min(entries.length - 1, idx + 1) : Math.max(0, idx - 1);
      if (entries[next]) setSelected(entries[next].name);
    } else if (ev.key === "Enter" && idx >= 0) {
      ev.preventDefault();
      openEntry(entries[idx]);
    } else if (ev.key === "Backspace" && segs.length) {
      ev.preventDefault();
      goTo(segs.slice(0, -1));
    }
  }

  /** 같은 칸을 다시 누르면 순서를 뒤집는다. 날짜·크기는 큰 것부터 시작 */
  function sortBy(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, desc: !s.desc } : { key, desc: key === "mtime" || key === "size" },
    );
  }

  const columns: Array<[SortKey, string]> = [
    ["name", "이름"],
    ["mtime", "수정한 날짜"],
    ["kind", "유형"],
    ["size", "크기"],
  ];

  const noticeEl = notice && (
    <span style={{ color: notice.error ? "#c84b31" : "#2a7a4b" }}>{notice.text}</span>
  );

  return (
    <div className="px-8 py-6 max-w-5xl">
      {/* 위치 + 도구 */}
      <div className="flex items-center gap-2 mb-4">
        <ToolButton
          onClick={() => goTo(segs.slice(0, -1))}
          disabled={!segs.length}
          title="상위 폴더 (Backspace)"
        >
          ↑
        </ToolButton>
        <nav className="flex items-center flex-wrap gap-1 text-[13px] min-w-0">
          <span
            className="text-[#aaaaaa]"
            title={listing.status === "ok" || listing.status === "missing" ? listing.dir : undefined}
          >
            자료함
          </span>
          {[code, ...segs].map((name, i) => {
            const last = i === segs.length;
            return (
              <span key={i} className="flex items-center gap-1 min-w-0">
                <span className="text-[#ccccca]">›</span>
                <button
                  onClick={() => !last && goTo(segs.slice(0, i))}
                  className={`truncate max-w-[240px] ${
                    last
                      ? "text-[#0f0f0f] font-medium cursor-default"
                      : "text-[#737373] hover:text-[#0f0f0f]"
                  }`}
                  style={i === 0 ? MONO : undefined}
                >
                  {name}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          <ToolButton onClick={load} title="목록 다시 읽기">
            새로고침
          </ToolButton>
          <ToolButton
            onClick={() => openOnPc(code, segs.join("/"), "탐색기에서 열었습니다")}
            disabled={listing.status !== "ok"}
            title="이 폴더를 Windows 탐색기로 열기 (파일 추가·이름 바꾸기는 여기서)"
          >
            탐색기에서 열기
          </ToolButton>
        </div>
      </div>

      {listing.status === "loading" && (
        <div className="text-[13px] text-[#aaaaaa] py-12 text-center">불러오는 중…</div>
      )}

      {listing.status === "error" && (
        <div className="text-[13px] text-[#737373] py-12 text-center flex flex-col items-center gap-3">
          <div>자료함을 불러오지 못했습니다.</div>
          <div className="text-[12px] text-[#c84b31] max-w-md">{listing.message}</div>
          <ToolButton onClick={load}>다시 시도</ToolButton>
        </div>
      )}

      {listing.status === "missing" && (
        <div
          className="border border-dashed border-[#e5e5e3] py-10 px-6 text-center flex flex-col items-center gap-2"
          style={{ borderRadius: RADIUS }}
        >
          <div className="text-[13.5px] text-[#0f0f0f]">
            <span style={MONO}>{code}</span> 자료 폴더가 없습니다.
          </div>
          <div className="text-[12px] text-[#737373]" style={MONO}>
            {listing.dir}
          </div>
          <div className="text-[12px] text-[#aaaaaa]">
            자료함에 프로젝트 코드와 같은 이름의 폴더를 만들면 여기에 보입니다.
          </div>
          <div className="mt-2">
            <ToolButton onClick={() => openOnPc("", "", "자료함 폴더를 열었습니다")}>
              자료함 폴더 열기
            </ToolButton>
          </div>
          {noticeEl && <div className="mt-1 text-[11.5px]">{noticeEl}</div>}
        </div>
      )}

      {listing.status === "ok" && (
        <>
          <div
            ref={listRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="border border-[#e5e5e3] outline-none focus-visible:border-[#0f0f0f] select-none"
            style={{ borderRadius: RADIUS }}
          >
            <div
              className="grid text-[11px] font-semibold tracking-wider text-[#737373] border-b border-[#e5e5e3] px-4"
              style={{ ...MONO, gridTemplateColumns: COLS }}
            >
              {columns.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => sortBy(key)}
                  className={`py-2.5 hover:text-[#0f0f0f] transition-colors ${
                    key === "size" ? "text-right" : "text-left"
                  } ${key === "name" ? "pl-[44px]" : ""}`}
                >
                  {label}
                  {sort.key === key && <span className="ml-1">{sort.desc ? "▼" : "▲"}</span>}
                </button>
              ))}
            </div>

            {entries.length === 0 && (
              <div className="text-[13px] text-[#aaaaaa] py-10 text-center">
                이 폴더는 비어 있습니다.
              </div>
            )}

            {entries.map((e) => {
              const kind = kindOf(e);
              const isSel = selected === e.name;
              return (
                <div
                  key={e.name}
                  data-selected={isSel}
                  onClick={() => setSelected(e.name)}
                  onDoubleClick={() => openEntry(e)}
                  className={`grid items-center px-4 py-[7px] cursor-default transition-colors ${
                    isSel ? "" : "hover:bg-[#f9f9f7]"
                  }`}
                  style={{
                    gridTemplateColumns: COLS,
                    backgroundColor: isSel ? project.colorBg : undefined,
                  }}
                >
                  <span className="flex items-center gap-2 min-w-0 pr-4">
                    <span className="w-[36px] flex justify-center flex-shrink-0">
                      {e.dir ? (
                        <FolderIcon />
                      ) : (
                        <span
                          className="inline-flex items-center justify-center w-[36px] h-[16px] text-[9px] font-semibold"
                          style={{
                            ...MONO,
                            color: kind.color,
                            backgroundColor: kind.bg,
                            borderRadius: RADIUS,
                          }}
                        >
                          {(extOf(e.name) || "file").toUpperCase().slice(0, 4)}
                        </span>
                      )}
                    </span>
                    <span className="text-[13.5px] text-[#0f0f0f] truncate" title={e.name}>
                      {e.name}
                    </span>
                  </span>
                  <span className="text-[11.5px] text-[#737373]" style={MONO}>
                    {fmtTime(e.mtime)}
                  </span>
                  <span className="text-[12px] text-[#737373] truncate">{kind.type}</span>
                  <span className="text-[11.5px] text-[#737373] text-right" style={MONO}>
                    {e.dir ? "" : fmtSize(e.size)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-2.5 text-[11.5px] text-[#aaaaaa]">
            <span style={MONO}>{entries.length}개 항목</span>
            <span>더블클릭·Enter 열기 · Backspace 상위 폴더</span>
            {noticeEl && <span className="ml-auto">{noticeEl}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function ToolButton({
  onClick,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-[12px] font-medium px-2.5 py-1 border border-[#e5e5e3] text-[#0f0f0f] hover:border-[#0f0f0f] transition-colors disabled:text-[#ccccca] disabled:hover:border-[#e5e5e3] flex-shrink-0"
      style={{ borderRadius: RADIUS }}
    >
      {children}
    </button>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
      <path
        d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3.8l1.7 1.8h7.5A1.5 1.5 0 0 1 17 4.3v7.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 1 11.5z"
        fill="#f3d27a"
        stroke="#d9a62e"
        strokeWidth="1"
      />
    </svg>
  );
}
