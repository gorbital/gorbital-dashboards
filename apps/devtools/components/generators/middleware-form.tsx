"use client";

import { Cable, Globe2, ShieldCheck } from "lucide-react";
import { Code } from "@gorbital/dash/components/code";
import { Field, Input } from "@gorbital/dash/components/input";
import { Segmented } from "@gorbital/dash/components/pill";
import { Spinner } from "@gorbital/dash/components/spinner";
import type { Plan } from "@/lib/api/types";
import { MIDDLEWARE_KINDS, middlewareNames, type MiddlewareErrors, type MiddlewareForm, type MiddlewareGeneratorResult, type MiddlewareKind } from "@/lib/generators/middleware";
import { nextStepsPreformatted } from "@/lib/generators/plan";
import { CopyButton } from "@/components/jobs/plan-diff";

type Props = {
  form: MiddlewareForm;
  onChange: (form: MiddlewareForm) => void;
  errors: MiddlewareErrors;
  touched: boolean;
  locked: boolean;
  serverError?: string;
  plan?: Plan;
  /** The modules the routes endpoint names; empty while it reads or when it can't. */
  modules: string[];
  modulesLoading: boolean;
};

const kindNotes: Record<MiddlewareKind, { icon: typeof Cable; title: string; body: string }> = {
  module: {
    icon: Cable,
    title: "Module middleware",
    body: "A file in internal/modules/<module>/delivery/. Add it to some routes with gorbital.Use in routes.go, or to every route of the module with Module.Middleware.",
  },
  global: {
    icon: Globe2,
    title: "Global middleware",
    body: "A package file under internal/middleware, for every request. Add it to main.go with gorbital.WithMiddleware: the generator never edits main.go, it tells you the line.",
  },
  guard: {
    icon: ShieldCheck,
    title: "Guard",
    body: "A route option: a guard.New spec with an error to map. Add it to a route in routes.go and map its error in module.go. It runs before the request body is read.",
  },
};

/** `orb gen middleware` as a form: the kind, the name and the module; after apply, the line that wires it. */
export function MiddlewareFormFields({ form, onChange, errors, touched, locked, serverError, plan, modules, modulesLoading }: Props) {
  const set = <K extends keyof MiddlewareForm>(key: K, value: MiddlewareForm[K]) => onChange({ ...form, [key]: value });
  const err = (key: keyof MiddlewareErrors) => (touched ? errors[key] : undefined);
  const names = middlewareNames(form);
  const note = kindNotes[form.kind];
  const Icon = note.icon;
  const result = plan?.generator === "middleware" ? (plan.result as MiddlewareGeneratorResult | undefined) : undefined;
  const moduleError = /module/i.test(serverError ?? "") ? serverError : undefined;
  return (
    <div className="grid min-w-0 gap-4">
      {locked && result && <WireIt result={result} next={plan?.next ?? []} />}
      <Field label="Kind" error={err("kind")}>
        <Segmented<MiddlewareKind> options={MIDDLEWARE_KINDS} value={form.kind} onChange={(v) => !locked && set("kind", v)} />
      </Field>
      <div className="flex items-start gap-2 rounded-lg border border-hairline bg-bg/40 px-3 py-2 text-[12px] text-muted">
        <Icon size={14} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <span className="text-text">{note.title}.</span> {note.body}
        </div>
      </div>
      <div className={`grid gap-2 ${form.kind === "global" ? "" : "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"}`}>
        <Field label="Name" htmlFor="mw-name" hint={form.name.trim() ? `${names.ident} · ${names.file}` : "RequireClientVersion, OwnsShelf or request-timer"} error={err("name") ?? (serverError && !moduleError ? serverError : undefined)}>
          <Input id="mw-name" mono value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={form.kind === "guard" ? "OwnsShelf" : form.kind === "global" ? "RequestTimer" : "RequireClientVersion"} autoFocus disabled={locked} />
        </Field>
        {form.kind !== "global" && (
          <Field
            label="Module"
            htmlFor="mw-module"
            hint={
              modulesLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Spinner size={9} /> reading the app&apos;s modules
                </span>
              ) : modules.length ? (
                `in this app: ${modules.join(", ")}`
              ) : (
                "a directory under internal/modules, such as books"
              )
            }
            error={err("module") ?? moduleError}
          >
            <Input id="mw-module" mono list="mw-modules" value={form.module} onChange={(e) => set("module", e.target.value)} placeholder={modules[0] ?? "books"} disabled={locked} autoComplete="off" />
            <datalist id="mw-modules">
              {modules.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        )}
      </div>
      <div className="text-[11px] text-dim">
        Writes {names.file} and {names.test.split("/").pop()}. Nothing else changes: {form.kind === "global" ? "you add it to main.go yourself." : form.kind === "guard" ? "you add it to a route and map its error yourself." : "you choose the routes it runs on."}
      </div>
    </div>
  );
}

/** After apply: the line to add, and the generator's next steps, above the form. */
function WireIt({ result, next }: { result: MiddlewareGeneratorResult; next: string[] }) {
  return (
    <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/8 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-text">Wire it up</span>
        {result.wire && <CopyButton text={result.wire} label="Copy line" />}
      </div>
      {result.wire && <Code className="whitespace-pre-wrap break-all text-text">{result.wire}</Code>}
      {next.length > 0 &&
        (nextStepsPreformatted(next) ? (
          <Code className="whitespace-pre-wrap text-muted">{next.join("\n")}</Code>
        ) : (
          <ol className="grid gap-1 text-[11.5px] text-muted">
            {next.map((n, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-dim tnum">{i + 1}.</span>
                <span className="whitespace-pre-wrap font-mono text-[11.5px]">{n}</span>
              </li>
            ))}
          </ol>
        ))}
    </div>
  );
}
