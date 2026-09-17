"use client";

/**
 * The Authentication screen's data layer: the operators' account APIs
 * (`/ops/auth/users…`, ADR-0070), the sign-in methods (`/ops/auth/providers`)
 * and the rate limiters (`/ops/auth/rate-limits`), through the portal's
 * proxy like every other `/ops` hook in `queries.ts`. Types match the Go
 * handlers in `internal/modules/auth/delivery/ops_users.go` and
 * `internal/modules/ops/delivery/auth.go` field for field.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@gorbital/dash/components/toast";
import { ApiError, NotConnectedError, apiFetch } from "./client";
import { errorMessage } from "./errors";
import { queryString } from "./queries";

/* ---------- Types ---------- */

/** An account as operators see it (`OpsUserResponse`). */
export type OpsUser = {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  /** Platform roles, such as platform_admin. */
  roles: string[];
  /** Accounts created with Google, Apple or GitHub have none until they reset one. */
  has_password: boolean;
  banned_at?: string;
  banned_reason?: string;
};

/** A page of accounts, newest first. */
export type OpsUserList = {
  users: OpsUser[];
  /** Pass as `cursor` for the next page; absent on the last page. */
  next_cursor?: string;
};

/** A signed-in device (`SessionResponse`). */
export type AuthSession = {
  id: string;
  created_at: string;
  last_seen_at: string;
  /** When the session ends unless used again. */
  expires_at: string;
  ip?: string;
  user_agent?: string;
  /** The session making the request: always false from `/ops`. */
  current: boolean;
  /** Signed in or confirmed with a second factor. */
  mfa_verified: boolean;
};

export type Passkey = {
  id: string;
  name: string;
  created_at: string;
  last_used_at?: string;
  /** Synced to the user's other devices by their passkey provider. */
  backed_up: boolean;
};

/** A Google, Apple or GitHub account linked to the user. */
export type Identity = {
  id: string;
  provider: "google" | "apple" | "github" | (string & {});
  email?: string;
  /** An Apple relay address that forwards to the person's real one. */
  private_email: boolean;
  name?: string;
  created_at: string;
  last_used_at?: string;
};

/** A usable verification or reset code, without the code (it arrives by email). */
export type OpsCode = {
  id: string;
  purpose: "verify_email" | "reset_password" | (string & {});
  attempts: number;
  max_attempts: number;
  created_at: string;
  expires_at: string;
};

export type OpsMFAStatus = {
  /** A confirmed authenticator app. */
  totp: boolean;
  /** Unused recovery codes. */
  recovery_codes: number;
  passkeys: number;
};

/** Everything about one account (`GET /ops/auth/users/{id}`). */
export type OpsUserDetail = {
  user: OpsUser;
  sessions: AuthSession[];
  passkeys: Passkey[];
  identities: Identity[];
  mfa: OpsMFAStatus;
  codes: OpsCode[];
};

export type CreateUserBody = {
  email: string;
  /** At least 12 characters. */
  password: string;
  /** Skip verification, as for seed data. */
  email_verified?: boolean;
};

export type BanUserBody = { reason?: string };
export type GrantRoleBody = { role: string };
export type ImpersonateBody = {
  /** Count the session as signed in with a second factor, so roles that require one apply. */
  mfa_verified?: boolean;
};

/** A session started for a user by an operator; the token is shown once. */
export type OpsImpersonation = {
  token: string;
  session: AuthSession;
  user: OpsUser;
  mfa_verified: boolean;
};

export type OpsRevoked = { revoked: number };

/** An authenticator app secret and recovery codes an operator turned on, shown once. */
export type OpsTOTPEnrollment = {
  secret: string;
  /** otpauth:// URI for authenticator apps. */
  uri: string;
  recovery_codes: string[];
};

/** A sign-in method's configuration status (`GET /ops/auth/providers`). */
export type SignInMethod = {
  key: string;
  name: string;
  enabled: boolean;
  /** How an enabled method is configured, such as its relying party ID; never secrets. */
  detail?: string;
  /** Environment variables that turn a disabled method on. */
  missing?: string[];
  /** The AUTH_PROVIDERS.md section that explains the method. */
  guide?: string;
};
export type SignInMethodList = { methods: SignInMethod[] };

export type RateLimiter = {
  name: string;
  /** What a key is: an address, an email address, a client network, an actor ID. */
  keys: string;
  description: string;
};
export type RateLimiterList = { limiters: RateLimiter[] };
export type RateLimitResetBody = { name: string; key: string };
export type RateLimitResetResponse = {
  /** A budget was kept for the key and is now forgotten. */
  reset: boolean;
};

/* ---------- Keys and helpers ---------- */

const base = "/_portal/app/ops/auth";
const userPath = (id: string) => `${base}/users/${encodeURIComponent(id)}`;

export const authKeys = {
  all: ["ops", "auth"] as const,
  users: (q: string) => ["ops", "auth", "users", q] as const,
  user: (id: string) => ["ops", "auth", "user", id] as const,
  providers: ["ops", "auth", "providers"] as const,
  rateLimits: ["ops", "auth", "rate-limits"] as const,
};

