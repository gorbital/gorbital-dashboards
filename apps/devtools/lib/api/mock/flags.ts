/**
 * Feature flags behind `/ops/flags*` in mock mode: the sample app's flags
 * with versions, a required reason, version conflicts and the state
 * validation the flags library applies (`invalid_flag_state`).
 */
import { NOW, MIN, HOUR, DAY } from "@gorbital/dash/lib/rand";
import type { FlagChange, FlagState, OpsFlag } from "../flags";
import type { Problem } from "../types";

const iso = (t: number) => new Date(t).toISOString();
const empty = (): FlagState => ({ enabled: false, default: false, percentage: null, orgs: { allow: [], deny: [] }, users: { allow: [], deny: [] } });

const declared: Omit<OpsFlag, "state" | "modified" | "invalid_stored_value" | "version">[] = [
  { key: "projects.search", group: "projects", description: "Full-text search over projects", client: true, declared_state: empty() },
  { key: "orgs.sso", group: "orgs", description: "SAML sign-in for organisations", client: false, declared_state: empty() },
  { key: "mail.digest", group: "mail", description: "Weekly organisation digest", client: false, declared_state: { ...empty(), enabled: true, default: true } },
  { key: "example.ping_time", group: "example", description: "Adds the server's time to GET /v1/ping replies. An example feature flag: turn it on with PUT /ops/flags/example.ping_time.", client: true, declared_state: empty() },
];

const initial = (): OpsFlag[] =>
  declared.map((d) => {
    if (d.key === "orgs.sso") {
      return { ...d, state: { enabled: true, default: false, percentage: 25, orgs: { allow: ["org_acme", "org_northwind"], deny: [] }, users: { allow: [], deny: [] } }, modified: true, invalid_stored_value: false, version: 3, updated_at: iso(NOW - 2 * DAY), updated_by: "ada@acme.dev" };
    }
    return { ...d, state: { ...d.declared_state, orgs: { allow: [], deny: [] }, users: { allow: [], deny: [] } }, modified: false, invalid_stored_value: false, version: 0 };
  });

const initialHistory = (): Record<string, FlagChange[]> => ({
  "orgs.sso": [
    { id: 3, key: "orgs.sso", old_state: { enabled: true, default: false, percentage: 10, orgs: { allow: ["org_acme"], deny: [] }, users: { allow: [], deny: [] } }, new_state: { enabled: true, default: false, percentage: 25, orgs: { allow: ["org_acme", "org_northwind"], deny: [] }, users: { allow: [], deny: [] } }, version: 2, reason: "widen the rollout to a quarter and add Northwind", actor_kind: "user", actor_id: "ada@acme.dev", request_id: "req_5d1c0a", changed_at: iso(NOW - 2 * DAY) },
    { id: 2, key: "orgs.sso", old_state: { enabled: true, default: false, percentage: null, orgs: { allow: ["org_acme"], deny: [] }, users: { allow: [], deny: [] } }, new_state: { enabled: true, default: false, percentage: 10, orgs: { allow: ["org_acme"], deny: [] }, users: { allow: [], deny: [] } }, version: 1, reason: "start a 10% rollout", actor_kind: "user", actor_id: "ada@acme.dev", request_id: "req_4b0e77", changed_at: iso(NOW - 9 * DAY - 3 * HOUR) },
    { id: 1, key: "orgs.sso", old_state: null, new_state: { enabled: true, default: false, percentage: null, orgs: { allow: ["org_acme"], deny: [] }, users: { allow: [], deny: [] } }, version: 0, reason: "pilot with Acme", actor_kind: "user", actor_id: "ada@acme.dev", request_id: "req_1f9a02", changed_at: iso(NOW - 20 * DAY - 40 * MIN) },
  ],
});

let flags: OpsFlag[] = initial();
let history: Record<string, FlagChange[]> = initialHistory();
let nextChange = 10;

/** Back to the sample flags; tests call it between cases. */
export function resetMockFlags() {
  flags = initial();
  history = initialHistory();
  nextChange = 10;
}

