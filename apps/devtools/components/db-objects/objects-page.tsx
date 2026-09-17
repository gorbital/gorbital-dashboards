"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown, type DropdownItem } from "@gorbital/dash/components/dropdown";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Pill } from "@gorbital/dash/components/pill";
import { TabPanel, Tabs, type Tab } from "@gorbital/dash/components/tabs";
import { useStatus } from "@/lib/api/queries";
import { useEnums, useExtensions, useFunctions, useSchemas, useViews } from "@/lib/api/schema";
import { SchemaNotice } from "@/components/database/schema-notice";
import { DbGate, DbPageSkeleton, useMounted } from "./common";
import { EnumsTab } from "./enums-tab";
import { ExtensionsTab } from "./extensions-tab";
import { FunctionsTab } from "./functions-tab";
import { IndexesTab } from "./indexes-tab";
import { TriggersTab } from "./triggers-tab";
import { ViewsTab } from "./views-tab";

export type ObjectsTab = "functions" | "triggers" | "enums" | "extensions" | "indexes" | "views";
const tabValues: ObjectsTab[] = ["functions", "triggers", "enums", "extensions", "indexes", "views"];

/** `/database/objects?tab=functions&schema=public`: the other objects, each with create and drop as migrations. */
export function ObjectsPage() {
  const mounted = useMounted();
  const status = useStatus();
  const hasDb = status.data?.portal.database ?? false;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = useMemo<ObjectsTab>(() => {
    const t = params.get("tab");
    return tabValues.includes(t as ObjectsTab) ? (t as ObjectsTab) : "functions";
  }, [params]);
  const schema = params.get("schema") || "public";
  const navigate = (next: { tab?: ObjectsTab; schema?: string }) => {
    const q = new URLSearchParams();
    q.set("tab", next.tab ?? tab);
    q.set("schema", next.schema ?? schema);
    router.replace(`${pathname}?${q.toString()}`);
  };

  const schemas = useSchemas(hasDb);
  const fns = useFunctions([schema], hasDb);
  const enums = useEnums([schema], hasDb);
  const views = useViews([schema], hasDb);
  const exts = useExtensions(hasDb);

  const tabs: Tab<ObjectsTab>[] = [
    { value: "functions", label: "Functions", badge: fns.data?.length },
    { value: "triggers", label: "Triggers" },
    { value: "enums", label: "Enums", badge: enums.data?.length },
    { value: "extensions", label: "Extensions", badge: exts.data ? exts.data.filter((e) => e.installed).length : undefined },
    { value: "indexes", label: "Indexes" },
    { value: "views", label: "Views", badge: views.data?.length },
  ];
  const schemaItems: DropdownItem[] = (schemas.data ?? []).filter((s) => !s.system).map((s) => ({ label: s.name, checked: s.name === schema, onSelect: () => navigate({ schema: s.name }) }));

  if (!mounted) return <DbPageSkeleton title="Objects" description="functions, triggers, enums, extensions, indexes and views" />;
  return (
    <>
      <PageHeader product="devtools" title="Objects" description={`functions, triggers, enums, extensions, indexes and views · ${schema}`}>
        <Dropdown trigger={<Pill>{schema}</Pill>} items={schemaItems.length ? schemaItems : [{ label: "no schemas", disabled: true }]} label="Schema" align="end" />
      </PageHeader>
      <Page>
        <DbGate status={status}>
          <SchemaNotice />
          <Tabs<ObjectsTab> tabs={tabs} value={tab} onChange={(t) => navigate({ tab: t })}>
            <TabPanel value="functions">{tab === "functions" && <FunctionsTab schema={schema} />}</TabPanel>
            <TabPanel value="triggers">{tab === "triggers" && <TriggersTab schema={schema} />}</TabPanel>
            <TabPanel value="enums">{tab === "enums" && <EnumsTab schema={schema} />}</TabPanel>
            <TabPanel value="extensions">{tab === "extensions" && <ExtensionsTab />}</TabPanel>
            <TabPanel value="indexes">{tab === "indexes" && <IndexesTab schema={schema} />}</TabPanel>
            <TabPanel value="views">{tab === "views" && <ViewsTab schema={schema} />}</TabPanel>
          </Tabs>
        </DbGate>
      </Page>
    </>
  );
}