/** Don't retry what won't change by itself: not connected, not signed in, or refused. */
function retry(count: number, err: Error) {
  if (err instanceof NotConnectedError) return false;
  if (err instanceof ApiError && err.status < 500) return false;
  return count < 1;
}

type QC = ReturnType<typeof useQueryClient>;

/** After a change to one account: its detail and every list page. */
function invalidateUser(qc: QC, id?: string) {
  void qc.invalidateQueries({ queryKey: ["ops", "auth", "users"] });
  if (id) void qc.invalidateQueries({ queryKey: authKeys.user(id) });
  void qc.invalidateQueries({ queryKey: ["ops", "audit"] });
}

/* ---------- Users ---------- */

/** `GET /ops/auth/users?q=&cursor=&limit=`: newest first, a page at a time; `fetchNextPage` follows `next_cursor`. */
export function useAuthUsers(q: string, enabled: boolean, limit = 50) {
  return useInfiniteQuery({
    queryKey: authKeys.users(q),
    queryFn: ({ pageParam }) => apiFetch<OpsUserList>(`${base}/users${queryString({ q, limit, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled,
    retry,
  });
}

/** `GET /ops/auth/users/{id}`: the account with its sessions, passkeys, identities, second factors and usable codes. */
export function useAuthUser(id: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: authKeys.user(id ?? ""),
    queryFn: () => apiFetch<OpsUserDetail>(userPath(id ?? "")),
    enabled: enabled && Boolean(id),
    refetchInterval: 15_000,
    retry,
  });
}

/** `POST /ops/auth/users` (201): as seed data does; the address can start verified. */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserBody) => apiFetch<OpsUser>(`${base}/users`, { method: "POST", json: body }),
    onSuccess: (u) => toast.success(`Created ${u.email}`, { description: u.email_verified ? "address marked verified" : "a verification code is on its way to the inbox" }),
    onSettled: () => invalidateUser(qc),
  });
}

/** `DELETE /ops/auth/users/{id}` (204): as the owner would, without their password; 409 `sole_owner` for an organisation's only owner. */
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => apiFetch<void>(userPath(id), { method: "DELETE" }),
    onSuccess: (_, { email }) => toast.success(`Deleted ${email}`, { description: "sessions and keys revoked, providers unlinked; the data goes after the retention period" }),
    onError: (err, { email }) => toast.error(`Couldn't delete ${email}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => {
      qc.removeQueries({ queryKey: authKeys.user(id) });
      invalidateUser(qc);
    },
  });
}

