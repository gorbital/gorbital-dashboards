"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle, ChevronRight, FileCode2, History, MoreHorizontal, Star, Trash2, BookTemplate, Pencil } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Dropdown } from "@gorbital/dash/components/dropdown";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { fmtAgo, fmtMs } from "@gorbital/dash/lib/format";
import type { HistoryEntry, RunMode, Snippet, Template } from "@/lib/api/sql";
import { useNow } from "@/lib/use-now";

export type TreeSelection = { kind: "snippet" | "template"; name: string } | { kind: "history" | "scratch" };

type Props = {
  snippets?: Snippet[];
  snippetsLoading: boolean;
  snippetsError?: string;
  templates?: Template[];
  history?: HistoryEntry[];
  historyMax?: number;
  selected: TreeSelection;
  onOpenSnippet: (s: Snippet) => void;
  onOpenTemplate: (t: Template) => void;
  onOpenHistory: (h: HistoryEntry) => void;
  onToggleFavorite: (s: Snippet) => void;
  onRename: (s: Snippet) => void;
  onDelete: (s: Snippet) => void;
  onClearHistory: () => void;
  onNew: () => void;
};

/** The left pane: favourites, the project's db/queries, the built-in templates and the run history. */
export function SnippetTree(p: Props) {
  const favorites = p.snippets?.filter((s) => s.favorite) ?? [];
  const selectedName = p.selected.kind === "snippet" ? p.selected.name : undefined;
  const row = (s: Snippet) => (
    <SnippetRow key={s.name} snippet={s} active={selectedName === s.name} onOpen={() => p.onOpenSnippet(s)} onToggleFavorite={() => p.onToggleFavorite(s)} onRename={() => p.onRename(s)} onDelete={() => p.onDelete(s)} />
  );
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <Section title="Favorites" count={favorites.length} defaultOpen>
        {p.snippetsLoading ? <Rows /> : favorites.length === 0 ? <Hint>Star a snippet to keep it here.</Hint> : favorites.map(row)}
      </Section>
      <Section
        title="Project"
        meta="db/queries"
        count={p.snippets?.length}
        defaultOpen
        actions={
          <Tooltip content="New scratch query">
            <button type="button" onClick={p.onNew} className="grid h-5 w-5 place-items-center rounded text-dim hover:bg-elevated hover:text-text" aria-label="New query">
              <FileCode2 size={12} />
            </button>
          </Tooltip>
        }
      >
        {p.snippetsLoading ? (
          <Rows />
        ) : p.snippetsError ? (
          <Hint tone="danger">{p.snippetsError}</Hint>
        ) : p.snippets?.length === 0 ? (
          <Hint>No saved queries yet. Save one and it lands in db/queries/&lt;name&gt;.sql, committed with the app.</Hint>
        ) : (
          p.snippets?.map(row)
        )}
      </Section>
      <Section title="Templates" count={p.templates?.length} defaultOpen>
        {!p.templates ? (
          <Rows />
        ) : (
          p.templates.map((t) => (
            <Tooltip key={t.name} content={t.needs ? `${t.description} · needs ${t.needs}` : t.description} side="right">
              <button
                type="button"
                onClick={() => p.onOpenTemplate(t)}
                className={`group flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px] transition-colors ${p.selected.kind === "template" && p.selected.name === t.name ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text"}`}
              >
                <BookTemplate size={12} className="shrink-0 text-dim" />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {t.needs && (
                  <Badge tone="muted" className="h-[16px] px-1 text-[9.5px]">
                    ext
                  </Badge>
                )}
              </button>
            </Tooltip>
          ))
        )}
      </Section>
      <Section
        title="History"
        count={p.history?.length}
        meta={p.historyMax ? `last ${p.historyMax}` : undefined}
        actions={
          p.history && p.history.length > 0 ? (
            <Tooltip content="Clear the history on this machine">
              <button type="button" onClick={p.onClearHistory} className="grid h-5 w-5 place-items-center rounded text-dim hover:bg-elevated hover:text-danger" aria-label="Clear history">
                <Trash2 size={12} />
              </button>
            </Tooltip>
          ) : undefined
        }
      >
        {!p.history ? <Rows /> : p.history.length === 0 ? <Hint>Every run lands here, newest first.</Hint> : <HistoryRows history={p.history} onOpen={p.onOpenHistory} />}
      </Section>
    </div>
  );
}

