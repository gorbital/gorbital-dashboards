"use client";

import { Suspense, useCallback, useState } from "react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import { useCapabilities } from "@/lib/api/queries";
import { useMounted } from "@/components/db-objects/common";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { AdviceTab } from "./advice";
import { ApiTab } from "./api";
import { DatabaseTab } from "./db";
import { HealthTab } from "./health";
import { JobsAuthTab } from "./jobs-auth";
import { QueriesTab } from "./queries";
import { SystemTab } from "./system";

type ObsTab = "health" | "api" | "database" | "queries" | "advice" | "system" | "jobs";
const tabs: ObsTab[] = ["health", "api", "database", "queries", "advice", "system", "jobs"];
const isTab = (v: string | null): v is ObsTab => tabs.includes(v as ObsTab);

/**
 * The Observability screen (ADR-0073): service health, the API's rates and
 * percentiles, the database's statistics, query performance, advice, the
 * machine and the Go runtime, jobs and sign-ins. The section lives in `?tab=`.
 * Each tab mounts its own hooks, so a tab polls only while it is open. The
 * page hydrates inside a Suspense boundary, possibly after the status query
 * has answered, so it renders the skeleton until mounted (like the Phase 4 pages).
 */
export function Observability() {
  const caps = useCapabilities();
  const mounted = useMounted();
  const [tab, setTab] = useState<ObsTab>("health");
  const onTab = useCallback((v: string | null) => setTab(isTab(v) ? v : "health"), []);
  const selectTab = (t: ObsTab) => {
    setTab(t);
    setQueryParam("tab", t === "health" ? null : t);
  };
  const noDatabase = mounted && caps.status.data?.portal.database === false;
  const project = mounted ? caps.status.data?.project : undefined;
  const hasOps = project ? project.features.includes("ops") || project.preset === "full" : true;

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="tab" onValue={onTab} />
      </Suspense>
      <PageHeader product="devtools" title="Observability" description={project ? `${project.name} · services, the API, PostgreSQL, the machine and the runtime` : "services, the API, PostgreSQL, the machine and the runtime"} />
      <Page>
        {!mounted ? (
          <SkeletonLines lines={6} className="p-4" />
        ) : (
        <Tabs<ObsTab>
          value={tab}
          onChange={selectTab}
          tabs={[
            { value: "health", label: "Health" },
            { value: "api", label: "API", disabled: !hasOps },
            { value: "database", label: "Database", disabled: noDatabase },
            { value: "queries", label: "Queries", disabled: noDatabase },
            { value: "advice", label: "Advice", disabled: noDatabase },
            { value: "system", label: "System" },
            { value: "jobs", label: "Jobs & auth", disabled: !hasOps },
          ]}
        >
          <TabPanel value="health">
            <HealthTab />
          </TabPanel>
          <TabPanel value="api">
            <ApiTab />
          </TabPanel>
          <TabPanel value="database">
            <DatabaseTab />
          </TabPanel>
          <TabPanel value="queries">
            <QueriesTab />
          </TabPanel>
          <TabPanel value="advice">
            <AdviceTab />
          </TabPanel>
          <TabPanel value="system">
            <SystemTab />
          </TabPanel>
          <TabPanel value="jobs">
            <JobsAuthTab />
          </TabPanel>
        </Tabs>
        )}
      </Page>
    </>
  );
}
