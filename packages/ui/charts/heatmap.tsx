import { theme } from "../theme";

type Props = {
  /** rows × cols of values in [0, 1]. */
  rows: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  cell?: number;
  gap?: number;
  color?: string;
  className?: string;
};

/** A latency/throughput heatmap; opacity encodes the value. */
export function Heatmap({ rows, rowLabels, colLabels, cell = 14, gap = 2, color = theme.primary, className }: Props) {
  const padL = rowLabels ? 60 : 0;
  const padT = colLabels ? 16 : 0;
  const cols = rows[0]?.length ?? 0;
  const w = padL + cols * (cell + gap);
  const h = padT + rows.length * (cell + gap);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className ?? "w-full h-auto max-h-[230px]"} aria-hidden="true">
      {colLabels?.map((l, i) =>
        i % Math.ceil(cols / 12) === 0 ? (
          <text key={i} x={padL + i * (cell + gap) + cell / 2} y={10} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={theme.dim}>
            {l}
          </text>
        ) : null,
      )}
      {rows.map((row, r) => (
        <g key={r}>
          {rowLabels && (
            <text x={padL - 8} y={padT + r * (cell + gap) + cell / 2 + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill={theme.dim}>
              {rowLabels[r]}
            </text>
          )}
          {row.map((v, c) => (
            <rect
              key={c}
              x={padL + c * (cell + gap)}
              y={padT + r * (cell + gap)}
              width={cell}
              height={cell}
              rx={2}
              fill={v <= 0.02 ? theme.elevated : color}
              fillOpacity={v <= 0.02 ? 1 : 0.15 + v * 0.85}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
