"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, MoreHorizontal, Pencil, Plus, PlusSquare, RefreshCw, Trash2, Upload } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { ConfirmDialog } from "@gorbital/dash/components/dialog";
import { Dropdown } from "@gorbital/dash/components/dropdown";
import { Empty } from "@gorbital/dash/components/panel";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import { ConnectionProblem } from "@/components/overview/connection";
import { ApiError, NotConnectedError } from "@/lib/api/client";
import { dbKeys, useDeleteRows, useRows, useTableDetail, useUpdateRow, type Cell, type Column, type RowKey, type RowPage, type RowQuery } from "@/lib/api/db";
import { useStatus as usePortalStatus } from "@/lib/api/queries";
import { parseState, serializeState, tableHref, type EditorState } from "@/lib/table-editor/url";
import { Banner, KindIcon, ManagedBanner, OwnershipBadge, ProblemNote, kindLabels, readOnlyReason } from "./common";
import { ColumnSheet } from "./column-sheet";
import { DDLDialog, type DDLIntent } from "./ddl-dialog";
import { Definition } from "./definition";
import { exportTable } from "./export";
import { FilterBar } from "./filter-bar";
import { Footer } from "./footer";
import { Grid, type ColumnAction, type RowAction } from "./grid";
import { ImportSheet } from "./import-sheet";
import { RowSheet, type RowSheetMode } from "./row-sheet";
import { Sidebar } from "./sidebar";
import { TableSheet } from "./table-sheet";

export function rowKeyOf(page: RowPage, row: Cell[]): RowKey {
  return Object.fromEntries(page.primary_key.map((k) => [k, row[page.columns.findIndex((c) => c.name === k)] ?? null]));
}

