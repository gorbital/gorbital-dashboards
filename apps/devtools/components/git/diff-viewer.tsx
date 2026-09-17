"use client";

import { useMemo } from "react";
import { ArrowRight, ExternalLink, FileWarning, Minus, Plus, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { errorMessage } from "@/lib/api/errors";
import { useGitDiff, useGitPatch, useGitPaths, useOpenInEditor, type GitFile } from "@/lib/api/git";
import { hunkPatch, parseUnifiedDiff, type DiffFile, type DiffHunk } from "@/lib/git/diff";
import { CopyButton } from "@/components/jobs/plan-diff";
import { StatusLetter } from "./common";

type Props = {
  file: GitFile;
  /** The index against HEAD (`true`) or the working tree against the index. */
  staged: boolean;
  onSide: (staged: boolean) => void;
  onDiscard: () => void;
  onSelect: (path: string | null, staged: boolean) => void;
};

/**
 * One file's unified diff: old and new line numbers, added and removed
 * lines in the theme's colours, Stage hunk / Unstage hunk per hunk
 * (`POST git/patch` with the file header and that hunk), Stage / Unstage /
 * Discard for the file; notes for binary, untracked and conflicted files.
 */
export function DiffViewer({ file, staged, onSide, onDiscard }: Props) {
  const side: "staged" | "unstaged" = staged ? "staged" : "unstaged";
  const diff = useGitDiff(file.path, staged);
  const patch = useGitPatch();
  const stage = useGitPaths("stage");
  const unstage = useGitPaths("unstage");
  const open = useOpenInEditor();
  const parsed = useMemo(() => (diff.data ? parseUnifiedDiff(diff.data.patch) : []), [diff.data]);
  const parsedFile: DiffFile | undefined = parsed[0];
  const hasStaged = file.staged && !file.conflict;
  const hasUnstaged = file.unstaged || file.untracked || file.conflict;
  const both = hasStaged && hasUnstaged;
  const letter = staged ? file.index : file.conflict ? "U" : file.untracked ? "?" : file.worktree;
  const hunkable = Boolean(diff.data && !diff.data.binary && !diff.data.untracked && !file.conflict && parsedFile && parsedFile.hunks.length > 0);

  const applyHunk = (h: DiffHunk) => {
    if (!parsedFile) return;
    patch.mutate({ patch: hunkPatch(parsedFile, h), reverse: staged });
  };

  return (
    <Panel
      flush
      title={
        <span className="flex min-w-0 items-center gap-2">
          <StatusLetter letter={letter} />
          <span className="min-w-0 truncate font-mono text-[12px] font-medium">
            {file.old_path ? (
              <>
                <span className="text-dim">{file.old_path}</span> <ArrowRight size={10} className="inline text-dim" /> {file.path}
              </>
            ) : (
              file.path
            )}
          </span>
        </span>
      }
      meta={diff.data && !diff.data.binary ? `+${diff.data.additions} −${diff.data.deletions}` : undefined}
    >
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5">
        {both && <Segmented<"unstaged" | "staged"> value={side} onChange={(v) => onSide(v === "staged")} options={[{ value: "unstaged", label: "Unstaged" }, { value: "staged", label: "Staged" }]} />}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" kind="ghost" icon={<ExternalLink size={11} />} onClick={() => open.mutate({ path: file.path })} loading={open.isPending}>
            Open
          </Button>
          {staged ? (
            <Button size="sm" icon={<Minus size={11} />} onClick={() => unstage.mutate([file.path])} loading={unstage.isPending}>
              Unstage file
            </Button>
          ) : (
            <Button size="sm" icon={<Plus size={11} />} onClick={() => stage.mutate([file.path])} loading={stage.isPending}>
              {file.conflict ? "Mark resolved" : "Stage file"}
            </Button>
          )}
          {(!staged || !hasUnstaged) && (
            <Button size="sm" kind="danger" icon={<Trash2 size={11} />} onClick={onDiscard}>
              Discard
            </Button>
          )}
        </span>
      </div>
      <div className="border-t border-hairline">
        {diff.isPending ? (
          <SkeletonLines lines={8} className="p-4" />
        ) : diff.error ? (
          <div className="p-4 text-[12px] text-danger">{errorMessage(diff.error)}</div>
        ) : !diff.data ? null : (
          <>
            {file.conflict && (
              <Note tone="danger" icon={<FileWarning size={13} />}>
                Conflicted. Resolve the <span className="font-mono">&lt;&lt;&lt;&lt;&lt;&lt;&lt;</span> markers in your editor, then Mark resolved; the combined diff below shows both sides.
              </Note>
            )}
            {diff.data.untracked && <Note tone="ok">Untracked: the whole file, shown as an addition. Stage it to track it, or Discard to delete it.</Note>}
            {diff.data.binary && <Note tone="muted">Binary file: git has no text diff to show. Stage or discard it as a whole.</Note>}
            {!diff.data.binary && diff.data.patch === "" && <div className="p-4 text-[12px] text-dim">No {side} changes in this file.</div>}
            {diff.data.binary && <Code className="m-3 text-text">{diff.data.patch.trimEnd()}</Code>}
            {file.conflict && diff.data.patch && (
              <Code className="m-3 max-h-[60vh] text-text">
                {diff.data.patch
                  .split("\n")
                  .map((l, i) => (
                    <span key={i} className={l.startsWith("++<<<<<<<") || l.startsWith("++=======") || l.startsWith("++>>>>>>>") ? "text-danger" : l.startsWith("+") ? "text-ok" : l.startsWith("-") ? "text-danger" : undefined}>
                      {l}
                      {"\n"}
                    </span>
                  ))}
              </Code>
            )}
            {!file.conflict && !diff.data.binary && parsedFile && parsedFile.hunks.length > 0 && (
              <div className="overflow-auto font-mono text-[11.5px] leading-[1.6]">
                {parsedFile.hunks.map((h, i) => (
                  <div key={i}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-y border-hairline bg-elevated/90 px-3 py-1 text-[10.5px] text-info backdrop-blur">
                      <span className="min-w-0 flex-1 truncate">{h.header}</span>
                      <span className="text-dim tnum">
                        +{h.additions} −{h.deletions}
                      </span>
                      {hunkable && (
                        <Button size="sm" kind="ghost" className="h-6 px-1.5 text-[10.5px]" icon={staged ? <Minus size={10} /> : <Plus size={10} />} onClick={() => applyHunk(h)} loading={patch.isPending && patch.variables?.patch === hunkPatch(parsedFile, h)}>
                          {staged ? "Unstage hunk" : "Stage hunk"}
                        </Button>
                      )}
                    </div>
                    {h.lines.map((l, j) => (
                      <div key={j} className={`grid grid-cols-[3.4em_3.4em_1em_1fr] px-2 ${l.type === "add" ? "bg-ok/10 text-ok" : l.type === "del" ? "bg-danger/10 text-danger" : l.type === "meta" ? "text-dim italic" : "text-muted"}`}>
                        <span className="select-none pr-1 text-right text-dim tnum">{l.oldNo ?? ""}</span>
                        <span className="select-none pr-1 text-right text-dim tnum">{l.newNo ?? ""}</span>
                        <span className="select-none">{l.type === "add" ? "+" : l.type === "del" ? "−" : " "}</span>
                        <span className="whitespace-pre">{l.type === "meta" ? l.text : l.text}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {!diff.data.binary && diff.data.patch !== "" && (
              <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-1.5">
                <span className="text-[11px] text-dim">
                  {parsedFile?.hunks.length ?? 0} hunk{parsedFile?.hunks.length === 1 ? "" : "s"}
                  {parsedFile?.renamed && (
                    <>
                      {" · "}
                      <Badge tone="violet">renamed</Badge>
                    </>
                  )}
                </span>
                <CopyButton text={diff.data.patch} label="Copy diff" />
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

function Note({ tone, icon, children }: { tone: "ok" | "muted" | "danger"; icon?: React.ReactNode; children: React.ReactNode }) {
  const cls = { ok: "border-ok/25 bg-ok/5 text-ok", muted: "border-border bg-elevated/40 text-muted", danger: "border-danger/30 bg-danger/10 text-danger" }[tone];
  return (
    <div className={`m-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[12px] ${cls}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
