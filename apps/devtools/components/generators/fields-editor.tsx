"use client";

import { useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Checkbox, Input, Select } from "@gorbital/dash/components/input";
import { FIELD_TYPES, MAX_FIELDS, emptyField, parseFieldSpecs, type ResourceField } from "@/lib/generators/resource";

type Props = {
  fields: ResourceField[];
  onChange: (fields: ResourceField[]) => void;
  locked: boolean;
  /** Messages per row, and for the list, once the form was touched. */
  rowErrors?: Record<number, string>;
  listError?: string;
  /** The portal's usage error, when it's about a field. */
  serverError?: string;
  /** Offer `string?` (the module generator). */
  allowOptional?: boolean;
  /** The resource's snake name, for the unique field's error code. */
  snake: string;
  /** What the rules line says under the rows. */
  rules: string;
};

const OPTIONAL = "string?";

/** The field editor both the resource and the module generator use: a row per field (name, type, enum values, unique). */
export function FieldsEditor({ fields, onChange, locked, rowErrors, listError, serverError, allowOptional, snake, rules }: Props) {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string>();
  const setField = (i: number, patch: Partial<ResourceField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const title = fields.findIndex((f) => f.type === "string" && !f.optional);
  const types: { value: string; label: string; hint: string }[] = allowOptional ? [FIELD_TYPES[0], { value: OPTIONAL, label: "string?", hint: "0 to 100 characters, optional; can't be unique" }, ...FIELD_TYPES.slice(1)] : FIELD_TYPES;

  const addPasted = () => {
    const r = parseFieldSpecs(pasted);
    if ("error" in r) return setPasteError(r.error);
    if (!allowOptional && r.fields.some((f) => f.optional)) return setPasteError("this generator has no optional strings (string?)");
    const keep = fields.filter((f) => f.name.trim() !== "");
    onChange([...keep, ...r.fields].slice(0, MAX_FIELDS));
    setPasted("");
    setPasteError(undefined);
    setPasting(false);
  };

  return (
    <div className="grid gap-2 rounded-lg border border-hairline bg-bg/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Fields</div>
        <span className="flex items-center gap-1">
          <Button size="sm" kind="ghost" icon={<ClipboardPaste size={11} />} onClick={() => setPasting((v) => !v)} disabled={locked}>
            Paste specs
          </Button>
          <Button size="sm" kind="ghost" icon={<Plus size={11} />} onClick={() => onChange([...fields, emptyField()])} disabled={locked || fields.length >= MAX_FIELDS}>
            Add field
          </Button>
        </span>
      </div>
      {pasting && (
        <div className="grid gap-1">
          <div className="flex items-center gap-2">
            <Input mono value={pasted} onChange={(e) => { setPasted(e.target.value); setPasteError(undefined); }} onKeyDown={(e) => e.key === "Enter" && addPasted()} placeholder={allowOptional ? "name:string:unique description:text nickname:string?" : "name:string:unique notes:text status:enum(open,done)"} aria-label="Field specs" autoFocus />
            <Button size="sm" kind="secondary" onClick={addPasted} disabled={!pasted.trim()}>
              Add
            </Button>
          </div>
          <span className={`text-[11px] ${pasteError ? "text-danger" : "text-dim"}`}>{pasteError ?? "Specs as on the command line, separated by spaces; they replace the empty rows."}</span>
        </div>
      )}
      {fields.length === 0 && <div className="text-[11.5px] text-muted">Add at least one {allowOptional ? "required " : ""}string field; the first one is the title, which lists sort by.</div>}
      {fields.map((f, i) => {
        const rowError = rowErrors?.[i];
        const value = f.type === "string" && f.optional ? OPTIONAL : f.type;
        const type = types.find((t) => t.value === value);
        const required = f.type === "string" && !f.optional;
        return (
          <div key={i} className="grid gap-1">
            <div className="grid grid-cols-[minmax(0,1.2fr)_110px_minmax(0,1.4fr)_auto_auto] items-center gap-2">
              <Input mono value={f.name} onChange={(e) => setField(i, { name: e.target.value })} placeholder={i === 0 ? "name" : "notes"} aria-label={`Field ${i + 1} name`} disabled={locked} />
              <Select
                value={value}
                onChange={(e) => {
                  const v = e.target.value;
                  const optional = v === OPTIONAL;
                  const t = (optional ? "string" : v) as ResourceField["type"];
                  setField(i, { type: t, optional: optional || undefined, unique: t === "string" && !optional ? f.unique : false });
                }}
                aria-label={`Field ${i + 1} type`}
                disabled={locked}
              >
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              {f.type === "enum" ? <Input mono value={f.values} onChange={(e) => setField(i, { values: e.target.value })} placeholder="active, archived" aria-label={`Field ${i + 1} values`} disabled={locked} /> : <span className="truncate text-[11px] text-dim">{type?.hint}</span>}
              <label className={`flex items-center gap-1.5 text-[11px] ${required ? "text-muted" : "text-faint"}`}>
                <Checkbox checked={f.unique} onCheckedChange={(v) => setField(i, { unique: v === true })} disabled={locked || !required} aria-label={`Field ${i + 1} unique`} />
                unique
              </label>
              <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => onChange(fields.filter((_, j) => j !== i))} disabled={locked} aria-label={`Remove field ${i + 1}`}>
                <span className="sr-only">Remove</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
              {i === title && <Badge tone="accent">title · lists sort by it</Badge>}
              {required && <Badge tone="muted">required</Badge>}
              {((f.type === "string" && f.optional) || f.type === "text") && <Badge tone="muted">optional</Badge>}
              {f.type === "enum" && <Badge tone="muted">filterable · default: first value</Badge>}
              {f.unique && required && (
                <Badge tone="info">
                  409 {snake}_{f.name || "field"}_taken
                </Badge>
              )}
              {rowError && <span className="text-[11px] text-danger">{rowError}</span>}
            </div>
          </div>
        );
      })}
      {listError && <div className="text-[11px] text-danger">{listError}</div>}
      {serverError && /^field /.test(serverError) && <div className="text-[11px] text-danger">{serverError}</div>}
      <div className="text-[11px] text-dim">{rules}</div>
    </div>
  );
}
