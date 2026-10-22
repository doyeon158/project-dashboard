# 프로젝트 대시보드

내 PC에서만 도는 프로젝트 관리 대시보드. React 19 + Vite + Tailwind v4 (TypeScript),
저장은 의존성 없는 Node 서버(`server.mjs`)가 `data/dashboard-data.json` 에 한다.
사용법·기능 설명은 `README.md` 가 기준.

## 실행

개발 서버는 자동으로 떠 있지 않다.

```bash
run.bat        # 설치 → (필요하면) 빌드 → server.mjs 실행 → 브라우저 열기, 5187 포트
npm run dev    # 소스 고칠 때. 5188 포트, /api 는 5187 로 넘김 (서버를 따로 띄워둘 것)
npm run build  # dist 갱신
npx tsc --noEmit
```

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/App.tsx` | 화면 배치 + 프로젝트 추가·삭제. 항목 편집은 각 탭이 담당 |
| `src/Sidebar.tsx`, `src/ProjectHeader.tsx` | 왼쪽 목록 / 프로젝트 머리말 |
| `src/ServerBar.tsx` | 모든 화면 맨 위 서버 관제실 띠 — GPU·SoC 사용중/비어있음 (`/api/servers`, 목록은 `data/servers.json`) |
| `src/tabs/*.tsx` | 업무·노트·기록·자료함 탭. 각 탭이 자기 폼 상태와 변경 로직을 가진다 |
| `src/Overview.tsx` | 한눈에 보기 |
| `src/ui.tsx` | 공용 조각 (MONO, RADIUS, ProgressBar, PinButton, SaveBadge …) |
| `src/store.ts` | 불러오기·자동 저장 훅 |
| `src/types.ts` | 타입 + 계산 (진행률, D-day, 개요 파싱, 고정 정렬) |
| `server.mjs` | 정적 서빙 + `/api/state` + `/api/files`(자료함) + `/api/servers`(관제실) |
| `launch.mjs` | 설치·재빌드 판단 후 서버 시작 |

## 이 프로젝트에서 조심할 것

- **한글 IME**: 입력 확정에 Enter 를 쓰는 곳은 `e.nativeEvent.isComposing` 을 먼저 확인한다.
  확인하지 않으면 한글 조합 중 Enter 에서 입력이 사라진다. `contentEditable` 은 쓰지 않는다
  (같은 이유로 `src/Editable.tsx` 는 실제 `<input>` 으로 바꿨다).
- **`.bat` 파일에 한글 금지**: cmd 가 UTF-8 한글을 잘못 해석해 줄이 깨진다. 배치는 ASCII 로 쓰고
  한글 출력은 Node(`launch.mjs`)나 PowerShell(`tools/*.ps1`, UTF-8 BOM)에서 한다.
- **주소는 `127.0.0.1`**: Windows 의 `localhost` 는 IPv6(`::1`)부터 찾는다. 서버는 IPv4·IPv6 를
  모두 듣게 되어 있으니 한쪽만 듣도록 되돌리지 말 것 (첫 화면이 2초 이상 늦어진다).
- **저장 경합**: 저장은 클라이언트(`store.ts`)에서 버전 번호로 한 번에 하나씩, 서버(`server.mjs`)에서
  한 줄로 세워 처리한다. 임시 파일 이름도 매번 다르게 쓴다. 이 구조를 단순화하면 빠르게
  연속 수정할 때 마지막 변경이 사라진다.
- **진행률 계산**: 대주제(하위 업무를 가진 업무)는 집계값이므로 개수·평균에서 제외한다(`leafTasks`).
- **자료함(`/api/files`)은 PC 파일을 연다**: Host·Origin 을 확인해 이 PC 의 대시보드 화면에서 온
  요청만 받고, 경로는 자료함 밖으로 못 나가게 막는다. 파일 열기는 경로를 명령줄이 아니라 환경변수로
  cmd 에 넘긴다(이름의 `& % ^` 가 명령으로 해석되지 않게). 이 확인들을 빼면 아무 웹사이트나
  자료함 목록을 읽고 파일을 열 수 있게 된다.
- **관제실은 서버마다 SSH 연결 하나를 유지한다** (`Monitor`, `ssh … bash -s` 에 스크립트를
  표준입력으로 보냄). 요청마다 새로 로그인하게 바꾸지 말 것 — 원격 로그·세션이 쌓이고 느려진다.
  화면이 1분 넘게 안 물으면 연결을 닫는다(`IDLE_CLOSE_MS`). 원격 스크립트 출력은 `@@이름` 줄로
  구역을 나누고 `@@END` 로 한 번치를 끝낸다. Git Bash 에서 시험할 때는 `MSYS_NO_PATHCONV=1`
  (안 그러면 `/opt/...` 인자가 Windows 경로로 바뀐다).
- **`npm run format`(oxfmt 0.2) 은 쓰지 말 것**: 세미콜론을 지우고 import 사이에 빈 줄을 넣어
  기존 스타일(Prettier 식, 100자)과 다르게 파일 전체를 바꾼다.

## 데이터

- `data/` 는 개인 데이터라 깃에 올리지 않는다. 예시는 `data.sample/dashboard-data.json`.
- 데이터 파일이 없으면 서버가 예시를 복사해 만든다.
