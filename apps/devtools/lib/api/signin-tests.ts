"use client";

/**
 * "Test sign-in" on the Authentication screen: `/_dev/auth/test…` through
 * the portal's proxy. Offline checks come with every GET; the network
 * checks, the round trips (Google, Apple, GitHub, passkeys), native ID
 * tokens and authenticator codes are separate calls. No answer ever carries
 * a token or a secret the app keeps: the TOTP secret is a throwaway one.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { apiFetch } from "./client";
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
