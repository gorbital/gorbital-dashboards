"use client";

import { useMemo, useRef, useState } from "react";
import { ZoomOut } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Legend, Panel } from "@gorbital/dash/components/panel";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { fmtInt } from "@gorbital/dash/lib/format";
import { theme } from "@gorbital/dash/theme";
import type { LogBucket } from "@/lib/api/logs";
import { clock } from "@/lib/time";

const levelColors = { error: theme.danger, warn: theme.warn, info: theme.info, debug: theme.faint } as const;
const order = ["debug", "info", "warn", "error"] as const;

type Props = {
  buckets: LogBucket[] | undefined;
  /** The bucket's width in ms, for the zoomed window's end. */
  bucketMs: number;
  loading?: boolean;
  /** The window is a zoom or a custom range, so Reset zoom applies. */
  zoomed: boolean;
  onZoom: (from: string, to: string) => void;
  onReset: () => void;
};

const W = 860;
const H = 120;
const padL = 36;
const padR = 8;
const padT = 8;
const padB = 20;

/** Records per bucket, stacked by level; click a bar or drag across bars to zoom the window to them. */
export function Histogram({ buckets, bucketMs, loading, zoomed, onZoom, onReset }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = buckets?.length ?? 0;
  const innerW = W - padL - padR;
  const slot = n ? innerW / n : innerW;
  const bw = Math.max(1, slot - (n > 120 ? 0.5 : 2));
  const max = useMemo(() => Math.max(1, ...(buckets ?? []).map((b) => b.total)), [buckets]);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const total = useMemo(() => (buckets ?? []).reduce((a, b) => a + b.total, 0), [buckets]);

  const indexAt = (clientX: number) => {
    const el = svg.current;
    if (!el || !n) return null;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    return Math.min(n - 1, Math.max(0, Math.floor((x - padL) / slot)));
  };

  const finish = (end: number | null) => {
    if (!drag || !buckets) return setDrag(null);
    const a = Math.min(drag.start, end ?? drag.end);
    const b = Math.max(drag.start, end ?? drag.end);
    setDrag(null);
    const from = Date.parse(buckets[a].time);
    const to = Date.parse(buckets[b].time) + bucketMs;
    onZoom(new Date(from).toISOString(), new Date(to).toISOString());
  };

  const labelEvery = n ? Math.max(1, Math.ceil(n / 8)) : 1;
  const sel = drag ? { a: Math.min(drag.start, drag.end), b: Math.max(drag.start, drag.end) } : null;
  const hovered = hover !== null && buckets ? buckets[hover] : null;

  return (
    <Panel
      title="Histogram"
      meta={buckets ? `${fmtInt(total)} records · ${n} buckets` : undefined}
      actions={
        <>
          {hovered && (
            <span className="font-mono text-[11px] text-dim tnum">
              {clock(hovered.time, false)} · {fmtInt(hovered.total)}
              {hovered.levels.error ? <span className="text-danger"> · {hovered.levels.error} error</span> : null}
              {hovered.levels.warn ? <span className="text-warn"> · {hovered.levels.warn} warn</span> : null}
            </span>
          )}
          <Legend items={[...order].reverse().map((l) => ({ label: l, color: levelColors[l] }))} />
          {zoomed && (
            <Button size="sm" kind="ghost" icon={<ZoomOut size={11} />} onClick={onReset}>
              Reset zoom
            </Button>
          )}
        </>
      }
    >
      {loading || !buckets ? (
        <Skeleton className="h-[120px] w-full" rounded="rounded-lg" />
      ) : (
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full cursor-crosshair select-none touch-none"
          role="img"
          aria-label="Records per bucket; click or drag to zoom"
          onPointerDown={(e) => {
            const i = indexAt(e.clientX);
            if (i === null) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag({ start: i, end: i });
          }}
          onPointerMove={(e) => {
            const i = indexAt(e.clientX);
            setHover(i);
            if (drag && i !== null) setDrag({ start: drag.start, end: i });
          }}
          onPointerUp={(e) => finish(indexAt(e.clientX))}
          onPointerCancel={() => setDrag(null)}
          onPointerLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} stroke={theme.hairline} strokeDasharray={f === 0 ? undefined : "2 4"} />
              <text x={padL - 6} y={y(max * f) + 3} textAnchor="end" fontSize="9.5" fontFamily="var(--font-mono)" fill={theme.dim}>
                {Math.round(max * f)}
              </text>
            </g>
          ))}
          {sel && <rect x={padL + sel.a * slot} y={padT} width={(sel.b - sel.a + 1) * slot} height={H - padT - padB} fill={theme.primary} fillOpacity={0.12} stroke={theme.primary} strokeOpacity={0.5} />}
          {buckets.map((b, i) => {
            let acc = 0;
            const x = padL + i * slot;
            const dim = sel ? i < sel.a || i > sel.b : false;
            return (
              <g key={b.time} opacity={dim ? 0.4 : 1}>
                <rect x={x} y={padT} width={slot} height={H - padT - padB} fill={hover === i ? theme.elevated : "transparent"} />
                {order.map((l) => {
                  const v = b.levels[l];
                  if (!v) return null;
                  const y0 = y(acc + v);
                  const hgt = y(acc) - y0;
                  acc += v;
                  return <rect key={l} x={x} y={y0} width={bw} height={Math.max(0.5, hgt)} fill={levelColors[l]} />;
                })}
                {i % labelEvery === 0 && (
                  <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fontFamily="var(--font-mono)" fill={theme.dim}>
                    {clock(b.time, false).slice(0, 5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </Panel>
  );
}
