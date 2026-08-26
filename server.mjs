/**
 * 프로젝트 대시보드 로컬 서버 (의존성 0 · Node 내장 모듈만 사용)
 *
 *   · dist/ 정적 파일 서빙 (vite build 결과물)
 *   · GET  /api/state → data/dashboard-data.json 읽기
 *   · POST /api/state → 즉시 저장 (원자적 쓰기 + 일자별 백업)
 *
 * 실행: run.bat 더블클릭  (또는  node server.mjs)
 * 데이터는 100% 이 PC 안에만 있습니다. 인터넷으로 나가지 않습니다.
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

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

    if (urlPath === "/api/health") {
      return send(res, 200, JSON.stringify({ ok: true, data: DATA }));
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

async function alreadyRunning() {
  console.log(`이미 대시보드가 ${PORT} 포트에서 실행 중입니다. 브라우저만 엽니다: ${URL_LOCAL}`);
  await openBrowser(URL_LOCAL);
  process.exit(0);
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
  if (e.code === "EADDRINUSE") await alreadyRunning();
  console.error(e);
  process.exit(1);
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
console.log("종료: 이 창에서 Ctrl+C (또는 창 닫기)");
await openBrowser(URL_LOCAL);
