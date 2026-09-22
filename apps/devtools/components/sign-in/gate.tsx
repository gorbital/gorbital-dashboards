"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError, apiFetch } from "@/lib/api/client";
import { dataMode } from "@/lib/api/mode";

import { SignIn } from "./sign-in";

/**
 * Shows the sign-in page in place of the portal when this browser has no
 * cookie, and the portal itself once it has one.
 *
 * Only a 401 gates. An `orb dev` that isn't running, or a portal that
 * answers something else, falls through to the screens, which already
 * explain those cases and offer a retry; replacing them with a sign-in
 * field would ask for a token that would not have helped. Mock mode never
 * reaches the portal, so it never gates either.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const mock = dataMode() === "mock";
  const session = useQuery({
    queryKey: ["portal", "session"],
    queryFn: () => apiFetch<{ ok: boolean }>("/_portal/api/session"),
    enabled: !mock,
    retry: false,
    staleTime: 30_000,
  });

  if (!mock && session.error instanceof ApiError && session.error.unauthorized) return <SignIn />;
  return <>{children}</>;
}
