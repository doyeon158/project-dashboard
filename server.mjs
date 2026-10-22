/**
 * 프로젝트 대시보드 로컬 서버 (의존성 0 · Node 내장 모듈만 사용)
 *
 *   · dist/ 정적 파일 서빙 (vite build 결과물)
 *   · GET  /api/state → data/dashboard-data.json 읽기
 *   · POST /api/state → 즉시 저장 (원자적 쓰기 + 일자별 백업)
 *   · GET  /api/files?code=QLC&path=하위/폴더 → 자료함 폴더 목록
 *   · POST /api/files/open {code, path}      → 그 파일을 Windows 기본 프로그램으로 열기
 *   · GET  /api/servers  → 서버 관제실: data/servers.json 의 GPU·SoC 가 사용중인지 비어 있는지
 *   · POST /api/shutdown → 서버 종료 (코드가 바뀐 뒤 바로가기를 다시 누르면 새 서버가 부른다)
 *
 * 실행: run.bat 더블클릭  (또는  node server.mjs)
 * 데이터는 100% 이 PC 안에만 있습니다. 바깥으로 나가는 연결은 관제실이 data/servers.json 에
 * 적힌 서버에 SSH 로 붙는 것 하나뿐입니다.
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec, spawn } from "node:child_process";

const BASE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(BASE, "dist");
const DATA_DIR = path.join(BASE, "data");
const DATA = path.join(DATA_DIR, "dashboard-data.json");
const BACKUP_DIR = path.join(DATA_DIR, "backup");
// 처음 실행(또는 깃에서 막 받아온 상태)이면 이 예시 데이터로 시작한다.
// data/ 는 개인 데이터라 깃에 올리지 않고, data.sample/ 만 함께 배포된다.
const SAMPLE = path.join(BASE, "data.sample", "dashboard-data.json");
const PORT = Number(process.env.PORT || 5187);
const OPEN_BROWSER = process.env.NO_OPEN !== "1";
const STARTED_AT = Date.now();
// 자료함: 이 아래에 프로젝트 코드 이름의 폴더(AET, QLC …)를 둔다
const FILES_ROOT = path.resolve(
  process.env.FILES_ROOT || path.join(os.homedir(), "Desktop", "자료함"),
);

const EMPTY_STATE = {
  version: 1,
  profile: { name: "사용자", team: "", email: "" },
  deadlines: [],
  memos: [],
  projects: [],
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function send(res, code, body, ctype = "application/json; charset=utf-8") {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf-8");
  res.writeHead(code, {
    "Content-Type": ctype,
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(buf);
}

async function readState() {
  try {
    const raw = await fsp.readFile(DATA, "utf-8");
    JSON.parse(raw); // 손상 여부 확인
    return raw;
  } catch {
    // 데이터 파일이 없거나 깨졌다 → 예시 데이터로 시작 (없으면 빈 상태)
    let raw = JSON.stringify(EMPTY_STATE, null, 2);
    let from = "빈 상태";
    try {
      const sample = await fsp.readFile(SAMPLE, "utf-8");
      JSON.parse(sample); // 예시 파일이 깨졌으면 빈 상태로
      raw = sample;
      from = "data.sample";
    } catch {
      // 예시 파일이 없으면 빈 상태 그대로
    }
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(DATA, raw, "utf-8");
    console.log(`[데이터 새로 만듦] ${from} → ${DATA}`);
    return raw;
  }
}

// 하루 첫 저장 때만 백업을 남긴다 (data/backup/dashboard-data.YYYY-MM-DD.json)
async function backupOnce() {
  try {
    if (!fs.existsSync(DATA)) return;
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const day = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (로컬 시각)
    const dest = path.join(BACKUP_DIR, `dashboard-data.${day}.json`);
    if (!fs.existsSync(dest)) await fsp.copyFile(DATA, dest);
  } catch (e) {
    console.warn("[백업 실패]", e.message);
  }
}

let writeSeq = 0;
let writeChain = Promise.resolve();

async function writeStateNow(raw) {
  const obj = JSON.parse(raw); // 잘못된 JSON이면 여기서 예외 → 400
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await backupOnce();
  // 임시 파일 이름을 매번 다르게 잡는다. 같은 이름을 쓰면 저장 두 건이 겹칠 때
  // 서로의 임시 파일을 덮어써 나중 변경이 사라진다.
  const tmp = `${DATA}.${process.pid}.${++writeSeq}.tmp`;
  try {
    await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf-8");
    await fsp.rename(tmp, DATA); // 원자적 교체 → 저장 중 종료해도 파일이 깨지지 않음
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}

/**
 * 저장을 한 줄로 세워 순서대로 처리한다.
 * 빠르게 연속 수정하면 POST 가 겹치는데, 그때 먼저 시작한 저장이 나중 변경을
 * 덮어쓰지 않도록 앞의 저장이 끝난 뒤에 다음 저장을 시작한다.
 */