function problem(status: number, code: string, detail: string): Response {
  const p: Problem = { title: { 404: "Not Found", 405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity" }[status] ?? "Error", status, code, detail };
  return new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/problem+json", "Cache-Control": "no-store" } });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const idPattern = /^[\x21-\x7e]{1,100}$/;

/** What the flags library refuses in a state, as its `invalid_flag_state` reason. */
export function validateFlagState(raw: unknown): { state: FlagState } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "state is required" };
  const s = raw as Record<string, unknown>;
  if (typeof s.enabled !== "boolean") return { error: "enabled must be true or false" };
  if (typeof s.default !== "boolean") return { error: "default must be true or false" };
  let percentage: number | null = null;
  if (s.percentage !== undefined && s.percentage !== null) {
    if (typeof s.percentage !== "number" || !Number.isInteger(s.percentage) || s.percentage < 0 || s.percentage > 100) return { error: "percentage must be a whole number from 0 to 100, or null" };
    percentage = s.percentage;
  }
  const rule = (raw: unknown, what: string): { allow: string[]; deny: string[] } | { error: string } => {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const list = (v: unknown, name: string): string[] | { error: string } => {
      if (v === undefined || v === null) return [];
      if (!Array.isArray(v)) return { error: `${what}.${name} must be a list of IDs` };
      if (v.length > 1000) return { error: `${what}.${name} holds at most 1000 IDs` };
      for (const id of v) if (typeof id !== "string" || !idPattern.test(id)) return { error: `${what}.${name}: an ID is 1 to 100 visible ASCII characters` };
      return v as string[];
    };
    const allow = list(r.allow, "allow");
    if (!Array.isArray(allow)) return allow;
    const deny = list(r.deny, "deny");
    if (!Array.isArray(deny)) return deny;
    const both = allow.find((id) => deny.includes(id));
    if (both) return { error: `${what}: an ID can't be in both allow and deny` };
    return { allow, deny };
  };
  const orgs = rule(s.orgs, "orgs");
  if ("error" in orgs) return orgs;
  const users = rule(s.users, "users");
  if ("error" in users) return users;
  return { state: { enabled: s.enabled, default: s.default, percentage, orgs, users } };
}

/** Answers `/ops/flags`, `/ops/flags/{key}`, its `history`, PUT and DELETE; undefined for other paths. */
export function mockFlagsFetch(path: string, query: URLSearchParams, method: string, body: Record<string, unknown>): Response | undefined {
  if (path === "/ops/flags") {
    if (method !== "GET") return problem(405, "method_not_allowed", `${method} not allowed`);
    const group = query.get("group");
    return json({ flags: group ? flags.filter((f) => f.group === group) : flags });
  }
  const m = /^\/ops\/flags\/([^/]+)(\/history)?$/.exec(path);
  if (!m) return undefined;
  const key = decodeURIComponent(m[1]);
  const f = flags.find((x) => x.key === key);
  if (!f) return problem(404, "flag_not_found", "no feature flag has this key");
  if (m[2]) return json({ changes: history[key] ?? [] });
  if (method === "GET") return json(f);
  if (method !== "PUT" && method !== "DELETE") return problem(405, "method_not_allowed", `${method} not allowed`);
  if (typeof body.version !== "number") return problem(422, "validation_failed", "version is required");
  if (body.version !== f.version) return problem(409, "flag_version_conflict", "the feature flag changed since it was read; read it again");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return problem(422, "flag_reason_required", "a reason is required to change a feature flag");
  const now = new Date().toISOString();
  let next: OpsFlag;
  if (method === "DELETE") {
    next = { ...f, state: { ...f.declared_state, orgs: { allow: [], deny: [] }, users: { allow: [], deny: [] } }, modified: false, invalid_stored_value: false, version: f.version + 1, updated_at: now, updated_by: "dev console (orb dev)" };
  } else {
    const v = validateFlagState(body.state);
    if ("error" in v) return problem(422, "invalid_flag_state", v.error);
    next = { ...f, state: v.state, modified: true, invalid_stored_value: false, version: f.version + 1, updated_at: now, updated_by: "dev console (orb dev)" };
  }
  flags = flags.map((x) => (x.key === key ? next : x));
  const change: FlagChange = { id: nextChange++, key, old_state: f.modified ? f.state : null, new_state: next.modified ? next.state : null, version: f.version, reason, actor_kind: "system", actor_id: "dev console (orb dev)", request_id: `req_${Math.random().toString(16).slice(2, 8)}`, changed_at: now };
  history[key] = [change, ...(history[key] ?? [])];
  return json(next);
}
