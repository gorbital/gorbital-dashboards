/**
 * What the generators hub reads out of a `genplan.Plan` beyond the file
 * diffs: the CLI's pre-formatted summary and next steps, and the dry run
 * `add-orgs` answers (a file list without content, and the branch).
 */

import type { PlanChange } from "@/lib/api/types";

/** `changes` may still be `null` on the wire (an `add-orgs` dry run with nothing to do); the UI wants an array. */
export function planChanges(plan: { changes: PlanChange[] | null } | undefined): PlanChange[] {
  return plan?.changes ?? [];
}

/**
 * The CLI prints `next` either as one step per line ("go run ./cmd/migrate")
 * or already laid out ("Next steps:", "  1. ✓ …", ""), as `orb add mail`
 * does. The first is numbered by the UI, the second shown as it is.
 */
export function nextStepsPreformatted(next: string[] | null | undefined): boolean {
  if (!next?.length) return false;
  return next.some((line) => /^\s/.test(line) || /^\d+\.\s/.test(line) || line === "" || /:\s*$/.test(line));
}

/** The summary's lines, without the CLI's two-space indent and trailing blank lines. */
export function summaryLines(summary: string | undefined): string[] {
  if (!summary) return [];
  const lines = summary.replace(/\s+$/, "").split("\n");
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length));
  return lines.map((l) => l.slice(Number.isFinite(indent) ? indent : 0));
}

export type OrgsPlan = {
  /** The app already has organisations: nothing to apply. */
  already: boolean;
  /** The branch `orb add orgs` works on. */
  branch: string;
  /** The files the dry run would touch, without content. */
  files: string[];
  /** The count the summary states, or the file list's length. */
  count: number;
};

/** Reads an `add-orgs` plan: the CLI's dry run, which lists files and names the branch but carries no diff. */
export function describeOrgsPlan(plan: { summary: string; changes: PlanChange[] | null; next: string[] | null }): OrgsPlan {
  const files = planChanges(plan).map((c) => c.path);
  const already = /already has organisations/i.test(plan.summary ?? "");
  const branch = /on branch (\S+?)[:;,.]?(\s|$)/.exec(plan.summary ?? "")?.[1] ?? /Review the branch (\S+)/.exec((plan.next ?? []).join("\n"))?.[1] ?? "orb-add-orgs";
  const stated = /(\d+) files? change/.exec(plan.summary ?? "");
  return { already, branch, files, count: stated ? Number(stated[1]) : files.length };
}

/** A plan whose changes carry no content (the `add-orgs` dry run) is shown as a file list, not diffs. */
export function isFileListPlan(plan: { generator: string; changes: PlanChange[] | null }): boolean {
  if (plan.generator === "add-orgs") return true;
  const changes = planChanges(plan);
  return changes.length > 0 && changes.every((c) => !c.content && !c.before);
}

/** "Nothing to change" plans (the provider already in place, RLS already on) have no files and say so. */
export function isNoop(plan: { changes: PlanChange[] | null; summary: string }): boolean {
  return planChanges(plan).length === 0 && /nothing to change/i.test(plan.summary ?? "");
}
