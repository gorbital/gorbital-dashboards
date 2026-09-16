import type { ReactNode } from "react";
import { theme } from "../theme";

type Props = {
  /** 0 to `max`. */
  value: number;
  max?: number;
  /** The number under the arc, e.g. "99.9%". */
  label: ReactNode;
  /** The small caption under the label. */
  caption?: ReactNode;
  color?: string;
  size?: number;
  className?: string;
};

/**
 * A three-quarter arc gauge: the track in the elevated tone, the value in
 * `color`, the label in the middle. Inline SVG, theme tokens only.
 */
export function Gauge({ value, max = 100, label, caption, color = theme.primary, size = 120, className = "" }: Props) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const sweep = 270;
  const start = 135;
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const arc = (deg: number) => {
    const rad = ((start + deg) * Math.PI) / 180;
    return [c + r * Math.cos(rad), c + r * Math.sin(rad)] as const;
  };
  const path = (deg: number) => {
    if (deg <= 0) return "";
    const [x0, y0] = arc(0);
    const [x1, y1] = arc(Math.min(deg, sweep - 0.01));
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  return (
    <div className={`relative inline-grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <path d={path(sweep)} fill="none" stroke={theme.elevated} strokeWidth={stroke} strokeLinecap="round" />
        {ratio > 0 && <path d={path(sweep * ratio)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" className="transition-[d] duration-500" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
        <div className="text-[20px] font-semibold leading-none tracking-[-0.02em] tnum">{label}</div>
        {caption && <div className="mt-1.5 max-w-[80%] truncate text-center font-mono text-[10px] uppercase tracking-wider text-dim">{caption}</div>}
      </div>
    </div>
  );
}
