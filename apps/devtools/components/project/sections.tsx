"use client";

import Link from "next/link";
import { ArrowRight, Database, FolderGit2, HardDrive, Mail, Network, ScrollText } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Panel } from "@gorbital/dash/components/panel";
import type { EnvList } from "@/lib/api/env";
import { envEntry } from "@/lib/api/env";
import type { ProjectSettings } from "@/lib/api/project";
import { LOG_FORMATS, LOG_LEVELS, MAIL_DELIVERIES, addrError, formatValue, loggingKeys, portError } from "@/lib/project/env-keys";
import { EnvField, InfoRow } from "./env-field";

type SectionProps = { settings: ProjectSettings; env: EnvList | undefined; readOnly: boolean; onSaved: (restart: boolean) => void };

const title = (icon: React.ReactNode, text: string) => (
  <span className="flex items-center gap-2">
    <span className="text-primary">{icon}</span> {text}
  </span>
);

/** The raw .env value for a key (the settings report a derived value, the control edits the file's). */
function raw(env: EnvList | undefined, key: string, fallback: string): string {
  const e = envEntry(env, key);
  return e?.set ? e.value : fallback;
}

export function AppSection({ settings }: { settings: ProjectSettings }) {
  return (
    <Panel title={title(<FolderGit2 size={13} />, "App")} meta="gorbital.yaml · go.mod">
      <InfoRow label="Name">
        <span className="font-mono text-text">{settings.name}</span>
      </InfoRow>
      <InfoRow label="Module">
        <span className="font-mono text-text">{settings.module}</span>
      </InfoRow>
      <InfoRow label="Preset">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{settings.preset}</Badge>
          {settings.tenancy && <Badge tone="muted">{settings.tenancy === "multi" ? "multi-tenant" : "single-tenant"}</Badge>}
          {!settings.database && <span className="text-[11px] text-dim">no database</span>}
        </span>
      </InfoRow>
      <InfoRow label="Features">
        <span className="flex flex-wrap gap-1">
          {settings.features.map((f) => (
            <Badge key={f} tone="muted">
              {f}
            </Badge>
          ))}
        </span>
      </InfoRow>
      <InfoRow label="Directory">
        <span className="break-all font-mono text-[11.5px] text-muted">{settings.dir}</span>
      </InfoRow>
      <InfoRow label="Git">{settings.git ? <Badge tone="ok">repository</Badge> : <span className="text-warn">not a git repository: generators can&apos;t check for uncommitted changes</span>}</InfoRow>
    </Panel>
  );
}

export function PortsSection({ settings, env, readOnly, onSaved }: SectionProps) {
  return (
    <Panel title={title(<Network size={13} />, "Ports and addresses")} meta="the app reads .env when it starts">
      <EnvField label="App address" envKey={settings.app.key} value={raw(env, settings.app.key, settings.app.addr)} display={<span className="font-mono text-text">{settings.app.addr}</span>} hint={<span>reachable at <a className="text-primary hover:underline" href={settings.app.url} target="_blank" rel="noreferrer">{settings.app.url}</a></span>} control={{ kind: "text", placeholder: "127.0.0.1:8080" }} validate={addrError} readOnly={readOnly} onSaved={onSaved} />
      <EnvField label="Portal port" envKey={settings.portal.key} value={raw(env, settings.portal.key, settings.portal.port)} display={<span className="font-mono text-text">{settings.portal.port}</span>} hint="orb dev serves the Dev Portal here; applies when orb dev restarts" control={{ kind: "text", inputMode: "numeric", placeholder: "3100" }} validate={(v) => portError(v, true)} readOnly={readOnly} onSaved={onSaved} />
      {settings.database && <EnvField label="PostgreSQL port" envKey={settings.database_settings.port_key} value={raw(env, settings.database_settings.port_key, "")} hint="the host port of the compose container; empty for the default (5432)" control={{ kind: "text", inputMode: "numeric", placeholder: "5432" }} validate={(v) => portError(v)} readOnly={readOnly} onSaved={onSaved} />}
    </Panel>
  );
}

