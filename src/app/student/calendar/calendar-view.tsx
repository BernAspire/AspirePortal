"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { Card, ClassesHeader, KIND_STYLE, KindLegend, type KindStyle } from "../_components/class-ui";

export interface CalendarEvent {
  readonly id: string;
  readonly time: string;
  readonly short: string;
  readonly title: string;
  readonly where: string;
  readonly style: KindStyle;
  readonly note: string | null;
}

export interface CalendarViewProps {
  readonly title: string;
  readonly prevHref: string;
  readonly nextHref: string;
  readonly days: readonly (string | null)[];
  readonly today: string;
  readonly events: Readonly<Record<string, readonly CalendarEvent[]>>;
  readonly initialDay: string;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dayTitle(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS_LONG[dow]}, ${d} ${MONTHS[m - 1]}${iso === today ? " · Today" : ""}`;
}

/** Month calendar from the Aspire Online design: pick a day to see its sessions. */
export function CalendarView(props: CalendarViewProps) {
  const [selected, setSelected] = useState(props.initialDay);
  const dayEvents = props.events[selected] ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ClassesHeader eyebrow="CLASSES AND DEADLINES" title="Calendar">
        <div className="flex items-center gap-2">
          <Link
            href={props.prevHref}
            aria-label="Previous month"
            className="inline-flex size-10 items-center justify-center rounded-full border border-[#CDEBD7] bg-white outline-none hover:bg-[#F6FBF8] focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            ‹
          </Link>
          <span className="min-w-[120px] text-center font-semibold" aria-live="polite">
            {props.title}
          </span>
          <Link
            href={props.nextHref}
            aria-label="Next month"
            className="inline-flex size-10 items-center justify-center rounded-full border border-[#CDEBD7] bg-white outline-none hover:bg-[#F6FBF8] focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            ›
          </Link>
        </div>
        <div className="w-full">
          <KindLegend kinds={["live_tutorial", "academic_coaching", "physical_tutorial", "cancelled"]} />
        </div>
      </ClassesHeader>

      <Card aria-label={props.title} className="p-2 sm:p-3.5">
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1.5 text-center text-xs font-semibold text-muted-foreground sm:text-[13px]">
              {w}
            </div>
          ))}
          {props.days.map((day, i) => {
            if (!day) return <div key={`pad-${i}`} />;
            const list = props.events[day] ?? [];
            const isSelected = day === selected;
            const isToday = day === props.today;
            const n = Number(day.slice(8));
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                aria-pressed={isSelected}
                aria-label={`${dayTitle(day, props.today)}, ${list.length ? `${list.length} item${list.length > 1 ? "s" : ""}` : "nothing scheduled"}`}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col items-stretch gap-1 rounded-xl border-2 p-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-[78px] sm:px-2 sm:py-1.5",
                  isSelected ? "border-[#1F8A50]" : isToday ? "border-[#CDEBD7]" : "border-[#F1ECE0]",
                  isToday ? "bg-[#EEF8F1]" : "bg-white hover:bg-[#FBFAF6]",
                )}
              >
                <span className={cn("text-[13px]", isToday ? "font-bold" : "font-medium")}>{n}</span>
                <span className="flex flex-wrap gap-1 sm:hidden" aria-hidden>
                  {list.map((e) => (
                    <span key={e.id} className={cn("size-2 rounded-full", KIND_STYLE[e.style].chip, "ring-1 ring-black/10")} />
                  ))}
                </span>
                {list.map((e) => (
                  <span
                    key={e.id}
                    aria-hidden
                    className={cn(
                      "hidden truncate rounded-[5px] px-1.5 py-0.5 text-[11px] leading-tight sm:block",
                      KIND_STYLE[e.style].chip,
                      e.style === "cancelled" && "line-through",
                    )}
                  >
                    {e.short}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
      </Card>

      <Card aria-labelledby="day-title" className="flex flex-col gap-2.5 px-5 py-4">
        <h2 id="day-title" className="font-display text-base font-semibold">
          {dayTitle(selected, props.today)}
        </h2>
        {dayEvents.length === 0 ? (
          <p className="py-3.5 text-center text-sm text-muted-foreground">Nothing scheduled for this day.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dayEvents.map((e) => (
              <li key={e.id} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5", KIND_STYLE[e.style].chip)}>
                <span className="min-w-20 text-sm font-semibold">{e.time}</span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-sm font-semibold", e.style === "cancelled" && "line-through")}>{e.title}</span>
                  <span className="text-xs text-[#3D4146]">{e.where}</span>
                  {e.note ? <span className="text-xs font-medium text-[#3D4146]">{e.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