/** The Table Editor: a schema's relations on the left, one table's rows (or definition) on the right, everything in the URL. */
export function TableEditor() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const state = useMemo(() => parseState(new URLSearchParams(params.toString())), [params]);
  const { schema, table } = state;
  const tableKey = schema && table ? `${schema}.${table}` : undefined;

  const navigate = useCallback(
    (next: EditorState, push = false) => {
      const qs = serializeState(next).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router],
  );
  const patch = useCallback((p: Partial<EditorState>) => navigate({ ...state, ...p }), [navigate, state]);

  const portal = usePortalStatus();
  const noDatabase = portal.data?.portal.database === false;
  const detail = useTableDetail(schema, table);
  const query: RowQuery | undefined = useMemo(
    () => (schema && table && state.view === "data" ? { schema, table, filters: state.filters, sorts: state.sorts, limit: state.limit, offset: (state.page - 1) * state.limit } : undefined),
    [schema, table, state.view, state.filters, state.sorts, state.limit, state.page],
  );
  const rows = useRows(query);
  const [loadedFor, setLoadedFor] = useState<string>();
  useEffect(() => {
    if (rows.data && !rows.isPlaceholderData) setLoadedFor(tableKey);
  }, [rows.data, rows.isPlaceholderData, tableKey]);
  const stale = rows.isPlaceholderData && loadedFor !== tableKey;
  const page = stale ? undefined : rows.data;

  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  useEffect(() => setSelected(new Set()), [page]);
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => setUnlocked(false), [tableKey]);

  const [rowSheet, setRowSheet] = useState<RowSheetMode | null>(null);
  const [columnSheet, setColumnSheet] = useState<{ column?: Column } | null>(null);
  const [tableSheet, setTableSheet] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [intent, setIntent] = useState<DDLIntent | null>(null);
  const [deleting, setDeleting] = useState<RowKey[] | null>(null);
  const [requestedFilter, setRequestedFilter] = useState<string>();

  const update = useUpdateRow(schema ?? "", table ?? "");
  const remove = useDeleteRows(schema ?? "", table ?? "");

  const t = detail.data?.table;
  const primaryKey = page?.primary_key ?? detail.data?.primary_key;
  const reason = readOnlyReason(t, primaryKey);
  const managed = t?.ownership === "managed";
  const readOnly = Boolean(reason) || (managed && !unlocked) || !primaryKey?.length;
  const canAlter = t?.ownership === "user" && (t.kind === "table" || t.kind === "partitioned_table");
  const canInsert = !reason && Boolean(t) && (!managed || unlocked) && (t?.kind === "table" || t?.kind === "partitioned_table");
  const columns = page?.columns ?? detail.data?.columns ?? [];

  const refresh = () => {
    void detail.refetch();
    void rows.refetch();
  };
  const invalidate = () => void qc.invalidateQueries({ queryKey: dbKeys.all });

  const onEditCell = useCallback(
    async (r: number, column: Column, value: Cell) => {
      if (!page || !query) return;
      const key = rowKeyOf(page, page.rows[r]);
      const res = await update.mutateAsync({ key, values: { [column.name]: value } });
      qc.setQueryData<RowPage>(dbKeys.rows(query), (old) => (old ? { ...old, rows: old.rows.map((row, i) => (i === r ? res.row : row)) } : old));
    },
    [page, query, update, qc],
  );

  const onRowAction = (action: RowAction, r: number) => {
    if (!page) return;
    const row = page.rows[r];
    if (action === "edit") setRowSheet({ kind: "edit", row, key: rowKeyOf(page, row) });
    else if (action === "duplicate") setRowSheet({ kind: "duplicate", row });
    else setDeleting([rowKeyOf(page, row)]);
  };

  const onColumnAction = (action: ColumnAction, column: Column) => {
    switch (action) {
      case "sort_asc":
      case "sort_desc":
        return patch({ sorts: [...state.sorts.filter((s) => s.column !== column.name), { column: column.name, descending: action === "sort_desc" }], page: 1 });
      case "filter":
        return setRequestedFilter(column.name);
      case "edit":
        return setColumnSheet({ column: column.name ? column : undefined });
      case "delete":
        return setIntent({ kind: "drop_column", column });
      case "foreign_key":
        return setIntent({ kind: "foreign_key", column });
      case "unique":
        return setIntent({ kind: "unique", column });
      case "primary_key":
        return setIntent({ kind: "primary_key", column });
    }
  };

  const onOpenReference = (column: Column, value: string) => {
    const fk = detail.data?.constraints.find((c) => c.type === "f" && c.columns.includes(column.name));
    const target = column.fk_targets?.[0];
    if (!target) return;
    const [refSchema, refTable] = fk?.ref_schema && fk.ref_table ? [fk.ref_schema, fk.ref_table] : target.split(".");
    const refColumn = fk?.ref_columns?.[fk.columns.indexOf(column.name)] ?? "id";
    router.push(tableHref(refSchema, refTable, { column: refColumn, operator: "=", value }));
  };

  const connectionError = (err: unknown) => err instanceof NotConnectedError || (err instanceof ApiError && (err.status === 401 || err.code === "no_database" || err.code === "database_unavailable"));

  if (noDatabase) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Empty title="This app has no database" hint="The Table Editor reads PostgreSQL through orb dev; the Minimal preset has none." />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <Sidebar
        schema={schema}
        table={table}
        onSchema={(s) => navigate({ ...state, schema: s, table: undefined, filters: [], sorts: [], page: 1 })}
        onTable={(s, tb) => navigate({ ...state, schema: s, table: tb, filters: [], sorts: [], page: 1, view: state.view }, true)}
        onNewTable={() => setTableSheet(true)}
      />
      <section className="flex min-w-0 flex-1 flex-col">
        {!tableKey ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Empty title="Pick a table" hint="Its rows open in a grid you can filter, sort and edit; the definition view shows how it is built." />
          </div>
        ) : detail.error && !detail.data && connectionError(detail.error) ? (
          <div className="p-6">
            <ConnectionProblem error={detail.error} retrying={detail.isFetching} onRetry={refresh} />
          </div>
        ) : (
          <>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-4">
              {t ? (
                <>
                  <KindIcon kind={t.kind} className="text-primary" />
                  <h1 className="truncate font-mono text-[13px] font-semibold text-text">
                    <span className="text-dim">{t.schema}.</span>
                    {t.name}
                  </h1>
                  <OwnershipBadge ownership={t.ownership} />
                  {t.rls_enabled && <Badge tone="info">rls</Badge>}
                  {t.comment && (
                    <span className="truncate text-[11.5px] text-dim" title={t.comment}>
                      {t.comment}
                    </span>
                  )}
                </>
              ) : detail.error ? (
                <span className="text-[12px] text-danger">{table}</span>
              ) : (
                <Skeleton className="h-3 w-40" />
              )}
              <span className="ml-auto" />
              <Tooltip content="Refresh rows and definition">
                <Button size="sm" kind="ghost" icon={<RefreshCw size={11} className={rows.isFetching || detail.isFetching ? "animate-spin" : ""} />} onClick={refresh} aria-label="Refresh">
                  Refresh
                </Button>
              </Tooltip>
              <Dropdown
                trigger={
                  <Button size="sm" kind="ghost" icon={<Download size={11} />}>
                    Export <ChevronDown size={11} className="text-dim" />
                  </Button>
                }
                items={[
                  { label: "CSV · current filters", onSelect: () => void exportTable({ schema: schema!, table: table!, filters: state.filters, sorts: state.sorts, format: "csv" }) },
                  { label: "JSON · current filters", onSelect: () => void exportTable({ schema: schema!, table: table!, filters: state.filters, sorts: state.sorts, format: "json" }) },
                ]}
              />
              <Button size="sm" kind="ghost" icon={<Upload size={11} />} onClick={() => setImportOpen(true)} disabled={!canInsert}>
                Import
              </Button>
              <Button size="sm" kind="primary" icon={<Plus size={11} />} onClick={() => setRowSheet({ kind: "insert" })} disabled={!canInsert}>
                Insert row
              </Button>
              {canAlter && (
                <Dropdown
                  trigger={
                    <Button size="sm" kind="ghost" aria-label="Table actions">
                      <MoreHorizontal size={13} />
                    </Button>
                  }
                  label={t?.name}
                  items={[
                    { label: "Add column", icon: <PlusSquare size={12} />, onSelect: () => setColumnSheet({}) },
                    { label: "Rename table…", icon: <Pencil size={12} />, onSelect: () => setIntent({ kind: "rename_table" }) },
                    "separator",
                    { label: "Delete table…", icon: <Trash2 size={12} />, danger: true, onSelect: () => setIntent({ kind: "drop_table" }) },
                  ]}
                />
              )}
            </header>
            {reason && <Banner tone="muted">{reason}</Banner>}
            {!reason && managed && <ManagedBanner unlocked={unlocked} onUnlock={setUnlocked} />}
            {state.view === "definition" ? (
              detail.data ? (
                <Definition detail={detail.data} />
              ) : detail.error ? (
                <div className="p-4">
                  <ProblemNote error={detail.error} />
                </div>
              ) : (
                <div className="grid gap-3 p-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )
            ) : (
              <>
                <FilterBar columns={columns} filters={state.filters} sorts={state.sorts} onFilters={(filters) => patch({ filters, page: 1 })} onSorts={(sorts) => patch({ sorts, page: 1 })} requestedColumn={requestedFilter} onRequestHandled={() => setRequestedFilter(undefined)} />
                {selected.size > 0 && (
                  <div className="flex items-center gap-3 border-b border-hairline bg-primary/6 px-4 py-1.5 text-[12px]">
                    <span className="font-mono tnum text-text">
                      {selected.size} {selected.size === 1 ? "row" : "rows"} selected
                    </span>
                    <Button size="sm" kind="danger" icon={<Trash2 size={11} />} onClick={() => page && setDeleting([...selected].map((i) => rowKeyOf(page, page.rows[i])))} disabled={readOnly}>
                      Delete
                    </Button>
                    <Button size="sm" kind="ghost" onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                  </div>
                )}
                {rows.error && !page && !connectionError(rows.error) && (
                  <div className="p-4">
                    <ProblemNote error={rows.error} />
                  </div>
                )}
                {rows.error && !page && connectionError(rows.error) && (
                  <div className="p-4">
                    <ConnectionProblem error={rows.error} retrying={rows.isFetching} onRetry={refresh} />
                  </div>
                )}
                {(!rows.error || page) && (
                  <Grid
                    page={page}
                    loading={!page}
                    readOnly={readOnly}
                    canAlter={Boolean(canAlter)}
                    sorts={state.sorts}
                    selected={selected}
                    onSelect={setSelected}
                    onEditCell={onEditCell}
                    onRowAction={onRowAction}
                    onColumnAction={onColumnAction}
                    onOpenReference={onOpenReference}
                    empty={state.filters.length ? <Empty title="No rows match" hint="Loosen or clear the filters." /> : <Empty title="No rows yet" hint={canInsert ? "Insert one, or import a CSV." : undefined} />}
                  />
                )}
                {rows.error && page && (
                  <div className="border-t border-hairline px-4 py-1.5">
                    <ProblemNote error={rows.error} />
                  </div>
                )}
              </>
            )}
            <Footer page={page} fetching={rows.isFetching} limit={state.limit} pageNo={state.page} view={state.view} onLimit={(limit) => patch({ limit, page: 1 })} onPage={(p) => patch({ page: p })} onView={(view) => patch({ view })} />
          </>
        )}
      </section>

      {schema && table && (
        <>
          <RowSheet open={rowSheet !== null} onOpenChange={(v) => !v && setRowSheet(null)} schema={schema} table={table} columns={columns} primaryKey={primaryKey ?? []} mode={rowSheet ?? { kind: "insert" }} onSaved={invalidate} />
          <ImportSheet open={importOpen} onOpenChange={setImportOpen} schema={schema} table={table} columns={columns} onImported={invalidate} />
          <ColumnSheet open={columnSheet !== null} onOpenChange={(v) => !v && setColumnSheet(null)} schema={schema} table={table} column={columnSheet?.column} onApplied={() => setColumnSheet(null)} />
          <DDLDialog
            intent={intent}
            onClose={() => setIntent(null)}
            schema={schema}
            table={table}
            columns={columns}
            onApplied={(done) => {
              setIntent(null);
              if (done.kind === "drop_table") navigate({ ...state, table: undefined, filters: [], sorts: [], page: 1 });
              else if (done.kind === "rename_table") navigate({ ...state, table: undefined, filters: [], sorts: [], page: 1 });
            }}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(v) => !v && setDeleting(null)}
            title={deleting && deleting.length > 1 ? `Delete ${deleting.length} rows?` : "Delete this row?"}
            description={
              deleting && deleting.length === 1
                ? `${Object.entries(deleting[0])
                    .map(([k, v]) => `${k} = ${v ?? "NULL"}`)
                    .join(", ")} in ${schema}.${table}. There is no undo.`
                : `From ${schema}.${table}, in one transaction. There is no undo.`
            }
            confirmLabel="Delete"
            danger
            loading={remove.isPending}
            onConfirm={async () => {
              if (!deleting) return;
              try {
                await remove.mutateAsync(deleting);
                setDeleting(null);
                setSelected(new Set());
              } catch {
                // The mutation's toast says why.
              }
            }}
          />
        </>
      )}
      <TableSheet
        open={tableSheet}
        onOpenChange={setTableSheet}
        schema={schema ?? "public"}
        onCreated={(s, tb) => {
          setTableSheet(false);
          navigate({ ...state, schema: s, table: tb, filters: [], sorts: [], page: 1, view: "data" }, true);
        }}
      />
    </div>
  );
}

export function TableEditorSkeleton() {
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[312px] shrink-0 border-r border-hairline p-3">
        <Skeleton className="mb-3 h-8 w-full" />
        <Skeleton className="mb-4 h-8 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className={`mb-2 h-3 ${i % 2 ? "w-2/3" : "w-1/2"}`} />
        ))}
      </div>
      <div className="flex-1 p-4">
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}
