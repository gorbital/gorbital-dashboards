"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Input } from "@gorbital/dash/components/input";
import type { KeyValue } from "@/lib/api/request-builder";

type Props = {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
};

/** Key/value rows for query parameters and headers; an empty key is ignored when sending. */
export function KeyValueEditor({ rows, onChange, keyPlaceholder = "key", valuePlaceholder = "value", addLabel = "Add" }: Props) {
  const set = (i: number, patch: Partial<KeyValue>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="grid gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1.5">
          <Input mono value={r.key} onChange={(e) => set(i, { key: e.target.value })} placeholder={keyPlaceholder} aria-label={`${keyPlaceholder} ${i + 1}`} className="h-7" />
          <Input mono value={r.value} onChange={(e) => set(i, { value: e.target.value })} placeholder={valuePlaceholder} aria-label={`${valuePlaceholder} ${i + 1}`} className="h-7" />
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="grid h-7 w-7 place-items-center rounded-md text-dim hover:bg-elevated hover:text-text" aria-label="Remove row">
            <X size={12} />
          </button>
        </div>
      ))}
      <div>
        <Button size="sm" kind="ghost" icon={<Plus size={11} />} onClick={() => onChange([...rows, { key: "", value: "" }])}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
