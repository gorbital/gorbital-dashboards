"use client";

import { useRouter } from "next/navigation";
import { TerminalSquare } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Gauge } from "@gorbital/dash/components/gauge";
import { Empty } from "@gorbital/dash/components/panel";
import { toneColor } from "@gorbital/dash/theme";
import type { HealthStatus } from "@/lib/api/observability";
import { useStatus } from "@/lib/api/queries";
import { percent } from "@/lib/observability/format";
import { gradeLabel, gradeTone, healthTone, hitGrade } from "@/lib/observability/grade";
import { saveDraft } from "@/lib/sql-editor/draft";

/** A service's status as a pill: ok, degraded, down or unknown, in the theme's tones. */
export function StatusPill({ status }: { status: HealthStatus }) {
  return (
    <Badge tone={healthTone[status]} className="gap-1.5">
      <Dot tone={healthTone[status]} pulse={status === "degraded" || status === "down"} />
      {status}
    </Badge>
  );
}

/** A cache or index hit ratio as a graded gauge: 99% and up good, 95% ok, below poor. */
export function HitGauge({ ratio, caption, size = 116 }: { ratio: number; caption: string; size?: number }) {
  const grade = hitGrade(ratio);
  return (
    <div className="flex flex-col items-center gap-1">
      <Gauge value={ratio * 100} max={100} label={percent(ratio)} caption={caption} color={toneColor[gradeTone[grade]]} size={size} />
      <Badge tone={gradeTone[grade]}>{gradeLabel[grade]}</Badge>
    </div>
  );
}

/** Puts `sql` in the SQL editor's draft (read-only mode) and goes there. */
export function useOpenInSqlEditor() {
  const router = useRouter();
  const status = useStatus();
  const appName = status.data?.project.name ?? "";
  return (sql: string) => {
    saveDraft(appName, { sql, mode: "readonly" });
    router.push("/database/sql");
  };
}

export function OpenInSqlEditorButton({ sql, size = "sm", kind = "ghost", label = "Open in SQL editor" }: { sql: string; size?: "sm" | "md"; kind?: "ghost" | "secondary" | "primary"; label?: string }) {
  const open = useOpenInSqlEditor();
  return (
    <Button size={size} kind={kind} icon={<TerminalSquare size={11} />} onClick={() => open(sql)}>
      {label}
    </Button>
  );
}

/** The database tabs when the project has no database. */
export function NoDatabase() {
  return <Empty title="This app has no database" hint="The Minimal preset runs without PostgreSQL, so there are no statistics, statements or advice here." />;
}

/** A label/value pair for the small stat rows. */
export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "warn" | "danger" }) {
  const cls = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-text";
  return (
    <div className="rounded-lg border border-hairline bg-bg/40 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className={`mt-1 text-[15px] font-semibold leading-none tnum ${cls}`}>{value}</div>
    </div>
  );
}
