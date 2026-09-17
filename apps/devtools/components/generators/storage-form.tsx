"use client";

import { Field, Input } from "@gorbital/dash/components/input";
import { Segmented } from "@gorbital/dash/components/pill";
import { STORAGE_DRIVERS, STORAGE_FIELD_LABELS, storageDefaults, storageFields, type StorageForm } from "@/lib/generators/add";

type Props = { form: StorageForm; onChange: (f: StorageForm) => void; errors: Partial<Record<keyof StorageForm, string>>; touched: boolean; locked: boolean; serverError?: string; appName: string; current?: string };

/** `orb add storage`: the driver, and the fields it reads; STORAGE_SECRET_KEY goes in .env by hand. */
export function StorageFormFields({ form, onChange, errors, touched, locked, serverError, appName, current }: Props) {
  const set = <K extends keyof StorageForm>(key: K, value: StorageForm[K]) => onChange({ ...form, [key]: value });
  const err = (key: keyof StorageForm) => (touched ? errors[key] : undefined);
  const driver = STORAGE_DRIVERS.find((d) => d.value === form.driver);
  const defaults = storageDefaults(form.driver, appName);
  const fields = storageFields(form.driver);
  const flags: Record<string, string> = { endpoint: "--endpoint", region: "--region", bucket: "--bucket", accessKey: "--access-key", publicUrl: "--public-url" };
  return (
    <div className="grid gap-3">
      <Field label="Driver" hint={driver?.hint} error={err("driver")}>
        <Segmented<StorageForm["driver"]> options={STORAGE_DRIVERS.map((d) => ({ value: d.value, label: d.label }))} value={form.driver} onChange={(v) => !locked && set("driver", v)} />
      </Field>
      {current && <div className="text-[11px] text-dim">.env says STORAGE_DRIVER={current} now.</div>}
      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {fields.map((f) => {
            const l = STORAGE_FIELD_LABELS[f];
            return (
              <Field key={f} label={l.label} htmlFor={`st-${f}`} hint={defaults[f] ? `default ${defaults[f]}` : l.hint} error={err(f) ?? (serverError?.startsWith(flags[f]) ? serverError : undefined)} className={f === "publicUrl" ? "col-span-2" : ""}>
                <Input id={`st-${f}`} mono value={form[f]} onChange={(e) => set(f, e.target.value)} placeholder={defaults[f] ?? l.placeholder} disabled={locked} />
              </Field>
            );
          })}
        </div>
      )}
      <div className="text-[11px] text-dim">
        Rewrites the storage block of .env.example, sets the values in .env{form.driver === "minio" ? " and adds the MinIO service to compose.yaml, which orb dev then starts (MINIO_PORT, MINIO_CONSOLE_PORT)" : ""}. Put <span className="font-mono">STORAGE_SECRET_KEY</span> in .env yourself.
      </div>
    </div>
  );
}
