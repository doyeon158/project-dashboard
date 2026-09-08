import { useMemo, useState } from "react";
import { MONO, RADIUS, SectionTitle, Tile } from "./ui";
import type { Project, State, Task } from "./types";
import {
  LOG_FIRST_WEEK,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  addDays,
  dayLabel,
  doneDay,
  leafTasks,
  logWeekOf,
  today,
  weekEnd,
  weekLabel,
  weekRelLabel,
  weekStart,
} from "./types";

/** 복사용 날짜 표기 */
function copyDay(day: string) {
  return day ? dayLabel(day) : "완료일 미기록";
}

/** 완료된 업무 한 건 + 그것이 속한 프로젝트·대주제 */
type Row = { t: Task; p: Project; parent?: Task; day: string };

/**
 * 주간일지 — 고른 한 주(월~일요일)에 완료를 찍은 업무를 프로젝트 구분 없이 모아 본다.
 * 완료일은 doneDay(완료 시각, 없으면 등록일)를 쓰고,
 * 둘 다 비어 있거나 LOG_FIRST_WEEK 보다 앞선 업무는 첫 주에 모아 둔다.
 */
export default function WeeklyLog({ state }: { state: State }) {
  const thisWeek = weekStart(today());
  const [monday, setMonday] = useState(thisWeek);
  const [groupBy, setGroupBy] = useState<"project" | "day">("project");
  const [copied, setCopied] = useState(false);

  const end = weekEnd(monday);
  const atFirstWeek = monday === LOG_FIRST_WEEK;

  // 모든 프로젝트의 완료 업무. 대주제는 하위 업무의 집계값이라 세지 않는다.
  const allDone = useMemo(() => {
    const out: Row[] = [];
    for (const p of state.projects) {
      for (const t of leafTasks(p.tasks)) {
        if (t.status !== "done") continue;
        out.push({
          t,
          p,
          parent: t.parentId ? p.tasks.find((x) => x.id === t.parentId) : undefined,
          day: doneDay(t),
        });
      }
    }
    return out;
  }, [state.projects]);

  // "YYYY-MM-DD" 는 글자 순서가 곧 날짜 순서라 문자열 비교로 충분하다.
  const inWeek = allDone.filter((r) => logWeekOf(r.day) === monday);
  // 이 주의 월~일 안에 떨어지는 건. 나머지(완료일이 없거나 첫 주보다 앞선 건)는 carried 로 뺀다.
  const dated = inWeek
    .filter((r) => r.day >= monday && r.day <= end)
    .sort((a, b) => a.day.localeCompare(b.day));
  const carried = inWeek.filter((r) => !(r.day >= monday && r.day <= end));
  const rows = [...dated, ...carried];

  // 고를 수 있는 주 = 완료 기록이 있는 주 + 첫 주 + 이번 주 + 지금 보고 있는 주.
  // 첫 주보다 앞선 주는 목록에 넣지 않는다.
  const weeks = useMemo(() => {
    const set = new Set<string>([LOG_FIRST_WEEK, thisWeek, monday]);
    for (const r of allDone) set.add(logWeekOf(r.day));
    return [...set].filter((w) => w >= LOG_FIRST_WEEK).sort().reverse();
  }, [allDone, monday, thisWeek]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const perDay = days.map((d) => dated.filter((r) => r.day === d).length);
  const busiest = perDay.some((n) => n > 0) ? days[perDay.indexOf(Math.max(...perDay))] : null;
  const projectCount = new Set(rows.map((r) => r.p.id)).size;

  // 프로젝트 → 대주제 순으로 묶는다. 프로젝트 순서는 사이드바와 같게 유지한다.
  const byProject = state.projects
    .map((p) => {
      const mine = rows.filter((r) => r.p.id === p.id);
      const groups: Array<{ key: string; parent?: Task; items: Row[] }> = [];
      for (const r of mine) {
        const key = r.parent?.id || "";
        const g = groups.find((x) => x.key === key);
        if (g) g.items.push(r);
        else groups.push({ key, parent: r.parent, items: [r] });
      }
      return { p, groups, count: mine.length };
    })
    .filter((x) => x.count > 0);

  const byDay = days
    .map((d) => ({ d, items: dated.filter((r) => r.day === d) }))
    .filter((x) => x.items.length > 0);

  /** 주간 보고에 그대로 붙여 넣을 수 있게 텍스트로 뽑는다 */
  function copyLog() {
    const lines = [`■ 주간일지  ${weekLabel(monday)}  ·  완료 ${rows.length}건`];
    for (const { p, groups, count } of byProject) {
      lines.push("", `[${p.name}] ${count}건`);
      for (const g of groups) {
        if (g.parent) {
          lines.push(`  · ${g.parent.text}`);
          for (const r of g.items) lines.push(`    - ${r.t.text} (${copyDay(r.day)})`);
        } else {
          for (const r of g.items) lines.push(`  · ${r.t.text} (${copyDay(r.day)})`);
        }
      }
    }
    navigator.clipboard.writeText(lines.join("\n")).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => alert("복사에 실패했습니다. 브라우저가 클립보드를 막고 있을 수 있습니다."),
    );
  }

  return (
    <div className="px-8 py-6 max-w-5xl">
      {/* 주 고르기 */}
      <div
        className="flex items-center gap-2 border border-[#e5e5e3] px-3 py-2.5 mb-6"
        style={{ borderRadius: RADIUS }}
      >
        <NavButton
          dir="left"
          title={atFirstWeek ? "주간일지는 8/17 주부터 봅니다" : "이전 주"}
          disabled={atFirstWeek}
          onClick={() => setMonday(addDays(monday, -7))}
        />
        <select
          value={monday}
          onChange={(e) => setMonday(e.target.value)}
          className="text-[13px] font-semibold text-[#0f0f0f] bg-white border border-[#e5e5e3] px-2.5 py-1.5"
          style={{ ...MONO, borderRadius: RADIUS }}
        >
          {weeks.map((m) => (
            <option key={m} value={m}>
              {weekLabel(m)} · {weekRelLabel(m)}
            </option>
          ))}
        </select>
        <NavButton dir="right" title="다음 주" onClick={() => setMonday(addDays(monday, 7))} />

        <span className="text-[11.5px] text-[#aaaaaa]" style={MONO}>
          {monday} ~ {end}
        </span>

        <div className="flex-1" />

        {monday !== thisWeek && (
          <button
            onClick={() => setMonday(thisWeek)}
            className="text-[12px] px-2.5 py-1.5 text-[#737373] border border-[#e5e5e3] hover:border-[#737373] transition-colors"
            style={{ borderRadius: RADIUS }}
          >
            이번 주
          </button>
        )}
        <button
          onClick={copyLog}
          disabled={rows.length === 0}
          className="text-[12px] font-semibold px-3 py-1.5 text-white bg-[#0f0f0f] hover:bg-[#333] disabled:bg-[#ccccca]"
          style={{ borderRadius: RADIUS }}
        >
          {copied ? "복사됨" : "텍스트 복사"}
        </button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-7">
        <Tile label="완료 업무" value={`${rows.length}건`} sub={weekRelLabel(monday)} />
        <Tile label="참여 프로젝트" value={`${projectCount}개`} />
        <Tile
          label="가장 많이 끝낸 날"
          value={busiest ? dayLabel(busiest) : "—"}
          sub={busiest ? `${Math.max(...perDay)}건` : "완료 기록 없음"}
        />
      </div>

      {/* 요일별 분포 */}
      <div className="grid grid-cols-7 gap-2 mb-7">
        {days.map((d, i) => {
          const n = perDay[i];
          const isToday = d === today();
          return (
            <div
              key={d}
              className="border px-2 py-2 text-center"
              style={{
                borderRadius: RADIUS,
                borderColor: isToday ? "#0f0f0f" : "#e5e5e3",
                backgroundColor: n > 0 ? "#f9f9f7" : "transparent",
              }}
            >
              <div className="text-[11px] text-[#737373]" style={MONO}>
                {dayLabel(d)}
              </div>
              <div
                className="text-[15px] font-semibold mt-0.5"
                style={{ ...MONO, color: n > 0 ? "#0f0f0f" : "#ccccca" }}
              >
                {n}
              </div>
            </div>
          );
        })}
      </div>

      {/* 완료 목록 */}
      <div className="flex items-start justify-between">
        <SectionTitle>이 주에 완료한 업무</SectionTitle>
        <div className="flex gap-1 -mt-1">
          {(["project", "day"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setGroupBy(k)}
              className={`text-[12px] px-2.5 py-1 border transition-colors ${
                groupBy === k
                  ? "border-[#0f0f0f] text-[#0f0f0f] font-semibold"
                  : "border-[#e5e5e3] text-[#737373] hover:border-[#737373]"
              }`}
              style={{ borderRadius: RADIUS }}
            >
              {k === "project" ? "프로젝트별" : "날짜별"}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-[#e5e5e3]" style={{ borderRadius: RADIUS }}>
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-[#aaaaaa] text-center">
            이 주에 완료를 찍은 업무가 없습니다.
          </div>
        ) : groupBy === "project" ? (
          byProject.map(({ p, groups, count }, pi) => (
            <div key={p.id} className={pi > 0 ? "border-t border-[#e5e5e3]" : ""}>
              <div className="flex items-center gap-2 px-5 py-2.5 bg-[#fafafa] border-b border-[#f0f0ee]">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="text-[13.5px] font-semibold text-[#0f0f0f]">{p.name}</span>
                <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
                  {count}건
                </span>
              </div>
              {groups.map((g) => (
                <div key={g.key || "solo"}>
                  {g.parent && (
                    <div className="px-5 pt-2.5 pb-1 text-[12px] font-medium text-[#737373]">
                      {g.parent.text}
                    </div>
                  )}
                  {g.items.map((r) => (
                    <TaskRow key={r.t.id} row={r} indent={!!g.parent} />
                  ))}
                </div>
              ))}
            </div>
          ))
        ) : (
          byDay.map(({ d, items }, di) => (
            <div key={d} className={di > 0 ? "border-t border-[#e5e5e3]" : ""}>
              <div className="flex items-center gap-2 px-5 py-2.5 bg-[#fafafa] border-b border-[#f0f0ee]">
                <span className="text-[13px] font-semibold text-[#0f0f0f]" style={MONO}>
                  {dayLabel(d)}
                </span>
                <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
                  {items.length}건
                </span>
              </div>
              {items.map((r) => (
                <TaskRow key={r.t.id} row={r} showProject />
              ))}
            </div>
          ))
        )}
        {groupBy === "day" && carried.length > 0 && (
          <div className={byDay.length > 0 ? "border-t border-[#e5e5e3]" : ""}>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-[#fafafa] border-b border-[#f0f0ee]">
              <span className="text-[13px] font-semibold text-[#737373]">완료일 미기록</span>
              <span className="text-[11px] text-[#aaaaaa]" style={MONO}>
                {carried.length}건
              </span>
            </div>
            {carried.map((r) => (
              <TaskRow key={r.t.id} row={r} showProject />
            ))}
          </div>
        )}
      </div>

      {carried.length > 0 && (
        <div className="mt-3 text-[11.5px] text-[#aaaaaa] leading-relaxed">
          완료일이 남지 않은 업무 {carried.length}건을 주간일지 첫 주인 이 주에 모아 두었습니다.
          업무 탭에서 완료를 다시 찍으면 실제로 끝낸 주로 옮겨집니다.
        </div>
      )}
    </div>
  );
}

function TaskRow({
  row,
  indent = false,
  showProject = false,
}: {
  row: Row;
  indent?: boolean;
  showProject?: boolean;
}) {
  const { t, p, day } = row;
  return (
    <div className="flex items-center gap-2.5 px-5 py-2 hover:bg-[#f9f9f7] transition-colors">
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#2a7a4b] ${indent ? "ml-3" : ""}`}
      />
      {showProject && (
        <span
          className="text-[10px] font-semibold tracking-[0.1em] uppercase px-1.5 py-0.5 flex-shrink-0"
          style={{ ...MONO, backgroundColor: p.colorBg, color: p.colorText, borderRadius: RADIUS }}
          title={p.name}
        >
          {p.code}
        </span>
      )}
      <span className="flex-1 text-[13px] text-[#0f0f0f] leading-snug">{t.text}</span>
      <span
        className="text-[10px] font-semibold tracking-wider flex-shrink-0"
        style={{ ...MONO, color: PRIORITY_COLOR[t.priority] }}
      >
        {PRIORITY_LABEL[t.priority]}
      </span>
      <span className="text-[11px] text-[#aaaaaa] w-[54px] text-right flex-shrink-0" style={MONO}>
        {day ? dayLabel(day) : "—"}
      </span>
    </div>
  );
}

function NavButton({
  dir,
  title,
  disabled = false,
  onClick,
}: {
  dir: "left" | "right";
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="w-7 h-7 flex items-center justify-center text-[#737373] hover:text-[#0f0f0f] hover:bg-[#f0f0ee] disabled:text-[#e0e0de] disabled:hover:bg-transparent transition-colors"
      style={{ borderRadius: RADIUS }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d={dir === "left" ? "M7.5 2.5L4 6l3.5 3.5" : "M4.5 2.5L8 6l-3.5 3.5"}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
