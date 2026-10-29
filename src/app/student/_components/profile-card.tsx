import { formatDateOnly } from "@/lib/time";

export interface SidebarProfile {
  readonly centreName: string;
  readonly fullName: string;
  readonly initials: string;
  readonly levelName: string | null;
  readonly clientCode: string;
  readonly validity: string | null;
}

/** Centre name as the portal's wordmark: the last word in the brand colour. */
export function CentreWordmark({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.pop() : undefined;
  return (
    <span className="font-display text-[19px] font-bold tracking-tight">
      {words.join(" ")}
      {last ? <span className="text-brand-strong"> {last}</span> : null}
    </span>
  );
}

/** Avatar, name, level, programme validity and client code, as in the design. */
export function ProfileCard({ profile }: { profile: SidebarProfile }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2.5 px-2">
        <span
          aria-hidden
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold"
        >
          {profile.initials}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{profile.fullName}</span>
          {profile.levelName ? (
            <span className="text-xs text-muted-foreground">{profile.levelName}</span>
          ) : null}
        </span>
      </div>
      <dl className="mx-2 grid grid-cols-[auto_auto] gap-x-2.5 gap-y-1 rounded-[10px] border border-[#F1E6C8] bg-white px-2.5 py-2 text-xs">
        <dt className="text-muted-foreground">Validity</dt>
        <dd className="text-right font-semibold">
          {profile.validity ? formatDateOnly(profile.validity) : "No active programme"}
        </dd>
        <dt className="text-muted-foreground">Client code</dt>
        <dd className="text-right font-bold">{profile.clientCode}</dd>
      </dl>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="grid gap-3" aria-hidden>
      <div className="flex items-center gap-2.5 px-2">
        <span className="size-10 animate-pulse rounded-full bg-brand-soft" />
        <span className="grid gap-1.5">
          <span className="h-3.5 w-24 animate-pulse rounded bg-brand-soft" />
          <span className="h-3 w-16 animate-pulse rounded bg-brand-soft" />
        </span>
      </div>
      <div className="mx-2 h-14 animate-pulse rounded-[10px] bg-white" />
    </div>
  );
}