/** `POST /ops/auth/users/{id}/verify-email` (204). */
export function useVerifyEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => apiFetch<void>(`${userPath(id)}/verify-email`, { method: "POST" }),
    onSuccess: (_, { email }) => toast.success(`Marked ${email} verified`),
    onError: (err, { email }) => toast.error(`Couldn't verify ${email}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `POST /ops/auth/users/{id}/ban` (204): every session and API key is revoked; sign-in answers 403 `account_banned`. */
export function useBanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; email: string; reason: string }) => apiFetch<void>(`${userPath(id)}/ban`, { method: "POST", json: { reason } satisfies BanUserBody }),
    onSuccess: (_, { email }) => toast.success(`Banned ${email}`, { description: "sessions and API keys revoked; sign-in refused until the ban is lifted" }),
    onError: (err, { email }) => toast.error(`Couldn't ban ${email}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `POST /ops/auth/users/{id}/unban` (204). API keys stay revoked; the person creates new ones. */
export function useUnbanUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => apiFetch<void>(`${userPath(id)}/unban`, { method: "POST" }),
    onSuccess: (_, { email }) => toast.success(`Lifted the ban on ${email}`, { description: "they can sign in again; revoked API keys stay revoked" }),
    onError: (err, { email }) => toast.error(`Couldn't unban ${email}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `POST /ops/auth/users/{id}/roles` (200 the user): the address must be verified. */
export function useGrantRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => apiFetch<OpsUser>(`${userPath(id)}/roles`, { method: "POST", json: { role } satisfies GrantRoleBody }),
    onSuccess: (u, { role }) => {
      qc.setQueryData<OpsUserDetail>(authKeys.user(u.id), (old) => (old ? { ...old, user: u } : old));
      toast.success(`Granted ${role} to ${u.email}`);
    },
    onError: (err, { role }) => toast.error(`Couldn't grant ${role}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `DELETE /ops/auth/users/{id}/roles/{role}` (200 the user). */
export function useRevokeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => apiFetch<OpsUser>(`${userPath(id)}/roles/${encodeURIComponent(role)}`, { method: "DELETE" }),
    onSuccess: (u, { role }) => {
      qc.setQueryData<OpsUserDetail>(authKeys.user(u.id), (old) => (old ? { ...old, user: u } : old));
      toast.success(`Revoked ${role} from ${u.email}`);
    },
    onError: (err, { role }) => toast.error(`Couldn't revoke ${role}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `DELETE /ops/auth/users/{id}/sessions` (200 `{revoked}`): signs the person out everywhere. */
export function useRevokeSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => apiFetch<OpsRevoked>(`${userPath(id)}/sessions`, { method: "DELETE" }),
    onSuccess: (r, { email }) => toast.success(`Ended ${r.revoked} session${r.revoked === 1 ? "" : "s"} of ${email}`),
    onError: (err, { email }) => toast.error(`Couldn't end the sessions of ${email}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `DELETE /ops/auth/users/{id}/sessions/{sessionId}` (204). */
export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, sessionId }: { id: string; sessionId: string }) => apiFetch<void>(`${userPath(id)}/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
    onSuccess: (_, { sessionId }) => toast.success(`Ended session ${sessionId}`),
    onError: (err, { sessionId }) => toast.error(`Couldn't end session ${sessionId}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `DELETE /ops/auth/users/{id}/passkeys/{passkeyId}` (204). */
export function useRemovePasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, passkeyId }: { id: string; passkeyId: string; name: string }) => apiFetch<void>(`${userPath(id)}/passkeys/${encodeURIComponent(passkeyId)}`, { method: "DELETE" }),
    onSuccess: (_, { name }) => toast.success(`Removed passkey ${name}`),
    onError: (err, { name }) => toast.error(`Couldn't remove passkey ${name}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `DELETE /ops/auth/users/{id}/identities/{identityId}` (204): unlinks a Google, Apple or GitHub account. */
export function useRemoveIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, identityId }: { id: string; identityId: string; provider: string }) => apiFetch<void>(`${userPath(id)}/identities/${encodeURIComponent(identityId)}`, { method: "DELETE" }),
    onSuccess: (_, { provider }) => toast.success(`Unlinked ${provider}`),
    onError: (err, { provider }) => toast.error(`Couldn't unlink ${provider}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `POST /ops/auth/users/{id}/mfa/enroll` (201): the secret and recovery codes, once; the caller shows them. */
export function useEnrollTOTP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => apiFetch<OpsTOTPEnrollment>(`${userPath(id)}/mfa/enroll`, { method: "POST" }),
    onError: (err, { email }) => toast.error(`Couldn't turn on an authenticator app for ${email}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `POST /ops/auth/users/{id}/mfa/reset` (204): removes every second factor and ends every session. */
export function useResetMFA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; email: string }) => apiFetch<void>(`${userPath(id)}/mfa/reset`, { method: "POST" }),
    onSuccess: (_, { email }) => toast.success(`Reset the second factors of ${email}`, { description: "authenticator app, passkeys and recovery codes removed; every session ended" }),
    onError: (err, { email }) => toast.error(`Couldn't reset the second factors of ${email}`, { description: errorMessage(err) }),
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/** `POST /ops/auth/users/{id}/impersonate` (201): a session as the user, only with the dev console (403 `impersonation_off` elsewhere). */
export function useImpersonate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mfa_verified }: { id: string; email: string; mfa_verified: boolean }) => apiFetch<OpsImpersonation>(`${userPath(id)}/impersonate`, { method: "POST", json: { mfa_verified } satisfies ImpersonateBody }),
    onError: (err, { email }) => {
      if (err instanceof ApiError && err.code === "impersonation_off") toast.warning("Impersonation is off", { description: "It exists only while the app runs with the dev console (orb dev)." });
      else toast.error(`Couldn't act as ${email}`, { description: errorMessage(err) });
    },
    onSettled: (_, __, { id }) => invalidateUser(qc, id),
  });
}

/* ---------- Providers and rate limits ---------- */

/** `GET /ops/auth/providers`: whether each sign-in method is configured, and what turns the others on. */
export function useSignInMethods(enabled: boolean) {
  return useQuery({
    queryKey: authKeys.providers,
    queryFn: async () => (await apiFetch<SignInMethodList>(`${base}/providers`)).methods ?? [],
    enabled,
    staleTime: 30_000,
    retry,
  });
}

/** `GET /ops/auth/rate-limits`: the app's limiters and what their keys are (budgets can't be listed). */
export function useRateLimiters(enabled: boolean) {
  return useQuery({
    queryKey: authKeys.rateLimits,
    queryFn: async () => (await apiFetch<RateLimiterList>(`${base}/rate-limits`)).limiters ?? [],
    enabled,
    staleTime: 60_000,
    retry,
  });
}

/** `POST /ops/auth/rate-limits/reset`: forgets a key's budget; `reset` says whether one was kept. 404 `rate_limiter_not_found`. */
export function useResetRateLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RateLimitResetBody) => apiFetch<RateLimitResetResponse>(`${base}/rate-limits/reset`, { method: "POST", json: body }),
    onSuccess: (r, { name, key }) => {
      if (r.reset) toast.success(`Reset ${name} for ${key}`, { description: "reset: true · the next request counts as the first" });
      else toast.info(`No budget kept for ${key} under ${name}`, { description: "reset: false · nothing to forget" });
    },
    onError: (err, { name }) => toast.error(`Couldn't reset ${name}`, { description: errorMessage(err) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["ops", "audit"] }),
  });
}
