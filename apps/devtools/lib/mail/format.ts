import type { MailAddress, MailPreview, MailSummary } from "@/lib/api/mail";

/*
 * The Mail screen's pure logic: how addresses, codes and sizes read, how
 * the stream's messages fold into the list, how previews group.
 */

/** `Ada Lovelace <ada@acme.dev>`, or the address alone. */
export function displayAddress(a: MailAddress | undefined): string {
  if (!a) return "";
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

/** The addresses joined, names dropped when there are several so the line stays short. */
export function displayAddresses(list: MailAddress[] | undefined, max = 3): string {
  if (!list || list.length === 0) return "";
  if (list.length === 1) return displayAddress(list[0]);
  const shown = list.slice(0, max).map((a) => a.email);
  return list.length > max ? `${shown.join(", ")} +${list.length - max}` : shown.join(", ");
}

/**
 * A code as the chip shows it: digits in groups of three (`483 920`), an
 * alphanumeric code as it is. The copied value is always the original.
 */
export function formatCode(code: string): string {
  if (!/^\d{6,8}$/.test(code)) return code;
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** `1.2 KB`, `812 B`, `3.4 MB`, with a space, for the list's size column. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** The subject, or a placeholder for an empty one. */
export function subjectOf(m: { subject: string }): string {
  return m.subject.trim() || "(no subject)";
}

/**
 * The store's search, mirrored: a message matches when every word of `q`
 * is in its subject, snippet, an address or a code, case-insensitively.
 * The stream's messages go through it so a filtered list stays filtered.
 */
export function matchesQuery(m: MailSummary, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [m.subject, m.snippet, m.from.email, m.from.name ?? "", ...m.to.flatMap((a) => [a.email, a.name ?? ""]), ...m.codes, m.category ?? ""].join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Puts `m` at the front of a newest-first list (replacing an earlier copy), capped at `max`. */
export function mergeMessage(list: MailSummary[], m: MailSummary, max = 100): MailSummary[] {
  const rest = list.filter((x) => x.id !== m.id);
  const out = [m, ...rest].sort((a, b) => Date.parse(b.time) - Date.parse(a.time) || b.id.localeCompare(a.id));
  return out.slice(0, max);
}

export type PreviewGroup = { category: string; label: string; previews: MailPreview[] };

/**
 * The previews grouped by category in the order the app listed them,
 * with a label: `auth_verification` → "Auth · verification", `test` → "Test".
 */
export function groupPreviews(previews: MailPreview[]): PreviewGroup[] {
  const groups = new Map<string, PreviewGroup>();
  for (const p of previews) {
    const category = p.category || "other";
    let g = groups.get(category);
    if (!g) {
      g = { category, label: categoryLabel(category), previews: [] };
      groups.set(category, g);
    }
    g.previews.push(p);
  }
  return [...groups.values()];
}

/** `auth_password_reset` → "Auth · password reset". */
export function categoryLabel(category: string): string {
  const parts = category.split(/[_.-]+/).filter(Boolean);
  if (parts.length === 0) return "Other";
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (parts.length === 1) return cap(parts[0]);
  return `${cap(parts[0])} · ${parts.slice(1).join(" ")}`;
}

/** The name without its module prefix: `auth.verification_code` → "verification code". */
export function previewTitle(name: string): string {
  const short = name.includes(".") ? name.slice(name.indexOf(".") + 1) : name;
  return short.replace(/_/g, " ");
}

/** A host to show for a link, and whether it points at the app's bench (a loopback host). */
export function linkHost(url: string): { host: string; local: boolean } {
  try {
    const u = new URL(url);
    return { host: u.host, local: /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(u.host) };
  } catch {
    return { host: url, local: false };
  }
}
