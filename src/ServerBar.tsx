import { useEffect, useState } from "react";
import { MONO, RADIUS } from "./ui";
import { fmtDate, today } from "./types";

type Proc = { pid: string; mem?: number; user?: string; secs?: number; cmd?: string };
type Unit = {
  id: string; // "GPU0", "SoC1" …
  busy: boolean | null; // null = 못 읽음
  error?: string;
  util?: number;
  memUsed?: number; // MiB
  memTotal?: number;
  procs?: Proc[];
  detail?: string; // 장치 종류마다 다른 한 줄 설명
};
type State = "free" | "busy" | "offline" | "unknown" | "checking";
type Server = {
  name: string;
  ssh: string;
  state: State;
  error: string;
  units: Unit[];
  updatedAt: number;
  since: number;
};
type Report =
  | { status: "loading" }
  | { status: "ok"; servers: Server[] }
  | { status: "error"; message: string };

// 화면은 5초마다 서버에 묻는다. 원격 값도 5초마다 갱신된다 (server.mjs SAMPLE_EVERY_S)
const POLL_MS = 5_000;

const LOOK: Record<State, { label: string; color: string; bg: string }> = {
  free: { label: "비어있음", color: "#2a7a4b", bg: "#f0faf4" },
  busy: { label: "사용중", color: "#b45309", bg: "#fff8ed" },
  offline: { label: "접속 안 됨", color: "#c84b31", bg: "#fff4f1" },
  unknown: { label: "알 수 없음", color: "#c84b31", bg: "#fff4f1" },
  checking: { label: "확인 중", color: "#aaaaaa", bg: "transparent" },
};

function clock(ms: number, withSec = false) {
  const d = new Date(ms);
  const t = [d.getHours(), d.getMinutes(), ...(withSec ? [d.getSeconds()] : [])]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return fmtDate(d) === today() ? t : `${d.getMonth() + 1}/${d.getDate()} ${t}`;
}

