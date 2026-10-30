import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { REVISION_PATH } from "../_components/nav-config";

const TABS = [
  { id: "home", label: "Revision Home", href: REVISION_PATH },
  { id: "weak", label: "Weak Topics", href: `${REVISION_PATH}/weak-topics` },
  { id: "exam", label: "Before-Exam Mode", href: `${REVISION_PATH}/exam` },
  { id: "bookmarks", label: "Bookmark Review", href: `${REVISION_PATH}/bookmarks` },
  { id: "materials", label: "Revision Materials", href: `${REVISION_PATH}/materials` },
] as const;
export type RevisionTab = (typeof TABS)[number]["id"];

export const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** The pill navigation across Smart Revision, as in the Aspire Online recording. */
export function RevisionNav({ active }: { active: RevisionTab }) {
  return (
    <nav aria-label="Smart Revision" className="flex flex-wrap justify-center gap-2">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-[38px] items-center rounded-full px-4 text-[13px] font-semibold",
            focus,
            t.id === active ? "bg-[#1F8A50] text-white" : "bg-[#F1F2F4] text-[#3D4146] hover:bg-[#E6E8EB]",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function RevisionHeader({ title, eyebrow = "SMART REVISION CENTRE", children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#F6E8C2] bg-[#FFF9EC] px-[22px] py-[18px]">
      <div>
        <p className="text-xs font-semibold tracking-[.06em] text-[#5F6368]">{eyebrow}</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export const panel = "rounded-2xl border border-border bg-card";

export function Stars({ value }: { value: number | null }) {
  const n = value ?? 0;
  return (
    <span className="tracking-[1px] text-[#8A5A00]" aria-label={value ? `${value} of 5 stars` : "Not rated"}>
      {"★".repeat(n)}
      <span className="text-[#C9CED4]">{"☆".repeat(5 - n)}</span>
    </span>
  );
}

export function RevisionEmpty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-[15px] text-muted-foreground">
      <span aria-hidden className="text-[#9AA0A6]">
        {icon}
      </span>
      {children}
    </div>
  );
}

export const WEAKNESS_TAG = {
  critical: { label: "Critical", cls: "bg-[#FDECEC] text-[#9B1C1C]" },
  needs_work: { label: "Needs work", cls: "bg-[#FFF1D6] text-[#7A4B00]" },
  low_confidence: { label: "Low confidence", cls: "bg-[#EEF2FB] text-[#1F3F7A]" },
} as const;
