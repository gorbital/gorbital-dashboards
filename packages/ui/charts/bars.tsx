import { theme } from "../theme";

export type BarStack = { name: string; data: number[]; color: string };

type Props = {
  stacks: BarStack[];
  labels?: string[];
  height?: number;
  width?: number;
  gap?: number;
  yTicks?: number;
  highlight?: number;
  className?: string;
};

/** Stacked bars, one column per label. Width fills the parent. */
export function BarChart({ stacks, labels, height = 220, width = 860, gap = 3, yTicks = 4, highlight, className }: Props) {
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const n = Math.max(...stacks.map((s) => s.data.length));
  const totals = Array.from({ length: n }, (_, i) => stacks.reduce((a, s) => a + (s.data[i] ?? 0), 0));
  const max = Math.max(...totals) * 1.08 || 1;
  const innerW = width - padL - padR;
  const bw = innerW / n - gap;
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className ?? "w-full h-auto"} aria-hidden="true">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={theme.hairline} strokeDasharray={i === 0 ? undefined : "2 4"} />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill={theme.dim}>
            {t >= 1000 ? `${(t / 1000).toFixed(t >= 10_000 ? 0 : 1)}k` : Math.round(t)}
          </text>
        </g>
      ))}
      {Array.from({ length: n }, (_, i) => {
        let acc = 0;
        const x = padL + i * (bw + gap);
        const dimmed = highlight !== undefined && highlight !== i;
        return (
          <g key={i} opacity={dimmed ? 0.45 : 1}>
            {stacks.map((s, si) => {
              const v = s.data[i] ?? 0;
              const y0 = y(acc + v);
              const hgt = y(acc) - y0;
              acc += v;
              return <rect key={si} x={x} y={y0} width={bw} height={Math.max(0, hgt)} fill={s.color} rx={si === stacks.length - 1 ? 2 : 0} />;
            })}
            {labels && i % Math.ceil(n / 8) === 0 && (
              <text x={x + bw / 2} y={height - 8} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill={theme.dim}>
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
