import { theme } from "../theme";

export type Slice = { label: string; value: number; color: string };

type Props = {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: { value: string; label?: string };
  className?: string;
};

export function Donut({ slices, size = 120, thickness = 14, center, className }: Props) {
  const r = size / 2 - thickness / 2 - 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.hairline} strokeWidth={thickness} />
      {slices.map((s, i) => {
        const len = (s.value / total) * c;
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
      {center && (
        <>
          <text x={size / 2} y={size / 2 + (center.label ? -2 : 5)} textAnchor="middle" fill={theme.text} fontFamily="var(--font-sans)" fontWeight="600" fontSize={size * 0.16}>
            {center.value}
          </text>
          {center.label && (
            <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill={theme.dim} fontFamily="var(--font-mono)" fontSize="9">
              {center.label}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
