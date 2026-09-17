"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ExternalLink, GitBranch, GitMerge, RefreshCw } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Sheet } from "@gorbital/dash/components/sheet";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { errorMessage } from "@/lib/api/errors";
import { isGitRefused, useOpenInEditor, useRemoteAction, type GitRemoteResult, type GitStatus, type RemoteAction } from "@/lib/api/git";
import { describeCounts, describeState } from "@/lib/git/status";
import { Hash } from "./common";

type Outcome = { action: RemoteAction; result?: GitRemoteResult; error?: unknown };

const labels: Record<RemoteAction, string> = { fetch: "Fetch", pull: "Pull", push: "Push" };

/** The repository at a glance: branch, upstream, ahead/behind, the operation in progress, counts; Fetch, Pull and Push with their result sheet. */
export function StatusHeader({ status, loading }: { status: GitStatus | undefined; loading: boolean }) {
  const [outcome, setOutcome] = useState<Outcome | undefined>();
  const fetch = useRemoteAction("fetch");
  const pull = useRemoteAction("pull");
  const push = useRemoteAction("push");
  const run = (action: RemoteAction) => {
    const m = { fetch, pull, push }[action];
    m.mutate(undefined, {
      onSuccess: (result) => setOutcome({ action, result }),
      onError: (error) => setOutcome({ action, error }),
    });
  };
  const busy = fetch.isPending || pull.isPending || push.isPending;
  const state = describeState(status?.state);
  return (
    <>
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch size={14} className="shrink-0 text-primary" />
          {status ? (
            <>
              <span className="truncate font-mono text-[13px] font-semibold text-text">{status.branch}</span>
              {status.detached && <Badge tone="warn">detached HEAD</Badge>}
              {status.upstream ? (
                <span className="truncate font-mono text-[11px] text-dim">→ {status.upstream}</span>
              ) : (
                !status.detached && <span className="font-mono text-[11px] text-dim">no upstream</span>
              )}
            </>
          ) : (
            <Skeleton className="h-3.5 w-28" />
          )}
        </div>
        {status && (
          <div className="flex items-center gap-1.5">
            <Tooltip content={status.ahead ? `${status.ahead} commit${status.ahead === 1 ? "" : "s"} to push` : "nothing to push"}>
              <span>
                <Badge tone={status.ahead ? "accent" : "muted"}>↑ {status.ahead}</Badge>
              </span>
            </Tooltip>
            <Tooltip content={status.behind ? `${status.behind} commit${status.behind === 1 ? "" : "s"} to pull` : "nothing to pull"}>
              <span>
                <Badge tone={status.behind ? "warn" : "muted"}>↓ {status.behind}</Badge>
              </span>
            </Tooltip>
            {state && (
              <Badge tone="warn">
                <GitMerge size={10} /> {state}
              </Badge>
            )}
          </div>
        )}
        {status && (
          <div className="flex items-center gap-2 font-mono text-[11px] text-dim">
            <span>{describeCounts(status)}</span>
            <span>·</span>
            <Hash hash={status.head} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" icon={<RefreshCw size={11} />} onClick={() => run("fetch")} loading={fetch.isPending} disabled={busy || loading}>
            Fetch
          </Button>
          <Button size="sm" icon={<ArrowDownToLine size={11} />} onClick={() => run("pull")} loading={pull.isPending} disabled={busy || loading || Boolean(status?.detached)}>
            Pull{status?.behind ? ` ${status.behind}` : ""}
          </Button>
          <Button size="sm" kind={status?.ahead ? "primary" : "secondary"} icon={<ArrowUpFromLine size={11} />} onClick={() => run("push")} loading={push.isPending} disabled={busy || loading || Boolean(status?.detached)}>
            Push{status?.ahead ? ` ${status.ahead}` : ""}
          </Button>
        </div>
      </div>
      <RemoteResultSheet outcome={outcome} onClose={() => setOutcome(undefined)} />
    </>
  );
}

/** What git said: the output of a fetch, pull, push or merge, a refusal in red, and the files a pull left conflicted. */
export function RemoteResultSheet({ outcome, onClose, title }: { outcome: Outcome | undefined; onClose: () => void; title?: string }) {
  const open = useOpenInEditor();
  const refused = outcome?.error !== undefined && isGitRefused(outcome.error);
  const output = outcome?.result?.output ?? "";
  const conflicts = outcome?.result?.conflicts ?? [];
  return (
    <Sheet
      open={Boolean(outcome)}
      onOpenChange={(o) => !o && onClose()}
      title={title ?? (outcome ? labels[outcome.action] : "")}
      meta={outcome ? `POST git/${outcome.action}` : undefined}
      description={outcome?.error ? (refused ? "git refused; its message is below." : "The request failed.") : conflicts.length ? `Left ${conflicts.length} conflicted file${conflicts.length === 1 ? "" : "s"}: resolve them, stage each, then commit.` : "git's output, as it was printed."}
      width="lg"
    >
      {outcome && (
        <div className="grid gap-3">
          {outcome.error !== undefined && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <pre className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.6]">{errorMessage(outcome.error)}</pre>
            </div>
          )}
          {output.trim() ? <Code className="max-h-[50vh] whitespace-pre-wrap text-text">{output.trimEnd()}</Code> : outcome.error === undefined && <div className="text-[12px] text-dim">git printed nothing: nothing to do.</div>}
          {conflicts.length > 0 && (
            <div className="grid gap-1.5">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-danger">Conflicts</div>
              {conflicts.map((p) => (
                <div key={p} className="flex items-center gap-2 rounded-lg border border-danger/25 bg-danger/5 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text">{p}</span>
                  <Button size="sm" kind="ghost" icon={<ExternalLink size={11} />} onClick={() => open.mutate({ path: p })} loading={open.isPending && open.variables?.path === p}>
                    Open in editor
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