export function DatabaseSection({ settings }: { settings: ProjectSettings }) {
  const db = settings.database_settings;
  return (
    <Panel title={title(<Database size={13} />, "Database")} meta="never the password">
      <InfoRow label="Connection" badge={db.key}>
        {db.configured ? (
          <span className="font-mono text-text">{db.host}</span>
        ) : settings.database ? (
          <span className="text-warn">{db.key} isn&apos;t set; orb dev points the app at its container</span>
        ) : (
          <span className="text-dim">this app has no database (Minimal preset)</span>
        )}
      </InfoRow>
      {settings.database && (
        <InfoRow label="Edit">
          <span className="text-[11.5px] text-muted">
            The URL carries credentials, so it&apos;s edited on the Environment screen where it&apos;s revealed on purpose.{" "}
            <Link href="/database" className="inline-flex items-center gap-1 text-primary hover:underline">
              pool, health and migrations <ArrowRight size={11} />
            </Link>
          </span>
        </InfoRow>
      )}
    </Panel>
  );
}

export function MailSection({ settings, env, readOnly, onSaved, provider }: SectionProps & { provider?: string }) {
  return (
    <Panel title={title(<Mail size={13} />, "Mail")} meta="where email goes in development">
      <EnvField label="Delivery" envKey={settings.mail.key} value={raw(env, settings.mail.key, settings.mail.delivery)} display={<span className="flex items-center gap-2"><Badge tone="accent">{settings.mail.delivery}</Badge>{settings.mail.catcher_addr && <span className="font-mono text-[11.5px] text-muted">catcher on {settings.mail.catcher_addr}</span>}</span>} hint={MAIL_DELIVERIES.find((d) => d.value === settings.mail.delivery)?.hint ?? "devmail, mailpit or provider"} control={{ kind: "select", options: MAIL_DELIVERIES.map((d) => ({ value: d.value, label: `${d.label} · ${d.hint}` })) }} readOnly={readOnly} onSaved={onSaved} />
      <InfoRow label="Provider">
        <span className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
          {provider ? <Badge tone="muted">{provider}</Badge> : "none in the manifest yet"}
          <Link href="/generators?generator=add-mail" className="inline-flex items-center gap-1 text-primary hover:underline">
            set or switch with orb add mail <ArrowRight size={11} />
          </Link>
        </span>
      </InfoRow>
    </Panel>
  );
}

export function StorageSection({ settings }: { settings: ProjectSettings }) {
  const s = settings.storage;
  return (
    <Panel title={title(<HardDrive size={13} />, "Storage")} meta="orb add storage">
      <InfoRow label="Driver" badge={s.key}>
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{s.driver}</Badge>
          {s.local_dir && <span className="font-mono text-[11.5px] text-muted">{s.local_dir}</span>}
          {s.bucket && <span className="font-mono text-[11.5px] text-muted">bucket {s.bucket}</span>}
        </span>
      </InfoRow>
      <InfoRow label="Change">
        <Link href="/generators?generator=add-storage" className="inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline">
          pick a driver with a diff preview <ArrowRight size={11} />
        </Link>
      </InfoRow>
    </Panel>
  );
}

export function LoggingSection({ settings, env, readOnly, onSaved }: SectionProps) {
  const k = loggingKeys(settings.logging.keys);
  return (
    <Panel title={title(<ScrollText size={13} />, "Logging and docs")} meta="applied when the app restarts">
      <EnvField label="Level" envKey={k.level} value={raw(env, k.level, settings.logging.level)} display={<Badge tone="accent">{settings.logging.level}</Badge>} hint="debug, info, warn or error" control={{ kind: "select", options: LOG_LEVELS.map((l) => ({ value: l, label: l })) }} readOnly={readOnly} onSaved={onSaved} />
      <EnvField label="Format" envKey={k.format} value={formatValue(raw(env, k.format, ""))} display={<span className="font-mono text-text">{settings.logging.format}</span>} hint="json or text; empty for the default (orb dev sets json for its log store and prints text)" control={{ kind: "select", options: LOG_FORMATS }} readOnly={readOnly} onSaved={onSaved} />
      <EnvField label="Docs" envKey={settings.docs.key} value={settings.docs.enabled ? "true" : "false"} display={<span>{settings.docs.enabled ? "/docs and /openapi.json are served" : "off"}</span>} hint="empty means on in development, off in production" control={{ kind: "switch", on: "true", off: "false" }} readOnly={readOnly} onSaved={onSaved} />
    </Panel>
  );
}
