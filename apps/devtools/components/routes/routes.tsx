"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, Globe, Play, Search } from "lucide-react";
import { Badge, Method, StatusCode } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Code } from "@gorbital/dash/components/code";
import { Field, Input, Select, Textarea } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Pill, Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Table, type Column } from "@gorbital/dash/components/table";
import { fmtBytes, fmtMs } from "@gorbital/dash/lib/format";
import { readBearerToken } from "@/lib/api/bearer-token";
import { useCapabilities, useDevRoutes } from "@/lib/api/queries";
import { methodsWithBody, pathParams, proxyAddsAuth, sendRequest, type AuthMode, type KeyValue, type RequestSpec, type SentRequest } from "@/lib/api/request-builder";
import { useRouteInfo } from "@/lib/api/routes";
import { filterRoutes, isPublic, joinRoutes, routeKey, routeTags, type JoinedRoute, type RouteSourceFilter } from "@/lib/routes/join";
import { clock } from "@/lib/time";
import { Gate } from "@/components/shared/gate";
import { KeyValueEditor } from "@/components/shared/kv-editor";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { RouteBadges, RouteDetails, RouteInfoStatus } from "./route-details";

export function Routes() {
  const caps = useCapabilities();
  const routes = useDevRoutes(caps.console);
  const info = useRouteInfo(caps.console);
  const [tag, setTag] = useState<string>("all");
  const [source, setSource] = useState<RouteSourceFilter>("all");
  const [publicOnly, setPublicOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const onParam = useCallback((v: string | null) => setSelectedKey(v), []);

  const all = useMemo(() => joinRoutes(routes.data?.routes ?? [], info.data?.routes), [routes.data, info.data]);
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all) for (const t of routeTags(r)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [all]);
  const shown = useMemo(() => filterRoutes(all, { tag, source, search, publicOnly }), [all, tag, source, search, publicOnly]);
  const selected = useMemo(() => all.find((r) => routeKey(r) === selectedKey), [all, selectedKey]);
  const guardsKnown = info.data?.guards_known ?? true;
  const columns = useMemo(() => routeColumns(guardsKnown), [guardsKnown]);

  const select = (r: JoinedRoute) => {
    const k = routeKey(r);
    setSelectedKey(k);
    setQueryParam("route", k);
  };

  const secured = all.filter((r) => r.secured).length;
  const publicCount = all.filter(isPublic).length;
  const infoLoading = caps.console && info.isPending && info.fetchStatus !== "idle";

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="route" onValue={onParam} />
      </Suspense>
      <PageHeader
        product="devtools"
        title="Routes"
        description={routes.data ? `${all.length} routes · ${info.data ? `${publicCount} public · ` : ""}${secured} secured · from /_dev/routes and /_portal/api/routes` : "what the app serves, read from the running process and its source"}
      >
        <Pill caret={false} dot={publicOnly ? "ok" : undefined} active={publicOnly} onClick={() => setPublicOnly((v) => !v)} disabled={!info.data}>
          <Globe size={12} /> Public{info.data ? <span className="font-mono text-[11px] text-dim tnum">{publicCount}</span> : null}
        </Pill>
        <Segmented<RouteSourceFilter>
          options={[
            { value: "all", label: "All" },
            { value: "openapi", label: "OpenAPI" },
            { value: "handler", label: "Handlers" },
          ]}
          value={source}
          onChange={setSource}
        />
      </PageHeader>
      <Page>
        <Gate need="console" loading={<Table<JoinedRoute> columns={columns} rows={[]} rowKey={routeKey} loading />}>
          {routes.error && !routes.data ? (
            <ProblemPanel error={routes.error} scope="dev" console={caps.consoleDeclared} meta="GET /_dev/routes" onRetry={() => void routes.refetch()} retrying={routes.isFetching} />
          ) : (
            <div className="grid grid-cols-[170px_minmax(0,1fr)_420px] gap-3">
              <aside className="flex flex-col gap-1">
                <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Modules</div>
                <ul className="grid gap-0.5 text-[12px]">
                  <TagItem label="all" count={all.length} active={tag === "all"} onClick={() => setTag("all")} />
                  {tags.map(([t, n]) => (
                    <TagItem key={t} label={t} count={n} active={tag === t} onClick={() => setTag(t)} />
                  ))}
                </ul>
              </aside>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="relative">
                  <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="method, path, operation, guard, handler…" className="pl-7" aria-label="Search routes" />
                </div>
                <RouteInfoStatus loading={infoLoading} error={info.error} data={info.data} onRetry={() => void info.refetch()} retrying={info.isFetching} />
                <Panel flush>
                  <Table<JoinedRoute>
                    columns={columns}
                    rows={shown}
                    rowKey={routeKey}
                    selected={selectedKey ?? undefined}
                    onRowClick={select}
                    loading={routes.isPending}
                    dense
                    empty={<Empty title="No routes match" hint={all.length === 0 ? "The app declares no routes." : publicOnly ? "No public route matches: every other route needs a signed-in caller." : "Clear the search or pick another module."} />}
                  />
                </Panel>
              </div>
              <aside className="flex min-w-0 flex-col gap-3">
                {selected ? (
                  <>
                    <RouteDetails route={selected} loading={infoLoading} failed={Boolean(info.error) && !info.data} guardsKnown={guardsKnown} />
                    <RequestBuilder key={routeKey(selected)} route={selected} />
                  </>
                ) : (
                  <Empty title="Pick a route" hint="Select a row to see its guards and source, and to send a request through the portal." />
                )}
              </aside>
            </div>
          )}
        </Gate>
      </Page>
    </>
  );
}

