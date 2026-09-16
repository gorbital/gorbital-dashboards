"use client";

import { AlignLeft, ChevronDown, FileOutput, Keyboard, ListTree, Play, Save } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Dropdown } from "@gorbital/dash/components/dropdown";
import { Select } from "@gorbital/dash/components/input";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import type { RunMode } from "@/lib/api/sql";
import { rowLimits, runModes, timeouts, type RunSettings } from "@/lib/sql-editor/run";

type Props = {
  settings: RunSettings;
  onSettings: (s: RunSettings) => void;
  hasSelection: boolean;
  canRun: boolean;
  running: boolean;
  explaining: boolean;
  onRun: (selectionOnly: boolean) => void;
  onExplain: (analyze: boolean) => void;
  onFormat: () => void;
  onSave: () => void;
  onMigration: () => void;
  /** Ctrl on Windows and Linux, ⌘ on a Mac. */
  mod: string;
};

const shortcuts: [string, string][] = [
  ["Run (selection when there is one)", "⌘⏎"],
  ["Save snippet", "⌘S"],
  ["Format", "⇧⌥F"],
  ["Find / replace", "⌘F · ⌘H"],
  ["Toggle comment", "⌘/"],
  ["Autocomplete", "^Space"],
  ["Go to line", "^G"],
];

export function Toolbar({ settings, onSettings, hasSelection, canRun, running, explaining, onRun, onExplain, onFormat, onSave, onMigration, mod }: Props) {
  const busy = running || explaining;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2">
      <Tooltip content={hasSelection ? "Run the selected text" : "Run the whole script"} shortcut={`${mod}⏎`}>
        <Button size="sm" kind="primary" icon={<Play size={11} />} onClick={() => onRun(hasSelection)} disabled={!canRun || busy} loading={running}>
          {hasSelection ? "Run selection" : "Run"}
        </Button>
      </Tooltip>
      {hasSelection && (
        <Tooltip content="Run the whole script, ignoring the selection">
          <Button size="sm" kind="ghost" onClick={() => onRun(false)} disabled={!canRun || busy}>
            Run all
          </Button>
        </Tooltip>
      )}
      <ModeSegmented value={settings.mode} onChange={(mode) => onSettings({ ...settings, mode })} />
      <Tooltip content="Rows kept of each result set">
        <span className="inline-flex">
          <Select value={settings.rowLimit} onChange={(e) => onSettings({ ...settings, rowLimit: Number(e.target.value) })} className="w-auto" aria-label="Row limit">
            {rowLimits.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString("en-US")} rows
              </option>
            ))}
          </Select>
        </span>
      </Tooltip>
      <Tooltip content="statement_timeout for the run">
        <span className="inline-flex">
          <Select value={settings.timeoutSeconds} onChange={(e) => onSettings({ ...settings, timeoutSeconds: Number(e.target.value) })} className="w-auto" aria-label="Timeout">
            {timeouts.map((n) => (
              <option key={n} value={n}>
                {n >= 60 ? `${n / 60} min` : `${n} s`}
              </option>
            ))}
          </Select>
        </span>
      </Tooltip>
      <span className="mx-0.5 h-5 w-px bg-hairline" />
      <Tooltip content="Explain the statement (EXPLAIN FORMAT JSON, VERBOSE), never run">
        <Button size="sm" kind="ghost" icon={<ListTree size={11} />} onClick={() => onExplain(false)} disabled={!canRun || busy} loading={explaining}>
          Explain
        </Button>
      </Tooltip>
      <Tooltip content="EXPLAIN ANALYZE: runs the statement in a transaction that is rolled back">
        <Button size="sm" kind="ghost" onClick={() => onExplain(true)} disabled={!canRun || busy}>
          Analyze
        </Button>
      </Tooltip>
      <Tooltip content="Format with sql-formatter (the selection when there is one)" shortcut="⇧⌥F">
        <Button size="sm" kind="ghost" icon={<AlignLeft size={11} />} onClick={onFormat} disabled={!canRun}>
          Format
        </Button>
      </Tooltip>
      <span className="ml-auto" />
      <Tooltip content="Save to db/queries/<name>.sql" shortcut={`${mod}S`}>
        <Button size="sm" kind="secondary" icon={<Save size={11} />} onClick={onSave} disabled={!canRun}>
          Save
        </Button>
      </Tooltip>
      <Tooltip content="Write the script as a migration's Up section under db/migrations">
        <Button size="sm" kind="secondary" icon={<FileOutput size={11} />} onClick={onMigration} disabled={!canRun}>
          Save as migration
        </Button>
      </Tooltip>
      <Tooltip
        side="bottom"
        align="end"
        content={
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            {shortcuts.map(([what, keys]) => (
              <div key={what} className="contents">
                <dt className="text-muted">{what}</dt>
                <dd className="font-mono text-[10.5px] text-dim">{keys.replace(/⌘/g, mod)}</dd>
              </div>
            ))}
          </dl>
        }
      >
        <button type="button" className="grid h-7 w-7 place-items-center rounded-lg text-dim hover:bg-elevated hover:text-text" aria-label="Keyboard shortcuts">
          <Keyboard size={13} />
        </button>
      </Tooltip>
    </div>
  );
}

const modeTone: Record<RunMode, string> = { rollback: "text-text", commit: "text-warn", readonly: "text-info" };

/** The mode picker: a segmented control whose options explain themselves. */
function ModeSegmented({ value, onChange }: { value: RunMode; onChange: (m: RunMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Run mode" className="inline-flex h-7 items-center rounded-lg border border-border bg-surface p-[2px] text-[11px]">
      {runModes.map((m) => (
        <Tooltip key={m.value} content={m.description} side="bottom">
          <button
            type="button"
            role="radio"
            aria-checked={m.value === value}
            onClick={() => onChange(m.value)}
            className={`h-full rounded-[5px] px-2 font-medium transition-colors ${m.value === value ? `bg-elevated ${modeTone[m.value]}` : "text-dim hover:text-muted"}`}
          >
            {m.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

/** A small menu for extra actions on a result set: copy or download in a format. */
export function FormatMenu({ label, icon, onPick, disabled }: { label: string; icon: React.ReactNode; onPick: (format: "csv" | "json" | "markdown") => void; disabled?: boolean }) {
  return (
    <Dropdown
      trigger={
        <button type="button" disabled={disabled} className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted hover:bg-elevated hover:text-text disabled:opacity-50">
          {icon}
          {label}
          <ChevronDown size={10} className="text-dim" />
        </button>
      }
      items={[
        { label: "CSV", onSelect: () => onPick("csv") },
        { label: "JSON", onSelect: () => onPick("json") },
        { label: "Markdown", onSelect: () => onPick("markdown") },
      ]}
    />
  );
}
