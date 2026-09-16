/** Commit messages: the subject line and the body, split and joined the way git does. */

/** The message git records: subject, a blank line, the body; trailing whitespace stripped. */
export function joinMessage(subject: string, body: string): string {
  const s = subject.trim();
  const b = body.replace(/\s+$/, "");
  return b ? `${s}\n\n${b}` : s;
}

/** The first line and the rest (after the blank line), as `git log` splits them. */
export function splitMessage(message: string): { subject: string; body: string } {
  const text = message.replace(/\r\n/g, "\n").trim();
  const nl = text.indexOf("\n");
  if (nl === -1) return { subject: text, body: "" };
  return { subject: text.slice(0, nl).trim(), body: text.slice(nl + 1).replace(/^\n+/, "").replace(/\s+$/, "") };
}

/** A subject cut to `max` characters with an ellipsis, for lists. */
export function shortSubject(subject: string, max = 72): string {
  const s = subject.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
