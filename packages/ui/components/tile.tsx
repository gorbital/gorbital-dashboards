import type { ReactNode } from "react";
import { Sparkline } from "../charts/sparkline";
import { theme } from "../theme";
import { Skeleton } from "./spinner";

type Props = {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaTone?: "good" | "bad" | "flat";
  spark?: number[];
  sparkColor?: string;
  /** The one accent moment on the page. */
  hero?: boolean;
  icon?: ReactNode;
  footer?: ReactNode;
  /** Shimmers in place of the value until the first data arrives. */
  loading?: boolean;
};

export function Tile({ label, value, unit, delta, deltaTone = "good", spark, sparkColor, hero, icon, footer, loading }: Props) {
  const deltaClass = deltaTone === "bad" ? "text-danger" : deltaTone === "flat" ? "text-dim" : "text-ok";
  return (
    <div className={`panel relative flex min-h-[112px] flex-col overflow-hidden p-4 ${hero ? "accent-wash" : ""}`}>
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-dim">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        {loading ? (
          <Skeleton className="h-[22px] w-20" />
        ) : (
          <>
            <b className="text-[26px] font-semibold leading-none tracking-[-0.03em] tnum">{value}</b>
            {unit && <span className="text-[12px] text-dim">{unit}</span>}
            {delta && <span className={`ml-1 font-mono text-[11px] tnum ${deltaClass}`}>{delta}</span>}
          </>
        )}
      </div>
      {footer && <div className="mt-auto pt-2 text-[11px] text-dim">{footer}</div>}
      {spark && (
        <div className="pointer-events-none absolute bottom-0 right-0 opacity-90">
          <Sparkline data={spark} width={150} height={44} color={sparkColor ?? (hero ? theme.primary : theme.muted)} />
        </div>
      )}
    </div>
  );
}

export function TileGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const cls = { 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6" }[cols];
  return <div className={`grid ${cls} gap-3 stagger`}>{children}</div>;
}
