"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input, Switch } from "@gorbital/dash/components/input";
import type { TypeOption } from "@/lib/api/db";
import { Popover } from "./popover";

type Props = {
  /** The picker name: int8, varchar(100), public.status… */
  value: string;
  onChange: (type: string) => void;
  types: TypeOption[] | undefined;
  array: boolean;
  onArray: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
};

const groupOrder = ["Numeric", "Text", "Boolean", "Date and time", "JSON", "Binary", "Enums"];

/** `varchar(100)` → { base: "varchar", size: "100" }. */
export function splitSized(type: string): { base: string; size: string } {
  const m = /^([^(]+)\((.*)\)$/.exec(type.trim());
  return m ? { base: m[1], size: m[2] } : { base: type.trim(), size: "" };
}

const sizable = new Set(["numeric", "varchar"]);

/** A grouped, searchable list of the types the portal offers, with a size for numeric and varchar and an array toggle. */
export function TypePicker({ value, onChange, types, array, onArray, disabled, id }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { base, size } = splitSized(value);
  const current = types?.find((t) => t.name === base);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (types ?? []).filter((t) => !term || t.name.toLowerCase().includes(term) || t.sql.toLowerCase().includes(term) || t.description.toLowerCase().includes(term));
    const by = new Map<string, TypeOption[]>();
    for (const t of list) by.set(t.group, [...(by.get(t.group) ?? []), t]);
    return [...by.entries()].sort(([a], [b]) => (groupOrder.indexOf(a) + 1 || 99) - (groupOrder.indexOf(b) + 1 || 99));
  }, [types, q]);

  const pick = (t: TypeOption) => {
    onChange(t.name);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="flex items-center gap-2">
      <Popover
        open={open}
        onOpenChange={setOpen}
        className="w-[380px] p-0"
        trigger={
          <button
            id={id}
            type="button"
            disabled={disabled}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-code-bg px-2.5 text-left text-[12px] text-text outline-none transition-colors hover:border-border-2 focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="truncate font-mono">{value || "choose a type"}</span>
            {current && <span className="truncate text-[11px] text-dim">{current.sql}</span>}
            <ChevronDown size={12} className="ml-auto shrink-0 text-dim" />
          </button>
        }
      >
        <div className="border-b border-hairline p-2">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search types…" aria-label="Search types" />
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {!types && <div className="px-2.5 py-2 text-[11.5px] text-dim">Loading types…</div>}
          {types && groups.length === 0 && <div className="px-2.5 py-2 text-[11.5px] text-dim">No type matches.</div>}
          {groups.map(([group, items]) => (
            <div key={group} className="mb-1">
              <div className="px-2.5 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{group}</div>
              {items.map((t) => (
                <button key={t.name} type="button" onClick={() => pick(t)} className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-raised ${t.name === base ? "bg-raised/60" : ""}`}>
                  <span className="w-[112px] shrink-0 truncate font-mono text-[12px] text-text">{t.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">{t.description}</span>
                  {t.name === base && <Check size={12} className="mt-0.5 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Popover>
      {sizable.has(base) && (
        <Input mono className="w-[84px]" value={size} onChange={(e) => onChange(e.target.value.trim() ? `${base}(${e.target.value.trim()})` : base)} placeholder={base === "numeric" ? "10,2" : "100"} aria-label="Size" disabled={disabled} />
      )}
      <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
        <Switch checked={array} onCheckedChange={onArray} disabled={disabled} aria-label="Array" />
        array
      </label>
    </div>
  );
}
