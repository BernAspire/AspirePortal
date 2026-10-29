import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { STUDENT_HOME_PATH } from "@/lib/auth/routing";
import { requirePortal } from "@/lib/auth/session";

import { signOut } from "../(auth)/actions";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <Link href={STUDENT_HOME_PATH} className="truncate font-semibold tracking-tight">
            Aspire Portal
          </Link>
          <Suspense fallback={<div className="h-8 w-24 rounded-md bg-muted" aria-hidden />}>
            <HeaderAccount />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

async function HeaderAccount() {
  const { centre } = await requirePortal("student", STUDENT_HOME_PATH);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden truncate text-sm text-muted-foreground sm:inline">
        {centre.centreName}
      </span>
      <form action={signOut}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
