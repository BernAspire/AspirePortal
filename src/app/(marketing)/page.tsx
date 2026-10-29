import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SIGN_IN_PATH } from "@/lib/auth/routing";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Aspire Portal</h1>
        <p className="text-muted-foreground">
          Lessons, practice and progress for students, families and staff.
        </p>
      </div>
      <div>
        <Button asChild size="lg">
          <Link href={SIGN_IN_PATH}>Sign in</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Accounts are set up by your centre. If you can&apos;t sign in, please contact them.
      </p>
    </main>
  );
}
