"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, KeyRound, Plus, ShieldOff, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { ConfirmDialog, Dialog } from "@gorbital/dash/components/dialog";
import { Field, Input, Select, Textarea } from "@gorbital/dash/components/input";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { isOperatorRefused, useCreateApiKey, useCreateServiceAccount, useDeleteServiceAccount, useRevokeApiKey, useServiceAccountKeys, useServiceAccounts, type ApiKey, type ServiceAccount } from "@/lib/api/project";
import { useCapabilities } from "@/lib/api/queries";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { CopyButton } from "@/components/jobs/plan-diff";
import { ProblemPanel } from "@/components/shared/problem-panel";

const EXPIRIES: { value: number; label: string }[] = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days (the default maximum)" },
];

/** API and service-account keys from the ops API: the accounts, each one's keys, create and revoke. */
export function KeysSection() {
  const caps = useCapabilities();
  const accounts = useServiceAccounts(caps.ops);
  const create = useCreateServiceAccount();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roles, setRoles] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <KeyRound size={13} className="text-primary" /> Keys
        </span>
      }
      meta="service accounts and their API keys · /ops/service-accounts"
      actions={
        caps.ops &&
        !accounts.error && (
          <Button size="sm" kind="secondary" icon={<Plus size={11} />} onClick={() => setCreating(true)}>
            New service account
          </Button>
        )
      }
    >
      {!caps.status.data ? (
        <SkeletonLines lines={3} />
      ) : !caps.ops ? (
        <Empty title={caps.running ? "This app has no ops API" : `App ${caps.status.data.app.state}`} hint={caps.running ? "Service accounts live in the auth module of a Full app." : "Keys are read from the running app's ops API."} />
      ) : accounts.error && isOperatorRefused(accounts.error) ? (
        <div className="grid gap-2 text-[12px] text-muted">
          <div className="flex items-center gap-2 text-text">
            <ShieldOff size={13} className="text-warn" /> The app refused the dev operator on /ops/service-accounts.
          </div>
          <div>
            The auth module wants a signed-in principal for service accounts (a platform administrator&apos;s session), and the development operator orb dev sends isn&apos;t one. List and manage keys with an admin session, or through <span className="font-mono text-text">POST /v1/auth/api-keys</span> for a user&apos;s own keys.
          </div>
          <div className="font-mono text-[11px] text-dim">
            {(accounts.error as ApiError).status} {(accounts.error as ApiError).code}: {(accounts.error as ApiError).detail}
          </div>
        </div>
      ) : accounts.error ? (
        <ProblemPanel error={accounts.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/service-accounts" onRetry={() => void accounts.refetch()} retrying={accounts.isFetching} />
      ) : accounts.isPending || !accounts.data ? (
        <SkeletonLines lines={3} />
      ) : accounts.data.length === 0 ? (
        <Empty title="No service accounts" hint="A service account is a non-human principal with platform roles; programs authenticate with its API keys." />
      ) : (
        <div className="grid gap-1">
          {accounts.data.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </div>
      )}
      <Dialog
        open={creating}
        onOpenChange={(o) => !create.isPending && setCreating(o)}
        title="New service account"
        description="A non-human principal with platform roles. Roles that require two-factor authentication can't be given."
        footer={
          <>
            <Button size="sm" kind="ghost" onClick={() => setCreating(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              kind="primary"
              loading={create.isPending}
              onClick={async () => {
                if (!name.trim()) {
                  setFieldError("name is required");
                  return;
                }
                setFieldError(undefined);
                try {
                  await create.mutateAsync({ name: name.trim(), description: description.trim() || undefined, roles: roles.split(",").map((r) => r.trim()).filter(Boolean) });
                  setCreating(false);
                  setName("");
                  setDescription("");
                  setRoles("");
                } catch (err) {
                  if (err instanceof ApiError && err.status === 422) setFieldError(err.detail);
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name" htmlFor="sa-name" hint="up to 100 characters" error={fieldError}>
            <Input id="sa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Billing sync" autoFocus />
          </Field>
          <Field label="Description" htmlFor="sa-desc" hint="optional, up to 500 characters">
            <Textarea id="sa-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Platform roles" htmlFor="sa-roles" hint="comma-separated, such as ops_viewer; empty for none">
            <Input id="sa-roles" mono value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="ops_viewer" />
          </Field>
        </div>
      </Dialog>
    </Panel>
  );
}

function AccountRow({ account }: { account: ServiceAccount }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteServiceAccount();
  const now = useNow();
  return (
    <div className="rounded-lg border border-hairline bg-bg/40">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? <ChevronDown size={12} className="shrink-0 text-dim" /> : <ChevronRight size={12} className="shrink-0 text-dim" />}
          <span className="whitespace-nowrap text-[12.5px] text-text">{account.name}</span>
          <span className="font-mono text-[10.5px] text-dim">{account.id}</span>
          {account.disabled && <Badge tone="warn">disabled</Badge>}
          {(account.roles ?? []).map((r) => (
            <Badge key={r} tone="info">
              {r}
            </Badge>
          ))}
        </button>
        <span className="text-[11px] text-dim">created {ago(account.created_at, now)}</span>
        <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => setConfirmDelete(true)} loading={remove.isPending}>
          Delete
        </Button>
      </div>
      {account.description && <div className="px-3 pb-2 text-[11.5px] text-muted">{account.description}</div>}
      {open && <KeysTable account={account} />}
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${account.name}`} description="Every key of this service account stops working at once." confirmLabel="Delete" danger loading={remove.isPending} onConfirm={async () => { await remove.mutateAsync(account.id).catch(() => undefined); setConfirmDelete(false); }} />
    </div>
  );
}

function KeysTable({ account }: { account: ServiceAccount }) {
  const keys = useServiceAccountKeys(account.id, true);
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [scopes, setScopes] = useState("");
  const [shown, setShown] = useState<{ key: string; name: string } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const tone = (k: ApiKey) => (k.status === "active" ? "ok" : k.status === "expired" ? "warn" : "muted");

  return (
    <div className="border-t border-hairline px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">API keys</span>
        <Button size="sm" kind="secondary" icon={<Plus size={11} />} onClick={() => setCreating(true)} disabled={account.disabled}>
          New key
        </Button>
      </div>
      {keys.error ? (
        <div className="text-[11.5px] text-danger">{errorMessage(keys.error)}</div>
      ) : keys.isPending || !keys.data ? (
        <SkeletonLines lines={2} />
      ) : keys.data.length === 0 ? (
        <div className="text-[11.5px] text-dim">no keys yet</div>
      ) : (
        <div className="grid gap-1">
          {keys.data.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-2 text-[11.5px]">
              <Badge tone={tone(k)}>{k.status}</Badge>
              <span className="text-text">{k.name}</span>
              <span className="font-mono text-[10.5px] text-dim">{k.prefix}…</span>
              {(k.scopes ?? []).length > 0 ? (
                <span className="text-dim">scopes {(k.scopes ?? []).join(", ")}</span>
              ) : (
                <span className="text-dim">all of the account&apos;s permissions</span>
              )}
              <span className="ml-auto text-dim">
                {k.status === "revoked" && k.revoked_at ? `revoked ${ago(k.revoked_at, now)}` : `expires ${when(k.expires_at)}`}
                {k.last_used_at ? ` · used ${ago(k.last_used_at, now)}` : " · never used"}
              </span>
              {k.status === "active" && (
                <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => setRevoking(k)} loading={revoke.isPending && revoke.variables?.keyId === k.id}>
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <Dialog
        open={creating}
        onOpenChange={(o) => !create.isPending && setCreating(o)}
        title={`New key for ${account.name}`}
        description="The key is shown once. Programs send it as Authorization: Bearer <key>."
        footer={
          <>
            <Button size="sm" kind="ghost" onClick={() => setCreating(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              kind="primary"
              loading={create.isPending}
              onClick={async () => {
                if (!name.trim()) {
                  setError("name is required");
                  return;
                }
                setError(undefined);
                try {
                  const r = await create.mutateAsync({ id: account.id, body: { name: name.trim(), expires_at: new Date(Date.now() + days * 86_400_000).toISOString(), scopes: scopes.split(",").map((s) => s.trim()).filter(Boolean) } });
                  setCreating(false);
                  setName("");
                  setScopes("");
                  setShown({ key: r.key, name: r.api_key.name });
                } catch (err) {
                  if (err instanceof ApiError) setError(err.detail);
                }
              }}
            >
              Create key
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name" htmlFor="ak-name" error={error}>
            <Input id="ak-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CI deploys" autoFocus />
          </Field>
          <Field label="Expires in" htmlFor="ak-exp" hint="at least an hour away, at most auth.api_key_max_ttl">
            <Select id="ak-exp" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
              {EXPIRIES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scopes" htmlFor="ak-scopes" hint="comma-separated permissions; empty: all of the account's permissions except those needing two-factor authentication">
            <Input id="ak-scopes" mono value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="ops.audit.read, ops.settings.read" />
          </Field>
        </div>
      </Dialog>
      <Dialog open={shown !== null} onOpenChange={(o) => !o && setShown(null)} title={`Key ${shown?.name ?? ""}`} description="Store it now: it isn't shown again." footer={<CopyButton text={shown?.key ?? ""} label="Copy key" kind="primary" />}>
        <Code className="break-all text-text">{shown?.key}</Code>
      </Dialog>
      <ConfirmDialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)} title={`Revoke ${revoking?.name ?? ""}`} description="The key stops working at once." confirmLabel="Revoke" danger loading={revoke.isPending} onConfirm={async () => { if (revoking) await revoke.mutateAsync({ id: account.id, keyId: revoking.id }).catch(() => undefined); setRevoking(null); }} />
    </div>
  );
}
