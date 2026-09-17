"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Input, Select, Textarea } from "@gorbital/dash/components/input";
import type { Column } from "@/lib/api/db";
import { cellKind, defaultPlaceholder, formatPgArray, parseJSON, parsePgArray, type EditorValue } from "@/lib/table-editor/literals";

export type ValueState = EditorValue | undefined;

type Props = {
  column: Column;
  /** `undefined` means "leave it to the default" (inserts only); `null` is NULL. */
  value: ValueState;
  onChange: (v: ValueState) => void;
  /** Offer the "default" state (inserts). */
  allowDefault?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Enter commits and Escape cancels, for the inline cell editor. */
  onCommit?: () => void;
  onCancel?: () => void;
  id?: string;
  className?: string;
};

const chip = "h-5 whitespace-nowrap rounded-md border px-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-40";
const chipOff = `${chip} border-border text-dim hover:border-border-2 hover:text-text`;
const chipOn = `${chip} border-primary/40 bg-primary/10 text-primary`;

/** Which JSON error, if the text isn't valid JSON. */
export function jsonError(v: ValueState): string | undefined {
  if (typeof v !== "string" || v.trim() === "") return undefined;
  const r = parseJSON(v);
  return r.ok ? undefined : r.error;
}

/** One typed control for a cell's value, with NULL (and default) as states of their own. */
export function ValueInput({ column, value, onChange, allowDefault, autoFocus, disabled, onCommit, onCancel, id: givenId, className = "" }: Props) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const kind = cellKind(column);
  const isNull = value === null;
  const isDefault = value === undefined;
  const text = typeof value === "string" ? value : Array.isArray(value) ? formatPgArray(value) : typeof value === "boolean" ? String(value) : "";

  const keys = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
    } else if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      onCommit?.();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onCommit?.();
    }
  };

  // NULL and "default" show as an empty control with a placeholder; typing or picking a value leaves that state.
  const placeholder = isNull ? "NULL" : isDefault ? defaultPlaceholder(column) || (column.is_nullable ? "NULL" : "required") : undefined;
  const off = isNull || isDefault;
  const common = { id, disabled, autoFocus, placeholder, onKeyDown: keys, "aria-label": column.name };

  let control: ReactNode;
  if (column.is_array) {
    control = <Input mono {...common} value={isNull || isDefault ? "" : text} onChange={(e) => onChange(parsePgArray(e.target.value) ?? e.target.value)} placeholder={placeholder ?? "{a,b}"} />;
  } else if (kind === "bool") {
    control = (
      <Select {...common} value={off ? "" : value === true ? "true" : value === false ? "false" : text} onChange={(e) => onChange(e.target.value === "true" ? true : e.target.value === "false" ? false : e.target.value)}>
        {off && <option value="">{placeholder}</option>}
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  } else if (kind === "enum") {
    control = (
      <Select {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)}>
        {(off || !column.enum_values?.includes(text)) && <option value={off ? "" : text}>{off ? placeholder : text || "—"}</option>}
        {column.enum_values?.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
    );
  } else if (kind === "json") {
    const err = jsonError(value);
    control = (
      <div className="grid gap-1">
        <Textarea mono rows={6} {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)} aria-invalid={err ? true : undefined} spellCheck={false} />
        {err ? <span className="text-[11px] text-danger">{err}</span> : <span className="text-[10.5px] text-faint">⌘↩ saves</span>}
      </div>
    );
  } else if (kind === "timestamptz" || kind === "timestamp") {
    control = (
      <div className="flex items-center gap-2">
        <Input mono type="datetime-local" step={1} {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)} />
        {kind === "timestamptz" && <span className="shrink-0 font-mono text-[10px] text-dim">UTC</span>}
      </div>
    );
  } else if (kind === "date") {
    control = <Input mono type="date" {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)} />;
  } else if (kind === "time") {
    control = <Input mono type="time" step={1} {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)} />;
  } else if (kind === "number") {
    control = <Input mono inputMode="decimal" {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)} />;
  } else if (kind === "text" && (text.includes("\n") || text.length > 80)) {
    control = <Textarea mono rows={4} {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
  } else {
    control = <Input mono {...common} value={off ? "" : text} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
  }

  const canNull = column.is_nullable && !disabled;
  const canDefault = allowDefault && !disabled && (column.default_expr !== null || column.identity !== "" || column.is_nullable);
  return (
    <div className={`grid gap-1.5 ${className}`}>
      {control}
      {(canNull || canDefault) && (
        <div className="flex items-center gap-1">
          {canNull && (
            <button type="button" className={isNull ? chipOn : chipOff} onClick={() => onChange(isNull ? emptyFor(column) : null)} aria-pressed={isNull}>
              null
            </button>
          )}
          {canDefault && (
            <button type="button" className={isDefault ? chipOn : chipOff} onClick={() => onChange(isDefault ? emptyFor(column) : undefined)} aria-pressed={isDefault}>
              default
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The blank value an editor starts from when leaving NULL or the default. */
export function emptyFor(column: Column): EditorValue {
  if (column.is_array) return [];
  const kind = cellKind(column);
  if (kind === "bool") return false;
  if (kind === "enum") return column.enum_values?.[0] ?? "";
  return "";
}
