"use client";

import "@xyflow/react/dist/style.css";
import "./flow.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel as FlowPanel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import { Check, Download, Fingerprint, KeyRound, LayoutGrid, Link2, Maximize2, Search } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Dropdown, type DropdownItem } from "@gorbital/dash/components/dropdown";
import { Input } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Pill } from "@gorbital/dash/components/pill";
import { Skeleton, SkeletonLines } from "@gorbital/dash/components/spinner";
import { toast } from "@gorbital/dash/components/toast";
import { theme } from "@gorbital/dash/theme";
import { DbGate, DbPageSkeleton, DbProblem, useMounted, useStoredState } from "@/components/db-objects/common";
import { useStatus } from "@/lib/api/queries";
import { describeError, useForeignKeys, useSchemas, useTableDetails, useTables, type DbTable, type Ownership, type TableDetail } from "@/lib/api/schema";
import { copyText, exportImage } from "./export";
import { buildGraph, layoutGraph, neighbourhood, nodeId, toMermaid, type Graph } from "./graph";
import { clearPositions, loadPositions, positionsKey, savePositions } from "./positions";
import { TableNode, type TableFlowNode } from "./table-node";

const nodeTypes: NodeTypes = { table: TableNode };
const FIND_ID = "schema-find";

type Shown = { managed: boolean; system: boolean };
const isShown = (v: unknown): v is Shown => Boolean(v) && typeof v === "object" && typeof (v as Shown).managed === "boolean" && typeof (v as Shown).system === "boolean";

/** The schema diagram: `/database/schema?schema=public[&schema=…]`. */
export function SchemaPage() {
  return (
    <ReactFlowProvider>
      <SchemaInner />
    </ReactFlowProvider>
  );
}

