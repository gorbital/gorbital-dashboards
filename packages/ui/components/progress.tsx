import { theme } from "../theme";

export function Bar({ value, max = 100, color = theme.primary, height = 6, track = true }: { value: number; max?: number; color?: string; height?: number; track?: boolean }) {
  return (
    <div className={`w-full overflow-hidden rounded-full ${track ? "bg-elevated" : ""}`} style={{ height }}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </div>
  );
}

/** A segmented bar, e.g. status classes or queue states. */
export function Split({ parts, height = 6 }: { parts: { value: number; color: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-elevated gap-px" style={{ height }}>
      {parts.map((p, i) => (
        <div key={i} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
      ))}
    </div>
  );
}