function TagItem({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`flex w-full items-center rounded-md px-2 py-1.5 text-left ${active ? "bg-elevated text-text" : "text-muted hover:bg-elevated/60 hover:text-text"}`}>
        <span className={label === "all" ? "" : "font-mono"}>{label}</span>
        <span className="ml-auto font-mono text-[11px] text-dim tnum">{count}</span>
      </button>
    </li>
  );
}

function routeColumns(guardsKnown: boolean): Column<JoinedRoute>[] {
  return [
    { key: "m", header: "Method", width: "76px", cell: (r) => <Method m={r.method} /> },
    {
      key: "p",
      header: "Path",
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-text">
            {isPublic(r) && <Globe size={11} className="shrink-0 text-ok" aria-label="public" />}
            <span className={`min-w-0 truncate ${r.info?.deprecated ? "line-through decoration-dim" : ""}`}>
              {r.path.split(/(\{[^}]+\})/).map((part, i) =>
                part.startsWith("{") ? (
                  <span key={i} className="text-primary/80">
                    {part}
                  </span>
                ) : (
                  part
                ),
              )}
            </span>
          </div>
          {(r.operation_id || r.summary) && (
            <div className="mt-0.5 truncate text-[11px] text-dim">
              {r.operation_id && <span className="font-mono">{r.operation_id}</span>}
              {r.operation_id && r.summary && " · "}
              {r.summary}
            </div>
          )}
        </div>
      ),
    },
    { key: "t", header: "Access and tags", width: "1%", cell: (r) => <RouteBadges route={r} guardsKnown={guardsKnown} /> },
  ];
}

/* ---------- The request builder ---------- */

let nextSentId = 1;