function SchemaInner() {
  const mounted = useMounted();
  const status = useStatus();
  const hasDb = status.data?.portal.database ?? false;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const selected = useMemo(() => {
    const s = params.getAll("schema").filter(Boolean);
    return s.length ? s : ["public"];
  }, [params]);
  const setSelected = (next: string[]) => {
    const q = next.map((s) => `schema=${encodeURIComponent(s)}`).join("&");
    router.replace(`${pathname}${q ? `?${q}` : ""}`);
  };

  const schemas = useSchemas(hasDb);
  const tables = useTables(selected, hasDb);
  const fks = useForeignKeys(selected, hasDb);
  const [shown, setShown] = useStoredState<Shown>("devtools.schema.show", { managed: false, system: false }, isShown);

  const visible = useMemo(() => (tables.data ?? []).filter((t) => t.ownership === "user" || (t.ownership === "managed" && shown.managed) || (t.ownership === "system" && shown.system)), [tables.data, shown]);
  const hiddenCount = (tables.data?.length ?? 0) - visible.length;
  const details = useTableDetails(visible);
  const loaded = details.every((q) => q.data !== undefined || q.error !== null);
  const graph = useMemo<Graph | null>(() => {
    if (!tables.data || !fks.data || !loaded) return null;
    const map = new Map<string, TableDetail | { error: string }>();
    visible.forEach((t, i) => {
      const q = details[i];
      if (q?.data) map.set(nodeId(t.schema, t.name), q.data);
      else if (q?.error) map.set(nodeId(t.schema, t.name), { error: describeError(q.error) });
    });
    return buildGraph(visible, map, fks.data);
    // The details array is a new object every render; its data is what the map reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.data, fks.data, loaded, visible, details.map((q) => q.dataUpdatedAt).join(",")]);

  const error = tables.error ?? fks.error;
  const counts = useMemo(() => {
    const c: Record<Ownership, number> = { user: 0, managed: 0, system: 0 };
    for (const t of tables.data ?? []) c[t.ownership]++;
    return c;
  }, [tables.data]);

  const schemaItems: DropdownItem[] = (schemas.data ?? [])
    .filter((s) => !s.system)
    .map((s) => ({
      label: s.name,
      checked: selected.includes(s.name),
      onSelect: () => {
        const next = selected.includes(s.name) ? selected.filter((x) => x !== s.name) : [...selected, s.name];
        if (next.length) setSelected(next);
      },
    }));

  if (!mounted) return <DbPageSkeleton title="Schema" description="the tables and their foreign keys, as a diagram" />;
  return (
    <>
      <PageHeader product="devtools" title="Schema" description={tables.data ? `${visible.length} of ${tables.data.length} tables · ${graph?.edges.length ?? fks.data?.length ?? 0} foreign keys · ${selected.join(", ")}` : "the tables and their foreign keys, as a diagram"}>
        <Dropdown trigger={<Pill>{selected.length === 1 ? selected[0] : `${selected.length} schemas`}</Pill>} items={schemaItems.length ? schemaItems : [{ label: "no schemas", disabled: true }]} label="Schemas" align="end" />
        <Pill caret={false} active={shown.managed} onClick={() => setShown({ ...shown, managed: !shown.managed })} dot="accent">
          managed <span className="font-mono text-[11px] text-dim tnum">{counts.managed}</span>
        </Pill>
        <Pill caret={false} active={shown.system} onClick={() => setShown({ ...shown, system: !shown.system })}>
          system <span className="font-mono text-[11px] text-dim tnum">{counts.system}</span>
        </Pill>
      </PageHeader>
      <Page>
        <DbGate status={status}>
          {error && !tables.data ? (
            <DbProblem error={error} retrying={tables.isFetching} onRetry={() => void Promise.all([tables.refetch(), fks.refetch()])} />
          ) : !graph ? (
            <Panel title="Schema" meta={tables.data ? `reading ${visible.length} tables…` : "loading"} className="min-h-[560px]">
              <SkeletonLines lines={6} />
            </Panel>
          ) : graph.nodes.length === 0 ? (
            <Panel>
              <Empty title={tables.data?.length ? `${hiddenCount} tables hidden` : "No tables"} hint={tables.data?.length ? "Every table here is managed or system; show them with the toggles above." : `${selected.join(", ")} has no tables yet; create one in the Table Editor or with a migration.`} />
            </Panel>
          ) : (
            <Diagram graph={graph} storageKey={positionsKey(selected)} tables={visible} hiddenCount={hiddenCount} />
          )}
        </DbGate>
      </Page>
    </>
  );
}

type DiagramProps = { graph: Graph; storageKey: string; tables: DbTable[]; hiddenCount: number };

function Diagram({ graph, storageKey, tables, hiddenCount }: DiagramProps) {
  const flow = useReactFlow<TableFlowNode, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<TableFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hover, setHover] = useState<{ node?: string; edge?: string }>({});
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  /** Lays the graph out: saved positions first, dagre for the rest (or for all when `reset`). */
  const place = useCallback(
    (reset: boolean) => {
      const saved = reset ? {} : loadPositions(storageKey);
      const layout = layoutGraph(graph.nodes, graph.edges);
      setNodes(graph.nodes.map((n) => ({ id: n.id, type: "table" as const, position: saved[n.id] ?? layout.get(n.id) ?? { x: 0, y: 0 }, data: n.data, width: n.width, height: n.height })));
      setEdges(
        graph.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: "default",
          data: { fk: e.fk },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: theme.border2 },
        })),
      );
      if (reset || !placed.current) requestAnimationFrame(() => void flow.fitView({ padding: 0.15, duration: reset ? 300 : 0, maxZoom: 1 }));
      placed.current = true;
    },
    [graph, storageKey, setNodes, setEdges, flow],
  );

  useEffect(() => {
    place(false);
  }, [place]);

  const highlight = useMemo(() => neighbourhood(graph, hover), [graph, hover]);
  const q = query.trim().toLowerCase();
  const matching = useMemo(() => new Set(q ? graph.nodes.filter((n) => n.data.table.name.toLowerCase().includes(q)).map((n) => n.id) : []), [graph, q]);
  const active = highlight.nodes.size > 0 || q.length > 0;

  const renderNodes = useMemo(
    () =>
      nodes.map((n) => {
        const hot = highlight.nodes.has(n.id) || matching.has(n.id);
        const dim = active && !hot;
        return { ...n, data: { ...n.data, hot, dim } };
      }),
    [nodes, highlight, matching, active],
  );
  const renderEdges = useMemo(
    () =>
      edges.map((e) => {
        const hot = highlight.edges.has(e.id);
        const fk = graph.edges.find((g) => g.id === e.id)?.fk;
        return {
          ...e,
          className: hot ? "edge--hot" : highlight.edges.size > 0 || q ? "edge--cold" : "",
          zIndex: hot ? 10 : 0,
          label: hot && fk ? `${fk.name} · on delete ${fk.on_delete.toLowerCase()}` : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: hot ? theme.primary : theme.border2 },
        };
      }),
    [edges, highlight, graph, q],
  );

  const onNodeEnter: NodeMouseHandler<TableFlowNode> = useCallback((_, n) => setHover({ node: n.id }), []);
  const onEdgeEnter: EdgeMouseHandler<Edge> = useCallback((_, e) => setHover({ edge: e.id }), []);
  const clearHover = useCallback(() => setHover({}), []);

  const persist = useCallback(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of flow.getNodes()) positions[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    savePositions(storageKey, positions);
  }, [flow, storageKey]);

  const autoLayout = () => {
    clearPositions(storageKey);
    place(true);
  };

  const focusMatch = () => {
    const first = graph.nodes.find((n) => matching.has(n.id));
    if (!first) return;
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === first.id })));
    const n = flow.getNode(first.id);
    if (n) void flow.setCenter(n.position.x + first.width / 2, n.position.y + first.height / 2, { zoom: 1, duration: 350 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        const el = document.getElementById(FIND_ID) as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const name = `schema-${[...new Set(tables.map((t) => t.schema))].join("-")}`;
  const exportAs = async (format: "png" | "svg") => {
    if (!container.current) return;
    setExporting(true);
    try {
      await exportImage(container.current, flow.getNodes(), format, name);
      toast.success(`Exported ${name}.${format}`);
    } catch (err) {
      toast.error("Export failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setExporting(false);
    }
  };
  const exportMermaid = async () => {
    const text = toMermaid(graph);
    const how = await copyText(text, `${name}.mmd`);
    toast.success(how === "copied" ? "Mermaid copied to the clipboard" : `Downloaded ${name}.mmd`, { description: `${graph.nodes.length} entities, ${new Set(graph.edges.map((e) => e.fk.name)).size} relations` });
  };

  const exportItems: DropdownItem[] = [
    { label: "PNG image", onSelect: () => void exportAs("png"), shortcut: "2×" },
    { label: "SVG image", onSelect: () => void exportAs("svg") },
    "separator",
    { label: "Copy as Mermaid", onSelect: () => void exportMermaid(), shortcut: "erDiagram" },
  ];

  return (
    <Panel
      title="Diagram"
      meta={`${graph.nodes.length} tables · ${graph.edges.length} edges${hiddenCount ? ` · ${hiddenCount} hidden` : ""}`}
      flush
      actions={
        <>
          <Button size="sm" kind="ghost" icon={<LayoutGrid size={11} />} onClick={autoLayout} title="Lay the tables out again with dagre and forget dragged positions">
            Auto layout
          </Button>
          <Button size="sm" kind="ghost" icon={<Maximize2 size={11} />} onClick={() => void flow.fitView({ padding: 0.15, duration: 300, maxZoom: 1 })}>
            Fit
          </Button>
          <Dropdown
            trigger={
              <Button size="sm" kind="secondary" icon={<Download size={11} />} loading={exporting}>
                Export
              </Button>
            }
            items={exportItems}
            label="Export the diagram"
          />
        </>
      }
    >
      <div ref={container} className="schema-flow h-[calc(100vh-268px)] min-h-[520px] border-t border-hairline">
        <ReactFlow<TableFlowNode, Edge>
          nodes={renderNodes}
          edges={renderEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeMouseEnter={onNodeEnter}
          onNodeMouseLeave={clearHover}
          onEdgeMouseEnter={onEdgeEnter}
          onEdgeMouseLeave={clearHover}
          onNodeDragStop={persist}
          nodesConnectable={false}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: false }}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => ((n.data as { hot?: boolean }).hot ? theme.primary : theme.raised)} />
          <FlowPanel position="top-left" className="!m-2 w-[240px]">
            <span className="relative inline-flex w-full">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-dim" />
              <Input
                id={FIND_ID}
                mono
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") focusMatch();
                  if (e.key === "Escape") {
                    setQuery("");
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Find table  ⌘F"
                className="bg-surface pl-7"
                aria-label="Find table"
              />
              {q && (
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-dim tnum">
                  {matching.size} {matching.size === 1 ? "match" : "matches"}
                </span>
              )}
            </span>
          </FlowPanel>
          <FlowPanel position="top-right" className="!m-2 hidden items-center gap-3 rounded-lg xl:flex border border-border bg-surface/90 px-2.5 py-1.5 font-mono text-[10px] text-dim">
            <span className="flex items-center gap-1">
              <KeyRound size={10} className="text-warn" /> primary key
            </span>
            <span className="flex items-center gap-1">
              <Link2 size={10} className="text-info" /> foreign key
            </span>
            <span className="flex items-center gap-1">
              <Fingerprint size={10} className="text-violet" /> unique
            </span>
            <span className="flex items-center gap-1">
              <Check size={10} className="text-primary" /> drag to arrange
            </span>
            <Badge tone="muted" className="h-[16px] text-[9.5px]">
              {name}
            </Badge>
          </FlowPanel>
        </ReactFlow>
      </div>
      {!nodes.length && (
        <div className="p-4">
          <Skeleton className="h-3 w-40" />
        </div>
      )}
    </Panel>
  );
}
