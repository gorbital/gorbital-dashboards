"use client";

import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Checkbox, Field, Input, Select } from "@gorbital/dash/components/input";
import { Segmented } from "@gorbital/dash/components/pill";
import { FIELD_TYPES, MAX_FIELDS, emptyField, resourceNames, type ResourceErrors, type ResourceField, type ResourceForm } from "@/lib/generators/resource";

type Props = {
  form: ResourceForm;
  onChange: (form: ResourceForm) => void;
  errors: ResourceErrors;
  /** Errors show only after the first Preview, or once a field was touched. */
  touched: boolean;
  /** The app's tenancy: `org` scope needs the orgs module. */
  tenancy?: string;
  /** The portal's usage error, when it names a flag. */
  serverError?: string;
  locked: boolean;
};

/** `orb gen resource` as a form: the name, the fields editor (name, type, enum values, unique), and the flags. */
export function ResourceFormFields({ form, onChange, errors, touched, tenancy, locked, serverError }: Props) {
  const names = resourceNames(form.name || "Resource", form.plural, form.idPrefix);
  const set = <K extends keyof ResourceForm>(key: K, value: ResourceForm[K]) => onChange({ ...form, [key]: value });
  const setField = (i: number, patch: Partial<ResourceField>) => set("fields", form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const err = (key: keyof ResourceErrors) => (touched ? (errors[key] as string | undefined) : undefined);
  const multi = tenancy === "multi";
  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <Field label="Name" htmlFor="rs-name" hint={form.name.trim() ? `${names.ident} · table ${names.table} · /v1/${form.scope === "org" ? "orgs/{orgId}/" : ""}${names.route} · IDs ${names.idPrefix}_…` : "singular: Project, OrderItem or order-item"} error={err("name") ?? (serverError?.includes("resource name") ? serverError : undefined)}>
          <Input id="rs-name" mono value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Project" autoFocus disabled={locked} />
        </Field>
        <Field label="Belongs to" hint={form.scope === "org" ? (multi ? "an organisation: /v1/orgs/{orgId}/…, membership and permission checks" : "needs the orgs module: run orb add orgs first") : "the signed-in user: another user's requests get 404"}>
          <Segmented<ResourceForm["scope"]>
            options={[
              { value: "user", label: "User" },
              { value: "org", label: "Organisation" },
            ]}
            value={form.scope}
            onChange={(v) => !locked && set("scope", v)}
          />
        </Field>
      </div>

      <div className="grid gap-2 rounded-lg border border-hairline bg-bg/40 p-3">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Fields</div>
          <Button size="sm" kind="ghost" icon={<Plus size={11} />} onClick={() => set("fields", [...form.fields, emptyField()])} disabled={locked || form.fields.length >= MAX_FIELDS}>
            Add field
          </Button>
        </div>
        {form.fields.length === 0 && <div className="text-[11.5px] text-muted">A resource needs at least one string field; the first one is its title, which lists sort by.</div>}
        {form.fields.map((f, i) => {
          const rowError = touched ? errors.fieldRows?.[i] : undefined;
          const type = FIELD_TYPES.find((t) => t.value === f.type);
          return (
            <div key={i} className="grid gap-1">
              <div className="grid grid-cols-[minmax(0,1.2fr)_110px_minmax(0,1.4fr)_auto_auto] items-center gap-2">
                <Input mono value={f.name} onChange={(e) => setField(i, { name: e.target.value })} placeholder={i === 0 ? "name" : "notes"} aria-label={`Field ${i + 1} name`} disabled={locked} />
                <Select value={f.type} onChange={(e) => setField(i, { type: e.target.value as ResourceField["type"], unique: e.target.value === "string" ? f.unique : false })} aria-label={`Field ${i + 1} type`} disabled={locked}>
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                {f.type === "enum" ? (
                  <Input mono value={f.values} onChange={(e) => setField(i, { values: e.target.value })} placeholder="active, archived" aria-label={`Field ${i + 1} values`} disabled={locked} />
                ) : (
                  <span className="truncate text-[11px] text-dim">{type?.hint}</span>
                )}
                <label className={`flex items-center gap-1.5 text-[11px] ${f.type === "string" ? "text-muted" : "text-faint"}`}>
                  <Checkbox checked={f.unique} onCheckedChange={(v) => setField(i, { unique: v === true })} disabled={locked || f.type !== "string"} aria-label={`Field ${i + 1} unique`} />
                  unique
                </label>
                <Button size="sm" kind="ghost" icon={<Trash2 size={11} />} onClick={() => set("fields", form.fields.filter((_, j) => j !== i))} disabled={locked} aria-label={`Remove field ${i + 1}`}>
                  <span className="sr-only">Remove</span>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
                {f.type === "string" && i === form.fields.findIndex((x) => x.type === "string") && <Badge tone="accent">title · lists sort by it</Badge>}
                {f.type === "string" && <Badge tone="muted">required</Badge>}
                {f.type === "text" && <Badge tone="muted">optional</Badge>}
                {f.type === "enum" && <Badge tone="muted">filterable · default: first value</Badge>}
                {f.unique && f.type === "string" && <Badge tone="info">409 {names.snake}_{f.name || "field"}_taken</Badge>}
                {rowError && <span className="text-[11px] text-danger">{rowError}</span>}
              </div>
            </div>
          );
        })}
        {err("fields") && <div className="text-[11px] text-danger">{errors.fields}</div>}
        {serverError && /^field /.test(serverError) && <div className="text-[11px] text-danger">{serverError}</div>}
        <div className="text-[11px] text-dim">
          Names are snake_case (max 20). string: 1–100 characters, required, sortable, can be unique per owner ignoring case. text: up to 2000 characters, optional. enum: 2–20 snake_case values, the first is the default.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Plural" htmlFor="rs-plural" hint={`default ${names.plural}: the package, table and route come from it`} error={err("plural") ?? (serverError?.includes("plural") ? serverError : undefined)}>
          <Input id="rs-plural" mono value={form.plural} onChange={(e) => set("plural", e.target.value)} placeholder={resourceNames(form.name || "Person").plural} disabled={locked} />
        </Field>
        <Field label="ID prefix" htmlFor="rs-prefix" hint={`default ${names.idPrefix}: 2 to 8 lowercase letters`} error={err("idPrefix") ?? (serverError?.includes("ID prefix") ? serverError : undefined)}>
          <Input id="rs-prefix" mono value={form.idPrefix} onChange={(e) => set("idPrefix", e.target.value)} placeholder={resourceNames(form.name || "Project").idPrefix} disabled={locked} />
        </Field>
      </div>
    </div>
  );
}
