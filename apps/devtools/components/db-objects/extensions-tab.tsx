"use client";

import { useState } from "react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { Table, type Column } from "@gorbital/dash/components/table";
import { useExtensions, type Change, type DbExtension } from "@/lib/api/schema";
import { changes } from "./changes";
import { DbProblem, SearchInput, matches } from "./common";
import { PlanDialog } from "./plan-dialog";

type PlanState = { change: Change; name?: string; title: string; danger?: boolean };
type Filter = "installed" | "available" | "all";

export function ExtensionsTab() {
  const exts = useExtensions();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("installed");
  const [confirm, setConfirm] = useState<DbExtension | null>(null);
  const [plan, setPlan] = useState<PlanState | null>(null);

  const rows = (exts.data ?? []).filter((e) => (filter === "all" || (filter === "installed") === e.installed) && matches(q, e.name, e.comment));
  const installed = exts.data?.filter((e) => e.installed).length ?? 0;
  const columns: Column<DbExtension>[] = [
    { key: "name", header: "Name", width: "220px", cell: (e) => <span className="font-mono text-text">{e.name}</span> },
    {
      key: "version",
      header: "Version",
      width: "160px",
      cell: (e) =>
        e.installed ? (
          <span className="font-mono text-[11px] text-muted">
            {e.installed_version}
            {e.default_version && e.default_version !== e.installed_version && <span className="text-warn"> → {e.default_version}</span>}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-dim">{e.default_version ?? "—"}</span>
        ),
    },
    { key: "schema", header: "Schema", width: "120px", cell: (e) => <span className="font-mono text-[11px] text-dim">{e.schema ?? ""}</span> },
    { key: "comment", header: "Comment", cell: (e) => <span className="text-muted">{e.comment}</span> },
    {
      key: "action",
      header: "",
      align: "right",
      width: "110px",
      cell: (e) =>
        e.name === "plpgsql" ? (
          <Badge tone="muted">built in</Badge>
        ) : e.installed ? (
          <Button size="sm" kind="ghost" className="text-danger" onClick={() => setConfirm(e)}>
            Disable
          </Button>
        ) : (
          <Button size="sm" kind="secondary" onClick={() => setPlan({ change: changes.createExtension(e.name), name: `enable_${e.name.replace(/-/g, "_")}`, title: `Enable ${e.name}` })}>
            Enable
          </Button>
        ),
    },
  ];

  if (exts.error && !exts.data) return <DbProblem error={exts.error} retrying={exts.isFetching} onRetry={() => void exts.refetch()} />;

  return (
    <Panel
      title="Extensions"
      meta={exts.data ? `${installed} installed · ${exts.data.length - installed} available` : undefined}
      flush
      actions={
        <>
          <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: "installed", label: "Installed" }, { value: "available", label: "Available" }, { value: "all", label: "All" }]} />
          <SearchInput value={q} onChange={setQ} placeholder="Filter extensions" className="w-[220px]" />
        </>
      }
    >
      <Table columns={columns} rows={rows} rowKey={(e) => e.name} loading={exts.isPending} dense empty={<Empty title="No extensions" hint={q ? "Nothing matches the filter." : filter === "installed" ? "Nothing beyond plpgsql; enable one from Available." : "The server offers nothing more."} />} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Disable ${confirm?.name}?`}
        description="DROP EXTENSION removes what the extension created (types, functions, operators). Objects that depend on it stop the migration; the plan shows the SQL first."
        confirmLabel="Plan the drop"
        danger
        onConfirm={() => {
          if (!confirm) return;
          setPlan({ change: changes.dropExtension(confirm.name), name: `disable_${confirm.name.replace(/-/g, "_")}`, title: `Disable ${confirm.name}`, danger: true });
          setConfirm(null);
        }}
      />
      <PlanDialog open={Boolean(plan)} onOpenChange={(o) => !o && setPlan(null)} change={plan?.change ?? null} name={plan?.name} title={plan?.title} danger={plan?.danger} />
    </Panel>
  );
}
