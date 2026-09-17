"use client";

import { Field, Input } from "@gorbital/dash/components/input";
import { Segmented } from "@gorbital/dash/components/pill";
import { resourceNames, type ResourceErrors, type ResourceForm } from "@/lib/generators/resource";
import { FieldsEditor } from "./fields-editor";

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

      <FieldsEditor
        fields={form.fields}
        onChange={(fields) => set("fields", fields)}
        locked={locked}
        rowErrors={touched ? errors.fieldRows : undefined}
        listError={err("fields")}
        serverError={serverError}
        snake={names.snake}
        rules="Names are snake_case (max 20). string: 1–100 characters, required, sortable, can be unique per owner ignoring case. text: up to 2000 characters, optional. enum: 2–20 snake_case values, the first is the default."
      />

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
