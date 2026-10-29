"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { SaveProgressResult } from "@/modules/elearning/schema";

export interface ViewerPage {
  readonly url: string | null;
  readonly role: "page" | "solution";
  readonly title: string;
}

interface Props {
  readonly partId: string;
  readonly pages: readonly ViewerPage[];
  readonly startPage: number;
  /** "slide" for decks, "page" for worksheets. */
  readonly noun: "slide" | "page";
  readonly downloadUrl: string | null;
  readonly save: (input: { partId: string; page: number; completed: boolean }) => Promise<SaveProgressResult>;
}

const SAVE_DELAY_MS = 700;

/**
 * Shows a part one page at a time. Worked solutions stay hidden until the
 * student asks; progress is saved a moment after they stop moving.
 */
export function PageViewer({ partId, pages, startPage, noun, downloadUrl, save }: Props) {
  const count = pages.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(startPage, 1), count) - 1);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const page = pages[index];
  const isSolution = page?.role === "solution";
  const hidden = isSolution && !revealed.has(index);
  const isWide = noun === "slide";

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), count - 1);
      setIndex(clamped);
      stage.current?.focus({ preventScroll: true });
    },
    [count],
  );

  // Save progress shortly after the student settles on a page.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const pageNumber = index + 1;
    timer.current = setTimeout(() => {
      save({ partId, page: pageNumber, completed: pageNumber === count }).then(
        (result) => {
          if (!result.saved && result.reason === "consent") {
            setNotice("Your progress isn't being saved yet: your centre still needs a parent's consent on record.");
          } else if (!result.saved && result.reason === "error") {
            setNotice("We couldn't save your progress just now. It will try again on the next page.");
          } else if (result.saved) {
            setNotice(null);
          }
        },
        () => setNotice("We couldn't save your progress just now. It will try again on the next page."),
      );
    }, SAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, partId, count, save]);

  // Keep the address in step so a refresh or a shared link reopens this page.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(index + 1));
    window.history.replaceState(window.history.state, "", url);
  }, [index]);

  // Load the next image early so moving forward feels instant.
  useEffect(() => {
    const next = pages[index + 1];
    if (next?.url && next.role === "page") {
      const img = new window.Image();
      img.src = next.url;
    }
  }, [index, pages]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      go(index - 1);
    }
  }

  if (!page) return null;
  const percent = Math.round(((index + 1) / count) * 100);

  return (
    <section aria-label="Lesson pages" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Go to {noun}</span>
          <select
            value={index}
            onChange={(e) => go(Number(e.target.value))}
            className="min-h-11 max-w-[min(70vw,360px)] truncate rounded-full border border-input bg-white px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {pages.map((p, i) => (
              <option key={i} value={i}>
                {i + 1}. {p.title || `${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {noun[0].toUpperCase() + noun.slice(1)} {index + 1} of {count}
          </span>
          {downloadUrl ? (
            <a
              href={downloadUrl}
              className="inline-flex min-h-11 items-center rounded-full bg-secondary px-4 text-sm font-semibold hover:bg-[#E6E7EA] focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
            >
              Download PDF
            </a>
          ) : null}
        </div>
      </div>

      <div
        ref={stage}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`${page.title || noun} (${index + 1} of ${count}). Use the left and right arrow keys to move.`}
        className="overflow-hidden rounded-[14px] border border-border bg-white outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onContextMenu={isWide ? (e) => e.preventDefault() : undefined}
      >
        {hidden ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 bg-success-soft p-6 text-center",
              isWide ? "aspect-video" : "aspect-[1/1.414]",
            )}
          >
            <p className="font-display text-lg font-semibold">{page.title || "Worked solution"}</p>
            <p className="max-w-sm text-sm text-[#3D4146]">Have a go first. When you&apos;re ready, check the worked solution.</p>
            <button
              type="button"
              onClick={() => setRevealed((s) => new Set(s).add(index))}
              className="inline-flex min-h-11 items-center rounded-full bg-[#1F9D55] px-5 text-sm font-semibold text-white hover:bg-[#178a49] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Show worked solution
            </button>
          </div>
        ) : page.url ? (
          <Image
            key={page.url}
            src={page.url}
            alt={page.title || `${noun} ${index + 1}`}
            width={isWide ? 1600 : 1240}
            height={isWide ? 900 : 1754}
            unoptimized
            priority
            draggable={false}
            className="h-auto w-full select-none"
          />
        ) : (
          <div className={cn("flex items-center justify-center p-6 text-sm text-muted-foreground", isWide ? "aspect-video" : "aspect-[1/1.414]")}>
            This {noun} couldn&apos;t be loaded. Try refreshing the page.
          </div>
        )}
      </div>

      <div
        role="progressbar"
        aria-label="Progress through this part"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 rounded-full bg-[#F1E6C8]"
      >
        <div className="h-full rounded-full bg-brand-strong transition-[width]" style={{ width: `${percent}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-secondary text-sm font-semibold hover:bg-[#E6E7EA] disabled:opacity-50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          ‹ Back
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === count - 1}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand text-sm font-semibold text-foreground hover:bg-brand-strong disabled:opacity-50 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {index === count - 1 ? "Finished" : "Next ›"}
        </button>
      </div>

      {notice ? (
        <p role="status" className="rounded-[10px] bg-[#FFF1D6] px-3 py-2 text-[13px] text-[#7A4B00]">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
