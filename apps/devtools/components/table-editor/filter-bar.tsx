"use client";

import { useEffect, useState } from "react";
import { ArrowDownUp, ListFilter, Plus, X } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Input, Select } from "@gorbital/dash/components/input";
import type { Column, Filter, FilterOperator, Sort } from "@/lib/api/db";
import { isValues, joinList, operatorLabels, operators, splitList } from "@/lib/table-editor/url";
import { Popover } from "./popover";

type Props = {
  columns: Column[];
  filters: Filter[];
  sorts: Sort[];
  onFilters: (f: Filter[]) => void;
  onSorts: (s: Sort[]) => void;
  /** Opens the "add filter" form on this column (from a header menu). */
  requestedColumn?: string;
  onRequestHandled?: () => void;
};

const chipClass = "flex h-7 items-center gap-1.5 rounded-full border border-border bg-elevated pl-2.5 pr-1 font-mono text-[11px] text-text";

function filterText(f: Filter): string {
  if (f.operator === "in") return `${f.column} in (${(f.values ?? []).join(", ")})`;
  if (f.operator === "is") return `${f.column} is ${f.value}`;
  return `${f.column} ${f.operator} ${f.value ?? ""}`;
}

export function FilterBar({ columns, filters, sorts, onFilters, onSorts, requestedColumn, onRequestHandled }: Props) {
  const [open, setOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [draft, setDraft] = useState<Filter>({ column: columns[0]?.name ?? "", operator: "=", value: "" });

  useEffect(() => {
    if (requestedColumn) {
      setDraft({ column: requestedColumn, operator: "=", value: "" });
      setOpen(true);
      onRequestHandled?.();
    }
  }, [requestedColumn, onRequestHandled]);

  useEffect(() => {
    if (!columns.some((c) => c.name === draft.column) && columns[0]) setDraft((d) => ({ ...d, column: columns[0].name }));
  }, [columns, draft.column]);

  const add = () => {
    if (!draft.column) return;
    const f: Filter = draft.operator === "in" ? { column: draft.column, operator: "in", values: splitList(draft.value ?? "") } : { column: draft.column, operator: draft.operator, value: draft.operator === "is" ? draft.value || "null" : draft.value ?? "" };
    onFilters([...filters, f]);
    setDraft({ column: draft.column, operator: "=", value: "" });
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2">
      <Popover
        open={open}
        onOpenChange={setOpen}
        className="w-[420px] p-3"
        trigger={
          <Button size="sm" kind={filters.length ? "secondary" : "ghost"} icon={<ListFilter size={12} />}>
            Filter{filters.length ? ` · ${filters.length}` : ""}
          </Button>
        }
      >
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="grid grid-cols-[1fr_130px] gap-2">
            <Select value={draft.column} onChange={(e) => setDraft({ ...draft, column: e.target.value })} aria-label="Column">
              {columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value as FilterOperator, value: e.target.value === "is" ? "null" : draft.value })} aria-label="Operator">
              {operators.map((op) => (
                <option key={op} value={op}>
                  {op} · {operatorLabels[op]}
                </option>
              ))}
            </Select>
          </div>
          {draft.operator === "is" ? (
            <Select value={draft.value ?? "null"} onChange={(e) => setDraft({ ...draft, value: e.target.value })} aria-label="Value">
              {isValues.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          ) : (
            <Input mono autoFocus value={draft.value ?? ""} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder={draft.operator === "in" ? "a, b, c" : draft.operator.startsWith("~~") ? "%pattern%" : "value"} aria-label="Value" />
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-dim">{draft.operator === "in" ? "comma separated; \\, for a comma" : draft.operator.startsWith("~~") ? "% matches anything, _ one character" : "text, as PostgreSQL would read it"}</span>
            <Button size="sm" kind="primary" type="submit" icon={<Plus size={11} />}>
              Add filter
            </Button>
          </div>
        </form>
      </Popover>
      {filters.map((f, i) => (
        <span key={i} className={chipClass}>
          {filterText(f)}
          <button type="button" className="grid h-5 w-5 place-items-center rounded-full text-dim hover:bg-raised hover:text-text" onClick={() => onFilters(filters.filter((_, j) => j !== i))} aria-label={`remove filter ${filterText(f)}`}>
            <X size={11} />
          </button>
        </span>
      ))}
      <span className="mx-1 h-4 w-px bg-hairline" />
      <Popover
        open={sortOpen}
        onOpenChange={setSortOpen}
        className="w-[360px] p-3"
        trigger={
          <Button size="sm" kind={sorts.length ? "secondary" : "ghost"} icon={<ArrowDownUp size={12} />}>
            Sort{sorts.length ? ` · ${sorts.length}` : ""}
          </Button>
        }
      >
        <div className="grid gap-2">
          {sorts.length === 0 && <div className="text-[11.5px] text-dim">No sort: rows come in primary key order.</div>}
          {sorts.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_110px_24px] items-center gap-1.5">
              <Select value={s.column} onChange={(e) => onSorts(sorts.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)))} aria-label="Sort column">
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select value={s.descending ? "desc" : "asc"} onChange={(e) => onSorts(sorts.map((x, j) => (j === i ? { ...x, descending: e.target.value === "desc" } : x)))} aria-label="Direction">
                <option value="asc">asc</option>
                <option value="desc">desc</option>
              </Select>
              <Select value={s.nulls_first ? "first" : "last"} onChange={(e) => onSorts(sorts.map((x, j) => (j === i ? { ...x, nulls_first: e.target.value === "first" } : x)))} aria-label="Nulls">
                <option value="last">nulls last</option>
                <option value="first">nulls first</option>
              </Select>
              <button type="button" className="grid h-6 w-6 place-items-center rounded text-dim hover:bg-raised hover:text-text" onClick={() => onSorts(sorts.filter((_, j) => j !== i))} aria-label="remove sort">
                <X size={12} />
              </button>
            </div>
          ))}
          <div>
            <Button size="sm" kind="ghost" icon={<Plus size={11} />} onClick={() => onSorts([...sorts, { column: columns.find((c) => !sorts.some((s) => s.column === c.name))?.name ?? columns[0]?.name ?? "" }])} disabled={!columns.length}>
              Add sort
            </Button>
          </div>
        </div>
      </Popover>
      {sorts.map((s, i) => (
        <span key={i} className={chipClass}>
          {s.column} {s.descending ? "↓" : "↑"}
          {s.nulls_first ? " · nulls first" : ""}
          <button type="button" className="grid h-5 w-5 place-items-center rounded-full text-dim hover:bg-raised hover:text-text" onClick={() => onSorts(sorts.filter((_, j) => j !== i))} aria-label={`remove sort ${s.column}`}>
            <X size={11} />
          </button>
        </span>
      ))}
      {(filters.length > 0 || sorts.length > 0) && (
        <Button
          size="sm"
          kind="ghost"
          className="ml-auto"
          onClick={() => {
            onFilters([]);
            onSorts([]);
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

export { joinList };
