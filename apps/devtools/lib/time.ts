/** Time as the tables show it: local clock with milliseconds, dates only when they differ from today. */

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** `14:32:08.412` in local time; `--:--:--` for anything unparseable. */
export function clock(iso: string, ms = true): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return ms ? `${base}.${pad(d.getMilliseconds(), 3)}` : base;
}

/** `15 Sep 14:32` in local time. */
export function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "3m ago", "in 6m", "2h ago"; `now` comes from `useNow` so the server and the first client render agree ("—" while it's 0). */
export function ago(iso: string | undefined, now: number): string {
  if (!iso || !now) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const s = Math.round((now - t) / 1000);
  const abs = Math.abs(s);
  const word = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.round(abs / 60)}m` : abs < 86_400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86_400)}d`;
  return s < 0 ? `in ${word}` : `${word} ago`;
}

/** The difference between two ISO times, formatted like a duration. */
export function between(from: string | undefined, to: string | undefined): string {
  if (!from || !to) return "—";
  const ms = Date.parse(to) - Date.parse(from);
  if (Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}
