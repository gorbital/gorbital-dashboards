"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Fingerprint, KeyRound, Link2Off, LogOut, Mail, Plus, RefreshCw, ShieldCheck, ShieldOff, Trash2, UserCheck, VenetianMask } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { ConfirmDialog, Dialog } from "@gorbital/dash/components/dialog";
import { Checkbox, Field, Input, Label, Select } from "@gorbital/dash/components/input";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table } from "@gorbital/dash/components/table";
import {
  useAuthUser,
  useBanUser,
  useDeleteUser,
  useEnrollTOTP,
  useGrantRole,
  useImpersonate,
  useRemoveIdentity,
  useRemovePasskey,
  useResetMFA,
  useRevokeRole,
  useRevokeSession,
  useRevokeSessions,
  useUnbanUser,
  useVerifyEmail,
  type AuthSession,
  type OpsCode,
  type OpsImpersonation,
  type OpsTOTPEnrollment,
  type OpsUserDetail,
} from "@/lib/api/auth";
import { storeBearerToken } from "@/lib/api/bearer-token";
import { useDevApp } from "@/lib/api/queries";
import { codePurpose, codeState, grantableRoles, revocableRoles } from "@/lib/auth";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { CopyButton, RoleChip, UserBadges, shortUserAgent } from "./common";

type Props = {
  id: string | null;
  enabled: boolean;
  /** The app serves the dev console: the role catalogs come from `/_dev/app`, and impersonation exists. */
  console: boolean;
  consoleDeclared?: boolean;
  onClose: () => void;
};

/** One account: profile and actions, roles, sessions, passkeys, linked providers, second factors and pending codes. */
export function UserSheet({ id, enabled, console: hasConsole, consoleDeclared, onClose }: Props) {
  const detail = useAuthUser(id, enabled);
  const d = detail.data;
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()} title={d?.user.email ?? "Account"} meta={id ?? undefined} width="lg" flush>
      {!id ? null : detail.error && !d ? (
        <div className="p-4">
          <ProblemPanel error={detail.error} scope="ops" console={consoleDeclared} meta={`GET /ops/auth/users/${id}`} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
        </div>
      ) : !d ? (
        <SkeletonLines lines={10} className="p-5" />
      ) : (
        <UserBody d={d} hasConsole={hasConsole} onDeleted={onClose} refetching={detail.isFetching} onRefetch={() => void detail.refetch()} />
      )}
    </Sheet>
  );
}

