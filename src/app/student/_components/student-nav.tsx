"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { FOOTER_ITEMS, HOME_ITEM, NAV_GROUPS, type NavItem } from "./nav-config";

const itemBase =
  "flex min-h-11 items-center justify-between gap-2 rounded-[10px] px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  if (!item.href) {
    return (
      <span aria-disabled="true" className={cn(itemBase, "cursor-default text-muted-foreground")}>
        {item.label}
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Soon
        </span>
      </span>
    );
  }
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        itemBase,
        active
          ? "bg-brand-soft font-semibold text-foreground"
          : "text-[#3D4146] hover:bg-accent hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}

/** The portal menu, shared by the desktop sidebar and the mobile menu. */
export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Student portal" className="flex flex-1 flex-col gap-0.5">
      <Item item={HOME_ITEM} pathname={pathname} />
      {NAV_GROUPS.map((group) => {
        const open = group.items.some((i) => i.href === pathname);
        return (
          <details key={group.label} open={open} className="group/navgroup">
            <summary
              className={cn(
                itemBase,
                "cursor-pointer list-none font-semibold text-foreground hover:bg-accent [&::-webkit-details-marker]:hidden",
              )}
            >
              {group.label}
              <span aria-hidden className="text-muted-foreground transition-transform group-open/navgroup:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-0.5 pl-3">
              {group.items.map((item) => (
                <Item key={item.label} item={item} pathname={pathname} />
              ))}
            </div>
          </details>
        );
      })}
      <div className="flex-1" />
      {FOOTER_ITEMS.map((item) => (
        <Item key={item.label} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}
