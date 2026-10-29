import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/routing";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Sign in</h1>
        </CardTitle>
        <CardDescription>
          Enter the email your centre has on record. We&apos;ll send you a code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<FormSkeleton />}>
          <SignInFormWithNext searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

async function SignInFormWithNext({
  searchParams,
}: {
  searchParams: PageProps<"/sign-in">["searchParams"];
}) {
  const { next } = await searchParams;
  return <SignInForm next={safeNextPath(Array.isArray(next) ? next[0] : next)} />;
}

function FormSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden>
      <div className="h-4 w-12 rounded bg-muted" />
      <div className="h-9 rounded-md bg-muted" />
      <div className="h-5" />
      <div className="h-9 rounded-md bg-muted" />
    </div>
  );
}
