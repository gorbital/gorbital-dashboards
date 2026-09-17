"use client";

import { GitBranch, GitCommitHorizontal, Tag } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { Panel } from "@gorbital/dash/components/panel";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import type { Tone } from "@gorbital/dash/theme";
import type { GitCommit } from "@/lib/api/git";
import { describeLetter, letterTone } from "@/lib/git/status";
import { relativeTime } from "@/lib/git/time";
import { useNow } from "@/lib/use-now";

/** git's status letter as a badge, with its meaning on hover. */
export function StatusLetter({ letter }: { letter: string }) {
  return (
    <Tooltip content={describeLetter(letter)}>
      <span>
        <Badge tone={letterTone(letter)} className="w-[22px] justify-center font-semibold">
          {letter}
        </Badge>
      </span>
    </Tooltip>
  );
}

/** A ref as `git log --decorate` names it: a branch, `origin/x`, or `tag: v1`. */
export function RefChip({ name, current }: { name: string; current?: boolean }) {
  const tag = name.startsWith("tag: ");
  const remote = !tag && name.includes("/") && /^[^/]+\//.test(name) && (name.startsWith("origin/") || name.startsWith("upstream/"));
  const tone: Tone = current ? "accent" : tag ? "warn" : remote ? "muted" : "info";
  return (
    <Badge tone={tone} className="max-w-[220px]">
      {tag ? <Tag size={10} /> : <GitBranch size={10} />}
      <span className="truncate">{tag ? name.slice(5) : name}</span>
    </Badge>
  );
}

/** A short hash in mono. */
export function Hash({ hash, short }: { hash: string; short?: string }) {
  return (
    <Tooltip content={hash}>
      <span className="font-mono text-[11px] text-dim tnum">{short ?? hash.slice(0, 7)}</span>
    </Tooltip>
  );
}

/** One commit per line: hash, subject, author and when; for previews and confirmations. */
export function CommitList({ commits, empty = "No commits.", max = 50 }: { commits: GitCommit[]; empty?: string; max?: number }) {
  const now = useNow(30_000);
  if (!commits.length) return <div className="px-1 py-2 text-[12px] text-dim">{empty}</div>;
  return (
    <ul className="grid gap-1 text-[12px]">
      {commits.slice(0, max).map((c) => (
        <li key={c.hash} className="flex min-w-0 items-baseline gap-2">
          <GitCommitHorizontal size={11} className="shrink-0 translate-y-px text-dim" />
          <Hash hash={c.hash} short={c.short} />
          <span className="min-w-0 flex-1 truncate text-text">{c.subject}</span>
          <span className="shrink-0 truncate text-[11px] text-dim">
            {c.author} · {relativeTime(c.time, now)}
          </span>
        </li>
      ))}
      {commits.length > max && <li className="text-[11px] text-dim">and {commits.length - max} more</li>}
    </ul>
  );
}

/** What the page shows for 404 `not_a_repository` (or `no_git`): the app directory holds no repository. */
export function NoRepository({ code, detail }: { code: string; detail: string }) {
  const noGit = code === "no_git";
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <GitBranch size={14} className="text-warn" /> {noGit ? "This orb dev runs no git" : "Not a git repository"}
        </span>
      }
      meta={`404 ${code}`}
    >
      <div className="grid max-w-3xl gap-3 text-[12px] text-muted">
        <p>{noGit ? "This orb dev was built without the Git screen's backend, or git isn't installed on this machine. The screen runs your own git in the app directory (ADR-0076)." : "The Git screen works on the directory orb dev runs in, and it isn't a git repository yet. Initialise one and the screen fills in; orb dev needs no restart."}</p>
        <Code>
          <Cmt># in the app directory</Cmt>
          {noGit ? "\n$ git --version\n$ go install ./cli/orb && orb dev" : "\n$ git init\n$ git add -A && git commit -m \"Initial commit\""}
        </Code>
        {detail && <p className="font-mono text-[11px] text-dim">{detail}</p>}
      </div>
    </Panel>
  );
}
