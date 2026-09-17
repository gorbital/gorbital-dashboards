import type { Tone } from "@gorbital/dash/theme";
import type { HealthStatus } from "../api/observability";

/** How a ratio or a percentage reads: fine, worth a look, or a problem. */
export type Grade = "good" | "ok" | "poor";

/** Cache and index hit ratios (0 to 1): 99% and up is good, 95% is ok, below that the working set doesn't fit. */
export function hitGrade(ratio: number): Grade {
  if (!Number.isFinite(ratio)) return "poor";
  if (ratio >= 0.99) return "good";
  if (ratio >= 0.95) return "ok";
  return "poor";
}

/** CPU, memory and disk use (0 to 100): under 70 is fine, 90 and up is a problem. */
export function usageGrade(percent: number): Grade {
  if (!Number.isFinite(percent)) return "poor";
  if (percent >= 90) return "poor";
  if (percent >= 70) return "ok";
  return "good";
}

/** Connections against `max_connections`: PostgreSQL refuses new sessions at the limit, so 90% is already a problem. */
export function connectionsGrade(used: number, max: number): Grade {
  if (max <= 0) return "poor";
  return usageGrade((used / max) * 100);
}

/** Server errors per request (0 to 1): under 0.1% is fine, over 1% is a problem. */
export function errorRateGrade(rate: number): Grade {
  if (!Number.isFinite(rate)) return "poor";
  if (rate >= 0.01) return "poor";
  if (rate >= 0.001) return "ok";
  return "good";
}

/** A load average against the core count: at the count, every core has a runnable thread. */
export function loadGrade(load: number, cores: number): Grade {
  if (cores <= 0) return "good";
  const ratio = load / cores;
  if (ratio >= 1.5) return "poor";
  if (ratio >= 1) return "ok";
  return "good";
}

export const gradeTone: Record<Grade, Tone> = { good: "ok", ok: "warn", poor: "danger" };

export const gradeLabel: Record<Grade, string> = { good: "good", ok: "ok", poor: "poor" };

export const healthTone: Record<HealthStatus, Tone> = { ok: "ok", degraded: "warn", down: "danger", unknown: "muted" };

/** The worst status wins: down > degraded > unknown > ok. */
export function worstStatus(statuses: HealthStatus[]): HealthStatus {
  const order: HealthStatus[] = ["down", "degraded", "unknown", "ok"];
  for (const s of order) if (statuses.includes(s)) return s;
  return "ok";
}
