"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api/client";
import { dataMode, isDemo } from "@/lib/api/mode";

import { SignIn } from "./sign-in";

/** Remembers, for this tab only, that the demo's front door has been opened. */
const DEMO_DONE = "devtoolsDemoEntered";

function demoEntered(): boolean {
  try {
    return sessionStorage.getItem(DEMO_DONE) === "1";
  } catch {
    // Storage can be blocked; show the page rather than fail.
    return false;
  }
}

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
 * the page once per tab, with the token filled in, because the sign-in is
 * part of what the demo is showing.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const demo = isDemo();
  const mock = dataMode() === "mock";
  const [entered, setEntered] = useState(demoEntered);

  const session = useQuery({
    queryKey: ["portal", "session"],
    queryFn: () => apiFetch<{ ok: boolean }>("/_portal/api/session"),
    enabled: !mock,
    retry: false,
    staleTime: 30_000,
  });

  if (demo && !entered) {
    return (
      <SignIn
        demo
        onDemoDone={() => {
          try {
            sessionStorage.setItem(DEMO_DONE, "1");
          } catch {
            // Not being able to remember only means the page shows again.
          }
          setEntered(true);
        }}
      />
    );
  }
  if (!mock && session.error instanceof ApiError && session.error.unauthorized) return <SignIn />;
  return <>{children}</>;
}
