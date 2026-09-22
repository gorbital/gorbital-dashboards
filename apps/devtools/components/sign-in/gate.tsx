"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api/client";
import { dataMode, isDemo } from "@/lib/api/mode";

import { SignIn } from "./sign-in";

/**
 * Shows the sign-in page in place of the portal when this browser has no
 * cookie, and the portal itself once it has one.
 *
 * Only a 401 gates. An `orb dev` that isn't running, or a portal that
 * answers something else, falls through to the screens, which already
 * explain those cases and offer a retry; replacing them with a sign-in
 * field would ask for a token that would not have helped.
 *
 * The public demo has no portal at all, so it never sees a 401. It shows
 * the page on each load, because the sign-in is part of what the demo is
 * showing. Whether it has been opened before is deliberately not
 * remembered: reading that from storage while rendering makes the first
 * client render disagree with the prerendered HTML, and the hydration
 * mismatch costs a visible flash — the very thing the page should not do.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const demo = isDemo();
  const mock = dataMode() === "mock";
  const [entered, setEntered] = useState(false);

  const session = useQuery({
    queryKey: ["portal", "session"],
    queryFn: () => apiFetch<{ ok: boolean }>("/_portal/api/session"),
    enabled: !mock,
    retry: false,
    staleTime: 30_000,
  });

  if (demo && !entered) return <SignIn demo onDemoDone={() => setEntered(true)} />;
  if (!mock && session.error instanceof ApiError && session.error.unauthorized) return <SignIn />;
  return <>{children}</>;
}
