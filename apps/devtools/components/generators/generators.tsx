"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Boxes, Cloud, FileCode2, GitBranch, Layers, Mail, Package, ShieldCheck, Wand2, Zap } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { Sheet } from "@gorbital/dash/components/sheet";
import { useProject } from "@/lib/api/project";
import { useStatus } from "@/lib/api/queries";
import { useRouteInfo } from "@/lib/api/routes";
import type { Project } from "@/lib/api/types";
import { defaultMailForm, defaultStorageForm, toMailCommand, toMailInput, toStorageCommand, toStorageInput, validateMailForm, validateStorageForm, type MailForm, type StorageForm } from "@/lib/generators/add";
import { gateReason, generatorInfo, orderGenerators, type GeneratorInfo } from "@/lib/generators/catalog";
import { defaultMiddlewareForm, moduleOptions, toMiddlewareCommand, toMiddlewareInput, validateMiddlewareForm, type MiddlewareForm } from "@/lib/generators/middleware";
import { defaultModuleForm, toModuleCommand, toModuleInput, validateModuleForm, type ModuleForm } from "@/lib/generators/module";
import { defaultResourceForm, toResourceCommand, toResourceInput, validateResourceForm, type ResourceForm } from "@/lib/generators/resource";
import { useMounted } from "@/components/db-objects/common";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { GeneratorSheet } from "./generator-sheet";
import { MailFormFields } from "./mail-form";
import { MiddlewareFormFields } from "./middleware-form";
import { MigrationFormFields, migrationNameError } from "./migration-form";
import { ModuleFormFields } from "./module-form";
import { JobNote, OrgsNote, RlsNote } from "./notes";
import { ResourceFormFields } from "./resource-form";
import { StorageFormFields } from "./storage-form";

const icons: Record<string, typeof Wand2> = { resource: Boxes, module: Package, middleware: Layers, job: Zap, migration: FileCode2, "add-mail": Mail, "add-storage": Cloud, "add-rls": ShieldCheck, "add-orgs": GitBranch };

/** The generators hub (ADR-0077): a card per generator the status lists, each with a sheet: form → preview (the diff) → apply → restart or migrate. `?generator=` opens a card. */
export function Generators() {
  const status = useStatus();
  const project = useProject();
  // The boundary may hydrate after the status query answered; the skeleton keeps the prerender and the first client render alike.
  const mounted = useMounted();
  const [open, setOpen] = useState<string | null>(null);
  const onParam = useCallback((v: string | null) => setOpen(v), []);
  const select = (name: string | null) => {
    setOpen(name);
    setQueryParam("generator", name);
  };
  const names = useMemo(() => orderGenerators(status.data?.generators ?? []), [status.data?.generators]);
  const proj = mounted ? status.data?.project : undefined;
  const git = project.data?.git;

  return (
    <Page>
      <Suspense fallback={null}>
        <QueryParam name="generator" onValue={onParam} />
      </Suspense>
      <PageHeader product="devtools" title="Generators" description={proj ? `${names.length} generators · the same plans orb gen and orb add print · /_portal/api/generators` : "every generator with a diff preview before it writes"}>
        <Link href="/jobs?new=1">
          <Button size="sm" kind="secondary" icon={<Zap size={11} />}>
            New job
          </Button>
        </Link>
      </PageHeader>
      {mounted && status.error && !status.data ? (
        <ProblemPanel error={status.error} scope="portal" onRetry={() => void status.refetch()} retrying={status.isFetching} meta="GET /_portal/api/status" />
      ) : !proj ? (
        <SkeletonLines lines={8} className="p-4" />
      ) : names.length === 0 ? (
        <Empty title="This orb offers no generators" hint="The status lists none; an orb from before the Dev Portal's generators, or a directory without an app." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {names.map((name) => (
            <GeneratorCard key={name} info={generatorInfo(name)} project={proj} onOpen={() => select(name)} />
          ))}
        </div>
      )}
      {proj && (
        <>
          <ResourceSheet open={open === "resource"} onClose={() => select(null)} project={proj} />
          <ModuleSheet open={open === "module"} onClose={() => select(null)} onUseResource={() => select("resource")} />
          <MiddlewareSheet open={open === "middleware"} onClose={() => select(null)} />
          <MigrationSheet open={open === "migration"} onClose={() => select(null)} />
          <MailSheet open={open === "add-mail"} onClose={() => select(null)} project={proj} />
          <StorageSheet open={open === "add-storage"} onClose={() => select(null)} project={proj} current={project.data?.storage.driver} />
          <GeneratorSheet name="add-rls" open={open === "add-rls"} onClose={() => select(null)} input={{}} command="orb add rls">
            {() => <RlsNote tenancy={proj.tenancy} database={proj.database} />}
          </GeneratorSheet>
          <GeneratorSheet name="add-orgs" open={open === "add-orgs"} onClose={() => select(null)} input={{}} command="orb add orgs" meta="orb add orgs · branch orb-add-orgs">
            {() => <OrgsNote tenancy={proj.tenancy} git={git} />}
          </GeneratorSheet>
          <Sheet open={open === "job"} onOpenChange={(o) => !o && select(null)} title="Job" meta="orb gen job" description={generatorInfo("job").blurb} width="md">
            <JobNote />
          </Sheet>
        </>
      )}
    </Page>
  );
}

