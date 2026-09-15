import { theme } from "../theme";

export type AreaSeries = { name: string; data: number[]; color?: string };

type Props = {
  series: AreaSeries[];
  labels?: string[];
  height?: number;
  width?: number;
  unit?: string;
  yTicks?: number;
  /** Threshold line, e.g. an SLO. */
  threshold?: { value: number; label: string; color?: string };
  className?: string;
};

/** A layered area chart; the first series sits on top. Width fills the parent. */
export function AreaChart({
  series,
  labels,
  height = 220,
  width = 860,
  unit = "",
  yTicks = 4,
  threshold,
  className,
}: Props) {
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const w = width;
  const h = height;
  const n = Math.max(...series.map((s) => s.data.length));
  const max = Math.max(threshold?.value ?? 0, ...series.flatMap((s) => s.data)) * 1.08 || 1;
  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i);
  const gradId = (i: number) => `area-${i}-${series[i].name.replace(/\W/g, "")}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className ?? "w-full h-auto"} aria-hidden="true">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={gradId(i)} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={s.color ?? theme.primary} stopOpacity="0.22" />
            <stop offset="1" stopColor={s.color ?? theme.primary} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={theme.hairline} strokeDasharray={i === 0 ? undefined : "2 4"} />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill={theme.dim}>
            {fmtTick(t)}
            {unit}
          </text>
        </g>
      ))}
      {labels?.map((l, i) =>
        i % Math.ceil(labels.length / 8) === 0 ? (
          <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={theme.dim}>
            {l}
          </text>
        ) : null,
      )}
      {[...series].reverse().map((s, ri) => {
        const i = series.length - 1 - ri;
        const c = s.color ?? theme.primary;
        const line = s.data.map((v, j) => `${j === 0 ? "M" : "L"}${x(j).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
        return (
          <g key={i}>
            <path d={`${line} L${x(s.data.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} fill={`url(#${gradId(i)})`} />
            <path d={line} fill="none" stroke={c} strokeWidth={i === 0 ? 1.8 : 1.2} strokeLinejoin="round" />
          </g>
        );
      })}
      {threshold && (
        <g>
          <line x1={padL} x2={w - padR} y1={y(threshold.value)} y2={y(threshold.value)} stroke={threshold.color ?? theme.danger} strokeDasharray="4 4" strokeOpacity="0.8" />
          <text x={w - padR} y={y(threshold.value) - 5} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill={threshold.color ?? theme.danger}>
            {threshold.label}
          </text>
        </g>
      )}
    </svg>
  );
}

function fmtTick(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  if (v >= 10) return `${Math.round(v)}`;
  return v.toFixed(v === 0 ? 0 : 1);
}