function UserBody({ d, hasConsole, onDeleted, refetching, onRefetch }: { d: OpsUserDetail; hasConsole: boolean; onDeleted: () => void; refetching: boolean; onRefetch: () => void }) {
  const u = d.user;
  const now = useNow(5000);
  const router = useRouter();
  const devApp = useDevApp(hasConsole);
  const verify = useVerifyEmail();
  const ban = useBanUser();
  const unban = useUnbanUser();
  const del = useDeleteUser();
  const grant = useGrantRole();
  const revoke = useRevokeRole();
  const revokeSessions = useRevokeSessions();
  const revokeSession = useRevokeSession();
  const removePasskey = useRemovePasskey();
  const removeIdentity = useRemoveIdentity();
  const enroll = useEnrollTOTP();
  const resetMFA = useResetMFA();
  const impersonate = useImpersonate();

  const [banning, setBanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [impersonation, setImpersonation] = useState<OpsImpersonation | undefined>();
  const [enrollment, setEnrollment] = useState<OpsTOTPEnrollment | undefined>();

  const options = grantableRoles(devApp.data?.permissions, u.roles);
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  useEffect(() => {
    if (role && role !== "__other" && !options.some((o) => o.name === role)) setRole("");
  }, [options, role]);
  const roleToGrant = role === "__other" || options.length === 0 ? customRole.trim() : role;
  const ids = { id: u.id, email: u.email };

  return (
    <div className="grid gap-4 p-5">
      {/* Profile and actions */}
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={u.email_verified ? "ok" : "warn"}>{u.email_verified ? "verified" : "unverified"}</Badge>
          <UserBadges user={u} reason={false} />
          {d.mfa.totp && <Badge tone="info">2FA</Badge>}
          {u.roles.map((r) => (
            <RoleChip key={r} role={r} />
          ))}
          <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={onRefetch} loading={refetching} className="ml-auto">
            Refresh
          </Button>
        </div>
        <KeyList
          rows={[
            { k: "ID", v: <span className="font-mono">{u.id}</span> },
            { k: "Created", v: `${when(u.created_at)} · ${ago(u.created_at, now)}` },
            { k: "Sign-in", v: u.has_password ? "password" : "a linked provider only (no password until they reset one)" },
            ...(u.banned_at ? [{ k: "Banned", v: <span className="text-danger">{`${when(u.banned_at)}${u.banned_reason ? ` · ${u.banned_reason}` : ""}`}</span> }] : []),
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          {!u.email_verified && (
            <Button size="sm" kind="secondary" icon={<UserCheck size={11} />} onClick={() => verify.mutate(ids)} loading={verify.isPending}>
              Verify email
            </Button>
          )}
          {u.banned_at ? (
            <Button size="sm" kind="secondary" icon={<ShieldCheck size={11} />} onClick={() => unban.mutate(ids)} loading={unban.isPending}>
              Unban
            </Button>
          ) : (
            <Button size="sm" kind="secondary" icon={<Ban size={11} />} onClick={() => setBanning(true)}>
              Ban
            </Button>
          )}
          <Button size="sm" kind="secondary" icon={<VenetianMask size={11} />} onClick={() => impersonate.mutate({ ...ids, mfa_verified: mfaVerified }, { onSuccess: setImpersonation })} loading={impersonate.isPending} disabled={Boolean(u.banned_at)}>
            Act as user
          </Button>
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <Checkbox checked={mfaVerified} onCheckedChange={(v) => setMfaVerified(v === true)} aria-label="Count the session as verified with a second factor" />
            as MFA-verified
          </label>
          <Button size="sm" kind="danger" icon={<Trash2 size={11} />} onClick={() => setDeleting(true)} className="ml-auto">
            Delete
          </Button>
        </div>
        {!hasConsole && <p className="font-mono text-[10.5px] text-dim">Act as user works only while the app runs with the dev console (orb dev).</p>}
      </div>

      {/* Roles */}
      <Panel title="Roles" meta="platform roles · the address must be verified">
        <div className="grid gap-2.5">
          <div className="flex flex-wrap gap-1">
            {revocableRoles(u.roles).length === 0 ? <span className="font-mono text-[11px] text-faint">none granted</span> : revocableRoles(u.roles).map((r) => <RoleChip key={r} role={r} onRemove={() => revoke.mutate({ id: u.id, role: r })} removing={revoke.isPending && revoke.variables?.role === r} />)}
          </div>
          <div className="flex items-center gap-1.5">
            {options.length > 0 && (
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="h-7 w-[220px]" aria-label="Role to grant">
                <option value="">Grant a role…</option>
                {options.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name} · {o.description}
                  </option>
                ))}
                <option value="__other">Other…</option>
              </Select>
            )}
            {(role === "__other" || options.length === 0) && <Input mono value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="role name" aria-label="Role name" className="h-7 w-[180px]" />}
            <Button size="sm" kind="secondary" icon={<Plus size={11} />} disabled={!roleToGrant || !u.email_verified} loading={grant.isPending} onClick={() => grant.mutate({ id: u.id, role: roleToGrant }, { onSuccess: () => { setRole(""); setCustomRole(""); } })}>
              Grant
            </Button>
          </div>
          {!u.email_verified && <span className="font-mono text-[10.5px] text-warn">Verify the address first; the app refuses roles on an unverified one.</span>}
          {hasConsole && devApp.data && options.length === 0 && revocableRoles(u.roles).length > 0 && <span className="font-mono text-[10.5px] text-dim">every declared role is granted</span>}
        </div>
      </Panel>

      {/* Sessions */}
      <Panel
        title="Sessions"
        meta={`${d.sessions.length} signed-in device${d.sessions.length === 1 ? "" : "s"}`}
        actions={
          <Button size="sm" kind="ghost" icon={<LogOut size={11} />} onClick={() => setRevokingAll(true)} disabled={d.sessions.length === 0}>
            Revoke all
          </Button>
        }
        flush
      >
        <Table<AuthSession>
          rows={d.sessions}
          rowKey={(s) => s.id}
          dense
          columns={[
            {
              key: "s",
              header: "Session",
              cell: (s) => (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-text">
                    <Dot tone={Date.parse(s.last_seen_at) > now - 5 * 60_000 ? "ok" : "muted"} />
                    {s.id}
                    {s.mfa_verified && <Badge tone="info">2FA</Badge>}
                  </div>
                  <div className="mt-0.5 pl-4 text-[11px] text-dim" title={s.user_agent}>
                    {shortUserAgent(s.user_agent)}
                    {s.ip ? ` · ${s.ip}` : ""}
                  </div>
                </div>
              ),
            },
            { key: "l", header: <span className="whitespace-nowrap">Last seen</span>, width: "100px", cell: (s) => <span className="font-mono text-dim tnum" title={s.last_seen_at}>{ago(s.last_seen_at, now)}</span> },
            { key: "e", header: "Expires", width: "100px", cell: (s) => <span className="font-mono text-dim tnum" title={s.expires_at}>{ago(s.expires_at, now)}</span> },
            {
              key: "a",
              header: "",
              width: "80px",
              align: "right",
              cell: (s) => (
                <Button size="sm" kind="ghost" onClick={() => revokeSession.mutate({ id: u.id, sessionId: s.id })} loading={revokeSession.isPending && revokeSession.variables?.sessionId === s.id}>
                  Revoke
                </Button>
              ),
            },
          ]}
          empty={<Empty title="No sessions" hint="The person isn't signed in anywhere; Act as user starts one." />}
        />
      </Panel>

      {/* Passkeys and identities */}
      <div className="grid grid-cols-2 gap-3">
        <Panel title="Passkeys" meta={String(d.passkeys.length)} flush>
          {d.passkeys.length === 0 ? (
            <Empty title="No passkeys" hint="Registered from the person's own devices." />
          ) : (
            <ul>
              {d.passkeys.map((p) => (
                <li key={p.id} className="flex items-center gap-2 border-t border-hairline px-4 py-2 first:border-0">
                  <Fingerprint size={12} className="text-dim" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-text">
                      {p.name} {p.backed_up && <Badge tone="muted">synced</Badge>}
                    </div>
                    <div className="font-mono text-[10.5px] text-dim">{p.last_used_at ? `used ${ago(p.last_used_at, now)}` : "never used"} · added {when(p.created_at)}</div>
                  </div>
                  <Button size="sm" kind="ghost" onClick={() => removePasskey.mutate({ id: u.id, passkeyId: p.id, name: p.name })} loading={removePasskey.isPending && removePasskey.variables?.passkeyId === p.id}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Linked providers" meta={String(d.identities.length)} flush>
          {d.identities.length === 0 ? (
            <Empty title="No linked accounts" hint="Google, Apple or GitHub, linked by the person." />
          ) : (
            <ul>
              {d.identities.map((i) => (
                <li key={i.id} className="flex items-center gap-2 border-t border-hairline px-4 py-2 first:border-0">
                  <Badge tone="violet">{i.provider}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-text">
                      {i.name || i.email || i.id}
                      {i.private_email && <Badge tone="muted">relay</Badge>}
                    </div>
                    <div className="truncate font-mono text-[10.5px] text-dim">
                      {i.email ?? "no address"} · {i.last_used_at ? `used ${ago(i.last_used_at, now)}` : "never used"}
                    </div>
                  </div>
                  <Button size="sm" kind="ghost" icon={<Link2Off size={11} />} onClick={() => removeIdentity.mutate({ id: u.id, identityId: i.id, provider: i.provider })} loading={removeIdentity.isPending && removeIdentity.variables?.identityId === i.id}>
                    Unlink
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* MFA */}
      <Panel
        title="Second factors"
        meta="mfa"
        actions={
          <>
            <Button size="sm" kind="secondary" icon={<KeyRound size={11} />} onClick={() => enroll.mutate(ids, { onSuccess: setEnrollment })} loading={enroll.isPending} disabled={d.mfa.totp}>
              Enroll authenticator
            </Button>
            <Button size="sm" kind="ghost" icon={<ShieldOff size={11} />} onClick={() => setResetting(true)} disabled={!d.mfa.totp && d.mfa.passkeys === 0 && d.mfa.recovery_codes === 0}>
              Reset
            </Button>
          </>
        }
      >
        <KeyList
          rows={[
            { k: "Authenticator app", v: <Badge tone={d.mfa.totp ? "ok" : "muted"}>{d.mfa.totp ? "on" : "off"}</Badge> },
            { k: "Recovery codes", v: <span className="font-mono tnum">{d.mfa.recovery_codes} unused</span> },
            { k: "Passkeys", v: <span className="font-mono tnum">{d.mfa.passkeys}</span> },
          ]}
        />
      </Panel>

      {/* Codes */}
      <Panel
        title="Pending codes"
        meta="the code itself only arrives by email"
        actions={
          <Link href="/mail" className="flex items-center gap-1 whitespace-nowrap font-mono text-[11px] text-primary hover:underline">
            <Mail size={11} /> open the inbox
          </Link>
        }
        flush
      >
        <Table<OpsCode>
          rows={d.codes}
          rowKey={(c) => c.id}
          dense
          columns={[
            { key: "p", header: "Purpose", cell: (c) => <span className="text-text">{codePurpose(c.purpose)}</span> },
            { key: "a", header: "Attempts", width: "80px", cell: (c) => <span className="font-mono text-dim tnum">{c.attempts}/{c.max_attempts}</span> },
            { key: "c", header: "Sent", width: "90px", cell: (c) => <span className="font-mono text-dim tnum" title={c.created_at}>{ago(c.created_at, now)}</span> },
            {
              key: "e",
              header: "Expiry",
              width: "130px",
              cell: (c) => {
                const s = codeState(c, now);
                return (
                  <Badge tone={s.tone} mono={false}>
                    {s.label}
                  </Badge>
                );
              },
            },
          ]}
          empty={<Empty title="No usable codes" hint="A sign-up or a password reset creates one; it lands in the local inbox." />}
        />
      </Panel>

      {/* Dialogs */}
      <ReasonDialog
        open={banning}
        onOpenChange={setBanning}
        title={`Ban ${u.email}?`}
        description="Every session and API key is revoked at once, and every sign-in answers 403 account_banned until the ban is lifted. Revoked API keys stay revoked after an unban."
        confirmLabel="Ban"
        danger
        required={false}
        loading={ban.isPending}
        onConfirm={(reason) => ban.mutate({ ...ids, reason }, { onSettled: () => setBanning(false) })}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${u.email}?`}
        description="What the owner's own deletion does, without their password: sessions and keys revoked, providers unlinked, the data removed after the retention period. A sole owner of an organisation is refused (409 sole_owner)."
        confirmLabel="Delete"
        danger
        confirmText={u.email}
        loading={del.isPending}
        onConfirm={() => del.mutate(ids, { onSuccess: onDeleted, onSettled: () => setDeleting(false) })}
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title={`Reset the second factors of ${u.email}?`}
        description="Removes the authenticator app, every passkey and the recovery codes, and ends every session: for a person locked out. Roles that require a second factor stop applying until they enroll again."
        confirmLabel="Reset"
        danger
        loading={resetMFA.isPending}
        onConfirm={() => resetMFA.mutate(ids, { onSettled: () => setResetting(false) })}
      />
      <ConfirmDialog
        open={revokingAll}
        onOpenChange={setRevokingAll}
        title={`End every session of ${u.email}?`}
        description={`${d.sessions.length} device${d.sessions.length === 1 ? " is" : "s are"} signed in; each has to sign in again.`}
        confirmLabel="Revoke all"
        danger
        loading={revokeSessions.isPending}
        onConfirm={() => revokeSessions.mutate(ids, { onSettled: () => setRevokingAll(false) })}
      />
      <ImpersonationDialog result={impersonation} onClose={() => setImpersonation(undefined)} onUseInRoutes={() => { if (impersonation) storeBearerToken(impersonation.token, impersonation.user.email); setImpersonation(undefined); router.push("/routes"); }} />
      <EnrollmentDialog result={enrollment} email={u.email} onClose={() => setEnrollment(undefined)} />
    </div>
  );
}

/* ---------- Shown-once secrets ---------- */

function ImpersonationDialog({ result, onClose, onUseInRoutes }: { result?: OpsImpersonation; onClose: () => void; onUseInRoutes: () => void }) {
  return (
    <Dialog
      open={Boolean(result)}
      onOpenChange={(o) => !o && onClose()}
      title={result ? `Acting as ${result.user.email}` : "Acting as user"}
      description="A session started by the operator, audited as auth.user.impersonated. The token is shown once; send it as Authorization: Bearer."
      footer={
        <>
          {result && <CopyButton text={result.token} label="Copy token" />}
          <Button size="sm" kind="primary" onClick={onUseInRoutes}>
            Use in Routes
          </Button>
        </>
      }
    >
      {result && (
        <div className="grid gap-3">
          <Code className="whitespace-pre-wrap break-all">{result.token}</Code>
          <KeyList
            rows={[
              { k: "Session", v: <span className="font-mono">{result.session.id}</span> },
              { k: "Expires", v: when(result.session.expires_at) },
              { k: "MFA verified", v: <Badge tone={result.mfa_verified ? "ok" : "muted"}>{result.mfa_verified ? "yes" : "no"}</Badge> },
            ]}
          />
          <p className="text-[11px] text-dim">Use in Routes fills the request builder&apos;s bearer token for this tab; GET /v1/auth/me then answers as {result.user.email}.</p>
        </div>
      )}
    </Dialog>
  );
}

function EnrollmentDialog({ result, email, onClose }: { result?: OpsTOTPEnrollment; email: string; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(result)}
      onOpenChange={(o) => !o && onClose()}
      title={`Authenticator app on for ${email}`}
      description="The secret and the recovery codes are shown once, as seed data shows the administrator's. Hand them over now, or reset later."
      footer={
        <>
          {result && <CopyButton text={`secret: ${result.secret}\n${result.uri}\nrecovery codes:\n${result.recovery_codes.join("\n")}`} label="Copy everything" />}
          <Button size="sm" kind="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {result && (
        <div className="grid gap-3">
          <Field label="Secret" htmlFor="totp-secret">
            <div className="flex items-center gap-1.5">
              <Input id="totp-secret" mono readOnly value={result.secret} className="flex-1" />
              <CopyButton text={result.secret} />
            </div>
          </Field>
          <div className="grid gap-1">
            <Label>otpauth URI</Label>
            <Code className="whitespace-pre-wrap break-all">{result.uri}</Code>
          </div>
          <div className="grid gap-1">
            <Label>Recovery codes · {result.recovery_codes.length}</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border bg-elevated px-3 py-2 font-mono text-[12px] text-text">
              {result.recovery_codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