function GeneratorCard({ info, project, onOpen }: { info: GeneratorInfo; project: Project | undefined; onOpen: () => void }) {
  const Icon = icons[info.name] ?? Wand2;
  const gate = gateReason(info, project);
  const soft = gate?.startsWith("needs organisations");
  const disabled = Boolean(gate) && !soft;
  const button = info.href ? (
    <Link href={info.href} className={disabled ? "pointer-events-none" : ""}>
      <Button size="sm" kind="primary" icon={<ArrowRight size={11} />} disabled={disabled}>
        Open
      </Button>
    </Link>
  ) : (
    <Button size="sm" kind="primary" icon={<Wand2 size={11} />} onClick={onOpen} disabled={disabled}>
      {info.name === "add-orgs" ? "Preview" : "Open"}
    </Button>
  );
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-hairline bg-elevated text-primary">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-text">{info.title}</span>
            <span className="font-mono text-[10.5px] text-dim">{info.cli}</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">{info.blurb}</p>
        </div>
      </div>
      {info.writes.length > 0 && (
        <div className="grid gap-0.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{info.after === "branch" ? "Does" : "Writes"}</div>
          {info.writes.map((w) => (
            <div key={w} className="flex items-start gap-1.5 font-mono text-[11px] text-muted">
              <FileCode2 size={10} className="mt-[3px] shrink-0 text-dim" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {gate ? (
          <Tooltip content={gate}>
            <span>
              <Badge tone={soft ? "warn" : "muted"}>{gate.split(":")[0]}</Badge>
            </span>
          </Tooltip>
        ) : (
          <Badge tone="muted">{info.after === "restart" ? "then restart" : info.after === "migrate" ? "then migrate" : info.after === "branch" ? "on a branch" : "no restart"}</Badge>
        )}
        <span className="ml-auto">{button}</span>
      </div>
    </div>
  );
}

function ResourceSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const [form, setForm] = useState<ResourceForm>(() => defaultResourceForm(project.tenancy === "multi" ? "org" : "user"));
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateResourceForm(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const names = form.name.trim() ? form.name.trim() : undefined;
  return (
    <GeneratorSheet name="resource" open={open} onClose={() => { onClose(); setTouched(false); setForm(defaultResourceForm(project.tenancy === "multi" ? "org" : "user")); }} input={valid ? toResourceInput(form) : null} onInvalid={() => setTouched(true)} command={toResourceCommand(form)} meta={names ? `orb gen resource ${names}` : undefined}>
      {({ locked, usageError }) => <ResourceFormFields form={form} onChange={(f) => { setForm(f); setTouched(true); }} errors={errors} touched={touched} tenancy={project.tenancy} locked={locked} serverError={usageError} />}
    </GeneratorSheet>
  );
}

function ModuleSheet({ open, onClose, onUseResource }: { open: boolean; onClose: () => void; onUseResource: () => void }) {
  const [form, setForm] = useState<ModuleForm>(() => defaultModuleForm());
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateModuleForm(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const name = form.name.trim();
  const reset = () => {
    setTouched(false);
    setForm(defaultModuleForm());
  };
  return (
    <GeneratorSheet name="module" open={open} onClose={() => { onClose(); reset(); }} input={valid ? toModuleInput(form) : null} onInvalid={() => setTouched(true)} command={toModuleCommand(form)} meta={name ? `orb gen module ${name}` : undefined}>
      {({ locked, usageError, plan }) => <ModuleFormFields form={form} onChange={(f) => { setForm(f); setTouched(true); }} errors={errors} touched={touched} locked={locked} serverError={usageError} plan={plan} onUseResource={() => { onUseResource(); reset(); }} />}
    </GeneratorSheet>
  );
}

function MiddlewareSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const routes = useRouteInfo(open);
  const modules = useMemo(() => moduleOptions(routes.data?.routes), [routes.data]);
  const [form, setForm] = useState<MiddlewareForm>(() => defaultMiddlewareForm());
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateMiddlewareForm(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const name = form.name.trim();
  return (
    <GeneratorSheet name="middleware" open={open} onClose={() => { onClose(); setForm(defaultMiddlewareForm()); setTouched(false); }} input={valid ? toMiddlewareInput(form) : null} onInvalid={() => setTouched(true)} command={toMiddlewareCommand(form)} meta={name ? `orb gen middleware ${name}` : undefined}>
      {({ locked, usageError, plan }) => <MiddlewareFormFields form={form} onChange={(f) => { setForm(f); setTouched(true); }} errors={errors} touched={touched} locked={locked} serverError={usageError} plan={plan} modules={modules} modulesLoading={routes.isPending && routes.fetchStatus !== "idle"} />}
    </GeneratorSheet>
  );
}

function MigrationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const valid = !migrationNameError(name);
  return (
    <GeneratorSheet name="migration" open={open} onClose={() => { onClose(); setName(""); setTouched(false); }} input={valid ? { name: name.trim() } : null} onInvalid={() => setTouched(true)} command={`orb gen migration ${name.trim() || "<name>"}`}>
      {({ locked, usageError }) => <MigrationFormFields name={name} onChange={(v) => { setName(v); setTouched(true); }} touched={touched} locked={locked} serverError={usageError} />}
    </GeneratorSheet>
  );
}

function MailSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const [form, setForm] = useState<MailForm>(() => defaultMailForm());
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateMailForm(form), [form]);
  const valid = Object.keys(errors).length === 0;
  return (
    <GeneratorSheet name="add-mail" open={open} onClose={() => { onClose(); setForm(defaultMailForm()); setTouched(false); }} input={valid ? toMailInput(form) : null} onInvalid={() => setTouched(true)} command={toMailCommand(form)}>
      {({ locked, usageError }) => <MailFormFields form={form} onChange={(f) => { setForm(f); setTouched(true); }} errors={errors} touched={touched} locked={locked} current={project.mail} serverError={usageError} />}
    </GeneratorSheet>
  );
}

function StorageSheet({ open, onClose, project, current }: { open: boolean; onClose: () => void; project: Project; current?: string }) {
  const [form, setForm] = useState<StorageForm>(() => defaultStorageForm());
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validateStorageForm(form), [form]);
  const valid = Object.keys(errors).length === 0;
  return (
    <GeneratorSheet name="add-storage" open={open} onClose={() => { onClose(); setForm(defaultStorageForm()); setTouched(false); }} input={valid ? toStorageInput(form) : null} onInvalid={() => setTouched(true)} command={toStorageCommand(form)}>
      {({ locked, usageError }) => <StorageFormFields form={form} onChange={(f) => { setForm(f); setTouched(true); }} errors={errors} touched={touched} locked={locked} appName={project.name} current={current} serverError={usageError} />}
    </GeneratorSheet>
  );
}
