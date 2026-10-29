"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { PinForm } from "./pin-form";
import { SignInForm } from "./sign-in-form";

type Tab = "student" | "family";

const TABS: readonly { id: Tab; label: string; hint: string }[] = [
  { id: "student", label: "Student", hint: "Use the username and PIN from your centre." },
  { id: "family", label: "Parent or staff", hint: "Enter the email your centre has on record. We'll send you a code." },
];

/** Students sign in with a username and PIN; parents and staff with an emailed code. */
export function SignInTabs({ next, initial }: { next: string; initial: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ student: null, family: null });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const nextTab: Tab = tab === "student" ? "family" : "student";
    setTab(nextTab);
    refs.current[nextTab]?.focus();
  }

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Who is signing in" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-10 rounded-full text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              tab === t.id ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{current.hint}</p>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "student" ? <PinForm next={next} /> : <SignInForm next={next} />}
      </div>
    </div>
  );
}
