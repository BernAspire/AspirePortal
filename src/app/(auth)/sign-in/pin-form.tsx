"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { pinSignIn } from "../actions";
import type { PinSignInState } from "./schema";

export function PinForm({ next }: { next: string }) {
  const [state, signIn, pending] = useActionState(pinSignIn, { next } satisfies PinSignInState);

  return (
    <form action={signIn} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.username ?? ""}
          aria-describedby="pin-error"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pin">PIN</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="[0-9 ]*"
          maxLength={10}
          required
          className="font-mono tracking-[0.3em]"
          aria-invalid={state.error ? true : undefined}
          aria-describedby="pin-error"
        />
      </div>
      <p id="pin-error" role="alert" className="min-h-5 text-sm text-destructive">
        {state.error}
      </p>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Forgot your PIN? Ask your centre to reset it.</p>
    </form>
  );
}
