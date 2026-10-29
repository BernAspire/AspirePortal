import type { ReactNode } from "react";

import { CentreWordmark, ProfileCard, ProfileSkeleton, type SidebarProfile } from "./profile-card";
import { StudentNav } from "./student-nav";

/**
 * The student portal frame from the Aspire Online design: a cream sidebar on
 * larger screens, a top bar with a menu on phones. Purely presentational; the
 * profile slot is filled by the caller (streamed in behind Suspense).
 */
export function StudentShell({
  profileSlot,
  wordmarkSlot,
  signOutSlot,
  children,
}: {
  profileSlot: ReactNode;
  wordmarkSlot: ReactNode;
  signOutSlot: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-1">
      <aside className="sticky top-0 hidden h-svh w-[232px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-sidebar-border bg-sidebar px-3 py-[18px] md:flex">
        <div className="px-2 pb-1">{wordmarkSlot}</div>
        {profileSlot}
        <StudentNav />
        {signOutSlot}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-sidebar-border bg-sidebar md:hidden">
          <details className="group/menu">
            <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
              {wordmarkSlot}
              <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-accent">
                <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
                <span className="group-open/menu:hidden">Menu</span>
                <span className="hidden group-open/menu:inline">Close</span>
              </span>
            </summary>
            <div className="flex max-h-[calc(100svh-3.5rem)] flex-col gap-3 overflow-y-auto border-t border-sidebar-border px-3 py-4">
              {profileSlot}
              <StudentNav />
              {signOutSlot}
            </div>
          </details>
        </header>

        <main className="w-full flex-1 px-4 pt-6 pb-16 md:px-8">
          <div className="max-w-[960px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

export { CentreWordmark, ProfileCard, ProfileSkeleton, type SidebarProfile };
