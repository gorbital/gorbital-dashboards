"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, ChevronDown, GitBranchPlus, GitMerge, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Dialog } from "@gorbital/dash/components/dialog";
import { Dropdown } from "@gorbital/dash/components/dropdown";
import { Field, Input, Select, Switch } from "@gorbital/dash/components/input";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table, type Column } from "@gorbital/dash/components/table";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { errorMessage } from "@/lib/api/errors";
import { useCreateBranch, useDeleteBranch, useGitBranches, useSwitchBranch, useUnmergedCommits, type GitBranch, type GitStatus } from "@/lib/api/git";
import { branchNameError, localName } from "@/lib/git/branch";
import { CommitList, Hash, RefChip } from "./common";
import { MergeSheet } from "./merge";

/** Local branches with upstream, ahead/behind, merged and the last commit; remote names; New, Switch, Merge into current, Delete. */
export function BranchesTab({ status }: { status: GitStatus | undefined }) {
  const branches = useGitBranches();
  const switchTo = useSwitchBranch();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<GitBranch | undefined>();
  const [merging, setMerging] = useState<string | undefined>();
  const current = branches.data?.branches.find((b) => b.current)?.name ?? status?.branch ?? "";
  const list = branches.data?.branches ?? [];

  const columns: Column<GitBranch>[] = [
    {
      key: "name",
      header: "Branch",
      cell: (b) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className={`max-w-[240px] truncate font-mono text-[12px] ${b.current ? "font-semibold text-text" : "text-text"}`}>{b.name}</span>
          {b.current && <Badge tone="accent">current</Badge>}
          {!b.current && b.merged && (
            <Tooltip content={`Merged into ${current}: deleting it loses nothing`}>
              <span>
                <Badge tone="ok">merged</Badge>
              </span>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      key: "upstream",
      header: "Upstream",
      cell: (b) =>
        b.upstream ? (
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted">{b.upstream}</span>
            {b.ahead > 0 && <Badge tone="accent">↑ {b.ahead}</Badge>}
            {b.behind > 0 && <Badge tone="warn">↓ {b.behind}</Badge>}
          </span>
        ) : (
          <span className="text-[11px] text-dim">—</span>
        ),
    },
    {
      key: "last",
      header: "Last commit",
      cell: (b) => (
        <span className="flex min-w-0 items-center gap-2">
          <Hash hash={b.head} short={b.head} />
          <span className="min-w-0 truncate text-[12px] text-muted">{b.subject}</span>
        </span>
      ),
      // Takes what the other columns leave and truncates, so the table never scrolls sideways.
      className: "w-full max-w-0",
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "150px",
      cell: (b) =>
        b.current ? null : (
          <span className="flex items-center justify-end gap-1">
            <Button size="sm" kind="ghost" icon={<ArrowLeftRight size={11} />} onClick={() => switchTo.mutate(b.name)} loading={switchTo.isPending && switchTo.variables === b.name} disabled={switchTo.isPending}>
              Switch
            </Button>
            <Dropdown
              trigger={
                <Button size="sm" kind="ghost" className="px-1.5" aria-label={`More for ${b.name}`}>
                  <ChevronDown size={12} />
                </Button>
              }
              items={[
                { label: `Merge into ${current}`, icon: <GitMerge size={12} />, onSelect: () => setMerging(b.name), disabled: Boolean(status?.state) },
                "separator",
                { label: "Delete branch…", icon: <Trash2 size={12} />, onSelect: () => setDeleting(b), danger: true },
              ]}
            />
          </span>
        ),
    },
  ];

  return (
    <div className="grid gap-4">
      <Panel
        flush
        title="Local branches"
        meta={branches.data ? String(list.length) : undefined}
        actions={
          <Button size="sm" kind="primary" icon={<GitBranchPlus size={11} />} onClick={() => setCreating(true)}>
            New branch
          </Button>
        }
      >
        {branches.error && !branches.data ? (
          <div className="px-4 pb-3 text-[12px] text-danger">{errorMessage(branches.error)}</div>
        ) : (
          <Table<GitBranch> columns={columns} rows={list} rowKey={(b) => b.name} loading={branches.isPending} dense empty={<Empty title="No branches" hint="A repository without a commit has no branch yet." />} />
        )}
      </Panel>
      <Panel title="Remote branches" meta={branches.data ? String(branches.data.remote.length) : undefined}>
        {branches.isPending ? (
          <SkeletonLines lines={2} />
        ) : branches.data?.remote.length ? (
          <div className="flex flex-wrap gap-1.5">
            {branches.data.remote.map((r) => (
              <RefChip key={r} name={r} />
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-dim">No remote branches: add a remote and fetch, or push to create one.</div>
        )}
      </Panel>
      <NewBranchDialog open={creating} onClose={() => setCreating(false)} current={current} local={list.map((b) => b.name)} remote={branches.data?.remote ?? []} />
      <DeleteBranchDialog branch={deleting} onClose={() => setDeleting(undefined)} />
      <MergeSheet branch={merging} current={current} onClose={() => setMerging(undefined)} />
    </div>
  );
}

/** Name (validated as the backend does), the start point (current or another branch), and whether to switch to it. */
function NewBranchDialog({ open, onClose, current, local, remote }: { open: boolean; onClose: () => void; current: string; local: string[]; remote: string[] }) {
  const create = useCreateBranch();
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [checkout, setCheckout] = useState(true);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setName("");
      setFrom("");
      setCheckout(true);
      setTouched(false);
    }
  }, [open]);
  const error = branchNameError(name) ?? (local.includes(name) ? `A branch named ${name} already exists.` : undefined);
  const submit = () => {
    setTouched(true);
    if (error) return;
    create.mutate({ name, from, checkout }, { onSuccess: onClose });
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="New branch"
      description={`git branch ${name || "<name>"}${from ? ` ${from}` : ""}${checkout ? ` && git switch ${name || "<name>"}` : ""}`}
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button kind="primary" size="sm" onClick={submit} loading={create.isPending} disabled={Boolean(error) && touched}>
            {checkout ? "Create and switch" : "Create"}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name" htmlFor="branch-name" error={touched ? error : undefined} hint={!touched || !error ? "letters, digits, . _ - and /; no .., no trailing /" : undefined}>
          <Input id="branch-name" mono autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} placeholder="feature/name" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="From" htmlFor="branch-from" hint={from ? (remote.includes(from) ? "a remote branch: the new one starts where it is" : "") : `the current branch (${current}) at its HEAD`}>
          <Select id="branch-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">{current} (current)</option>
            {local
              .filter((b) => b !== current)
              .map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            {remote.length > 0 && (
              <optgroup label="Remote">
                {remote.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        {remote.includes(from) && !name && (
          <button type="button" className="justify-self-start text-[11px] text-primary hover:underline" onClick={() => setName(localName(from))}>
            Name it {localName(from)}
          </button>
        )}
        <Field inline label="Switch to it after creating" htmlFor="branch-checkout" hint="git refuses the switch when local changes would be lost">
          <Switch id="branch-checkout" checked={checkout} onCheckedChange={setCheckout} />
        </Field>
      </form>
    </Dialog>
  );
}

/** First fetches the commits deleting the branch would lose; offers "Delete anyway (force)" only when there are some. */
function DeleteBranchDialog({ branch, onClose }: { branch: GitBranch | undefined; onClose: () => void }) {
  const del = useDeleteBranch();
  const unmerged = useUnmergedCommits(branch?.name);
  const lost = unmerged.data?.commits ?? [];
  const loading = Boolean(branch) && unmerged.isPending;
  const [refusal, setRefusal] = useState<string | undefined>();
  useEffect(() => setRefusal(undefined), [branch]);
  const run = (force: boolean) =>
    branch &&
    del.mutate(
      { name: branch.name, force },
      {
        onSuccess: onClose,
        onError: (err) => setRefusal(errorMessage(err)),
      },
    );
  return (
    <Dialog
      open={Boolean(branch)}
      onOpenChange={(o) => !o && onClose()}
      title={branch ? `Delete ${branch.name}?` : ""}
      description={
        loading
          ? "Checking what the branch has that the current one doesn't…"
          : unmerged.error
            ? errorMessage(unmerged.error)
            : lost.length
              ? `${lost.length} commit${lost.length === 1 ? " is" : "s are"} only on this branch. Deleting it with force loses them (until git's reflog expires).`
              : "Every commit on this branch is on the current one too: deleting it loses nothing."
      }
      footer={
        <>
          <Button kind="ghost" size="sm" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          {lost.length > 0 ? (
            <Button kind="danger" size="sm" icon={<Trash2 size={11} />} onClick={() => run(true)} loading={del.isPending} disabled={loading}>
              Delete anyway (force)
            </Button>
          ) : (
            <Button kind="danger" size="sm" icon={<Check size={11} />} onClick={() => run(false)} loading={del.isPending} disabled={loading || Boolean(unmerged.error)}>
              Delete
            </Button>
          )}
        </>
      }
    >
      {lost.length > 0 && (
        <div className="grid gap-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-danger">Commits that would be lost</div>
          <CommitList commits={lost} max={20} />
        </div>
      )}
      {refusal && <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-[11px] text-danger">{refusal}</pre>}
    </Dialog>
  );
}
