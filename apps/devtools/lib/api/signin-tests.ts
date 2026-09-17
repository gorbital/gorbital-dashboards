"use client";

/**
 * "Test sign-in" on the Authentication screen: `/_dev/auth/test…` through
 * the portal's proxy. Offline checks come with every GET; the network
 * checks, the round trips (Google, Apple, GitHub, passkeys), native ID
 * tokens and authenticator codes are separate calls. No answer ever carries
 * a token or a secret the app keeps: the TOTP secret is a throwaway one.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { finishedId, POLL_MS, shouldPoll } from "../signin-tests/signin-tests";
import { ApiError, apiFetch } from "./client";
import { errorMessage } from "./errors";
import { retry } from "./queries";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";
export type CheckLink = "environment" | "tunnel" | "mail" | "guide";

export interface SignInCheck {
  code: string;
  status: CheckStatus;
  message: string;
  fix?: string;
  variables?: string[];
  link?: CheckLink;
}

export type SignInMethodKey = "google" | "apple" | "github" | "passkeys" | "authenticator_app" | "email";
export type RedirectProvider = "google" | "apple" | "github";
export type LiveKind = "redirect" | "ceremony" | "code" | "email";

export interface SignInTestMethod {
  key: SignInMethodKey;
  name: string;
  configured: boolean;
  /** Offline checks, computed on every GET. */
  checks: SignInCheck[];
  live: { kind: LiveKind; available: boolean; reason?: string; link?: CheckLink };
  /** google, apple, github. */
  callback_url?: string;
  /** google, apple: native ID tokens can be verified. */
  id_token?: boolean;
  /** passkeys: where the ceremony runs. */
  origin?: string;
  rp_id?: string;
}

/** `GET /_dev/auth/test`. */
export interface SignInTests {
  public_url: string;
  methods: SignInTestMethod[];
}

/** `POST /_dev/auth/test/{provider}/check`: provider reachable, clock skew, client credentials. */
export interface SignInLiveChecks {
  method: SignInMethodKey;
  checks: SignInCheck[];
}

/** `POST /_dev/auth/test/{provider|passkeys}/start`. */
export interface SignInTestStart {
  id: string;
  url: string;
  expires_at: string;
}

export type SignInTestState = "pending" | "passed" | "failed" | "expired";

export interface SignInIdentity {
  subject: string;
  email?: string;
  email_verified: boolean;
  private_email?: boolean;
  name?: string;
  audience?: string;
  hosted_domain?: string;
}

export interface SignInPasskey {
  rp_id: string;
  origin: string;
  credential_id: string;
  backup_eligible: boolean;
  backup_state: boolean;
  user_verified: boolean;
}

/** `GET /_dev/auth/test/results/{id}` and `POST …/id-token`. */
export interface SignInTestResult {
  id: string;
  method: SignInMethodKey;
  kind: "redirect" | "ceremony" | "id_token";
  state: SignInTestState;
  code?: string;
  message?: string;
  fix?: string;
  link?: CheckLink;
  identity?: SignInIdentity;
  passkey?: SignInPasskey;
  warnings?: SignInCheck[];
  started_at: string;
  finished_at?: string;
  expires_at: string;
}

/** `POST /_dev/auth/test/totp/start`. */
export interface TOTPTestStart {
  id: string;
  secret: string;
  uri: string;
  /** A data URL for an <img>. */
  qr_code: string;
  issuer: string;
  account: string;
  expires_at: string;
  checks: SignInCheck[];
}

/** `POST /_dev/auth/test/totp/verify`. */
export interface TOTPTestResult {
  passed: boolean;
  code: "ok" | "invalid_code" | "clock_drift" | "expired" | "too_many_attempts";
  message: string;
  fix?: string;
  drift_steps?: number;
  drift_seconds?: number;
  attempts_left: number;
}

export const SIGN_IN_TEST_BASE = "/_portal/app/_dev/auth/test";

/** The popup's window name and the BroadcastChannel the result page announces on. */
export const SIGN_IN_TEST_CHANNEL = "orb-sign-in-test";

export const signInTestKeys = {
  all: ["dev", "auth", "test"] as const,
  list: ["dev", "auth", "test", "list"] as const,
  result: (id: string) => ["dev", "auth", "test", "result", id] as const,
};

/** `GET /_dev/auth/test`: every method with its offline checks. */
export function useSignInTests(enabled: boolean) {
  return useQuery({
    queryKey: signInTestKeys.list,
    queryFn: async () => {
      const r = await apiFetch<SignInTests>(SIGN_IN_TEST_BASE);
      return { ...r, methods: (r.methods ?? []).map((m) => ({ ...m, checks: m.checks ?? [] })) };
    },
    enabled,
    staleTime: 10_000,
    retry,
  });
}