function RequestBuilder({ route }: { route: JoinedRoute }) {
  const params = pathParams(route.path);
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [query, setQuery] = useState<KeyValue[]>([]);
  const [headers, setHeaders] = useState<KeyValue[]>([]);
  const [body, setBody] = useState("");
  const [auth, setAuth] = useState<AuthMode>("operator");
  const [token, setToken] = useState("");
  const [tokenFrom, setTokenFrom] = useState<string | undefined>();
  // "Act as user" on the Authentication screen leaves a token for this tab; start from it.
  useEffect(() => {
    const stored = readBearerToken();
    if (!stored) return;
    setAuth("bearer");
    setToken(stored.token);
    setTokenFrom(stored.label);
  }, []);
  const [sending, setSending] = useState(false);
  const [current, setCurrent] = useState<SentRequest | undefined>();
  const [history, setHistory] = useState<SentRequest[]>([]);
  const method = route.method.toUpperCase();
  const hasBody = methodsWithBody.has(method);
  const missing = params.filter((p) => !pathValues[p]?.trim());

  const send = async () => {
    const spec: RequestSpec = { method, path: route.path, pathParams: pathValues, query, headers, body: hasBody ? body : "", auth, token };
    const sent: SentRequest = { id: nextSentId++, at: new Date().toISOString(), method, path: route.path.replace(/\{([^}]+)\}/g, (w, n: string) => pathValues[n] || w) };
    setSending(true);
    try {
      sent.response = await sendRequest(spec);
    } catch (err) {
      sent.error = err instanceof Error ? err.message : String(err);
    } finally {
      setSending(false);
    }
    setCurrent(sent);
    setHistory((h) => [sent, ...h].slice(0, 20));
  };

  return (
    <>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <Method m={method} /> <span className="font-mono text-[12.5px] font-normal text-text">{route.path}</span>
          </span>
        }
        meta={route.operation_id}
      >
        <div className="grid gap-3">
          {params.length > 0 && (
            <div className="grid gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Path params</span>
              {params.map((p) => (
                <div key={p} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-1.5">
                  <span className="truncate font-mono text-[12px] text-primary/80">{`{${p}}`}</span>
                  <Input mono value={pathValues[p] ?? ""} onChange={(e) => setPathValues({ ...pathValues, [p]: e.target.value })} placeholder={p} className="h-7" aria-label={`path parameter ${p}`} />
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Query</span>
            <KeyValueEditor rows={query} onChange={setQuery} addLabel="Add parameter" />
          </div>
          <div className="grid gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Headers</span>
            <KeyValueEditor rows={headers} onChange={setHeaders} keyPlaceholder="Header" addLabel="Add header" />
          </div>
          {hasBody && (
            <Field label="Body · JSON" htmlFor="req-body">
              <Textarea id="req-body" mono rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"{\n  \n}"} spellCheck={false} />
            </Field>
          )}
          <Field
            label="Auth"
            htmlFor="req-auth"
            hint={auth === "operator" ? "orb dev adds its token to /ops and /_dev; other routes go as anonymous." : auth === "none" && proxyAddsAuth(route.path) ? "The proxy still adds the dev operator on this path; paste a bearer token to override it." : auth === "bearer" ? "Sent as Authorization: Bearer …; wins over the proxy's token." : "No Authorization header."}
          >
            <Select id="req-auth" value={auth} onChange={(e) => setAuth(e.target.value as AuthMode)}>
              <option value="operator">Dev operator (proxy adds it for /ops, /_dev)</option>
              <option value="bearer">Bearer token (paste)</option>
              <option value="none">None</option>
            </Select>
          </Field>
          {auth === "bearer" && (
            <div className="grid gap-1">
              <Input mono value={token} onChange={(e) => { setToken(e.target.value); setTokenFrom(undefined); }} placeholder="token" aria-label="bearer token" autoComplete="off" />
              {tokenFrom && token && <span className="font-mono text-[10.5px] text-dim">acting as {tokenFrom} · from the Authentication screen</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button kind="primary" size="sm" icon={<Play size={11} />} onClick={() => void send()} loading={sending} disabled={missing.length > 0}>
              Send
            </Button>
            <span className="ml-auto font-mono text-[10.5px] text-dim">{missing.length > 0 ? `fill ${missing.map((m) => `{${m}}`).join(", ")}` : `through /_portal/app${route.path}`}</span>
          </div>
        </div>
      </Panel>
      {current && <ResponsePanel sent={current} />}
      {history.length > 0 && (
        <Panel title="This session" meta={`last ${history.length} of 20`} flush>
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => setCurrent(h)} className={`flex w-full items-center gap-2 border-t border-hairline px-4 py-1.5 text-left font-mono text-[11px] first:border-0 hover:bg-elevated/40 ${current?.id === h.id ? "bg-elevated/60" : ""}`}>
                  <span className="text-faint tnum">{clock(h.at, false)}</span>
                  <span className="w-12 text-dim">{h.method}</span>
                  <span className="min-w-0 flex-1 truncate text-text">{h.path}</span>
                  {h.response ? <StatusCode code={h.response.status} /> : <Badge tone="danger">failed</Badge>}
                  <span className="w-14 text-right text-dim tnum">{h.response ? fmtMs(h.response.durationMs) : "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

function ResponsePanel({ sent }: { sent: SentRequest }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const r = sent.response;
  if (!r) {
    return (
      <Panel title="Response" meta="no answer">
        <p className="font-mono text-[11.5px] text-danger">{sent.error}</p>
      </Panel>
    );
  }
  const copy = () => {
    void navigator.clipboard?.writeText(r.body).then(() => setCopied(true));
  };
  return (
    <Panel
      title="Response"
      meta={`${fmtMs(r.durationMs)} · ${fmtBytes(r.bytes)}`}
      actions={
        <>
          <StatusCode code={r.status} />
          <Button size="sm" kind="ghost" icon={copied ? <Check size={11} /> : <Copy size={11} />} onClick={copy} disabled={!r.body}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {r.headers.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11px]">
            {r.headers.map((h) => (
              <div key={h.key} className="contents">
                <dt className="text-dim">{h.key.toLowerCase()}</dt>
                <dd className="min-w-0 truncate text-muted">
                  {h.key.toLowerCase() === "x-request-id" ? (
                    <Link href={`/requests?id=${encodeURIComponent(h.value)}`} className="text-primary hover:underline">
                      {h.value}
                    </Link>
                  ) : (
                    h.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {r.body ? <Code className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words">{r.body}</Code> : <p className="font-mono text-[11px] text-dim">empty body</p>}
      </div>
    </Panel>
  );
}

export function RoutesSkeleton() {
  return <SkeletonLines lines={8} className="p-4" />;
}
