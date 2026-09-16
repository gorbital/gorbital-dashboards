"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, GitCommitHorizontal, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Field, Input, Textarea } from "@gorbital/dash/components/input";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { useGitCommit, useGitDiff, useGitPaths, type GitFile, type GitStatus } from "@/lib/api/git";
import { joinMessage } from "@/lib/git/message";
import { splitFiles, type ChangeEntry } from "@/lib/git/status";
import { describeStat } from "@/lib/git/diff";
import { StatusLetter } from "./common";
import { DiffViewer } from "./diff-viewer";

type Props = {
  status: GitStatus | undefined;
  /** The selected file and which side of the index is shown. */
  path: string | null;
  staged: boolean;
  onSelect: (path: string | null, staged: boolean) => void;
};

/** Staged and Changes (with untracked files and conflicts), the diff viewer for the selected file, and the commit box. */
export function ChangesTab({ status, path, staged, onSelect }: Props) {
  const { staged: stagedList, changes } = useMemo(() => splitFiles(status?.files ?? []), [status]);
  const [discarding, setDiscarding] = useState<GitFile | undefined>();
  const stage = useGitPaths("stage");
  const unstage = useGitPaths("unstage");
  const file = status?.files.find((f) => f.path === path);

  // A selection that vanished (committed, discarded, or the side emptied) moves on: the other side, or nothing.
  useEffect(() => {
    if (!status || !path) return;
    if (!file) return onSelect(null, false);
    const hasStaged = file.staged && !file.conflict;
    const hasUnstaged = file.unstaged || file.untracked || file.conflict;
    if (staged && !hasStaged && hasUnstaged) onSelect(path, false);
    else if (!staged && !hasUnstaged && hasStaged) onSelect(path, true);
    else if (!hasStaged && !hasUnstaged) onSelect(null, false);
  }, [status, path, staged, file, onSelect]);

  if (!status) {
    return (
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="Changes">
          <SkeletonLines lines={5} />
        </Panel>
        <Panel title="Diff">
          <SkeletonLines lines={8} />
        </Panel>
      </div>
    );
  }

  const selectedKey = path ? `${staged ? "s" : "u"}:${path}` : undefined;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="grid gap-4">
        <Panel
          flush
          title="Staged"
          meta={String(stagedList.length)}
          actions={
            stagedList.length > 0 && (
              <Button size="sm" kind="ghost" icon={<Minus size={11} />} onClick={() => unstage.mutate(stagedList.map((e) => e.file.path))} loading={unstage.isPending}>
                Unstage all
              </Button>
            )
          }
        >
          <FileList entries={stagedList} selected={selectedKey} onSelect={(e) => onSelect(e.file.path, true)} empty="Nothing staged." actions={(e) => <RowActions entry={e} onStage={() => stage.mutate([e.file.path])} onUnstage={() => unstage.mutate([e.file.path])} onDiscard={() => setDiscarding(e.file)} />} />
        </Panel>
        <Panel
          flush
          title="Changes"
          meta={String(changes.length)}
          actions={
            changes.length > 0 && (
              <Button size="sm" kind="ghost" icon={<Plus size={11} />} onClick={() => stage.mutate(changes.map((e) => e.file.path))} loading={stage.isPending}>
                Stage all
              </Button>
            )
          }
        >
          <FileList entries={changes} selected={selectedKey} onSelect={(e) => onSelect(e.file.path, false)} empty={stagedList.length ? "Everything is staged." : "The working tree is clean."} actions={(e) => <RowActions entry={e} onStage={() => stage.mutate([e.file.path])} onUnstage={() => unstage.mutate([e.file.path])} onDiscard={() => setDiscarding(e.file)} />} />
        </Panel>
        <CommitBox status={status} />
      </div>
      {file ? (
        <DiffViewer file={file} staged={staged} onSide={(s) => onSelect(file.path, s)} onDiscard={() => setDiscarding(file)} onSelect={onSelect} />
      ) : (
        <Panel title="Diff">
          <Empty title={status.files.length ? "Select a file" : "Nothing to show"} hint={status.files.length ? "The diff appears here; stage or unstage it by file or by hunk." : "Edit something in the app and it shows up on the left."} />
        </Panel>
      )}
      <DiscardDialog file={discarding} onClose={() => setDiscarding(undefined)} onDone={() => discarding?.path === path && onSelect(null, false)} />
    </div>
  );
}

