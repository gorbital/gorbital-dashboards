import { theme } from "../theme";

export type Span = {
  id: string;
  name: string;
  kind: "http" | "sql" | "job" | "mail" | "cache" | "internal" | "ext";
  start: number;
  duration: number;
  depth: number;
  error?: boolean;
};

const kindColor: Record<Span["kind"], string> = {
  http: theme.primary,
  sql: theme.info,
  job: theme.violet,
  mail: theme.warn,
  cache: theme.ok,
  internal: theme.muted,
  ext: theme.warn,
};

type Props = { spans: Span[]; total?: number; selected?: string; onSelect?: (id: string) => void };

/** Trace waterfall: one row per span, bars in the right column. */
export function Waterfall({ spans, total, selected }: Props) {
  const max = total ?? Math.max(...spans.map((s) => s.start + s.duration));
  return (
    <div className="font-mono text-[11px]">
      <div className="grid grid-cols-[minmax(220px,1fr)_2fr_64px] items-center border-b border-hairline pb-1.5 mb-1 text-[10px] uppercase tracking-wider text-dim">
        <span>Span</span>
        <span className="relative h-3">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t} className="absolute -translate-x-1/2" style={{ left: `${t * 100}%` }}>
              {Math.round(max * t)}ms
            </span>
          ))}
        </span>
        <span className="text-right">Dur</span>
      </div>
      <ul className="stagger">
        {spans.map((s) => {
          const c = s.error ? theme.danger : kindColor[s.kind];
          return (
            <li
              key={s.id}
              className={`grid grid-cols-[minmax(220px,1fr)_2fr_64px] items-center gap-2 h-7 rounded-md px-1 -mx-1 ${selected === s.id ? "bg-elevated" : "hover:bg-elevated/60"}`}
            >
              <span className="flex items-center gap-2 min-w-0 truncate" style={{ paddingLeft: s.depth * 14 }}>
                <i className="inline-block w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: c }} />
                <span className={s.error ? "text-danger" : "text-text"}>{s.name}</span>
              </span>
              <span className="relative h-3">
                {[0.25, 0.5, 0.75].map((t) => (
                  <i key={t} className="absolute top-0 bottom-0 border-l border-hairline" style={{ left: `${t * 100}%` }} />
                ))}
                <i
                  className="absolute top-0 h-3 rounded-sm"
                  style={{
                    left: `${(s.start / max) * 100}%`,
                    width: `${Math.max(0.4, (s.duration / max) * 100)}%`,
                    background: c,
                    opacity: s.depth === 0 ? 1 : 0.8,
                  }}
                />
              </span>
              <span className="text-right text-dim tnum">{s.duration < 1 ? `${(s.duration * 1000).toFixed(0)}µs` : `${s.duration.toFixed(s.duration < 10 ? 1 : 0)}ms`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { kindColor as spanKindColor };
