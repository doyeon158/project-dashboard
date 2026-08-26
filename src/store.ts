import { useEffect, useRef, useState } from "react";
import type { State } from "./types";

const API = "/api/state";
const LOCAL_KEY = "project-dashboard-state";
const DEBOUNCE_MS = 400;

export type SaveStatus = "loading" | "saved" | "saving" | "error" | "local";

const EMPTY: State = {
  version: 1,
  profile: { name: "사용자", team: "", email: "" },
  deadlines: [],
  memos: [],
  projects: [],
};

function normalize(raw: unknown): State {
  const s = (raw || {}) as Partial<State>;
  return {
    version: s.version ?? 1,
    profile: { ...EMPTY.profile, ...(s.profile || {}) },
    deadlines: Array.isArray(s.deadlines) ? s.deadlines : [],
    memos: Array.isArray(s.memos) ? s.memos : [],
    projects: (Array.isArray(s.projects) ? s.projects : []).map((p) => ({
      ...p,
      notes: Array.isArray(p.notes) ? p.notes : [],
      tasks: (Array.isArray(p.tasks) ? p.tasks : []).map((t) => ({
        ...t,
        status: t.status ?? "pending",
        priority: t.priority ?? "mid",
        progress: Number(t.progress) || 0,
        date: t.date ?? "",
      })),
      records: Array.isArray(p.records) ? p.records : [],
    })),
  };
}

/**
 * 상태를 로컬 데이터 서버(data/dashboard-data.json)와 동기화한다.
 * 서버에 못 붙으면 브라우저 localStorage 로 자동 대체(작업이 날아가지 않게).
 *
 * 저장은 0.4초 디바운스 + 한 번에 하나씩. 저장하는 동안 또 고치면 끝난 뒤 최신
 * 상태로 한 번 더 보내므로, 빠르게 연속 수정해도 마지막 값이 파일에 남는다.
 */
export function usePersistentState() {
  const [state, setState] = useState<State | null>(null);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const latest = useRef<State | null>(null); // 가장 최근 상태
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false); // 저장 요청 진행 중
  const version = useRef(0); // 변경될 때마다 +1
  const savedVersion = useRef(0); // 파일에 기록이 끝난 버전
  const dirty = useRef(false); // 사용자가 실제로 고쳤는지 (최초 로딩 직후 저장 방지)
  const offline = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        setState(normalize(json));
        setStatus("saved");
      } catch {
        offline.current = true;
        const cached = localStorage.getItem(LOCAL_KEY);
        if (!alive) return;
        setState(normalize(cached ? JSON.parse(cached) : EMPTY));
        setStatus("local");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 아직 파일에 안 들어간 변경이 남아 있으면 없어질 때까지 순서대로 보낸다.
   * "저장 중에 생긴 변경"은 버전 번호로 판별하므로, 요청이 끝나는 순간에
   * 새 변경이 들어와도 놓치지 않는다.
   */
  async function flush() {
    if (inFlight.current) return; // 이미 돌고 있으면 그 루프가 최신 버전까지 처리한다
    inFlight.current = true;
    try {
      while (version.current !== savedVersion.current) {
        const sending = version.current;
        const snapshot = latest.current;
        if (!snapshot) break;
        localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
        if (offline.current) {
          savedVersion.current = sending;
          setStatus("local");
          continue;
        }
        setStatus("saving");
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        if (!res.ok) throw new Error(String(res.status));
        savedVersion.current = sending;
      }
      if (!offline.current && version.current === savedVersion.current) setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
      // 루프를 빠져나오는 사이에 들어온 변경 처리 (마지막 한 건이 유실되던 구간)
      if (version.current !== savedVersion.current) void flush();
    }
  }

  // 변경 후 0.4초 뒤 저장 (연속 입력은 한 번으로 합침)
  useEffect(() => {
    latest.current = state;
    if (!state || !dirty.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    setStatus(offline.current ? "local" : "saving");
    timer.current = window.setTimeout(flush, DEBOUNCE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state]);

  function update(fn: (s: State) => State) {
    dirty.current = true;
    version.current += 1;
    setState((cur) => (cur ? fn(cur) : cur));
  }

  return { state, status, update };
}
