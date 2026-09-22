"use client";

import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Mark } from "@gorbital/dash/components/brand";
import { Button } from "@gorbital/dash/components/button";
import { Input } from "@gorbital/dash/components/input";
import { ThemeToggle } from "@gorbital/dash/components/theme-toggle";

import { ApiError } from "@/lib/api/client";
import { useSignIn } from "@/lib/api/sign-in";

import { Showcase } from "./showcase";

/**
 * The whole portal when this browser has no cookie: one field for the token
 * `orb dev` printed, and beside it what the portal is for. There is no
 * account and no email — the portal has a single secret, generated per run,
 * and holding it is what being signed in means.
 */
export function SignIn() {
  const [token, setToken] = useState("");
  const signIn = useSignIn();
  const failed = signIn.isError;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (token.trim() && !signIn.isPending) signIn.mutate(token);
  }

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.45fr_minmax(380px,0.55fr)]">
      <Showcase />

      <main className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-0 top-0">
          <ThemeToggle />
        </div>

        <div className="flex w-full max-w-[320px] flex-col gap-8">
          <div className="grid gap-5">
            <Mark className="h-6" />
            <div className="grid gap-2">
              <h1 className="text-[24px] font-semibold tracking-tight text-text">Sign in to the Dev Portal</h1>
              <p className="text-[13px] leading-relaxed text-muted">
                Paste the token <span className="font-mono text-text">orb dev</span> printed in your terminal.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="grid gap-2.5">
            <Input
              mono
              autoFocus
              type="password"
              name="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Portal token"
              aria-label="Portal token"
              aria-invalid={failed || undefined}
              aria-describedby={failed ? "sign-in-error" : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-10 w-full"
            />
            <Button
              type="submit"
              kind="primary"
              className="h-10 w-full justify-center"
              disabled={!token.trim()}
              loading={signIn.isPending}
              icon={<KeyRound size={13} />}
            >
              {signIn.isPending ? "Signing in…" : "Sign in"}
            </Button>

            {failed && (
              <p id="sign-in-error" role="alert" className="text-[12px] leading-relaxed text-danger">
                {signIn.error instanceof ApiError && signIn.error.unauthorized
                  ? "That is not this run's token. orb dev prints a new one every run."
                  : ((signIn.error as Error)?.message ?? "The portal did not answer.")}
              </p>
            )}
          </form>

          <p className="text-[11px] leading-relaxed text-dim">
            The terminal line reads <span className="font-mono text-muted">✓ Dev Portal http://127.0.0.1:3100/_portal/auth?t=…</span> — the token is
            everything after <span className="font-mono text-muted">t=</span>. Opening that link signs you in too.
          </p>
        </div>
      </main>
    </div>
  );
}