function Section({ title, meta, count, defaultOpen = false, actions, children }: { title: string; meta?: string; count?: number; defaultOpen?: boolean; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-hairline pb-1.5 last:border-0">
      <div className="flex items-center gap-1 px-1 pt-2.5 pb-1">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-elevated/60" aria-expanded={open}>
          <ChevronRight size={11} className={`shrink-0 text-dim transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{title}</span>
          {count !== undefined && <span className="font-mono text-[10px] text-faint tnum">{count}</span>}
          {meta && <span className="ml-1 truncate font-mono text-[10px] text-faint">{meta}</span>}
        </button>
        {actions}
      </div>
      {open && <div className="flex flex-col gap-px px-1">{children}</div>}
    </div>
  );
}

function SnippetRow({ snippet: s, active, onOpen, onToggleFavorite, onRename, onDelete }: { snippet: Snippet; active: boolean; onOpen: () => void; onToggleFavorite: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <div className={`group flex items-center gap-1 rounded-md pl-2 pr-1 text-[12px] transition-colors ${active ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text"}`}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 py-[5px] text-left" title={s.path}>
        <FileCode2 size={12} className={`shrink-0 ${active ? "text-primary" : "text-dim"}`} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{s.name}</span>
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={s.favorite ? "Remove from favorites" : "Add to favorites"}
        aria-pressed={s.favorite}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded transition-opacity ${s.favorite ? "text-warn" : "text-dim opacity-0 hover:text-warn group-hover:opacity-100"}`}
      >
        <Star size={11} fill={s.favorite ? "currentColor" : "none"} />
      </button>
      <Dropdown
        trigger={
          <button type="button" aria-label="Snippet actions" className="grid h-5 w-5 shrink-0 place-items-center rounded text-dim opacity-0 hover:bg-raised hover:text-text group-hover:opacity-100 data-[state=open]:opacity-100">
            <MoreHorizontal size={12} />
          </button>
        }
        label={s.path}
        items={[
          { label: "Rename", icon: <Pencil size={12} />, onSelect: onRename },
          { label: s.favorite ? "Unfavorite" : "Favorite", icon: <Star size={12} />, onSelect: onToggleFavorite },
          "separator",
          { label: "Delete", icon: <Trash2 size={12} />, danger: true, onSelect: onDelete },
        ]}
      />
    </div>
  );
}

const modeTone: Record<RunMode, "muted" | "warn" | "info"> = { rollback: "muted", commit: "warn", readonly: "info" };
const modeShort: Record<RunMode, string> = { rollback: "rb", commit: "commit", readonly: "ro" };

function HistoryRows({ history, onOpen }: { history: HistoryEntry[]; onOpen: (h: HistoryEntry) => void }) {
  const now = useNow();
  return (
    <>
      {history.slice(0, 200).map((h, i) => {
        const first = h.sql.trim().split("\n").find((l) => l.trim() && !l.trim().startsWith("--")) ?? h.sql.trim();
        return (
          <button key={`${h.time}-${i}`} type="button" onClick={() => onOpen(h)} className="group flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-elevated/60" title={h.sql}>
            <span className="flex items-center gap-1.5">
              {h.error ? <AlertCircle size={11} className="shrink-0 text-danger" /> : <History size={11} className="shrink-0 text-dim" />}
              <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${h.error ? "text-danger" : "text-muted group-hover:text-text"}`}>{first}</span>
            </span>
            <span className="flex items-center gap-1.5 pl-[17px] font-mono text-[10px] text-faint tnum">
              <span>{now ? fmtAgo(Date.parse(h.time), now) : ""}</span>
              <Badge tone={modeTone[h.mode] ?? "muted"} className="h-[15px] px-1 text-[9.5px]">
                {modeShort[h.mode] ?? h.mode}
              </Badge>
              <span>{fmtMs(h.duration_ms)}</span>
              {!h.error && <span>· {h.rows} rows</span>}
            </span>
          </button>
        );
      })}
    </>
  );
}

function Rows() {
  return (
    <div className="flex flex-col gap-2 px-2 py-1.5">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

function Hint({ children, tone }: { children: ReactNode; tone?: "danger" }) {
  return <p className={`px-2 py-1.5 text-[11px] leading-snug ${tone === "danger" ? "text-danger" : "text-faint"}`}>{children}</p>;
}
