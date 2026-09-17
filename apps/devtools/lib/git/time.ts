/** Relative time in words, the way git and its hosts print it: "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function relativeTime(iso: string | undefined, now: number): string {
  if (!iso || !now) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const s = Math.round((now - t) / 1000);
  if (s < 0) return "in the future";
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w} week${w === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}
