/**
 * 실행 준비 + 서버 시작 (run.bat 이 호출)
 *   1) node_modules 없으면 npm install
 *   2) dist 가 없거나 소스가 더 최신이면 npm run build
 *   3) server.mjs 실행
 *
 * 배치 파일에서 이 판단을 하면 인용부호·한글 인코딩 문제가 생기므로 Node 로 옮겼다.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BASE = path.dirname(fileURLToPath(import.meta.url));
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: BASE, stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function newestSourceTime() {
  const files = [path.join(BASE, "index.html"), path.join(BASE, "vite.config.ts")];
  const srcDir = path.join(BASE, "src");
  if (fs.existsSync(srcDir)) {
    for (const f of fs.readdirSync(srcDir)) files.push(path.join(srcDir, f));
  }
  return Math.max(...files.map(mtime), 0);
}

if (!fs.existsSync(path.join(BASE, "node_modules"))) {
  console.log("처음 실행이라 패키지를 설치합니다. 1~2분 걸립니다...");
  if (!run(NPM, ["install", "--no-audit", "--no-fund"])) {
    console.error("[오류] npm install 실패. 위 메시지를 확인하세요.");
    process.exit(1);
  }
}

const builtAt = mtime(path.join(BASE, "dist", "index.html"));
if (builtAt === 0 || newestSourceTime() > builtAt) {
  console.log("소스가 바뀌었습니다. 화면을 다시 빌드합니다...");
  if (!run(NPM, ["run", "build"])) {
    console.error("[오류] 빌드 실패. 위 메시지를 확인하세요.");
    process.exit(1);
  }
}

await import("./server.mjs");
