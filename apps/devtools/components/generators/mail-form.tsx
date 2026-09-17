"use client";

import { Field, Input, Select } from "@gorbital/dash/components/input";
import { Segmented } from "@gorbital/dash/components/pill";
import { SMTP_PORTS, defaultTLS, type MailForm } from "@/lib/generators/add";

type Props = { form: MailForm; onChange: (f: MailForm) => void; errors: Partial<Record<keyof MailForm, string>>; touched: boolean; locked: boolean; serverError?: string; current?: string };

/** `orb add mail`: the provider, and the SMTP server's details; the API key and the password go in .env by hand. */
export function MailFormFields({ form, onChange, errors, touched, locked, serverError, current }: Props) {
  const set = <K extends keyof MailForm>(key: K, value: MailForm[K]) => onChange({ ...form, [key]: value });
  const err = (key: keyof MailForm) => (touched ? errors[key] : undefined);
  const flag = (name: string) => (serverError?.startsWith(`--${name}`) ? serverError : undefined);
  return (
    <div className="grid gap-3">
      <Field label="Provider" hint={current ? `the manifest says ${current}; picking it again changes nothing` : "run it again later to switch"} error={err("provider")}>
        <Segmented<MailForm["provider"]>
          options={[
            { value: "resend", label: "Resend (recommended)" },
            { value: "smtp", label: "SMTP" },
          ]}
          value={form.provider}
          onChange={(v) => !locked && set("provider", v)}
        />
      </Field>
      {form.provider === "resend" ? (
        <div className="text-[11.5px] text-muted">
          Add <span className="font-mono text-text">RESEND_API_KEY</span> to <span className="font-mono text-text">.env</span> yourself (secrets never go through here), verify your domain at Resend, then set the sender with <span className="font-mono text-text">mail.from_email</span> on the Settings page.
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
            <Field label="SMTP server" htmlFor="ml-host" hint="optional: add SMTP_HOST to .env later" error={err("smtpHost") ?? flag("smtp-host")}>
              <Input id="ml-host" mono value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.postmarkapp.com" disabled={locked} />
            </Field>
            <Field label="Port and encryption" htmlFor="ml-port" hint={`${form.smtpTLS || defaultTLS(form.smtpPort)}${form.smtpTLS ? "" : " (from the port)"}`} error={err("smtpPort") ?? err("smtpTLS") ?? flag("smtp-port") ?? flag("smtp-tls")}>
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-1">
                <Input id="ml-port" mono inputMode="numeric" list="ml-ports" value={form.smtpPort} onChange={(e) => set("smtpPort", e.target.value)} placeholder="587" disabled={locked} />
                <datalist id="ml-ports">
                  {SMTP_PORTS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </datalist>
                <Select value={form.smtpTLS} onChange={(e) => set("smtpTLS", e.target.value as MailForm["smtpTLS"])} aria-label="Encryption" disabled={locked}>
                  <option value="">auto</option>
                  <option value="starttls">starttls</option>
                  <option value="tls">tls</option>
                  <option value="none">none</option>
                </Select>
              </div>
            </Field>
          </div>
          <Field label="Username" htmlFor="ml-user" hint="optional; the password goes in .env as SMTP_PASSWORD" error={err("smtpUsername") ?? flag("smtp-username")}>
            <Input id="ml-user" mono value={form.smtpUsername} onChange={(e) => set("smtpUsername", e.target.value)} placeholder="postmark-server-token" disabled={locked} />
          </Field>
        </div>
      )}
      <div className="text-[11px] text-dim">Writes infra_mail.go and its tests, the mail block of .env.example and .env (values already there are kept, the file stays mode 0600), gorbital.yaml and the lock, then edits go.mod and runs go mod tidy.</div>
    </div>
  );
}
