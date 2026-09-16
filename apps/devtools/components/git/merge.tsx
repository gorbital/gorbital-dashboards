"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink, FastForward, GitMerge, XCircle } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Panel } from "@gorbital/dash/components/panel";
import { Sheet } from "@gorbital/dash/components/sheet";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { errorMessage } from "@/lib/api/errors";
import { useAbortMerge, useGitConflicts, useGitMerge, useGitPaths, useMergePreview, useOpenInEditor, type GitMergePreview, type GitRemoteResult, type GitStatus } from "@/lib/api/git";
import { CommitList } from "./common";

/** `merge/preview` for a branch (commits, files, fast-forward or merge commit, conflicts in red), then Merge and its result. */
export function MergeSheet({ branch, current, onClose }: { branch: string | undefined; current: string; onClose: () => void }) {
  const preview = useMergePreview(branch);
  const merge = useGitMerge();
  const [result, setResult] = useState<GitRemoteResult | undefined>();
  const [refusal, setRefusal] = useState<string | undefined>();
  /** The preview as it was when Merge was pressed: the query refetches after the merge and would say "up to date". */
  const [frozen, setFrozen] = useState<GitMergePreview | undefined>();
  useEffect(() => {
    setResult(undefined);
    setRefusal(undefined);
    setFrozen(undefined);
  }, [branch]);
  const p = frozen ?? preview.data;
  const run = () => {
    if (!branch) return;
    setFrozen(preview.data);
    merge.mutate(branch, {
      onSuccess: setResult,
      onError: (err) => {
        setFrozen(undefined);
        setRefusal(errorMessage(err));
      },
    });
  };
  return (
    <Sheet
      open={Boolean(branch)}
      onOpenChange={(o) => !o && onClose()}
      title={`Merge ${branch ?? ""} into ${current}`}
      meta={`GET git/merge/preview?branch=${branch ?? ""}`}
      description={result ? (result.conflicts?.length ? "Merged with conflicts: resolve them in the editor, stage each file, then commit." : "Merged.") : "What the merge would do, without touching the working tree (git merge-tree)."}
      width="lg"
      footer={
        result ? (
          <Button kind="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button kind="ghost" size="sm" onClick={onClose} disabled={merge.isPending}>
              Cancel
            </Button>
            <Button kind={p?.conflicts.length ? "danger" : "primary"} size="sm" icon={<GitMerge size={11} />} onClick={run} loading={merge.isPending} disabled={!p || p.up_to_date}>
              {p?.conflicts.length ? `Merge with ${p.conflicts.length} conflict${p.conflicts.length === 1 ? "" : "s"}` : p?.fast_forward ? "Fast-forward" : "Merge"}
            </Button>
          </>
        )
      }
    >
      {preview.isPending && !p ? (
        <SkeletonLines lines={6} />
      ) : preview.error && !p ? (
        <div className="grid gap-2 text-[12px]">
          <div className="text-danger">{errorMessage(preview.error)}</div>
          <div className="text-dim">The preview needs Git 2.38 or newer (git merge-tree --write-tree); merging still works without it.</div>
        </div>
      ) : p ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {p.up_to_date ? (
              <Badge tone="muted">
                <Check size={10} /> already up to date
              </Badge>
            ) : p.fast_forward ? (
              <Badge tone="ok">
                <FastForward size={10} /> fast-forward
              </Badge>
            ) : (
              <Badge tone="info">
                <GitMerge size={10} /> merge commit
              </Badge>
            )}
            {p.conflicts.length > 0 && (
              <Badge tone="danger">
                <AlertTriangle size={10} /> {p.conflicts.length} conflict{p.conflicts.length === 1 ? "" : "s"}
              </Badge>
            )}
            <span className="text-[11px] text-dim">
              {p.commits.length} commit{p.commits.length === 1 ? "" : "s"} · {p.files.length} file{p.files.length === 1 ? "" : "s"}
            </span>
          </div>
          {!p.up_to_date && (
            <>
              <section className="grid gap-1.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Commits</div>
                <CommitList commits={p.commits} max={30} />
              </section>
              <section className="grid gap-1.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Files</div>
                <ul className="grid gap-0.5 font-mono text-[11.5px]">
                  {p.files.map((f) => {
                    const conflict = p.conflicts.includes(f);
                    return (
                      <li key={f} className={`flex items-center gap-2 ${conflict ? "text-danger" : "text-text"}`}>
                        {conflict ? <AlertTriangle size={11} className="shrink-0" /> : <span className="w-[11px]" />}
                        <span className="truncate">{f}</span>
                        {conflict && <span className="text-[10.5px]">conflict</span>}
                      </li>
                    );
                  })}
                  {p.conflicts
                    .filter((c) => !p.files.includes(c))
                    .map((f) => (
                      <li key={f} className="flex items-center gap-2 text-danger">
                        <AlertTriangle size={11} className="shrink-0" />
                        <span className="truncate">{f}</span>
                        <span className="text-[10.5px]">conflict</span>
                      </li>
                    ))}
                </ul>
              </section>
            </>
          )}
          {refusal && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              <XCircle size={13} className="mt-0.5 shrink-0" />
              <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.6]">{refusal}</pre>
            </div>
          )}
          {result && (
            <section className="grid gap-1.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">git said</div>
              <Code className="max-h-[40vh] whitespace-pre-wrap text-text">{result.output.trimEnd() || "(nothing)"}</Code>
              {result.conflicts && result.conflicts.length > 0 && <div className="text-[12px] text-danger">Conflicts in: {result.conflicts.join(", ")}. The Conflicts panel on the page lists them with Open in editor and Abort merge.</div>}
            </section>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

/** While a merge is in progress: the conflicted files with Open in editor and Mark resolved, and Abort merge (confirmed: it drops the merge, the commits stay). */
export function ConflictsPanel({ status, onOpenFile }: { status: GitStatus; onOpenFile: (path: string) => void }) {
  const conflicts = useGitConflicts(true);
  const open = useOpenInEditor();
  const stage = useGitPaths("stage");
  const abort = useAbortMerge();
  const [confirming, setConfirming] = useState(false);
  const files = status.files.filter((f) => f.conflict).map((f) => f.path);
  const list = files.length ? files : (conflicts.data?.files ?? []);
  return (
    <>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <GitMerge size={14} className="text-warn" /> {status.state ? `${status.state[0].toUpperCase()}${status.state.slice(1)}` : "Conflicts"}
          </span>
        }
        meta={list.length ? `${list.length} conflicted file${list.length === 1 ? "" : "s"}` : "no conflicts left"}
        actions={
          <Button size="sm" kind="danger" icon={<XCircle size={11} />} onClick={() => setConfirming(true)} disabled={status.state !== "merging"}>
            Abort merge
          </Button>
        }
      >
        <div className="grid gap-2 text-[12px] text-muted">
          <p>{list.length ? "Resolve the markers in each file, then Mark resolved (git add); the Commit box records the merge once no conflict is left." : status.state === "merging" ? "Every conflict is resolved: commit to conclude the merge, or abort it." : "An operation is in progress; finish it in the terminal or abort."}</p>
          {list.length > 0 && (
            <ul className="grid gap-1">
              {list.map((p) => (
                <li key={p} className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/5 px-2.5 py-1.5">
                  <AlertTriangle size={11} className="shrink-0 text-danger" />
                  <button type="button" className="min-w-0 flex-1 truncate text-left font-mono text-[11.5px] text-text hover:underline" onClick={() => onOpenFile(p)}>
                    {p}
                  </button>
                  <Button size="sm" kind="ghost" icon={<ExternalLink size={11} />} onClick={() => open.mutate({ path: p, line: 1 })} loading={open.isPending && open.variables?.path === p}>
                    Open in editor
                  </Button>
                  <Button size="sm" kind="ghost" icon={<Check size={11} />} onClick={() => stage.mutate([p])} loading={stage.isPending && stage.variables?.[0] === p}>
                    Mark resolved
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Abort the merge?"
        description="This drops the merge in progress and puts the working tree back to before it; your commits stay. Changes you made while resolving conflicts are lost."
        confirmLabel="Abort merge"
        danger
        loading={abort.isPending}
        onConfirm={() => abort.mutate(undefined, { onSuccess: () => setConfirming(false) })}
      />
    </>
  );
}
