"use client";

import { ArrowRight, Boxes } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Checkbox, Field, Input } from "@gorbital/dash/components/input";
import type { Plan } from "@/lib/api/types";
import { ORG_HINT, isV01LayoutError, moduleNames, type ModuleForm, type ModuleGeneratorResult } from "@/lib/generators/module";
import type { ResourceErrors } from "@/lib/generators/resource";
import { FieldsEditor } from "./fields-editor";

type Props = {
  form: ModuleForm;
  onChange: (form: ModuleForm) => void;
  errors: ResourceErrors;
  touched: boolean;
  locked: boolean;
  serverError?: string;
  plan?: Plan;
  /** Opens the resource generator, for apps on the v0.1 layout. */
  onUseResource: () => void;
};

/** `orb gen module` as a form: the name, the fields (with `string?`), the plural and ID prefix, and whether records belong to an organisation (`--org`). */
export function ModuleFormFields({ form, onChange, errors, touched, locked, serverError, plan, onUseResource }: Props) {
  const names = moduleNames(form.name || "Module", form.plural, form.idPrefix, form.org);
  const set = <K extends keyof ModuleForm>(key: K, value: ModuleForm[K]) => onChange({ ...form, [key]: value });
  const err = (key: keyof ResourceErrors) => (touched ? (errors[key] as string | undefined) : undefined);
  const v01 = isV01LayoutError(serverError);
  const result = plan?.generator === "module" ? (plan.result as ModuleGeneratorResult | undefined) : undefined;
  return (
    <div className="grid min-w-0 gap-4">
      {v01 && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[12px]">
          <Boxes size={14} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1 text-muted">
            <div className="text-text">This app uses the v0.1 layout.</div>
            Its modules are wired in internal/app/modules.go, which the module generator doesn&apos;t write to. The Resource generator makes the same kind of module for it.
          </div>
          <Button size="sm" kind="primary" icon={<ArrowRight size={11} />} onClick={onUseResource}>
            Open Resource
          </Button>
        </div>
      )}
      <Field label="Name" htmlFor="md-name" hint={form.name.trim() ? `${names.dir} · table ${names.table} · ${names.path} · IDs ${names.idPrefix}_…` : "singular: Review, BookLoan or book-loan"} error={err("name") ?? (serverError && /name/.test(serverError) && !/^field /.test(serverError) && !v01 ? serverError : undefined)}>
        <Input id="md-name" mono value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Review" autoFocus disabled={locked} />
      </Field>

      <FieldsEditor
        fields={form.fields}
        onChange={(fields) => set("fields", fields)}
        locked={locked}
        rowErrors={touched ? errors.fieldRows : undefined}
        listError={err("fields")}
        serverError={serverError}
        allowOptional
        snake={names.snake}
        rules="Names are snake_case (max 20). string: 1–100 characters, required, sortable; unique means unique per owner, ignoring case. string?: 0–100 characters, optional, never unique. text: up to 2000 characters, optional. enum: 2–20 snake_case values, the first is the default; lists can filter by it."
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Plural" htmlFor="md-plural" hint={`default ${names.plural}: the package, table and route come from it`} error={err("plural") ?? (serverError?.includes("plural") ? serverError : undefined)}>
          <Input id="md-plural" mono value={form.plural} onChange={(e) => set("plural", e.target.value)} placeholder={moduleNames(form.name || "Review").plural} disabled={locked} />
        </Field>
        <Field label="ID prefix" htmlFor="md-prefix" hint={`default ${names.idPrefix}: 2 to 8 lowercase letters`} error={err("idPrefix") ?? (serverError?.includes("ID prefix") ? serverError : undefined)}>
          <Input id="md-prefix" mono value={form.idPrefix} onChange={(e) => set("idPrefix", e.target.value)} placeholder={moduleNames(form.name || "Review").idPrefix} disabled={locked} />
        </Field>
      </div>

      <div className="grid gap-1 rounded-lg border border-hairline bg-bg/40 px-3 py-2">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <Checkbox checked={form.org} onCheckedChange={(c) => set("org", c === true)} disabled={locked} aria-label="Scope to organisations" />
          Belongs to an organisation
          <span className="font-mono text-[10.5px] text-dim">--org</span>
        </label>
        <div className="text-[11px] text-dim">{form.org ? ORG_HINT : "Records belong to the signed-in user: another user's requests get 404."}</div>
      </div>

      {result ? (
        <div className="grid gap-1.5 text-[11.5px]">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{locked ? "Written" : "Will write"}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">module {result.module}</Badge>
            <Badge tone="info">{result.route}</Badge>
            <Badge tone="muted">table {result.table}</Badge>
            <Badge tone="muted">scope {result.scope}</Badge>
            {result.permissions.map((p) => (
              <Badge key={p} tone="violet">
                {p}
              </Badge>
            ))}
          </div>
          {result.migration && <div className="font-mono text-[11px] text-muted">{result.migration}</div>}
        </div>
      ) : (
        <div className="text-[11px] text-dim">
          Writes {names.dir}/ with domain, usecase, repository and delivery, one file per operation (create, get, list, update, delete) with their tests, a migration for {names.table}, and the entry in internal/modules/modules.gen.go. Permissions: {names.permissions.join(", ")}.
        </div>
      )}
    </div>
  );
}
