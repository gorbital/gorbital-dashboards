import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./client";

/**
 * Sends the token `orb dev` printed to `POST /_portal/auth`, which sets the
 * `orb_portal` cookie for this browser. The token never reaches React state
 * or storage: it goes straight from the field into the request, and the
 * cookie the portal sets is `HttpOnly`, so nothing here can read it back.
 */
export async function signIn(token: string): Promise<void> {
  await apiFetch<void>("/_portal/auth", {
    method: "POST",
    json: { token: token.trim() },
  });
}

/**
 * useSignIn runs {@link signIn} and, on success, drops every cached query so
 * the screens refetch as the signed-in browser rather than showing the 401
 * they were holding.
 */
export function useSignIn() {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: signIn,
    onSuccess: () => queries.invalidateQueries(),
  });
}
