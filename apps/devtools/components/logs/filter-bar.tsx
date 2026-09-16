"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Input, Select } from "@gorbital/dash/components/input";
import { Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import type { Tone } from "@gorbital/dash/theme";
import { countActiveFilters, defaultRange, levels, normalizeFilters, rangePresets, statusClasses, type LogFilters, type RangePreset } from "@/lib/logs/filters";
import { levelTone } from "./log-line";

type Draft = { user: string; method: string; path: string; status: string; min_duration_ms: string; request_id: string; trace_id: string; q: string; from: string; to: string };

const toDraft = (f: LogFilters): Draft => ({
  user: f.user ?? "",
  method: f.method ?? "",
  path: f.path ?? "",
  status: f.status !== undefined ? String(f.status) : "",
  min_duration_ms: f.min_duration_ms !== undefined ? String(f.min_duration_ms) : "",
  request_id: f.request_id ?? "",
  trace_id: f.trace_id ?? "",
  q: f.q ?? "",
  from: toLocal(f.from),
  to: toLocal(f.to),
});

/** An ISO time as `datetime-local` wants it, in local time. */
function toLocal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

type Props = {
  filters: LogFilters;
  onChange: (next: LogFilters) => void;
};

const toneClass: Partial<Record<Tone, string>> = { danger: "border-danger/40 bg-danger/10 text-danger", warn: "border-warn/40 bg-warn/10 text-warn", info: "border-info/40 bg-info/10 text-info", muted: "border-border-2 bg-elevated text-muted" };

/**
 * Every filter the store knows. The time range, levels and status class
 * apply at once; the text fields apply on Enter or Apply, so typing a path
 * doesn't fire a query per keystroke.
 */
export function FilterBar({ filters, onChange }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(filters));
  const [custom, setCustom] = useState(Boolean(filters.from || filters.to));
  const key = JSON.stringify(normalizeFilters(filters));
  useEffect(() => {
    setDraft(toDraft(filters));
    setCustom(Boolean(filters.from || filters.to));
  }, [key]);

  const absolute = Boolean(filters.from || filters.to);
  const range: RangePreset | "custom" = absolute || custom ? "custom" : (filters.range ?? defaultRange);
  const active = countActiveFilters(filters);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const apply = () => {
    const next: LogFilters = {
      ...filters,
      user: draft.user,
      method: draft.method,
      path: draft.path,
      status: draft.status ? Number(draft.status) : undefined,
      min_duration_ms: draft.min_duration_ms ? Number(draft.min_duration_ms) : undefined,
      request_id: draft.request_id,
      trace_id: draft.trace_id,
      q: draft.q,
    };
    if (custom) {
      next.from = fromLocal(draft.from);
      next.to = fromLocal(draft.to);
      if (!next.from && !next.to) next.range = filters.range;
    }
    onChange(normalizeFilters(next));
  };

  const toggleLevel = (l: string) => {
    const cur = filters.level ?? [];
    const next = cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l];
    onChange({ ...filters, level: next.length === levels.length ? [] : next });
  };

  return (
    <Panel
      title="Filters"
      meta={active ? `${active} active` : "every field combines"}
      actions={
        active > 0 && (
          <Button size="sm" kind="ghost" icon={<X size={11} />} onClick={() => onChange({ range: filters.range, from: filters.from, to: filters.to })}>
            Clear filters
          </Button>
        )
      }
    >
      <form
        className="grid gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<RangePreset | "custom">
            options={[...rangePresets.map((p) => ({ value: p.value, label: p.label })), { value: "custom", label: "Custom" }]}
            value={range}
            onChange={(v) => {
              if (v === "custom") return setCustom(true);
              setCustom(false);
              onChange({ ...filters, range: v, from: undefined, to: undefined });
            }}
          />
          {(custom || absolute) && (
            <>
              <span className="w-[190px] shrink-0"><Input type="datetime-local" value={draft.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" /></span>
              <span className="text-dim">→</span>
              <span className="w-[190px] shrink-0"><Input type="datetime-local" value={draft.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" /></span>
            </>
          )}
          <span className="mx-1 h-5 w-px bg-hairline" />
          <div className="flex items-center gap-1" role="group" aria-label="Levels">
            {levels.map((l) => {
              const on = (filters.level ?? []).includes(l);
              return (
                <button key={l} type="button" aria-pressed={on} onClick={() => toggleLevel(l)} className={`h-7 rounded-md border px-2 font-mono text-[11px] transition-colors ${on ? (toneClass[levelTone(l)] ?? toneClass.muted) : "border-border bg-surface text-dim hover:border-border-2 hover:text-muted"}`}>
                  {l}
                </button>
              );
            })}
          </div>
          <span className="w-[118px]">
            <Select value={filters.min_level ?? ""} onChange={(e) => onChange({ ...filters, min_level: e.target.value || undefined })} aria-label="Minimum level">
              <option value="">Any level</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  ≥ {l}
                </option>
              ))}
            </Select>
          </span>
          <Segmented<string>
            options={[{ value: "", label: "All" }, ...statusClasses.map((c) => ({ value: c, label: c }))]}
            value={filters.status_class ?? ""}
            onChange={(v) => onChange({ ...filters, status_class: v || undefined })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-[220px] flex-1"><Input mono value={draft.q} onChange={(e) => set({ q: e.target.value })} placeholder="text in the message, an attribute or a raw line" aria-label="Search text" /></span>
          <span className="w-[110px]">
            <Select value={draft.method} onChange={(e) => set({ method: e.target.value })} aria-label="Method">
              <option value="">Method</option>
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </span>
          <span className="w-[170px] shrink-0"><Input mono value={draft.path} onChange={(e) => set({ path: e.target.value })} placeholder="path or route prefix" aria-label="Path" /></span>
          <span className="w-[76px] shrink-0"><Input mono inputMode="numeric" value={draft.status} onChange={(e) => set({ status: e.target.value.replace(/\D/g, "") })} placeholder="status" aria-label="Status" /></span>
          <span className="w-[84px] shrink-0"><Input mono inputMode="numeric" value={draft.min_duration_ms} onChange={(e) => set({ min_duration_ms: e.target.value.replace(/[^\d.]/g, "") })} placeholder="≥ ms" aria-label="Minimum duration in ms" /></span>
          <span className="w-[150px] shrink-0"><Input mono value={draft.user} onChange={(e) => set({ user: e.target.value })} placeholder="user id or email" aria-label="User" /></span>
          <span className="w-[160px] shrink-0"><Input mono value={draft.request_id} onChange={(e) => set({ request_id: e.target.value })} placeholder="request id" aria-label="Request id" /></span>
          <span className="w-[160px] shrink-0"><Input mono value={draft.trace_id} onChange={(e) => set({ trace_id: e.target.value })} placeholder="trace id" aria-label="Trace id" /></span>
          <Button type="submit" size="sm" kind="primary">
            Apply
          </Button>
        </div>
      </form>
    </Panel>
  );
}