/** `POST /_dev/auth/test/{provider}/check`: the network checks. */
export function useSignInLiveCheck() {
  return useMutation({
    mutationFn: (provider: RedirectProvider) => apiFetch<SignInLiveChecks>(`${SIGN_IN_TEST_BASE}/${provider}/check`, { method: "POST", json: {} }),
    onError: (err) => toast.error("Couldn't run the checks", { description: errorMessage(err) }),
  });
}

/** `POST /_dev/auth/test/{provider|passkeys}/start` with where the provider's answer lands. The caller shows errors (the popup is closed first). */
export function startSignInTest(method: RedirectProvider | "passkeys", resultUrl: string) {
  return apiFetch<SignInTestStart>(`${SIGN_IN_TEST_BASE}/${method}/start`, { method: "POST", json: { result_url: resultUrl } });
}

/** `GET /_dev/auth/test/results/{id}`. */
export function fetchSignInTestResult(id: string) {
  return apiFetch<SignInTestResult>(`${SIGN_IN_TEST_BASE}/results/${encodeURIComponent(id)}`);
}

/** `POST /_dev/auth/test/{google|apple}/id-token`. */
export function useVerifyIdToken() {
  return useMutation({
    mutationFn: ({ provider, id_token, nonce }: { provider: "google" | "apple"; id_token: string; nonce: string }) => apiFetch<SignInTestResult>(`${SIGN_IN_TEST_BASE}/${provider}/id-token`, { method: "POST", json: { id_token, nonce } }),
  });
}

/** `POST /_dev/auth/test/totp/start`. */
export function useStartTotpTest() {
  return useMutation({
    mutationFn: () => apiFetch<TOTPTestStart>(`${SIGN_IN_TEST_BASE}/totp/start`, { method: "POST", json: {} }),
    onError: (err) => toast.error("Couldn't start the authenticator test", { description: errorMessage(err) }),
  });
}

/** `POST /_dev/auth/test/totp/verify`. */
export function useVerifyTotp() {
  return useMutation({
    mutationFn: (v: { id: string; code: string }) => apiFetch<TOTPTestResult>(`${SIGN_IN_TEST_BASE}/totp/verify`, { method: "POST", json: v }),
  });
}

/** Re-reads the method list (for "Check" on methods without network checks). */
export function useRefreshSignInTests() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: signInTestKeys.list });
}

export type SignInTestWatch = {
  result: SignInTestResult | undefined;
  error: unknown;
  /** Still waiting: no final state yet, not expired, no fatal error. */
  waiting: boolean;
};

/**
 * Follows one round trip until it is final: asks every 1.5 s until
 * `expires_at`, and at once when the result page says it finished (on the
 * BroadcastChannel, or a `message` from this origin posted by the popup).
 */
export function useSignInTestResult(test: Pick<SignInTestStart, "id" | "expires_at"> | null): SignInTestWatch {
  const [state, setState] = useState<{ id: string; result?: SignInTestResult; error?: unknown; waiting: boolean }>({ id: "", waiting: false });

  const testId = test?.id;
  const testExpiry = test?.expires_at;

  useEffect(() => {
    if (!testId || !testExpiry) {
      setState({ id: "", waiting: false });
      return;
    }
    const id = testId;
    const expires_at = testExpiry;
    setState({ id, waiting: true });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: BroadcastChannel | null = null;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      channel?.close();
      window.removeEventListener("message", onWindowMessage);
    };
    const read = async () => {
      if (stopped) return;
      try {
        const result = await fetchSignInTestResult(id);
        if (stopped) return;
        const more = shouldPoll(result, expires_at, Date.now());
        setState({ id, result, waiting: more });
        if (!more) stop();
      } catch (error) {
        if (stopped) return;
        const fatal = error instanceof ApiError && error.status === 404;
        const expired = !shouldPoll(undefined, expires_at, Date.now());
        setState((s) => ({ ...s, id, error, waiting: !fatal && !expired }));
        if (fatal || expired) stop();
      }
    };
    const schedule = () => {
      timer = setTimeout(async () => {
        await read();
        if (stopped) return;
        if (!shouldPoll(undefined, expires_at, Date.now())) {
          setState((s) => ({ ...s, waiting: false }));
          stop();
          return;
        }
        schedule();
      }, POLL_MS);
    };
    function onWindowMessage(e: MessageEvent) {
      if (finishedId(e.data, { got: e.origin, want: window.location.origin }) === id) void read();
    }
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(SIGN_IN_TEST_CHANNEL);
      channel.onmessage = (e: MessageEvent) => {
        if (finishedId(e.data) === id) void read();
      };
    }
    window.addEventListener("message", onWindowMessage);
    schedule();
    return stop;
  }, [testId, testExpiry]);

  const current = test && state.id === test.id ? state : undefined;
  return { result: current?.result, error: current?.error, waiting: Boolean(test) && (current ? current.waiting : true) };
}
