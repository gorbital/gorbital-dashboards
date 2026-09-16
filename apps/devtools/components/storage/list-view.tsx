"use client";

import { ChevronDown, ChevronsUpDown, ChevronUp, Download, Link2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Dropdown, type DropdownItem } from "@gorbital/dash/components/dropdown";
import { Checkbox } from "@gorbital/dash/components/input";
import { Empty } from "@gorbital/dash/components/panel";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { formatModified, formatSize, shortType } from "@/lib/storage/format";
import { nextSort, type Entry, type Sort, type SortKey } from "@/lib/storage/list";
import { EntryIcon } from "./common";

export type EntryAction = "download" | "signed_url" | "move" | "delete";

type Props = {
  entries: Entry[];
  sort: Sort | undefined;
  onSort: (sort: Sort | undefined) => void;
  /** Keys ticked for a bulk action. */
  selected: Set<string>;
  onSelect: (keys: Set<string>) => void;
  /** The object open in the preview pane. */
  selectedKey?: string;
  onOpenFolder: (prefix: string) => void;
  onOpenObject: (key: string) => void;
  onAction: (entry: Entry, action: EntryAction) => void;
  locked: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  /** Shown as the empty state's hint. */
  emptyHint: string;
};

const headers: { key: SortKey; label: string; align?: "right"; width?: string }[] = [
  { key: "name", label: "Name" },
  { key: "size", label: "Size", align: "right", width: "96px" },
  { key: "modified", label: "Modified", width: "150px" },
];

/** Item 74, list view: name, size, type, modified, a checkbox per row, sortable headers, a menu per row, "Load more". */
export function ListView({ entries, sort, onSort, selected, onSelect, selectedKey, onOpenFolder, onOpenObject, onAction, locked, loading, hasMore, loadingMore, onMore, emptyHint }: Props) {
  const all = entries.length > 0 && entries.every((e) => selected.has(e.key));
  const some = !all && entries.some((e) => selected.has(e.key));
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    onSelect(next);
  };
  const headerButton = (h: (typeof headers)[number]) => {
    const active = sort?.key === h.key;
    return (
      <button type="button" onClick={() => onSort(nextSort(sort, h.key))} className={`inline-flex items-center gap-1 uppercase tracking-[0.1em] hover:text-text ${active ? "text-text" : ""} ${h.align === "right" ? "flex-row-reverse" : ""}`}>
        {h.label}
        {active ? sort?.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} /> : <ChevronsUpDown size={11} className="opacity-50" />}
      </button>
    );
  };
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th className="w-8 px-3 py-2">
              <Checkbox aria-label="Select all" checked={all ? true : some ? "indeterminate" : false} onCheckedChange={(v) => onSelect(v === true ? new Set(entries.map((e) => e.key)) : new Set())} disabled={entries.length === 0} />
            </th>
            {headers.map((h) => (
              <th key={h.key} style={{ width: h.width }} aria-sort={sort?.key === h.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined} className={`px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-dim ${h.align === "right" ? "text-right" : ""}`}>
                {headerButton(h)}
              </th>
            ))}
            <th className="w-[88px] px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-dim">Type</th>
            <th className="w-10 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }, (_, i) => (
              <tr key={i} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2" />
                <td className="px-3 py-2">
                  <Skeleton className={`h-3 ${i % 2 ? "w-1/3" : "w-1/2"}`} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Skeleton className="h-3 w-10" />
                </td>
                <td className="px-3 py-2">
                  <Skeleton className="h-3 w-24" />
                </td>
                <td className="px-3 py-2">
                  <Skeleton className="h-3 w-8" />
                </td>
                <td />
              </tr>
            ))}
          {!loading &&
            entries.map((e) => {
              const ticked = selected.has(e.key);
              const open = e.kind === "object" && selectedKey === e.key;
              const items: DropdownItem[] =
                e.kind === "folder"
                  ? [
                      { label: "Open", onSelect: () => onOpenFolder(e.key) },
                      "separator",
                      { label: "Delete folder…", icon: <Trash2 size={12} />, danger: true, disabled: locked, onSelect: () => onAction(e, "delete") },
                    ]
                  : [
                      { label: "Download", icon: <Download size={12} />, onSelect: () => onAction(e, "download") },
                      { label: "Signed URL…", icon: <Link2 size={12} />, onSelect: () => onAction(e, "signed_url") },
                      { label: "Rename / move…", icon: <Pencil size={12} />, disabled: locked, onSelect: () => onAction(e, "move") },
                      "separator",
                      { label: "Delete…", icon: <Trash2 size={12} />, danger: true, disabled: locked, onSelect: () => onAction(e, "delete") },
                    ];
              return (
                <tr
                  key={e.key}
                  aria-selected={open || undefined}
                  className={`group border-b border-hairline transition-colors last:border-0 hover:bg-elevated/50 ${open ? "bg-elevated/70" : ticked ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-1.5 align-middle">
                    <Checkbox aria-label={`Select ${e.name}`} checked={ticked} onCheckedChange={(v) => toggle(e.key, v === true)} />
                  </td>
                  <td className="max-w-0 px-3 py-1.5 align-middle">
                    <button
                      type="button"
                      onClick={() => (e.kind === "folder" ? onOpenFolder(e.key) : onOpenObject(e.key))}
                      className={`flex w-full min-w-0 items-center gap-2 text-left ${e.kind === "folder" ? "font-medium text-text" : "text-text"} hover:text-primary`}
                      title={e.key}
                    >
                      <EntryIcon entry={e} />
                      <span className="truncate">{e.name}</span>
                      {e.kind === "folder" && <span className="text-dim">/</span>}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right align-middle font-mono text-[11px] text-muted tnum">{e.kind === "object" ? formatSize(e.object.size) : <span className="text-faint">—</span>}</td>
                  <td className="px-3 py-1.5 align-middle font-mono text-[11px] text-muted tnum" title={e.kind === "object" ? e.object.last_modified : undefined}>
                    {e.kind === "object" ? formatModified(e.object.last_modified) : <span className="text-faint">—</span>}
                  </td>
                  <td className="px-3 py-1.5 align-middle font-mono text-[11px] text-dim">{e.kind === "object" ? shortType(e.object.content_type, e.key) : "folder"}</td>
                  <td className="px-2 py-1.5 align-middle">
                    <Dropdown
                      trigger={
                        <button type="button" aria-label={`Actions for ${e.name}`} className="grid h-6 w-6 place-items-center rounded-md text-dim opacity-0 transition-opacity hover:bg-elevated hover:text-text group-hover:opacity-100 data-[state=open]:opacity-100">
                          <MoreHorizontal size={13} />
                        </button>
                      }
                      items={items}
                    />
                  </td>
                </tr>
              );
            })}
          {!loading && entries.length === 0 && (
            <tr>
              <td colSpan={6} className="p-2">
                <Empty title="This folder is empty" hint={emptyHint} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {hasMore && (
        <div className="flex justify-center border-t border-hairline py-2">
          <Button size="sm" kind="ghost" onClick={onMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
