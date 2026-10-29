import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Colours from the Aspire Online calendar design, shared by the Classes pages. */
export const KIND_STYLE = {
  live_tutorial: { chip: "bg-[#DCE8FB]", label: "Live tutorial" },
  academic_coaching: { chip: "bg-[#DDF1E4]", label: "Academic coaching" },
  physical_tutorial: { chip: "bg-[#FFEDBF]", label: "Physical tutorial" },
  cancelled: { chip: "bg-[#EEEEEC]", label: "Cancelled" },
} as const;
export type KindStyle = keyof typeof KIND_STYLE;

export const ATTENDANCE_STYLE = {
  present: "bg-[#E6F4EC] text-[#145C38]",
  late: "bg-[#FFF1D6] text-[#7A4B00]",
  absent: "bg-[#FDECEC] text-[#9B1C1C]",
  excused: "bg-[#EEF2FB] text-[#1F3F7A]",
  unmarked: "bg-secondary text-[#3D4146]",
} as const;

/** The green "Classes" page header card from the design. */
export function ClassesHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#CDEBD7] bg-[#EEF8F1] px-[22px] py-[18px]">
      <div>
        <p className="text-xs font-bold tracking-[.06em] text-[#146C3E]">{eyebrow}</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold text-[#145C38]">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function KindLegend({ kinds }: { kinds: readonly KindStyle[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px]" aria-label="Colour key">
      {kinds.map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2.5 rounded-[3px] ring-1 ring-black/10", KIND_STYLE[k].chip)} />
          {KIND_STYLE[k].label}
        </li>
      ))}
    </ul>
  );
}

export function Card({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-[14px] border border-border bg-card", className)} {...rest}>
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="px-5 py-8 text-center">
      <h2 className="font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</p>
    </Card>
  );
}

export function ClassesSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading {label}…</span>
      <div className="h-[92px] animate-pulse rounded-[14px] bg-muted" aria-hidden />
      <div className="h-64 animate-pulse rounded-[14px] bg-muted" aria-hidden />
    </div>
  );
}