function writeState(raw) {
  const task = writeChain.catch(() => {}).then(() => writeStateNow(raw));
  writeChain = task.catch(() => {});
  return task;
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("본문이 너무 큽니다"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/* ───────────── 자료함 ───────────── */

/** 탐색기에서도 보통 안 보이는 것들 (Office 잠금 파일 ~$… 포함) */
function isHiddenEntry(name) {
  return name.startsWith(".") || name.startsWith("~$") || /^(desktop\.ini|thumbs\.db)$/i.test(name);
}

/** 더블클릭으로 실행되는 종류는 대시보드에서 열지 않는다 (탐색기에서 직접 열 것) */
const NO_OPEN_EXT = new Set(
  ".exe .com .bat .cmd .msi .ps1 .vbs .vbe .js .jse .wsf .wsh .scr .hta .cpl .reg .pif .jar".split(
    " ",
  ),
);

/**
 * 자료함 요청은 이 PC 의 대시보드 화면에서 온 것만 받는다.
 * 다른 웹사이트가 127.0.0.1 로 요청을 보내 파일 목록을 읽거나 파일을 열지 못하게
 * Host(주소 바꿔치기 차단)와 Origin(다른 사이트 차단)을 확인한다.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
function isLocalRequest(req) {
  const host = String(req.headers.host || "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.has(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // 같은 화면에서 보낸 GET 은 Origin 이 없다
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * 프로젝트 코드 + 상대 경로 → 실제 경로. 자료함 밖을 가리키면 null.
 * code 가 빈 값이면 자료함 자체를 가리킨다.
 */
function resolveInFiles(code, rel) {
  code = String(code ?? "");
  rel = String(rel ?? "");
  if (code && (!/^[^\\/:*?"<>|]+$/.test(code) || /^\.+$/.test(code))) return null;
  // 파일 이름에 못 쓰는 글자. 특히 ':' 는 드라이브 이동·NTFS 대체 스트림(파일:숨은것)을 막는다
  if (/[:*?"<>|]/.test(rel)) return null;
  const base = code ? path.join(FILES_ROOT, code) : FILES_ROOT;
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return { base, target };
}

async function listFiles(code, rel) {
  const r = resolveInFiles(code, rel);
  if (!r) return [400, { ok: false, error: "잘못된 경로입니다" }];
  const info = { ok: true, root: FILES_ROOT, dir: r.target };
  if (!fs.existsSync(r.base)) return [200, { ...info, exists: false }];
  let dirents;
  try {
    dirents = await fsp.readdir(r.target, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") {
      return [404, { ok: false, error: "폴더가 없습니다" }];
    }
    throw e;
  }
  const entries = await Promise.all(
    dirents
      .filter((d) => !isHiddenEntry(d.name))
      .map(async (d) => {
        try {
          const st = await fsp.stat(path.join(r.target, d.name));
          return {
            name: d.name,
            dir: st.isDirectory(),
            size: st.isDirectory() ? 0 : st.size,
            mtime: st.mtimeMs,
          };
        } catch {
          return null; // 권한 없음·깨진 링크 등은 건너뛴다
        }
      }),
  );
  return [200, { ...info, exists: true, entries: entries.filter(Boolean) }];
}

/**
 * 파일·폴더를 Windows 기본 프로그램으로 연다 (탐색기에서 더블클릭한 것과 같음).
 * 경로는 명령줄에 직접 넣지 않고 환경변수로 넘긴다. 그래야 이름에 & ^ % 같은 글자가
 * 있어도 cmd 가 명령으로 해석하지 않는다.
 */
function openWithDefaultApp(target) {
  return new Promise((resolve, reject) => {
    const child = spawn('start "" "%DASH_OPEN_TARGET%"', {
      shell: true,
      env: { ...process.env, DASH_OPEN_TARGET: target },
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`열기 실패 (코드 ${code})`)),
    );
  });
}

async function openFile(raw) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return [400, { ok: false, error: "잘못된 요청입니다" }];
  }
  const r = resolveInFiles(body.code, body.path);
  if (!r) return [400, { ok: false, error: "잘못된 경로입니다" }];
  let st;
  try {
    st = await fsp.stat(r.target);
  } catch {
    return [404, { ok: false, error: "파일이 없습니다. 새로고침해 보세요." }];
  }
  // Windows 는 이름 끝의 점·공백을 무시한다 ("a.exe." 도 a.exe 로 열림) → 떼고 확장자를 본다
  const ext = path.extname(r.target.replace(/[. ]+$/, "")).toLowerCase();
  if (!st.isDirectory() && NO_OPEN_EXT.has(ext)) {
    return [
      403,
      { ok: false, error: "실행 파일은 대시보드에서 열지 않습니다. 탐색기에서 열어 주세요." },
    ];
  }
  await openWithDefaultApp(r.target);
  return [200, { ok: true }];
}

async function handleFiles(req, res, urlPath) {
  if (!isLocalRequest(req)) {
    return send(res, 403, JSON.stringify({ ok: false, error: "forbidden" }));
  }
  let result;
  if (urlPath === "/api/files" && req.method === "GET") {
    const q = new URL(req.url || "/", "http://x").searchParams;
    result = await listFiles(q.get("code"), q.get("path"));
  } else if (urlPath === "/api/files/open" && req.method === "POST") {
    result = await openFile(await readBody(req, 64 * 1024));
  } else {
    result = [405, { ok: false, error: "method not allowed" }];
  }
  return send(res, result[0], JSON.stringify(result[1]));
}

/* ───────────── 서버 관제실 ───────────── */

/**
 * 감시할 서버와 장치. 개인 환경이라 data/ 에 둔다 (깃에 안 올라감).
 *   [{ "name": "5090", "ssh": "mrod-pub", "gpus": [0] },
 *    { "name": "Qualcomm", "ssh": "V-Raptor-5F", "qaic": [0, 1, 2] }]
 * ssh  : ~/.ssh/config 의 Host 별칭 (VS Code Remote-SSH 와 같은 것). 비밀번호 없이 키로 로그인돼야 한다.
 * gpus : 지켜볼 nvidia-smi GPU 번호.  qaic : 지켜볼 qaic-util 장치(SoC) 번호.
 */
const SERVERS_FILE = path.join(DATA_DIR, "servers.json");
const SSH_BIN = process.env.SSH_BIN || "ssh";
const SAMPLE_EVERY_S = 5; // 원격에서 상태를 찍는 간격
const IDLE_CLOSE_MS = 60_000; // 이만큼 아무도 화면을 안 보면 SSH 연결을 닫는다
const RETRY_MS = 30_000; // 연결이 끊기면 이만큼 뒤에 다시 붙는다
const STALE_MS = 20_000; // 이보다 오래된 값은 믿지 않는다 ('확인 중')
// 프로세스가 안 보여도(다른 컨테이너 등) 메모리를 이만큼 쓰거나 사용률이 이 이상이면 사용중
const BUSY_MEM_MIB = 1024;
const BUSY_UTIL = 10;

function intList(v) {
  return Array.isArray(v) ? v.filter((n) => Number.isInteger(n) && n >= 0) : [];
}

async function readServerList() {
  let raw;
  try {
    raw = await fsp.readFile(SERVERS_FILE, "utf-8");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error("servers.json 은 [ … ] 배열이어야 합니다");
  return list
    .filter((s) => s && s.name)
    .map((s) => ({
      name: String(s.name),
      ssh: String(s.ssh || ""),
      gpus: intList(s.gpus),
      qaic: intList(s.qaic),
    }));
}

/*
 * 원격에서 도는 스크립트. ssh … bash -s 의 표준입력으로 보낸다 (명령줄 따옴표 문제 없음).
 * 한 번 붙으면 연결을 유지한 채 SAMPLE_EVERY_S 마다 상태를 찍고 @@END 로 끝을 알린다.
 * 매번 새로 로그인하지 않으므로 원격 로그에 접속 기록이 쌓이지 않는다.
 */
const NVIDIA_SCRIPT = `
echo @@GPU
nvidia-smi --query-gpu=index,uuid,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits
echo @@APPS
a=$(nvidia-smi --query-compute-apps=gpu_uuid,pid,used_memory --format=csv,noheader,nounits)
echo "$a"
p=$(echo "$a" | awk -F', ' 'NF>1{printf "%s%s", s, $2; s=","}')
echo @@PS
[ -n "$p" ] && ps -o pid=,user:32=,etimes=,args= -p "$p" | cut -c1-300
`;

/*
 * Qualcomm Cloud AI 100. qaic-util -q 는 0.4초쯤 걸린다. 필요한 줄만 남긴다.
 * 장치를 잡고 있는 프로세스는 fuser 로 찾는다 (같은 계정 것만 보인다).
 */
const QAIC_SCRIPT = `
echo @@QAIC
Q=$(command -v qaic-util || echo /opt/qti-aic/tools/qaic-util)
"$Q" -q 2>&1 | grep -E '^QID|Status:|Dev Link:|Dram (Total|Free):|Nsp (Total|Free):|Networks (Loaded|Active):'
echo @@QPIDS
for f in /dev/accel/accel*; do echo "$f $(fuser "$f" 2>/dev/null)"; done
p=$(for f in /dev/accel/accel*; do fuser "$f" 2>/dev/null; done | tr -s ' ' '\\n' | grep -E '^[0-9]+$' | sort -u | paste -sd,)
echo @@QPS
[ -n "$p" ] && ps -o pid=,user:32=,etimes=,args= -p "$p" | cut -c1-300
`;

function remoteScript(cfg) {
  const body = [cfg.gpus.length ? NVIDIA_SCRIPT : "", cfg.qaic.length ? QAIC_SCRIPT : ""];
  return `while :; do\n${body.join("\n")}\necho @@END\nsleep ${SAMPLE_EVERY_S}\ndone\n`;
}

/** "@@이름" 줄로 나뉜 한 번치 출력을 { 이름: [줄…] } 로 */
function sections(block) {
  const out = {};
  let cur = null;
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("@@")) out[(cur = line.slice(2).trim())] = [];
    else if (cur && line.trim()) out[cur].push(line);
  }
  return out;
}

const csv = (line) => line.split(",").map((s) => s.trim());
// "31391744 KB" 처럼 단위가 붙어도 앞 숫자를 읽는다. [N/A] 등은 0
const num = (s) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : 0);

/** ps -o pid=,user=,etimes=,args= 출력 → pid 별 { user, secs, cmd } */
function psTable(lines = []) {
  const procs = new Map();
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
    if (m) procs.set(m[1], { user: m[2], secs: Number(m[3]), cmd: m[4] });
  }
  return procs;
}

function nvidiaUnits(sec, wanted) {
  const procs = psTable(sec.PS);
  const apps = (sec.APPS || []).map(csv).filter((a) => a.length >= 3);
  const gpus = new Map((sec.GPU || []).map(csv).map((g) => [Number(g[0]), g]));
  return wanted.map((idx) => {
    const g = gpus.get(idx);
    if (!g) return { id: `GPU${idx}`, busy: null, error: "GPU 정보를 못 읽음" };
    const [, uuid, util, used, total] = g;
    const ps = apps
      .filter((a) => a[0] === uuid)
      .map(([, pid, mem]) => ({ pid, mem: num(mem), ...procs.get(pid) }));
    return {
      id: `GPU${idx}`,
      busy: ps.length > 0 || num(used) >= BUSY_MEM_MIB || num(util) >= BUSY_UTIL,
      util: num(util),
      memUsed: num(used),
      memTotal: num(total),
      procs: ps,
    };
  });
}

/**
 * NSP 코어가 하나라도 잡혀 있거나 모델(network)이 올라가 있으면 사용중.
 * 요청을 처리하지 않고 대기 중인 서빙 프로세스도 SoC 를 점유하므로 다른 테스트를 못 돌린다.
 */
function qaicUnits(sec, wanted) {
  const devs = new Map();
  let cur = null;
  for (const line of sec.QAIC || []) {
    const q = line.match(/^QID\s+(\d+)/);
    if (q) devs.set(Number(q[1]), (cur = {}));
    else if (cur && line.includes(":")) {
      const i = line.indexOf(":");
      cur[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const pidsByDev = new Map();
  for (const line of sec.QPIDS || []) {
    const [dev, ...rest] = line.trim().split(/\s+/);
    pidsByDev.set(dev, rest.map((p) => p.replace(/\D/g, "")).filter(Boolean));
  }
  const procs = psTable(sec.QPS);
  return wanted.map((qid) => {
    const id = `SoC${qid}`;
    const d = devs.get(qid);
    if (!d) return { id, busy: null, error: "SoC 정보를 못 읽음" };
    if (d.Status !== "Ready") return { id, busy: null, error: `상태 ${d.Status || "알 수 없음"}` };
    const nspTotal = num(d["Nsp Total"]);
    const nspUsed = nspTotal - num(d["Nsp Free"]);
    const loaded = num(d["Networks Loaded"]);
    const active = num(d["Networks Active"]);
    const all = (pidsByDev.get(d["Dev Link"]) || []).map((pid) => ({ pid, ...procs.get(pid) }));
    // multiprocessing 으로 띄운 하위 프로세스는 빼고 본체만 (다 빠지면 그대로)
    const main = all.filter((p) => !/multiprocessing/.test(p.cmd || ""));
    return {
      id,
      busy: nspUsed > 0 || loaded > 0 || active > 0,
      memUsed: Math.round((num(d["Dram Total"]) - num(d["Dram Free"])) / 1024),
      memTotal: Math.round(num(d["Dram Total"]) / 1024),
      detail: `NSP ${nspUsed}/${nspTotal} · 모델 ${active}개 실행 (${loaded}개 적재)`,
      procs: main.length ? main : all,
    };
  });
}

/** ssh 가 남긴 오류 메시지를 사람이 읽을 말로 */
function sshError(stderr) {
  const t = stderr.trim();
  if (/Permission denied/i.test(t)) return "키 로그인 안 됨 (비밀번호로만 접속 가능)";
  if (/timed out/i.test(t)) return "접속 시간 초과";
  if (/Could not resolve hostname/i.test(t)) return "주소를 찾을 수 없음";
  if (/Connection refused/i.test(t)) return "접속 거부";
  if (/Host key verification failed/i.test(t)) return "호스트 키 확인 실패 (VS Code 로 한 번 접속해 볼 것)";
  return t.split(/\r?\n/).filter(Boolean).pop() || "연결이 끊김";
}

/** 서버 하나를 지켜보는 SSH 연결. 화면이 보고 있는 동안만 연결을 유지한다 */
class Monitor {
  constructor(cfg) {
    this.cfg = cfg;
    this.child = null;
    this.retryAt = 0;
    this.wantedAt = 0;
    this.units = [];
    this.updatedAt = 0;
    this.error = "";
    this.lastRemoteErr = "";
    this.state = "checking";
    this.since = 0;
  }

  /** 화면이 물어볼 때마다 부른다. 연결이 없으면 붙는다 */
  touch() {
    this.wantedAt = Date.now();
    if (!this.child && Date.now() >= this.retryAt) this.start();
  }

  start() {
    if (!this.cfg.ssh) {
      this.error = "ssh 별칭이 없음";
      this.retryAt = Infinity;
      return;
    }
    // prettier-ignore
    const args = [
      "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
      "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2",
      this.cfg.ssh, "bash", "-s",
    ];
    const child = spawn(SSH_BIN, args, { windowsHide: true });
    this.child = child;
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
      let i;
      while ((i = out.indexOf("@@END")) >= 0) {
        this.onSample(out.slice(0, i));
        out = out.slice(i + 5);
      }
    });
    child.stderr.on("data", (d) => {
      err = (err + d).slice(-4000);
      this.lastRemoteErr = err.trim().split(/\r?\n/).pop() || "";
    });
    child.on("error", (e) => {
      this.error = e.code === "ENOENT" ? "ssh 프로그램을 찾을 수 없음" : e.message;
    });
    child.on("close", () => {
      if (this.child !== child) return; // 일부러 닫은 연결
      this.child = null;
      this.retryAt = Date.now() + RETRY_MS;
      this.error ||= sshError(err);
      this.setState("offline");
    });
    child.stdin.on("error", () => {}); // 연결이 먼저 끊기면 쓰기 오류가 난다
    child.stdin.write(remoteScript(this.cfg)); // 표준입력은 닫지 않는다 (닫으면 원격 bash 가 끝남)
  }

  stop() {
    const child = this.child;
    this.child = null;
    child?.kill();
  }

  onSample(block) {
    const sec = sections(block);
    const units = [
      ...(this.cfg.gpus.length ? nvidiaUnits(sec, this.cfg.gpus) : []),
      ...(this.cfg.qaic.length ? qaicUnits(sec, this.cfg.qaic) : []),
    ];
    // 명령이 없거나 권한이 없으면 원격 오류 메시지를 대신 보여준다
    for (const u of units) if (u.busy === null && this.lastRemoteErr) u.error = this.lastRemoteErr;
    this.units = units;
    this.updatedAt = Date.now();
    this.error = "";
    const known = units.filter((u) => u.busy !== null);
    if (!known.length) this.setState("unknown");
    else this.setState(known.some((u) => u.busy) ? "busy" : "free");
  }

  setState(state) {
    if (state !== this.state) {
      this.state = state;
      this.since = Date.now();
    }
  }

  report() {
    const fresh = Date.now() - this.updatedAt < STALE_MS;
    let state = this.state;
    if (this.child && !fresh) state = "checking"; // 붙는 중이거나 응답이 늦다
    return {
      name: this.cfg.name,
      ssh: this.cfg.ssh,
      state,
      error: state === "offline" || state === "unknown" ? this.error : "",
      units: state === "offline" ? [] : this.units,
      updatedAt: this.updatedAt,
      since: this.since,
    };
  }
}

const monitors = new Map(); // 설정(JSON) → Monitor. servers.json 이 바뀌면 새로 만든다

// 아무도 안 보는 연결은 닫는다 (원격에 세션을 붙잡아 두지 않게)
setInterval(() => {
  for (const m of monitors.values()) {
    if (m.child && Date.now() - m.wantedAt > IDLE_CLOSE_MS) {
      m.stop();
      m.retryAt = 0;
      m.updatedAt = 0;
    }
  }
}, 15_000).unref();

async function serverReport() {
  const list = await readServerList();
  const keys = new Set();
  const out = list.map((cfg) => {
    const key = JSON.stringify(cfg);
    keys.add(key);
    if (!monitors.has(key)) monitors.set(key, new Monitor(cfg));
    const m = monitors.get(key);
    m.touch();
    return m.report();
  });
  for (const [key, m] of monitors) {
    if (!keys.has(key)) {
      m.stop();
      monitors.delete(key);
    }
  }
  return out;
}

async function serveStatic(res, urlPath) {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    return send(
      res,
      503,
      "<h1>빌드가 필요합니다</h1><p><code>run.bat</code> 을 실행하거나 <code>npm run build</code> 후 다시 열어주세요.</p>",
      "text/html; charset=utf-8",
    );
  }
  const rel = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  let file = path.resolve(DIST, rel || "index.html");
  // dist 밖으로 나가는 경로 차단
  if (!file.startsWith(DIST)) file = path.join(DIST, "index.html");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html"); // SPA fallback
  }
  const body = await fsp.readFile(file);
  send(res, 200, body, MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
}

/** 요청 처리. IPv4·IPv6 두 서버가 같은 핸들러를 공유한다. */
async function handler(req, res) {
  try {
    const urlPath = (req.url || "/").split("?")[0];

    if (req.method === "OPTIONS") return send(res, 204, "");

    if (urlPath === "/api/state") {
      if (req.method === "GET") return send(res, 200, await readState());
      if (req.method === "POST") {
        const raw = await readBody(req);
        try {
          await writeState(raw);
          return send(res, 200, JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
        } catch (e) {
          return send(res, 400, JSON.stringify({ ok: false, error: e.message }));
        }
      }
      return send(res, 405, JSON.stringify({ ok: false, error: "method not allowed" }));
    }

    if (urlPath === "/api/files" || urlPath === "/api/files/open") {
      return await handleFiles(req, res, urlPath);
    }

    if (urlPath === "/api/servers" && req.method === "GET") {
      if (!isLocalRequest(req)) return send(res, 403, JSON.stringify({ ok: false }));
      try {
        return send(res, 200, JSON.stringify({ ok: true, servers: await serverReport() }));
      } catch (e) {
        return send(res, 200, JSON.stringify({ ok: false, error: `servers.json: ${e.message}` }));
      }
    }

    if (urlPath === "/api/health") {
      return send(res, 200, JSON.stringify({ ok: true, data: DATA, startedAt: STARTED_AT }));
    }

    if (urlPath === "/api/shutdown" && req.method === "POST") {
      if (!isLocalRequest(req)) return send(res, 403, JSON.stringify({ ok: false }));
      send(res, 200, JSON.stringify({ ok: true }));
      // 진행 중인 저장을 마친 뒤 정상 종료(0) → run.bat 콘솔 창도 함께 닫힌다
      writeChain.then(() => setTimeout(() => process.exit(0), 100));
      return;
    }

    // 없는 API 를 화면(index.html)으로 돌려주면 클라이언트가 원인을 알 수 없다
    if (urlPath.startsWith("/api/")) {
      return send(res, 404, JSON.stringify({ ok: false, error: "not found" }));
    }

    if (req.method !== "GET") return send(res, 405, JSON.stringify({ ok: false }));
    return await serveStatic(res, urlPath);
  } catch (e) {
    send(res, 500, JSON.stringify({ ok: false, error: e.message }));
  }
}

const server = http.createServer(handler);

const URL_LOCAL = `http://127.0.0.1:${PORT}/`;

/**
 * 브라우저 열기.
 * exec 는 비동기라서 곧바로 process.exit 하면 창이 안 뜨는 일이 있었다.
 * 그래서 detached 로 띄우고 완료(또는 실패)를 확인한 뒤에 넘어간다.
 */
function openBrowser(url) {
  return new Promise((resolve) => {
    if (!OPEN_BROWSER) return resolve();
    exec(`start "" "${url}"`, { shell: "cmd.exe" }, (err) => {
      if (err) console.warn("[브라우저 열기 실패] 직접 여세요:", url);
      resolve();
    });
  });
}

/**
 * 포트가 이미 쓰이고 있을 때.
 * 실행 중인 서버가 지금의 server.mjs 보다 먼저 떴으면(= 그 뒤에 코드가 바뀌었으면) 그 서버를
 * 끄고 돌아온다. 그러면 이 프로세스가 대신 뜬다. 콘솔 창은 최소화돼 있어 찾아 닫기 어려우니
 * 바로가기만 다시 눌러도 새 기능이 켜지게 하려는 것.
 * 코드가 그대로면 새로 띄우지 않고 브라우저만 열고 끝낸다.
 */
async function replaceOrOpen() {
  let health = null;
  try {
    health = await (await fetch(`${URL_LOCAL}api/health`)).json();
  } catch {
    // 다른 프로그램이 포트를 쓰고 있을 수도 있다 → 아래에서 브라우저만 연다
  }
  const codeTime = fs.statSync(fileURLToPath(import.meta.url)).mtimeMs;
  if (health?.startedAt && health.startedAt < codeTime) {
    console.log("대시보드가 업데이트되어 실행 중인 서버를 새로 띄웁니다...");
    await fetch(`${URL_LOCAL}api/shutdown`, { method: "POST" }).catch(() => {});
    return;
  }
  if (health?.ok && !health.startedAt) {
    // 자동 교체 기능이 생기기 전의 서버
    console.log(
      "실행 중인 대시보드 서버가 예전 버전입니다. 작업 표시줄의 대시보드 콘솔 창을 닫고 다시 실행해 주세요.",
    );
  } else {
    console.log(`이미 대시보드가 ${PORT} 포트에서 실행 중입니다. 브라우저만 엽니다: ${URL_LOCAL}`);
  }
  await openBrowser(URL_LOCAL);
  process.exit(0);
}

/** 예전 서버가 꺼지면서 포트를 놓을 때까지 잠깐(최대 5초) 기다렸다가 연다 */
async function listenWhenFree(srv, host) {
  for (let i = 0; ; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      return await listenOn(srv, host);
    } catch (e) {
      if (e.code !== "EADDRINUSE" || i >= 25) throw e;
    }
  }
}

/**
 * listen 을 기다린다. 성공하면 임시 오류 처리기를 떼고,
 * 대신 계속 남는 처리기를 달아 둔다. (없으면 나중에 소켓 오류 하나로 서버가 죽는다)
 */
function listenOn(srv, host) {
  return new Promise((resolve, reject) => {
    const onError = (e) => {
      srv.off("listening", onListening);
      reject(e);
    };
    const onListening = () => {
      srv.off("error", onError);
      srv.on("error", (e) => console.warn(`[${host} 소켓 오류]`, e.message));
      resolve();
    };
    srv.once("error", onError);
    srv.once("listening", onListening);
    srv.listen(PORT, host);
  });
}

await readState(); // 데이터 파일 없으면 생성

// IPv4 로 먼저 연다. 이게 실패하면 이미 대시보드가 켜져 있다는 뜻.
try {
  await listenOn(server, "127.0.0.1");
} catch (e) {
  if (e.code !== "EADDRINUSE") {
    console.error(e);
    process.exit(1);
  }
  await replaceOrOpen(); // 돌아왔으면 예전 서버를 끄는 중이다
  try {
    await listenWhenFree(server, "127.0.0.1");
  } catch (e2) {
    console.error(e2);
    process.exit(1);
  }
}

/*
 * Windows 의 localhost 는 IPv6(::1) 로 먼저 풀린다. IPv4 만 듣고 있으면 브라우저가
 * ::1 로 붙어보고 실패한 뒤 IPv4 로 다시 시도하느라 첫 화면이 2초 이상 늦게 뜬다.
 * 그래서 ::1 도 함께 듣는다 (둘 다 이 PC 안에서만 접속 가능).
 */
try {
  await listenOn(http.createServer(handler), "::1");
} catch {
  // IPv6 를 못 쓰는 환경이면 IPv4 만으로 동작한다
}

console.log(`[프로젝트 대시보드] ${URL_LOCAL}`);
console.log(`[데이터 파일] ${DATA}`);
console.log(`[자료함] ${FILES_ROOT}`);
console.log("종료: 이 창에서 Ctrl+C (또는 창 닫기)");
await openBrowser(URL_LOCAL);
