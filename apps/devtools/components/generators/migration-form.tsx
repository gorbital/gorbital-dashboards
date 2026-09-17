"use client";

import { Field, Input } from "@gorbital/dash/components/input";

/** `orb gen migration <name>`: letters, digits, hyphens and underscores, at most 60. */
export function migrationNameError(name: string): string | undefined {
  const n = name.trim();
  if (!n) return "give the migration a name, such as add_customer_phone";
  if (n.length > 60) return "at most 60 characters";
  if (!/^[A-Za-z0-9_-]+$/.test(n)) return "letters, digits, hyphens and underscores only, so it can't reach a path or the SQL";
  return undefined;
}

/** The file name the CLI derives: snake_case of the name. */
export function migrationSlug(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
}

export function MigrationFormFields({ name, onChange, touched, locked, serverError }: { name: string; onChange: (v: string) => void; touched: boolean; locked: boolean; serverError?: string }) {
  const error = (touched ? migrationNameError(name) : undefined) ?? serverError;
  return (
    <div className="grid gap-3">
      <Field label="Name" htmlFor="mg-name" hint={name.trim() ? `db/migrations/<version>_${migrationSlug(name)}.sql` : "add_customer_phone, AddCustomerPhone or add-customer-phone"} error={error}>
        <Input id="mg-name" mono value={name} onChange={(e) => onChange(e.target.value)} placeholder="add_customer_phone" autoFocus disabled={locked} />
      </Field>
      <div className="grid gap-1 text-[11.5px] text-muted">
        <div>An empty goose file: a short comment and a <span className="font-mono text-text">-- +goose Up</span> section. The version is the current UTC time, or one past the newest migration&apos;s, so it always runs last; there is no Down section, migrations only go forward.</div>
        <div className="text-warn">Write the SQL before applying: goose records an empty migration as applied, and SQL added afterwards never runs.</div>
      </div>
    </div>
  );
}
