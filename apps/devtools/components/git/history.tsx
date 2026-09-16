"use client";

import { useMemo, useState } from "react";
import { ChevronDown, GitCommitHorizontal, GitMerge } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { KeyList, Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { Sheet } from "@gorbital/dash/components/sheet";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { series } from "@gorbital/dash/theme";
import { errorMessage } from "@/lib/api/errors";
import { useGitLog, type GitCommit, type GitStatus } from "@/lib/api/git";
import { assignLanes, graphWidth, type GraphRow } from "@/lib/git/graph";
import { relativeTime } from "@/lib/git/time";
import { when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { CopyButton } from "@/components/jobs/plan-diff";
import { RefChip } from "./common";

const ROW = 34;
const COL = 14;
const PAGE = 50;

/** The log with a lane graph (SVG from the parents), refs as chips, author, relative time and subject; a commit opens its detail; Load more; current branch or all. */
export function HistoryTab({ status }: { status: GitStatus | undefined }) {
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<GitCommit | undefined>();
  const log = useGitLog({ all, limit: PAGE });
  const now = useNow(30_000);
  const commits = useMemo(() => log.data?.pages.flatMap((p) => p.commits) ?? [], [log.data]);
  const rows = useMemo(() => assignLanes(commits), [commits]);
  const width = graphWidth(rows);
  const current = status?.branch;
  const byHash = useMemo(() => new Map(commits.map((c) => [c.hash, c])), [commits]);

  return (
    <Panel
      flush
      title="History"
      meta={log.data ? `${commits.length} commit${commits.length === 1 ? "" : "s"}${log.hasNextPage ? "+" : ""}` : undefined}
      actions={<Segmented<"current" | "all"> value={all ? "all" : "current"} onChange={(v) => setAll(v === "all")} options={[{ value: "current", label: current ? current : "Current branch" }, { value: "all", label: "All branches" }]} />}
    >
      {log.isPending ? (
        <SkeletonLines lines={8} className="p-4" />
      ) : log.error && !log.data ? (
        <div className="px-4 pb-3 text-[12px] text-danger">{errorMessage(log.error)}</div>
      ) : commits.length === 0 ? (
        <Empty title="No commits yet" hint="The first commit starts the history." />
      ) : (
        <div className="border-t border-hairline">
          <div className="flex">
            <Graph rows={rows} width={width} />
            <ul className="min-w-0 flex-1">
              {commits.map((c, i) => (
                <li key={c.hash} style={{ height: ROW }} className="flex min-w-0 items-center gap-2 border-b border-hairline pr-4 last:border-0">
                  <button type="button" onClick={() => setSelected(c)} className="flex h-full min-w-0 flex-1 items-center gap-2 text-left hover:bg-elevated/40">
                    {c.refs.map((r) => (
                      <RefChip key={r} name={r} current={r === current} />
                    ))}
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text">{c.subject}</span>
                    {rows[i]?.merge && (
                      <Tooltip content={`merge: ${c.parents.length} parents`}>
                        <GitMerge size={11} className="shrink-0 text-dim" />
                      </Tooltip>
                    )}
                    <span className="hidden shrink-0 truncate text-[11px] text-dim md:inline">{c.author}</span>
                    <Tooltip content={when(c.time)}>
                      <span className="w-[92px] shrink-0 text-right text-[11px] text-dim">{relativeTime(c.time, now)}</span>
                    </Tooltip>
                    <span className="w-[60px] shrink-0 text-right font-mono text-[11px] text-dim tnum">{c.short}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {log.hasNextPage && (
            <div className="flex justify-center border-t border-hairline p-2">
              <Button size="sm" kind="ghost" icon={<ChevronDown size={11} />} onClick={() => void log.fetchNextPage()} loading={log.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
      <CommitSheet commit={selected} onClose={() => setSelected(undefined)} onSelect={(h) => byHash.get(h) && setSelected(byHash.get(h))} current={current} known={byHash} />
    </Panel>
  );
}

/** The lanes as one SVG beside the rows: a dot per commit, straight lines down a lane, curves where a lane joins or forks. */
function Graph({ rows, width }: { rows: GraphRow[]; width: number }) {
  const w = width * COL + COL;
  const x = (lane: number) => COL / 2 + 6 + lane * COL;
  const color = (i: number) => series[i % series.length];
  return (
    <svg width={w} height={rows.length * ROW} className="shrink-0" aria-hidden="true">
      {rows.map((r, i) => {
        const y = i * ROW + ROW / 2;
        return (
          <g key={r.hash}>
            {r.edges.map((e, j) => {
              const x1 = x(e.from);
              const x2 = x(e.to);
              const y2 = y + ROW;
              const d = x1 === x2 ? `M${x1} ${y} L${x2} ${y2}` : `M${x1} ${y} C${x1} ${y + ROW / 2}, ${x2} ${y + ROW / 2}, ${x2} ${y2}`;
              return <path key={j} d={d} stroke={color(e.color)} strokeWidth={1.5} fill="none" strokeOpacity={0.85} />;
            })}
          </g>
        );
      })}
      {rows.map((r, i) => {
        const y = i * ROW + ROW / 2;
        return r.merge ? (
          <circle key={r.hash} cx={x(r.lane)} cy={y} r={3.5} fill="var(--color-surface)" stroke={color(r.color)} strokeWidth={1.5} />
        ) : (
          <circle key={r.hash} cx={x(r.lane)} cy={y} r={3.5} fill={color(r.color)} />
        );
      })}
    </svg>
  );
}

/** One commit: subject, body, author, when, the hash with Copy, the parents (clickable when loaded), refs. */
function CommitSheet({ commit, onClose, onSelect, current, known }: { commit: GitCommit | undefined; onClose: () => void; onSelect: (hash: string) => void; current?: string; known: Map<string, GitCommit> }) {
  const now = useNow(30_000);
  return (
    <Sheet open={Boolean(commit)} onOpenChange={(o) => !o && onClose()} title={commit?.subject ?? ""} meta={commit?.short} width="lg">
      {commit && (
        <div className="grid gap-4">
          {commit.refs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {commit.refs.map((r) => (
                <RefChip key={r} name={r} current={r === current} />
              ))}
            </div>
          )}
          <KeyList
            rows={[
              { k: "Author", v: `${commit.author} <${commit.email}>` },
              { k: "When", v: `${when(commit.time)} · ${relativeTime(commit.time, now)}` },
              {
                k: "Hash",
                v: (
                  <span className="flex items-center gap-2">
                    <span className="truncate">{commit.hash}</span>
                    <CopyButton text={commit.hash} label="Copy" />
                  </span>
                ),
              },
              {
                k: commit.parents.length === 1 ? "Parent" : "Parents",
                v: commit.parents.length ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {commit.parents.map((p) => (
                      <button key={p} type="button" className={`inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] ${known.has(p) ? "text-text hover:border-border-2" : "cursor-default text-dim"}`} onClick={() => onSelect(p)} title={known.has(p) ? known.get(p)?.subject : "not loaded: Load more first"}>
                        <GitCommitHorizontal size={10} /> {p.slice(0, 7)}
                      </button>
                    ))}
                  </span>
                ) : (
                  "— (root commit)"
                ),
              },
            ]}
          />
          <section className="grid gap-1.5">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Message</div>
            <Code className="whitespace-pre-wrap text-text">{commit.body ? `${commit.subject}\n\n${commit.body}` : commit.subject}</Code>
          </section>
        </div>
      )}
    </Sheet>
  );
}
