/**
 * A job's schedule in plain English: "every weekday at 09:00", "every 15
 * minutes", "on demand". Covers the descriptors (`@every`, `@hourly`,
 * `@daily`…) and the 5-field cron shapes people write; anything else comes
 * back as the raw expression, so nothing is ever mis-described.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ALIASES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_ALIASES: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** `"every 15 minutes"`, `"every day at 03:00"`, `"on demand"`, or the expression itself when it has no plain reading. */
export function describeSchedule(expr: string | undefined): string {
  const s = (expr ?? "").trim();
  if (!s) return "on demand";
  if (s.startsWith("@")) return describeDescriptor(s) ?? s;
  return describeCron(s) ?? s;
}

/** Whether `describeSchedule` found words for it (false means the raw expression is shown). */
export function hasPlainSchedule(expr: string | undefined): boolean {
  const s = (expr ?? "").trim();
  return !s || describeSchedule(s) !== s;
}

function describeDescriptor(s: string): string | undefined {
  const lower = s.toLowerCase();
  switch (lower) {
    case "@hourly":
      return "every hour";
    case "@daily":
    case "@midnight":
      return "every day at 00:00";
    case "@weekly":
      return "every Sunday at 00:00";
    case "@monthly":
      return "on the 1st of every month at 00:00";
    case "@yearly":
    case "@annually":
      return "every year on 1 January at 00:00";
  }
  const every = /^@every\s+(.+)$/.exec(s);
  if (every) return describeEvery(every[1].trim());
  return undefined;
}

/** `15m` → "every 15 minutes", `1h` → "every hour", `1h30m` → "every 1 h 30 min". */
export function describeEvery(duration: string): string | undefined {
  const parts = [...duration.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)];
  if (!parts.length || parts.map((p) => p[0]).join("") !== duration) return undefined;
  const totalMs = parts.reduce((acc, [, n, u]) => acc + Number(n) * ({ ns: 1e-6, us: 1e-3, "µs": 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[u] ?? 0), 0);
  if (!(totalMs > 0)) return undefined;
  const whole = (ms: number, unit: string) => {
    const n = totalMs / ms;
    if (!Number.isInteger(n)) return undefined;
    return n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
  };
  if (totalMs % 3_600_000 === 0) return whole(3_600_000, "hour");
  if (totalMs % 60_000 === 0) {
    if (totalMs > 3_600_000) {
      const h = Math.floor(totalMs / 3_600_000);
      const m = (totalMs % 3_600_000) / 60_000;
      return `every ${h} h ${m} min`;
    }
    return whole(60_000, "minute");
  }
  if (totalMs % 1000 === 0) return whole(1000, "second");
  return `every ${duration}`;
}

type Field = { any: boolean; step?: number; values?: number[]; raw: string };

function parseField(raw: string, min: number, max: number, aliases?: Record<string, number>): Field | undefined {
  const f: Field = { any: false, raw };
  if (raw === "*" || raw === "?") return { any: true, raw };
  const step = /^(\*|\d+-\d+)\/(\d+)$/.exec(raw);
  if (step) {
    const n = Number(step[2]);
    if (!(n > 0)) return undefined;
    if (step[1] === "*") return { any: false, step: n, raw };
    const [lo, hi] = step[1].split("-").map(Number);
    if (lo === min && hi === max) return { any: false, step: n, raw };
    const values: number[] = [];
    for (let v = lo; v <= hi; v += n) values.push(v);
    return { any: false, values, raw };
  }
  const values = new Set<number>();
  for (const part of raw.split(",")) {
    const one = (token: string) => {
      const t = token.toLowerCase();
      if (aliases && t in aliases) return aliases[t];
      if (!/^\d+$/.test(t)) return undefined;
      return Number(t);
    };
    const range = /^([^-]+)-([^-]+)$/.exec(part);
    if (range) {
      const lo = one(range[1]);
      const hi = one(range[2]);
      if (lo === undefined || hi === undefined || lo > hi || lo < min || hi > max) return undefined;
      for (let v = lo; v <= hi; v++) values.add(v);
      continue;
    }
    const v = one(part);
    if (v === undefined || v < min || v > max) return undefined;
    values.add(v);
  }
  if (!values.size) return undefined;
  f.values = [...values].sort((a, b) => a - b);
  return f;
}

const pad = (n: number) => String(n).padStart(2, "0");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function describeCron(s: string): string | undefined {
  const fields = s.split(/\s+/);
  if (fields.length !== 5) return undefined;
  const minute = parseField(fields[0], 0, 59);
  const hour = parseField(fields[1], 0, 23);
  const dom = parseField(fields[2], 1, 31);
  const month = parseField(fields[3], 1, 12, MONTH_ALIASES);
  const dow = parseField(fields[4], 0, 7, DAY_ALIASES);
  if (!minute || !hour || !dom || !month || !dow) return undefined;
  if (dow.values) dow.values = [...new Set(dow.values.map((d) => (d === 7 ? 0 : d)))].sort((a, b) => a - b);

  // Sub-hourly: */15 * * * *, * * * * *, 0,30 * * * *.
  if (hour.any && dom.any && month.any && dow.any) {
    if (minute.any) return "every minute";
    if (minute.step) return minute.step === 1 ? "every minute" : `every ${minute.step} minutes`;
    if (minute.values) {
      if (minute.values.length === 1) return minute.values[0] === 0 ? "every hour" : `every hour at :${pad(minute.values[0])}`;
      return `every hour at ${list(minute.values.map((m) => `:${pad(m)}`))}`;
    }
  }
  // Every N hours: 0 */6 * * *.
  if (minute.values?.length === 1 && hour.step && dom.any && month.any && dow.any) {
    const at = minute.values[0] === 0 ? "" : ` at :${pad(minute.values[0])}`;
    return hour.step === 1 ? `every hour${at}` : `every ${hour.step} hours${at}`;
  }
  if (!minute.values || minute.values.length !== 1) return undefined;
  if (hour.values && hour.values.length > 4) return undefined;
  if (!hour.values) return undefined;
  const times = list(hour.values.map((h) => `${pad(h)}:${pad(minute.values![0])}`));

  // Daily and weekly shapes.
  if (dom.any && month.any) {
    if (dow.any) return `every day at ${times}`;
    if (dow.values) {
      const d = dow.values;
      const same = (xs: number[]) => xs.length === d.length && xs.every((x, i) => x === d[i]);
      if (same([1, 2, 3, 4, 5])) return `every weekday at ${times}`;
      if (same([0, 6])) return `every weekend at ${times}`;
      if (same([0, 1, 2, 3, 4, 5, 6])) return `every day at ${times}`;
      return `every ${list(d.map((x) => DAYS[x]))} at ${times}`;
    }
    return undefined;
  }
  // Monthly and yearly shapes, on a day of the month.
  if (dow.any && dom.values && dom.values.length === 1) {
    const day = dom.values[0];
    if (month.any) return `on the ${ordinal(day)} of every month at ${times}`;
    if (month.values) return `every year on ${list(month.values.map((m) => `${day} ${MONTHS[m - 1]}`))} at ${times}`;
  }
  return undefined;
}