function duration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간`;
  return h ? `${h}시간 ${m}분` : `${m}분`;
}

const gb = (mib = 0) => (mib / 1024).toFixed(1);

/** 경로는 마지막 이름만 남기고(모델 경로 → 모델 이름) 70자로 자른다 */
function shortCmd(cmd = "") {
  const s = cmd.replace(/(^|[\s=])(?:[^\s=/]*\/)+(?=[^\s/])/g, "$1");
  return s.length > 70 ? s.slice(0, 69) + "…" : s;
}

function unitLine(u: Unit) {
  if (u.busy === null) return `${u.id} · 못 읽음${u.error ? ` — ${u.error}` : ""}`;
  const parts = [`${u.id} · ${u.busy ? "사용중" : "비어있음"}`];
  if (u.util !== undefined) parts.push(`사용률 ${u.util}%`);
  if (u.memTotal) parts.push(`메모리 ${gb(u.memUsed)}/${gb(u.memTotal)}GB`);
  if (u.detail) parts.push(u.detail);
  const lines = [parts.join(" · ")];
  for (const p of u.procs || []) {
    const age = p.secs !== undefined ? `${duration(p.secs)}째` : "";
    const mem = p.mem !== undefined ? `${gb(p.mem)}GB` : "";
    lines.push("   " + [p.user, shortCmd(p.cmd), age, mem].filter(Boolean).join(" · "));
  }
  return lines.join("\n");
}

function tooltip(s: Server) {
  const lines = [`${s.name} (${s.ssh})`];
  if (s.error) lines.push(s.error);
  lines.push(...s.units.map(unitLine));
  if (s.since && s.state !== "checking") lines.push(`${clock(s.since)}부터 ${LOOK[s.state].label}`);
  if (s.updatedAt) lines.push(`마지막 확인 ${clock(s.updatedAt, true)}`);
  return lines.join("\n");
}

/** 사용중일 때 띠에 바로 보일 한 줄: 누가 · 얼마나 */
function busySummary(s: Server) {
  const busy = s.units.filter((u) => u.busy);
  const user = busy.flatMap((u) => u.procs || []).find((p) => p.user)?.user;
  if (s.units.length > 1) {
    return [`${busy.length}/${s.units.length}`, user].filter(Boolean).join(" · ");
  }
  const u = busy[0];
  if (!u) return "";
  return [u.util !== undefined ? `${u.util}%` : "", u.memTotal ? `${gb(u.memUsed)}GB` : "", user]
    .filter(Boolean)
    .join(" · ");
}

/** "GPU0" "SoC0" "SoC1" → [["GPU", [0번]], ["SoC", [0번, 1번]]] — 이름은 한 번, 번호만 나열 */
function groupUnits(units: Unit[]) {
  const groups = new Map<string, Array<{ n: string; u: Unit }>>();
  for (const u of units) {
    const [, prefix = u.id, n = ""] = u.id.match(/^(\D+)(\d+)$/) || [];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push({ n, u });
  }
  return [...groups];
}

/**
 * 서버 관제실 — 모든 화면 맨 위에 고정되는 띠.
 * data/servers.json 의 GPU·SoC 가 지금 사용중인지, 비어 있어 쓸 수 있는지 보여준다.
 * 탭을 보고 있지 않을 때는 묻지 않는다 → 1분 뒤 서버가 SSH 연결을 닫는다.
 */
export default function ServerBar() {
  const [report, setReport] = useState<Report>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;

    async function load() {
      try {
        const res = await fetch("/api/servers", { cache: "no-store" });
        // 예전 server.mjs 는 이 API 를 몰라 화면(index.html)을 돌려준다
        if (!(res.headers.get("content-type") || "").includes("application/json")) {
          throw new Error("바탕화면의 '프로젝트 대시보드'를 다시 실행해 주세요");
        }
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "확인 실패");
        if (alive) setReport({ status: "ok", servers: data.servers });
      } catch (e) {
        if (!alive) return;
        setReport({
          status: "error",
          // fetch 자체가 실패 = 로컬 대시보드 서버가 꺼졌다
          message: e instanceof TypeError ? "대시보드 서버 연결 끊김" : (e as Error).message,
        });
      }
    }

    async function tick() {
      if (!document.hidden) await load();
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    }
    const onVisible = () => {
      if (!document.hidden) load();
    };

    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const servers = report.status === "ok" ? report.servers : [];

  return (
    <div className="h-[34px] flex-shrink-0 border-b border-[#e5e5e3] bg-[#f9f9f7] flex items-center gap-3 px-4 text-[12px] overflow-hidden">
      <span className="text-[11.5px] font-semibold text-[#737373] flex-shrink-0 mr-1">
        서버 관제실
      </span>

      {report.status === "loading" && <span className="text-[#aaaaaa]">확인 중…</span>}

      {report.status === "error" && <span className="text-[#c84b31]">{report.message}</span>}

      {report.status === "ok" && servers.length === 0 && (
        <span className="text-[#aaaaaa]">
          감시할 서버가 없습니다 · <span style={MONO}>data/servers.json</span> 에 추가하세요
        </span>
      )}

      {servers.map((s) => {
        const look = LOOK[s.state];
        const summary = s.state === "busy" ? busySummary(s) : "";
        return (
          <span
            key={`${s.name}|${s.ssh}`}
            title={tooltip(s)}
            className="flex items-center gap-1.5 px-2 py-0.5 flex-shrink-0 cursor-default"
            style={{ backgroundColor: look.bg, borderRadius: RADIUS }}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: look.color }} />
            <span className="font-semibold text-[#0f0f0f]">{s.name}</span>
            {/* 지켜보는 장치 번호. 장치마다 사용중이면 주황, 비었으면 초록 */}
            {groupUnits(s.units).map(([prefix, list]) => (
              <span key={prefix} className="flex items-center gap-1 text-[11px]" style={MONO}>
                <span className="text-[#aaaaaa]">{prefix}</span>
                {list.map(({ n, u }) => {
                  const color = u.busy ? LOOK.busy.color : u.busy === false ? LOOK.free.color : "";
                  return (
                    <span
                      key={u.id}
                      title={unitLine(u)}
                      className="font-semibold"
                      style={{ color: color || "#aaaaaa" }}
                    >
                      {n}
                    </span>
                  );
                })}
              </span>
            ))}
            <span className="font-medium" style={{ color: look.color }}>
              {look.label}
            </span>
            {summary && (
              <span className="text-[11px] text-[#737373]" style={MONO}>
                {summary}
              </span>
            )}
            {(s.state === "offline" || s.state === "unknown") && s.error && (
              <span className="text-[11px] text-[#c84b31] truncate max-w-[260px]">{s.error}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
