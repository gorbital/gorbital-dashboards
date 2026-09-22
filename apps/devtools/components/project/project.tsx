"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCw } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty } from "@gorbital/dash/components/panel";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { isNoEnvEditor, useEnv } from "@/lib/api/env";
import { isNoProjectSettings, useProject } from "@/lib/api/project";
import type { Project } from "@/lib/api/types";
import { useAppAction, useStatus } from "@/lib/api/queries";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { CorsEditor } from "./cors-editor";
import { DangerZone } from "./danger-zone";
import { KeysSection } from "./keys";
import { AppSection, DatabaseSection, LoggingSection, MailSection, PortsSection, StorageSection } from "./sections";

/** Project Settings (ADR-0077): the app as the manifest and .env describe it, each value with its env key, edited through the env editor with a restart offered; keys from the ops API; the danger zone. */
/**
 * profileWords says how the app was made, in the words its own manifest
 * uses: the sign-in it serves and what it calls a tenant (`orb new --auth`
 * and `--scope`, from v0.3.0), or the `tenancy` an older app recorded
 * instead. An app that declares neither gets nothing rather than a guess.
 */
function profileWords(p: Pick<Project, "auth" | "scope" | "tenancy">): string {
  const parts = [p.auth && `auth ${p.auth}`, p.scope ?? p.tenancy].filter(Boolean);
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

export function ProjectSettingsPage() {
  const project = useProject();
  const status = useStatus();
  const env = useEnv();
  const restart = useAppAction("restart");
  const [restartNeeded, setRestartNeeded] = useState(false);
  const noEditor = isNoEnvEditor(env.error);
  const readOnly = noEditor;
  const onSaved = (needed: boolean) => setRestartNeeded((r) => r || needed);
  const s = project.data;

  return (
    <Page>
      <PageHeader product="devtools" title="Project" description={s ? `${s.name} · ${s.module} · ${s.preset}${profileWords(s)} · /_portal/api/project` : "name, ports, database, mail, storage, CORS, logging, keys and the danger zone"}>
        <Link href="/generators">
          <Button size="sm" kind="secondary" icon={<ArrowRight size={11} />}>
            Generators
          </Button>
        </Link>
      </PageHeader>

      {restartNeeded && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[12px]">
          <span className="text-text">.env changed. The app reads it when it starts, so restart to apply.</span>
          <span className="ml-auto flex items-center gap-2">
            <Button size="sm" kind="ghost" onClick={() => setRestartNeeded(false)}>
              Later
            </Button>
            <Button size="sm" kind="primary" icon={<RotateCw size={11} />} loading={restart.isPending} onClick={() => restart.mutate(undefined, { onSuccess: () => setRestartNeeded(false) })}>
              Restart the app
            </Button>
          </span>
        </div>
      )}
      {noEditor && <div className="rounded-lg border border-hairline bg-bg/40 px-3 py-2 text-[11.5px] text-muted">This orb dev has no env editor (404 no_env_editor): values are shown from .env but edited in the file. Rebuild orb from the current gorbital to edit them here.</div>}

      {project.error && !project.data ? (
        isNoProjectSettings(project.error) ? (
          <Empty title="This orb dev describes no project" hint="GET /_portal/api/project answered 404: an orb from before the Project Settings screen. Rebuild orb from the current gorbital and start orb dev again." />
        ) : (
          <ProblemPanel error={project.error} scope="portal" meta="GET /_portal/api/project" onRetry={() => void project.refetch()} retrying={project.isFetching} />
        )
      ) : !s ? (
        <SkeletonLines lines={10} className="p-4" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <AppSection settings={s} />
          <PortsSection settings={s} env={env.data} readOnly={readOnly} onSaved={onSaved} />
          <DatabaseSection settings={s} />
          <MailSection settings={s} env={env.data} readOnly={readOnly} onSaved={onSaved} provider={status.data?.project.mail} />
          <StorageSection settings={s} />
          <LoggingSection settings={s} env={env.data} readOnly={readOnly} onSaved={onSaved} />
          <CorsEditor origins={s.cors.origins ?? []} envKey={s.cors.key} readOnly={readOnly} onSaved={onSaved} />
          <KeysSection />
          <div className="xl:col-span-2">
            <DangerZone actions={s.danger ?? []} />
          </div>
        </div>
      )}
      {status.data?.app.state === "building" && <div className="text-[11.5px] text-muted">The app is rebuilding; values refresh when it&apos;s up.</div>}
    </Page>
  );
}
