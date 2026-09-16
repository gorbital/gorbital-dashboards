import type { FlagState, FlagTargets } from "@/lib/api/flags";

/*
 * The Flags tab's pure logic: how a state reads, the form behind the
 * editor, and what the app would refuse before it is sent.
 */

/** How many IDs a state targets across both lists of both rules. */
export function targetCount(state: FlagState): number {
  const n = (t?: FlagTargets) => (t?.allow?.length ?? 0) + (t?.deny?.length ?? 0);
  return n(state.orgs) + n(state.users);
}

/** One line for the table: "off", "on for everyone", "25% rollout · 3 targets", "off by default · 2 targets". */
export function describeFlagState(state: FlagState): string {
  if (!state.enabled) return "off";
  const parts: string[] = [];
  if (typeof state.percentage === "number") parts.push(`${state.percentage}% rollout`);
  else parts.push(state.default ? "on for everyone" : "off by default");
  const targets = targetCount(state);
  if (targets > 0) parts.push(`${targets} target${targets === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** The editor's fields: lists as one ID per line, the percentage as text (empty for no rollout). */
export type FlagForm = {
  enabled: boolean;
  default: boolean;
  percentage: string;
  usersAllow: string;
  usersDeny: string;
  orgsAllow: string;
  orgsDeny: string;
};

const lines = (ids?: string[] | null) => (ids ?? []).join("\n");

export function formFromState(state: FlagState): FlagForm {
  return {
    enabled: state.enabled,
    default: state.default,
    percentage: typeof state.percentage === "number" ? String(state.percentage) : "",
    usersAllow: lines(state.users?.allow),
    usersDeny: lines(state.users?.deny),
    orgsAllow: lines(state.orgs?.allow),
    orgsDeny: lines(state.orgs?.deny),
  };
}

/** IDs from a textarea: one per line or comma-separated, trimmed, empty lines dropped, duplicates removed. */
export function parseTargets(text: string): string[] {
  return [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}

export type FormCheck = { ok: true; state: FlagState } | { ok: false; error: string; field?: keyof FlagForm };

/** Turns the form into a `FlagState`, refusing what the app would refuse (a percentage outside 0–100, an ID in both lists of a rule, too many or too long IDs). */
export function stateFromForm(form: FlagForm): FormCheck {
  let percentage: number | null = null;
  const p = form.percentage.trim();
  if (p !== "") {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: "The percentage is a whole number from 0 to 100, or empty for no rollout.", field: "percentage" };
    percentage = n;
  }
  const rule = (allowText: string, denyText: string, what: string, field: keyof FlagForm): { ok: true; targets: FlagTargets } | { ok: false; error: string; field: keyof FlagForm } => {
    const allow = parseTargets(allowText);
    const deny = parseTargets(denyText);
    for (const list of [allow, deny]) {
      if (list.length > 1000) return { ok: false, error: `At most 1000 ${what} IDs per list.`, field };
      const bad = list.find((id) => id.length > 100 || !/^[\x21-\x7e]+$/.test(id));
      if (bad) return { ok: false, error: `"${bad}" isn't an ID: 1 to 100 visible ASCII characters.`, field };
    }
    const both = allow.find((id) => deny.includes(id));
    if (both) return { ok: false, error: `${both} is in both the allow and the deny list of ${what}.`, field };
    return { ok: true, targets: { allow, deny } };
  };
  const users = rule(form.usersAllow, form.usersDeny, "users", "usersAllow");
  if (!users.ok) return users;
  const orgs = rule(form.orgsAllow, form.orgsDeny, "organisations", "orgsAllow");
  if (!orgs.ok) return orgs;
  return { ok: true, state: { enabled: form.enabled, default: form.default, percentage, users: users.targets, orgs: orgs.targets } };
}

/** True when two states mean the same thing (lists compared as sets, a missing list as empty, a missing percentage as null). */
export function sameState(a: FlagState, b: FlagState): boolean {
  const norm = (s: FlagState) => ({
    enabled: s.enabled,
    default: s.default,
    percentage: typeof s.percentage === "number" ? s.percentage : null,
    ua: [...(s.users?.allow ?? [])].sort(),
    ud: [...(s.users?.deny ?? [])].sort(),
    oa: [...(s.orgs?.allow ?? [])].sort(),
    od: [...(s.orgs?.deny ?? [])].sort(),
  });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
