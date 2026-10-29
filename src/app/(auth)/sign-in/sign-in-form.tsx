"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestCode, verifyCode } from "../actions";
import type { SignInState } from "./schema";

export function SignInForm({ next }: { next: string }) {
  const [state, sendCode, sending] = useActionState(requestCode, {
    step: "email",
    next,
  } satisfies SignInState);

  if (state.step === "email") {
    return (
      <form action={sendCode} className="grid gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={state.email ?? ""}
            aria-invalid={state.error ? true : undefined}
            aria-describedby="email-error"
          />
        </div>
        <p id="email-error" role="alert" className="min-h-5 text-sm text-destructive">
          {state.error}
        </p>
        <Button type="submit" disabled={sending} className="w-full">
          {sending ? "Sending code…" : "Send me a code"}
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        If <span className="font-medium break-all text-foreground">{state.email}</span> has an
        account, we&apos;ve emailed it a sign-in code.
      </p>

      {/* Remounts for each new code, clearing any earlier error. */}
      <CodeStep key={state.sentAt} email={state.email} next={next} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <form action={sendCode}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="email" value={state.email} />
          <Button type="submit" variant="link" className="h-auto px-0" disabled={sending}>
            {sending ? "Sending…" : "Send a new code"}
          </Button>
        </form>
        <form action={sendCode}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="intent" value="change-email" />
          <Button type="submit" variant="link" className="h-auto px-0 text-muted-foreground">
            Use a different email
          </Button>
        </form>
      </div>
    </div>
  );
}

function CodeStep({ email, next }: { email: string; next: string }) {
  const [state, checkCode, checking] = useActionState(verifyCode, {
    step: "code",
    next,
    email,
  } satisfies SignInState);

  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, [state]);

  return (
    <form action={checkCode} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="email" value={email} />
      <div className="grid gap-2">
        <Label htmlFor="code">Code</Label>
        <Input
          ref={input}
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={12}
          required
          className="font-mono text-lg tracking-[0.3em]"
          aria-invalid={state.error ? true : undefined}
          aria-describedby="code-error"
        />
      </div>
      <p id="code-error" role="alert" className="min-h-5 text-sm text-destructive">
        {state.error}
      </p>
      <Button type="submit" disabled={checking} className="w-full">
        {checking ? "Checking…" : "Sign in"}
      </Button>
    </form>
  );
}
