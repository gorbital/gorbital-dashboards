"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { useStorageObjects } from "@/lib/api/storage";
import { formatSize } from "@/lib/storage/format";
import { ancestors, baseName } from "@/lib/storage/keys";
import { entriesOf, mergePages, sortEntries } from "@/lib/storage/list";
import { EntryIcon, ProblemNote } from "./common";

type Props = {
  prefix: string;
  selectedKey?: string;
  enabled: boolean;
  limit: number;
  onOpenFolder: (prefix: string) => void;
  onOpenObject: (key: string) => void;
};

/** Item 74, column view: one Finder-like column per level from the root down to the current folder, each its own listing. */
export function ColumnView({ prefix, selectedKey, enabled, limit, onOpenFolder, onOpenObject }: Props) {
  const levels = useMemo(() => ancestors(prefix), [prefix]);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [levels.length, selectedKey]);
  return (
    <div ref={scroller} className="flex min-h-[320px] overflow-x-auto">
      {levels.map((level, i) => (
        <Column key={level} prefix={level} active={i + 1 < levels.length ? levels[i + 1] : selectedKey} enabled={enabled} limit={limit} onOpenFolder={onOpenFolder} onOpenObject={onOpenObject} />
      ))}
    </div>
  );
}

function Column({ prefix, active, enabled, limit, onOpenFolder, onOpenObject }: { prefix: string; active?: string; enabled: boolean; limit: number; onOpenFolder: (p: string) => void; onOpenObject: (k: string) => void }) {
  const list = useStorageObjects(prefix, enabled, limit);
  const entries = useMemo(() => sortEntries(entriesOf(mergePages(list.data?.pages ?? [])), { key: "name", dir: "asc" }), [list.data]);
  return (
    <div className="flex w-[240px] shrink-0 flex-col border-r border-hairline last:border-r-0">
      <div className="truncate border-b border-hairline px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-dim" title={prefix || "/"}>
        {prefix ? baseName(prefix) : "root"}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {list.isPending && enabled && (
          <div className="flex flex-col gap-2 px-3 py-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        )}
        {list.error && !list.data && <ProblemNote error={list.error} className="m-2" />}
        {entries.map((e) => {
          const isActive = active === e.key;
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => (e.kind === "folder" ? onOpenFolder(e.key) : onOpenObject(e.key))}
              aria-current={isActive || undefined}
              title={e.key}
              className={`flex w-full items-center gap-2 px-3 py-1 text-left text-[12px] transition-colors ${isActive ? "bg-primary/12 text-text" : "text-muted hover:bg-elevated/60 hover:text-text"}`}
            >
              <EntryIcon entry={e} size={13} />
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {e.kind === "folder" ? <ChevronRight size={12} className="shrink-0 text-dim" /> : <span className="shrink-0 font-mono text-[10px] text-dim tnum">{formatSize(e.object.size)}</span>}
            </button>
          );
        })}
        {list.data && entries.length === 0 && <div className="px-3 py-3 text-[11.5px] text-faint">empty</div>}
        {list.hasNextPage && (
          <div className="flex justify-center py-1">
            <Button size="sm" kind="ghost" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