function FileList({ entries, selected, onSelect, empty, actions }: { entries: ChangeEntry[]; selected?: string; onSelect: (e: ChangeEntry) => void; empty: string; actions: (e: ChangeEntry) => React.ReactNode }) {
  if (!entries.length) return <div className="px-4 pb-3 text-[12px] text-dim">{empty}</div>;
  return (
    <ul className="pb-1">
      {entries.map((e) => {
        const key = `${e.side === "staged" ? "s" : "u"}:${e.file.path}`;
        const active = key === selected;
        return (
          <li key={key} className={`group flex items-center gap-2 px-3 py-1 transition-colors hover:bg-elevated/50 ${active ? "bg-elevated/70" : ""}`}>
            <button type="button" onClick={() => onSelect(e)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-current={active || undefined}>
              <StatusLetter letter={e.letter} />
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text">
                {e.file.old_path && e.letter === "R" ? (
                  <>
                    <span className="text-dim">{e.file.old_path}</span> <ArrowRight size={10} className="inline text-dim" /> {e.file.path}
                  </>
                ) : (
                  e.file.path
                )}
              </span>
            </button>
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{actions(e)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function RowActions({ entry, onStage, onUnstage, onDiscard }: { entry: ChangeEntry; onStage: () => void; onUnstage: () => void; onDiscard: () => void }) {
  if (entry.side === "staged") {
    return (
      <Tooltip content="Unstage">
        <Button size="sm" kind="ghost" className="h-6 px-1.5" aria-label={`Unstage ${entry.file.path}`} onClick={onUnstage}>
          <Minus size={11} />
        </Button>
      </Tooltip>
    );
  }
  return (
    <>
      <Tooltip content={entry.file.conflict ? "Mark resolved (stage)" : "Stage"}>
        <Button size="sm" kind="ghost" className="h-6 px-1.5" aria-label={`Stage ${entry.file.path}`} onClick={onStage}>
          {entry.file.conflict ? <Check size={11} /> : <Plus size={11} />}
        </Button>
      </Tooltip>
      <Tooltip content={entry.file.untracked ? "Delete the untracked file" : "Discard changes"}>
        <Button size="sm" kind="ghost" className="h-6 px-1.5 hover:text-danger" aria-label={`Discard ${entry.file.path}`} onClick={onDiscard}>
          <Trash2 size={11} />
        </Button>
      </Tooltip>
    </>
  );
}

/** Subject and body; Enter in the subject or ⌘Enter anywhere commits. Enabled while something is staged (or a merge without conflicts waits for its commit). */
export function CommitBox({ status }: { status: GitStatus }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const commit = useGitCommit();
  const merging = status.state === "merging";
  const canCommit = status.staged > 0 && status.conflicts === 0 && subject.trim().length > 0;
  useEffect(() => {
    if (merging && !subject) setSubject("Merge branch");
    // Only pre-fill once, when a merge starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merging]);
  const submit = () => {
    if (!canCommit || commit.isPending) return;
    commit.mutate(joinMessage(subject, body), {
      onSuccess: () => {
        setSubject("");
        setBody("");
      },
    });
  };
  const onKey = (e: KeyboardEvent, subjectField: boolean) => {
    if (e.key === "Enter" && (subjectField ? !e.shiftKey : e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };
  const long = subject.length > 72;
  return (
    <Panel title={merging ? "Commit the merge" : "Commit"} meta={status.staged ? `${status.staged} staged` : "nothing staged"}>
      <div className="grid gap-2.5">
        <Field label="Subject" htmlFor="git-subject" hint={<span className={long ? "text-warn" : undefined}>{subject.length}/72{long ? " · git shows long subjects cut" : ""}</span>}>
          <Input id="git-subject" value={subject} onChange={(e) => setSubject(e.target.value)} onKeyDown={(e) => onKey(e, true)} placeholder="What this commit does" autoComplete="off" disabled={commit.isPending} />
        </Field>
        <Field label="Body" htmlFor="git-body" hint="optional · ⌘⏎ commits">
          <Textarea id="git-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => onKey(e, false)} placeholder="Why, and anything the subject doesn't say" disabled={commit.isPending} />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-dim">{status.conflicts ? "Resolve the conflicts first." : status.staged ? "Records the index; unstaged changes stay." : "Stage a file or a hunk to enable."}</span>
          <Button kind="primary" size="sm" icon={<GitCommitHorizontal size={11} />} onClick={submit} disabled={!canCommit} loading={commit.isPending}>
            {merging ? "Commit merge" : `Commit${status.staged ? ` ${status.staged} file${status.staged === 1 ? "" : "s"}` : ""}`}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** Confirms a discard with what it loses: the diff's summary, both sides of the index. */
function DiscardDialog({ file, onClose, onDone }: { file: GitFile | undefined; onClose: () => void; onDone: () => void }) {
  const discard = useGitPaths("discard");
  const unstagedDiff = useGitDiff(file?.path, false);
  const stagedDiff = useGitDiff(file && file.staged && !file.untracked ? file.path : undefined, true);
  const loading = unstagedDiff.isPending && Boolean(file);
  const additions = (unstagedDiff.data?.additions ?? 0) + (stagedDiff.data?.additions ?? 0);
  const deletions = (unstagedDiff.data?.deletions ?? 0) + (stagedDiff.data?.deletions ?? 0);
  const what = !file ? "" : file.untracked ? `This deletes the untracked file ${file.path} (${unstagedDiff.data?.additions ?? "…"} lines). It isn't in git, so nothing can bring it back.` : file.conflict ? `This throws away the merge's changes to ${file.path} and restores it from HEAD.` : `This throws away ${loading ? "…" : describeStat(additions, deletions)} in ${file.path}${file.staged ? ", staged and unstaged" : ""}. There is no undo.`;
  return (
    <ConfirmDialog
      open={Boolean(file)}
      onOpenChange={(o) => !o && onClose()}
      title={file ? (file.untracked ? `Delete ${file.path}?` : `Discard changes to ${file.path}?`) : ""}
      description={what}
      confirmLabel={file?.untracked ? "Delete file" : "Discard changes"}
      danger
      loading={discard.isPending}
      onConfirm={() =>
        file &&
        discard.mutate([file.path], {
          onSuccess: () => {
            onDone();
            onClose();
          },
        })
      }
    />
  );
}
