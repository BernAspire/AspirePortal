"use client";

import { useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export interface RewardsViewProps {
  readonly level: number;
  readonly levelName: string;
  readonly inLevel: number;
  readonly toNext: number | null;
  readonly nextLevel: { readonly code: string; readonly name: string } | null;
  readonly percent: number;
  readonly levels: readonly string[];
  readonly recent: readonly { readonly label: string; readonly when: string; readonly xp: number }[];
  readonly badges: readonly { readonly id: string; readonly icon: string; readonly name: string; readonly how: string; readonly earned: boolean; readonly comingSoon: boolean }[];
  readonly streak: { readonly current: number; readonly best: number; readonly activeToday: boolean; readonly days: readonly { readonly date: string; readonly label: string; readonly active: boolean }[] };
}

type Tab = "xp" | "badges" | "leagues" | "streak";
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "xp", label: "XP & Levels" },
  { id: "badges", label: "Badges" },
  { id: "leagues", label: "Leagues" },
  { id: "streak", label: "Streak Centre" },
];
const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const card = "rounded-2xl border border-border bg-card";

/** Rewards from the Aspire Online design: XP & levels, badges, leagues, streaks. */
export function RewardsView(p: RewardsViewProps) {
  const [tab, setTab] = useState<Tab>("xp");
  const earned = p.badges.filter((b) => b.earned).length;
  const circumference = 2 * Math.PI * 46;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
    setTab(next.id);
    document.getElementById(`rtab-${next.id}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-2xl bg-[#2B3138] px-[22px] py-[18px] text-white">
        <p className="text-xs font-semibold tracking-[.06em] text-[#C9CED4]">REWARDS · XP AND LEVELS</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold">Your progress</h1>
      </header>

      <div role="tablist" aria-label="Rewards sections" onKeyDown={onKey} className="grid grid-cols-2 gap-1.5 rounded-3xl bg-[#F1F2F4] p-1 sm:grid-cols-4 sm:rounded-full">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`rtab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="rpanel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cn("min-h-10 rounded-full text-sm font-semibold", focus, tab === t.id ? "bg-brand" : "hover:bg-white/70")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div id="rpanel" role="tabpanel" aria-labelledby={`rtab-${tab}`} className="flex min-w-0 flex-[999_1_460px] flex-col gap-4">
          {tab === "xp" ? (
            <>
              <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-[#2B3138] px-[22px] py-5 text-white">
                <div className="flex-[1_1_260px]">
                  <p className="text-xs font-semibold tracking-[.06em] text-[#C9CED4]">CURRENT LEVEL</p>
                  <p className="mb-3 mt-0.5 font-display text-[28px] font-bold">
                    L{p.level} <span className="text-brand">{p.levelName}</span>
                  </p>
                  {p.nextLevel ? (
                    <>
                      <div className="mb-1.5 flex justify-between text-[13px]">
                        <span>
                          Progress to {p.nextLevel.code} ({p.nextLevel.name})
                        </span>
                        <span className="font-bold text-brand">{p.inLevel}/100 XP</span>
                      </div>
                      <div className="h-2 rounded-full bg-[#4A525B]">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${p.percent}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-[#C9CED4]">
                        {p.toNext} more XP to level up · a 10-question practice earns 2–3 XP
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[#C9CED4]">Top level reached. Amazing work!</p>
                  )}
                </div>
                <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${p.inLevel} of 100 XP`}>
                  <circle cx="56" cy="56" r="46" fill="none" stroke="#4A525B" strokeWidth="9" />
                  <circle
                    cx="56"
                    cy="56"
                    r="46"
                    fill="none"
                    stroke="#F5B014"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={`${(p.percent / 100) * circumference} ${circumference}`}
                    transform="rotate(-90 56 56)"
                  />
                  <text x="56" y="58" textAnchor="middle" fontSize="24" fontWeight="700" fill="#FFFFFF">
                    {p.inLevel}
                  </text>
                  <text x="56" y="76" textAnchor="middle" fontSize="11" fill="#C9CED4">
                    / 100 XP
                  </text>
                </svg>
              </section>

              <section aria-label="Level path" className={cn(card, "overflow-x-auto px-5 py-4")}>
                <p className="mb-3 text-xs font-semibold tracking-[.06em] text-[#5F6368]">LEVEL PATH</p>
                <ol className="grid min-w-[560px] grid-cols-8 gap-1">
                  {p.levels.map((name, i) => {
                    const n = i + 1;
                    const done = n < p.level;
                    const cur = n === p.level;
                    return (
                      <li key={name} className={cn("flex flex-col items-center gap-1.5 text-xs", cur ? "font-bold text-[#7A4B00]" : "text-[#5F6368]")}>
                        <span
                          className={cn(
                            "inline-flex size-[34px] items-center justify-center rounded-full border text-xs font-bold",
                            done ? "border-transparent bg-[#1F9D55] text-white" : cur ? "border-transparent bg-brand" : "border-[#DCD5C3] bg-white",
                          )}
                        >
                          {done ? "✓" : `L${n}`}
                        </span>
                        {name}
                      </li>
                    );
                  })}
                </ol>
              </section>

              <section aria-labelledby="rx" className={cn(card, "px-5 py-4")}>
                <h2 id="rx" className="mb-1.5 font-display text-base font-semibold">
                  Recent XP
                </h2>
                {p.recent.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Finish a practice or a lesson part to earn your first XP.</p>
                ) : (
                  <ul>
                    {p.recent.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-2.5 border-t border-[#F3EEE2] py-2.5">
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold">{r.label}</span>
                          <span className="text-xs text-[#5F6368]">{r.when}</span>
                        </span>
                        <span className={cn("font-bold", r.xp > 0 ? "text-[#8A5A00]" : "text-[#9B1C1C]")}>
                          {r.xp > 0 ? `+${r.xp}` : r.xp}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}

          {tab === "badges" ? (
            <section className={cn(card, "grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 px-5 py-[18px]")}>
              {p.badges.map((b) => (
                <div
                  key={b.id}
                  className={cn("flex flex-col gap-1.5 rounded-[14px] border border-border p-3.5", b.earned ? "bg-[#FFF9EC]" : "bg-white opacity-75")}
                >
                  <span aria-hidden className={cn("inline-flex size-10 items-center justify-center rounded-full font-bold", b.earned ? "bg-brand" : "bg-[#F1F2F4]")}>
                    {b.icon}
                  </span>
                  <span className="text-sm font-semibold">
                    {b.name}
                    <span className="sr-only">{b.earned ? " (earned)" : " (not yet earned)"}</span>
                  </span>
                  <span className="text-xs text-[#3D4146]">{b.how}</span>
                  {b.comingSoon ? <span className="text-[11px] font-semibold text-muted-foreground">Coming soon</span> : null}
                  {b.earned ? <span className="text-[11px] font-semibold text-[#146C3E]">Earned</span> : null}
                </div>
              ))}
            </section>
          ) : null}

          {tab === "leagues" ? (
            <section className={cn(card, "flex flex-col items-start gap-2.5 p-[22px]")}>
              <h2 className="font-display text-[17px] font-semibold">Leagues are off</h2>
              <p className="text-sm leading-relaxed text-[#3D4146]">
                Leagues will let you compare weekly XP with other students at your centre, using a nickname only. A parent
                will need to switch them on, so they are not available yet.
              </p>
            </section>
          ) : null}

          {tab === "streak" ? (
            <section className={cn(card, "flex flex-col gap-3.5 p-[22px]")}>
              <h2 className="font-display text-[17px] font-semibold">
                {p.streak.current}-day streak · best {p.streak.best} day{p.streak.best === 1 ? "" : "s"}
              </h2>
              <ul className="flex flex-wrap gap-2" aria-label="Last 14 days">
                {p.streak.days.map((d) => (
                  <li
                    key={d.date}
                    title={d.label}
                    className={cn(
                      "inline-flex size-[34px] items-center justify-center rounded-[10px] text-xs font-semibold",
                      d.active ? "bg-brand" : "bg-[#F1F2F4] text-[#5F6368]",
                    )}
                  >
                    {Number(d.date.slice(8))}
                    <span className="sr-only">
                      {" "}
                      {d.label}, {d.active ? "active" : "no activity"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[13px] text-[#3D4146]">
                {p.streak.activeToday
                  ? "You've kept your streak today. See you tomorrow!"
                  : "Answer a practice question or finish a lesson part today to keep your streak."}{" "}
                7 days earns the Week Warrior badge.
              </p>
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-3">
          {[
            { label: "XP this level", value: p.nextLevel ? `${p.inLevel}/100` : `${p.inLevel}`, dot: "bg-[#FFF1D6]", fg: "text-[#8A5A00]" },
            { label: "Current level", value: `L${p.level}`, dot: "bg-[#E6F4EC]", fg: "text-[#145C38]" },
            { label: "Badges earned", value: String(earned), dot: "bg-[#F1EAFB]", fg: "text-[#5B2A86]" },
            { label: "League rank", value: "Off", dot: "bg-[#FFF1D6]", fg: "text-[#3D4146]" },
            { label: "Current streak", value: `${p.streak.current} day${p.streak.current === 1 ? "" : "s"}`, dot: "bg-[#FDECEC]", fg: "text-[#B42318]" },
          ].map((s) => (
            <div key={s.label} className={cn(card, "flex items-center gap-3 px-4 py-3.5")}>
              <span aria-hidden className={cn("size-10 rounded-full", s.dot)} />
              <span className="flex flex-col">
                <span className="text-xs text-[#5F6368]">{s.label}</span>
                <span className={cn("font-display text-lg font-bold", s.fg)}>{s.value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
