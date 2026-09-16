/**
 * Where the developer dragged the tables, kept in localStorage per set of
 * schemas. Storage can be blocked or full, so every access is guarded and
 * a failure just means the layout starts from dagre again.
 */
import type { Position } from "./graph";

const PREFIX = "devtools.schema.positions";

export function positionsKey(schemas: string[]): string {
  return `${PREFIX}:${[...schemas].sort().join(",")}`;
}

export function loadPositions(key: string): Record<string, Position> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, Position> = {};
    for (const [id, p] of Object.entries(parsed as Record<string, unknown>)) {
      if (p && typeof p === "object" && typeof (p as Position).x === "number" && typeof (p as Position).y === "number") out[id] = { x: (p as Position).x, y: (p as Position).y };
    }
    return out;
  } catch {
    return {};
  }
}

export function savePositions(key: string, positions: Record<string, Position>): void {
  try {
    localStorage.setItem(key, JSON.stringify(positions));
  } catch {
    // Blocked or full: the layout is recomputed next time.
  }
}

export function clearPositions(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
