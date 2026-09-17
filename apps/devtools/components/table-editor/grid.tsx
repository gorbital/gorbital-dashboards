"use client";

import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Fingerprint, KeyRound, Link2, ListFilter, MoreHorizontal, Pencil, PlusSquare, Trash2 } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Dropdown, type DropdownItem } from "@gorbital/dash/components/dropdown";
import { Checkbox } from "@gorbital/dash/components/input";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import type { Cell, Column, RowPage, Sort } from "@/lib/api/db";
import { cellKind, displayCell, fromEditor, toEditor, type EditorValue } from "@/lib/table-editor/literals";
import { TypeBadge } from "./common";
import { ValueInput, jsonError } from "./value-input";

export type RowAction = "edit" | "duplicate" | "delete";
export type ColumnAction = "sort_asc" | "sort_desc" | "filter" | "edit" | "delete" | "foreign_key" | "unique" | "primary_key";

type Props = {
  page: RowPage | undefined;
  loading: boolean;
  readOnly: boolean;
  /** Columns can be altered (the app's own tables). */
  canAlter: boolean;
  sorts: Sort[];
  selected: ReadonlySet<number>;
  onSelect: (next: Set<number>) => void;
  onEditCell: (rowIndex: number, column: Column, value: Cell) => Promise<void>;
  onRowAction: (action: RowAction, rowIndex: number) => void;
  onColumnAction: (action: ColumnAction, column: Column) => void;
  onOpenReference: (column: Column, value: string) => void;
  empty: ReactNode;
};

type Pos = { r: number; c: number };

/** A column the grid can write to. */
export function editable(c: Column): boolean {
  return c.identity !== "a" && c.generated === "";
}

