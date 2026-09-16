"use client";

import type { ReactNode } from "react";
import { Empty } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { useCapabilities } from "@/lib/api/queries";
import { ProblemPanel } from "./problem-panel";

type Props = {
  /** What the page reads: the dev console (`/_dev/*`) or the ops API (`/ops/*`, Full preset). */
  need: "console" | "ops" | "database";
  /** Rendered while the status hasn't answered; skeletons keep the prerender and the first client render alike. */
  loading?: ReactNode;
  children: ReactNode;
};

/**
 * Renders `children` once the status says the app can answer what the page
 * reads, and the right explanation otherwise: not connected, not signed in,
 * app stopped, no console, Minimal preset.
 */
export function Gate({ need, loading, children }: Props) {
  const { status, running, console, ops, database } = useCapabilities();
  if (status.error && !status.data) return <ProblemPanel error={status.error} scope="portal" onRetry={() => void status.refetch()} retrying={status.isFetching} />;
  if (!status.data) return <>{loading ?? <SkeletonLines lines={6} className="p-4" />}</>;
  if (!running) return <Empty title={`App ${status.data.app.state}`} hint={status.data.app.state === "stopped" ? "Start it from the Overview; this page reads from the running app." : "This page reads from the running app; it fills in when the app is up."} />;
  if (need === "console" && !console) return <Empty title="This app has no dev console" hint="Apps created before v1.1, or run without DEV_CONSOLE_TOKEN, don't serve /_dev/. Run it through orb dev with the token set." />;
  if (need === "ops" && !ops) return <Empty title="This app has no ops API" hint="The Minimal preset has no /ops endpoints; orb add ops, or a Full app, brings them." />;
  if (need === "database" && !database) return <Empty title="This app has no database" hint="The Minimal preset runs without PostgreSQL, so there are no migrations, jobs or settings here." />;
  return <>{children}</>;
}
