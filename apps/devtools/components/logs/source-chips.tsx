"use client";

import { Pill } from "@gorbital/dash/components/pill";
import { fmtInt } from "@gorbital/dash/lib/format";
import { sourceLabels, sources, type Source } from "@/lib/logs/filters";

type Props = {
  /** The sources the filters keep; empty for all. */
  selected: string[];
  /** Records per source in what is loaded; undefined while nothing is. */
  counts?: Partial<Record<string, number>>;
  onChange: (sources: string[]) => void;
};

/** One chip per source, All first; a click selects one, shift-click adds it. Counts come from the loaded records. */
export function SourceChips({ selected, counts, onChange }: Props) {
  const total = counts ? Object.values(counts).reduce<number>((a, b) => a + (b ?? 0), 0) : undefined;
  const toggle = (s: Source, add: boolean) => {
    if (add) onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
    else onChange(selected.length === 1 && selected[0] === s ? [] : [s]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sources">
      <Pill active={selected.length === 0} caret={false} onClick={() => onChange([])}>
        All
        {total !== undefined && <span className="font-mono text-[11px] text-dim tnum">{fmtInt(total)}</span>}
      </Pill>
      {sources.map((s) => {
        const n = counts?.[s];
        const active = selected.includes(s);
        return (
          <Pill key={s} active={active} caret={false} onClick={() => toggle(s, false)} className="group/chip">
            <span
              onClick={(e) => {
                if (e.shiftKey) {
                  e.stopPropagation();
                  toggle(s, true);
                }
              }}
            >
              {sourceLabels[s]}
            </span>
            {n !== undefined && (selected.length === 0 || active) && <span className="font-mono text-[11px] text-dim tnum">{fmtInt(n)}</span>}
          </Pill>
        );
      })}
    </div>
  );
}