export function Grid({ page, loading, readOnly, canAlter, sorts, selected, onSelect, onEditCell, onRowAction, onColumnAction, onOpenReference, empty }: Props) {
  const [active, setActive] = useState<Pos | null>(null);
  const [editing, setEditing] = useState<(Pos & { value: EditorValue; saving?: boolean; error?: string }) | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const rows = page?.rows ?? [];
  const columns = page?.columns ?? [];

  useEffect(() => {
    setActive(null);
    setEditing(null);
  }, [page?.columns]);

  const startEdit = useCallback(
    (r: number, c: number) => {
      if (readOnly || !page) return;
      const col = page.columns[c];
      if (!editable(col)) return;
      setEditing({ r, c, value: toEditor(col, page.rows[r][c]) });
    },
    [page, readOnly],
  );

  const commit = useCallback(async () => {
    if (!editing || !page) return;
    const col = page.columns[editing.c];
    const err = cellKind(col) === "json" && !col.is_array ? jsonError(editing.value) : undefined;
    if (err) return setEditing({ ...editing, error: err });
    const next = fromEditor(col, editing.value);
    if (next === page.rows[editing.r][editing.c]) return setEditing(null);
    setEditing({ ...editing, saving: true, error: undefined });
    try {
      await onEditCell(editing.r, col, next);
      setEditing(null);
      container.current?.focus();
    } catch (e) {
      setEditing((s) => (s ? { ...s, saving: false, error: e instanceof Error ? e.message : String(e) } : s));
    }
  }, [editing, page, onEditCell]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (editing || !rows.length) return;
    const pos = active ?? { r: 0, c: 0 };
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      const r = Math.min(rows.length - 1, Math.max(0, pos.r + dr));
      const c = Math.min(columns.length - 1, Math.max(0, pos.c + dc));
      setActive({ r, c });
      const cell = container.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    switch (e.key) {
      case "ArrowDown":
        return move(1, 0);
      case "ArrowUp":
        return move(-1, 0);
      case "ArrowRight":
        return move(0, 1);
      case "ArrowLeft":
        return move(0, -1);
      case "Tab":
        return move(0, e.shiftKey ? -1 : 1);
      case "Home":
        return move(-rows.length, e.ctrlKey || e.metaKey ? -columns.length : 0);
      case "End":
        return move(rows.length, e.ctrlKey || e.metaKey ? columns.length : 0);
      case "Enter":
      case "F2":
        if (active) {
          e.preventDefault();
          startEdit(active.r, active.c);
        }
        return;
      case " ":
        if (active) {
          e.preventDefault();
          toggleRow(active.r);
        }
        return;
      case "Escape":
        setActive(null);
        return;
      default:
        return;
    }
  };

  const toggleRow = (r: number) => {
    const next = new Set(selected);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    onSelect(next);
  };
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  const headerMenu = (col: Column): DropdownItem[] => {
    const items: DropdownItem[] = [
      { label: "Sort ascending", icon: <ArrowUp size={12} />, onSelect: () => onColumnAction("sort_asc", col) },
      { label: "Sort descending", icon: <ArrowDown size={12} />, onSelect: () => onColumnAction("sort_desc", col) },
      { label: "Filter by this column", icon: <ListFilter size={12} />, onSelect: () => onColumnAction("filter", col) },
    ];
    if (canAlter) {
      items.push(
        "separator",
        { label: "Edit column", icon: <Pencil size={12} />, onSelect: () => onColumnAction("edit", col) },
        { label: "Add foreign key…", icon: <Link2 size={12} />, onSelect: () => onColumnAction("foreign_key", col) },
        { label: "Make unique", icon: <Fingerprint size={12} />, disabled: col.is_unique, onSelect: () => onColumnAction("unique", col) },
        { label: "Set as primary key", icon: <KeyRound size={12} />, disabled: col.is_primary_key, onSelect: () => onColumnAction("primary_key", col) },
        "separator",
        { label: "Delete column…", icon: <Trash2 size={12} />, danger: true, onSelect: () => onColumnAction("delete", col) },
      );
    }
    return items;
  };

  return (
    <div ref={container} tabIndex={0} onKeyDown={onKey} className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/30" role="grid" aria-rowcount={rows.length} aria-colcount={columns.length}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-[12px]">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-30 w-[64px] border-b border-r border-hairline bg-surface px-2 text-left">
              <div className="flex h-8 items-center gap-1.5">
                <Checkbox checked={allSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={() => onSelect(allSelected ? new Set() : new Set(rows.map((_, i) => i)))} aria-label="Select all rows" disabled={!rows.length} />
              </div>
            </th>
            {columns.map((col) => {
              const sort = sorts.find((s) => s.column === col.name);
              return (
                <th key={col.name} className="group/h min-w-[140px] max-w-[360px] border-b border-r border-hairline bg-surface px-2 text-left font-normal" scope="col">
                  <div className="flex h-8 items-center gap-1.5">
                    {col.is_primary_key && (
                      <Tooltip content="primary key">
                        <KeyRound size={11} className="shrink-0 text-warn" />
                      </Tooltip>
                    )}
                    {col.fk_targets?.length ? (
                      <Tooltip content={`references ${col.fk_targets.join(", ")}`}>
                        <Link2 size={11} className="shrink-0 text-info" />
                      </Tooltip>
                    ) : null}
                    {col.is_unique && !col.is_primary_key && (
                      <Tooltip content="unique">
                        <Fingerprint size={11} className="shrink-0 text-violet" />
                      </Tooltip>
                    )}
                    <span className="truncate font-mono text-[11.5px] font-medium text-text" title={col.comment ?? col.name}>
                      {col.name}
                    </span>
                    {!col.is_nullable && (
                      <Tooltip content="not null">
                        <span className="font-mono text-[10px] text-dim">*</span>
                      </Tooltip>
                    )}
                    <TypeBadge column={col} />
                    {sort && <span className="font-mono text-[10px] text-primary">{sort.descending ? "↓" : "↑"}</span>}
                    <Dropdown
                      align="end"
                      trigger={
                        <button type="button" className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded text-dim opacity-0 transition-opacity hover:bg-elevated hover:text-text focus-visible:opacity-100 group-hover/h:opacity-100 data-[state=open]:opacity-100" aria-label={`${col.name} options`}>
                          <ChevronDown size={12} />
                        </button>
                      }
                      label={col.name}
                      items={headerMenu(col)}
                    />
                  </div>
                </th>
              );
            })}
            {canAlter && (
              <th className="border-b border-hairline bg-surface px-2">
                <Tooltip content="Add column">
                  <button type="button" className="grid h-6 w-6 place-items-center rounded text-dim hover:bg-elevated hover:text-text" onClick={() => onColumnAction("edit", { name: "" } as Column)} aria-label="Add column">
                    <PlusSquare size={13} />
                  </button>
                </Tooltip>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 8 }, (_, i) => (
                <tr key={i}>
                  <td className="sticky left-0 z-10 border-b border-r border-hairline bg-surface px-2 py-2" />
                  {(columns.length ? columns : Array.from({ length: 5 }, (_, j) => ({ name: String(j) }))).map((c) => (
                    <td key={c.name} className="border-b border-r border-hairline px-2 py-2">
                      <Skeleton className={`h-3 ${i % 3 ? "w-2/3" : "w-1/3"}`} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row, r) => (
                <GridRow
                  key={r}
                  r={r}
                  row={row}
                  columns={columns}
                  selected={selected.has(r)}
                  activeCol={active?.r === r ? active.c : -1}
                  editing={editing?.r === r ? editing : null}
                  readOnly={readOnly}
                  canAlter={canAlter}
                  onToggle={toggleRow}
                  onActivate={setActive}
                  onStartEdit={startEdit}
                  onChangeEdit={(value) => setEditing((s) => (s ? { ...s, value, error: undefined } : s))}
                  onCommit={commit}
                  onCancel={() => {
                    setEditing(null);
                    container.current?.focus();
                  }}
                  onRowAction={onRowAction}
                  onOpenReference={onOpenReference}
                />
              ))}
        </tbody>
      </table>
      {!loading && rows.length === 0 && <div className="p-6">{empty}</div>}
    </div>
  );
}

type RowProps = {
  r: number;
  row: Cell[];
  columns: Column[];
  selected: boolean;
  activeCol: number;
  editing: (Pos & { value: EditorValue; saving?: boolean; error?: string }) | null;
  readOnly: boolean;
  canAlter: boolean;
  onToggle: (r: number) => void;
  onActivate: (p: Pos) => void;
  onStartEdit: (r: number, c: number) => void;
  onChangeEdit: (v: EditorValue) => void;
  onCommit: () => void;
  onCancel: () => void;
  onRowAction: (action: RowAction, r: number) => void;
  onOpenReference: (column: Column, value: string) => void;
};

const GridRow = memo(function GridRow({ r, row, columns, selected, activeCol, editing, readOnly, canAlter, onToggle, onActivate, onStartEdit, onChangeEdit, onCommit, onCancel, onRowAction, onOpenReference }: RowProps) {
  const rowItems: DropdownItem[] = [
    { label: "Edit row", icon: <Pencil size={12} />, onSelect: () => onRowAction("edit", r), disabled: readOnly },
    { label: "Duplicate row", icon: <Copy size={12} />, onSelect: () => onRowAction("duplicate", r), disabled: readOnly },
    "separator",
    { label: "Delete row…", icon: <Trash2 size={12} />, danger: true, onSelect: () => onRowAction("delete", r), disabled: readOnly },
  ];
  return (
    <tr className={`group/r ${selected ? "bg-primary/6" : "hover:bg-elevated/40"}`} aria-selected={selected} aria-rowindex={r + 1}>
      <td className="sticky left-0 z-10 border-b border-r border-hairline bg-surface px-2">
        {selected && <i className="pointer-events-none absolute inset-0 bg-primary/6" aria-hidden="true" />}
        <div className="relative flex h-7 items-center gap-1">
          <Checkbox checked={selected} onCheckedChange={() => onToggle(r)} aria-label={`Select row ${r + 1}`} />
          <Dropdown
            trigger={
              <button type="button" className="grid h-5 w-5 place-items-center rounded text-dim opacity-0 hover:bg-elevated hover:text-text focus-visible:opacity-100 group-hover/r:opacity-100 data-[state=open]:opacity-100" aria-label={`Row ${r + 1} actions`}>
                <MoreHorizontal size={12} />
              </button>
            }
            items={rowItems}
            align="start"
          />
        </div>
      </td>
      {columns.map((col, c) => {
        const v = row[c];
        const isActive = activeCol === c;
        const isEditing = editing?.c === c;
        const kind = cellKind(col);
        const fk = col.fk_targets?.[0];
        return (
          <td
            key={col.name}
            data-cell={`${r}:${c}`}
            role="gridcell"
            aria-selected={isActive || undefined}
            onClick={() => onActivate({ r, c })}
            onDoubleClick={() => onStartEdit(r, c)}
            className={`relative h-7 max-w-[360px] border-b border-r border-hairline px-2 align-middle font-mono text-[11.5px] ${isActive ? "ring-1 ring-inset ring-primary/70" : ""} ${!readOnly && editable(col) ? "cursor-cell" : "cursor-default"}`}
          >
            <div className="flex h-7 items-center gap-1.5">
              {v === null ? (
                <span className="italic text-faint">NULL</span>
              ) : (
                <span className={`min-w-0 flex-1 truncate ${kind === "number" ? "tnum text-info" : kind === "bool" ? "text-violet" : kind === "json" ? "text-muted" : "text-text"}`}>
                  {kind === "bool" ? (v === "t" ? "true" : v === "f" ? "false" : v) : displayCell(v)}
                </span>
              )}
              {fk && v !== null && (
                <Tooltip content={`open ${fk} where ${col.name} = ${v}`}>
                  <button
                    type="button"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-dim opacity-0 hover:bg-elevated hover:text-info focus-visible:opacity-100 group-hover/r:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReference(col, v);
                    }}
                    aria-label={`open ${fk}`}
                  >
                    <Link2 size={12} />
                  </button>
                </Tooltip>
              )}
            </div>
            {isEditing && editing && (
              <div className="absolute left-0 top-0 z-30 min-w-[300px] max-w-[440px] rounded-lg border border-border bg-elevated p-2 shadow-2xl shadow-umbra/50" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                <ValueInput column={col} value={editing.value} onChange={(nv) => onChangeEdit(nv === undefined ? null : nv)} autoFocus onCommit={onCommit} onCancel={onCancel} />
                {editing.error && <div className="mt-1.5 font-mono text-[11px] text-danger">{editing.error}</div>}
                <div className="mt-2 flex items-center justify-end gap-1.5">
                  <span className="mr-auto font-mono text-[10px] text-faint">↩ save · esc cancel</span>
                  <Button size="sm" kind="ghost" onClick={onCancel} disabled={editing.saving}>
                    Cancel
                  </Button>
                  <Button size="sm" kind="primary" onClick={onCommit} loading={editing.saving}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </td>
        );
      })}
      {canAlter && <td className="border-b border-hairline" />}
    </tr>
  );
});
