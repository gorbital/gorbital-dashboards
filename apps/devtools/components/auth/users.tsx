"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Plus, Search, UserRound } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Field, Input, Switch } from "@gorbital/dash/components/input";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Table } from "@gorbital/dash/components/table";
import { useAuthUsers, useCreateUser, type CreateUserBody, type OpsUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { mergeUserPages } from "@/lib/auth";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { RoleChip, UserBadges } from "./common";

type Props = {
  enabled: boolean;
  consoleDeclared?: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
};

/** The accounts: search, the table, keyset paging and the "New user" sheet. */
export function Users({ enabled, consoleDeclared, selected, onSelect }: Props) {
  const now = useNow(10_000);
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);
  const users = useAuthUsers(q, enabled);
  const rows = mergeUserPages(users.data?.pages);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Panel
        title="Accounts"
        meta={users.data ? `${rows.length}${users.hasNextPage ? "+" : ""} shown · newest first · /ops/auth/users` : "newest first · /ops/auth/users"}
        actions={
          <>
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="part of an address, or an ID" aria-label="Search accounts" className="h-7 w-[260px] pl-7" />
            </div>
            <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setCreating(true)}>
              New user
            </Button>
          </>
        }
        flush
      >
        {users.error && !users.data ? (
          <div className="p-3">
            <ProblemPanel error={users.error} scope="ops" console={consoleDeclared} meta="GET /ops/auth/users" onRetry={() => void users.refetch()} retrying={users.isFetching} />
          </div>
        ) : (
          <>
            <Table<OpsUser>
              rows={rows}
              rowKey={(u) => u.id}
              loading={users.isPending}
              dense
              selected={selected ?? undefined}
              onRowClick={(u) => onSelect(u.id)}
              columns={[
                {
                  key: "email",
                  header: "Email",
                  cell: (u) => (
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[12px] text-text">
                        <UserRound size={12} className={u.banned_at ? "text-danger" : "text-dim"} />
                        <span className="truncate">{u.email}</span>
                        <UserBadges user={u} reason={false} />
                      </div>
                      <div className="mt-0.5 pl-5 font-mono text-[10.5px] text-dim">{u.id}</div>
                    </div>
                  ),
                },
                { key: "v", header: "Verified", width: "80px", cell: (u) => <Badge tone={u.email_verified ? "ok" : "warn"}>{u.email_verified ? "yes" : "no"}</Badge> },
                {
                  key: "r",
                  header: "Roles",
                  width: "200px",
                  cell: (u) => (u.roles.length ? <span className="flex flex-wrap gap-1">{u.roles.map((r) => <RoleChip key={r} role={r} />)}</span> : <span className="font-mono text-[11px] text-faint">none</span>),
                },
                { key: "p", header: "Sign-in", width: "100px", cell: (u) => <span className="font-mono text-[11px] text-dim">{u.has_password ? "password" : "provider only"}</span> },
                { key: "c", header: "Created", width: "130px", cell: (u) => <span className="whitespace-nowrap font-mono text-dim tnum" title={u.created_at}>{when(u.created_at)}</span> },
                { key: "a", header: "", width: "70px", align: "right", cell: (u) => <span className="font-mono text-[11px] text-faint tnum">{ago(u.created_at, now)}</span> },
              ]}
              empty={<Empty title={q ? `No account matches "${q}"` : "No accounts"} hint={q ? "Search matches part of the address, or a whole ID." : "Create one here, or sign up through the API."} />}
            />
            {users.hasNextPage && (
              <div className="flex justify-center border-t border-hairline p-2">
                <Button size="sm" kind="ghost" icon={<ChevronDown size={11} />} onClick={() => void users.fetchNextPage()} loading={users.isFetchingNextPage}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>
      <NewUserSheet open={creating} onClose={() => setCreating(false)} onCreated={(u) => { setCreating(false); onSelect(u.id); }} />
    </>
  );
}

/* ---------- New user ---------- */

function NewUserSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: OpsUser) => void }) {
  const create = useCreateUser();
  const [form, setForm] = useState<CreateUserBody>({ email: "", password: "", email_verified: true });
  const [error, setError] = useState<{ field?: "email" | "password"; message: string } | undefined>();
  useEffect(() => {
    if (open) {
      setForm({ email: "", password: "", email_verified: true });
      setError(undefined);
    }
  }, [open]);
  const ready = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.password.length >= 12;
  const submit = () => {
    setError(undefined);
    create.mutate(
      { email: form.email.trim(), password: form.password, email_verified: form.email_verified },
      {
        onSuccess: onCreated,
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : "";
          setError({ field: code === "invalid_email" || code === "email_taken" || code === "email_in_use" ? "email" : code === "weak_password" ? "password" : undefined, message: errorMessage(err) });
        },
      },
    );
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="New user"
      meta="POST /ops/auth/users"
      description="As orb dev's seed data does: an account with a password, verified or waiting for its code."
      width="sm"
      footer={
        <>
          <Button size="sm" kind="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button size="sm" kind="primary" onClick={submit} disabled={!ready} loading={create.isPending}>
            Create
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) submit();
        }}
      >
        <Field label="Email" htmlFor="new-email" error={error?.field === "email" ? error.message : undefined}>
          <Input id="new-email" type="email" autoFocus mono value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ada@example.com" autoComplete="off" />
        </Field>
        <Field label="Password" htmlFor="new-password" hint="At least 12 characters; the person can change it after signing in." error={error?.field === "password" ? error.message : undefined}>
          <Input id="new-password" type="text" mono value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="correct horse battery staple" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Email verified" htmlFor="new-verified" inline hint={form.email_verified ? "No verification code; the address counts as confirmed, so roles can be granted at once." : "A verification code lands in the local inbox (Mail)."}>
          <Switch id="new-verified" checked={Boolean(form.email_verified)} onCheckedChange={(v) => setForm({ ...form, email_verified: v })} />
        </Field>
        {error && !error.field && <p className="text-[12px] text-danger">{error.message}</p>}
      </form>
    </Sheet>
  );
}
