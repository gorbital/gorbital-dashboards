import { Play, Lock, ShieldCheck, Gauge as GaugeIcon } from "lucide-react";
import { Page, PageHeader } from "@apistock/dash/components/page";
import { Pill, Segmented } from "@apistock/dash/components/pill";
import { Panel } from "@apistock/dash/components/panel";
import { Badge, Method, StatusCode } from "@apistock/dash/components/badge";
import { Button } from "@apistock/dash/components/button";
import { Code, Key, Str, Num, Cmt } from "@apistock/dash/components/code";
import { routes, moduleCounts } from "@/lib/mock";

const sel = routes.find((x) => x.id === "r19")!;

export default function Routes() {
  const modules = Object.keys(moduleCounts);
  return (
    <>
      <PageHeader product="devtools" title="Routes" searchHint="Jump to route, module, setting">
        <Badge tone="muted">openapi.json · {routes.length} operations</Badge>
        <Segmented options={[{ value: "all", label: "All" }, { value: "public", label: "Public" }, { value: "ops", label: "/ops" }]} value="all" />
      </PageHeader>
      <div className="grid flex-1 grid-cols-[200px_minmax(0,1fr)_420px]">
        <aside className="border-r border-hairline p-4">
          <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Modules</div>
          <ul className="grid gap-0.5 text-[12px]">
            <li className="flex items-center rounded-md bg-elevated px-2 py-1.5 text-text">
              all <span className="ml-auto font-mono text-[11px] text-dim tnum">{routes.length}</span>
            </li>
            {modules.map((m) => (
              <li key={m} className="flex items-center rounded-md px-2 py-1.5 text-muted hover:bg-elevated/60 hover:text-text">
                <span className="font-mono">{m}</span>
                <span className="ml-auto font-mono text-[11px] text-dim tnum">{moduleCounts[m]}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">Middleware</div>
          <ul className="grid gap-1 px-2 text-[11px] text-muted">
            <li className="flex items-center gap-2"><Lock size={11} className="text-dim" /> session · 24</li>
            <li className="flex items-center gap-2"><ShieldCheck size={11} className="text-dim" /> 2fa · 8</li>
            <li className="flex items-center gap-2"><GaugeIcon size={11} className="text-dim" /> ratelimit · 3</li>
          </ul>
        </aside>

        <div className="min-w-0 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 bg-bg">
              <tr className="border-b border-hairline text-left font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
                <th className="w-[76px] px-4 py-2 font-medium">Method</th>
                <th className="px-2 py-2 font-medium">Path</th>
                <th className="px-2 py-2 font-medium">Handler</th>
                <th className="px-2 py-2 font-medium">Guards</th>
                <th className="w-[70px] px-4 py-2 text-right font-medium">p95</th>
              </tr>
            </thead>
            <tbody className="stagger">
              {routes.map((x) => (
                <tr key={x.id} className={`border-b border-hairline transition-colors hover:bg-elevated/50 ${x.id === sel.id ? "bg-elevated/70" : ""}`}>
                  <td className="px-4 py-2">
                    <Method m={x.method} />
                  </td>
                  <td className="px-2 py-2 font-mono text-text">
                    {x.path.split(/(\{[^}]+\})/).map((part, i) => (part.startsWith("{") ? <span key={i} className="text-primary/80">{part}</span> : part))}
                  </td>
                  <td className="px-2 py-2 font-mono text-dim">{x.handler}</td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-1">
                      {x.mw.length === 0 ? <Badge tone="muted">public</Badge> : x.mw.map((g) => <Badge key={g} tone={g === "2fa" ? "warn" : g.startsWith("role") || g.startsWith("platform") ? "info" : "muted"}>{g}</Badge>)}
                    </span>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono tnum ${(x.p95 ?? 0) > 200 ? "text-warn" : "text-dim"}`}>{x.p95} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="flex flex-col gap-3 border-l border-hairline p-4">
          <div className="flex items-center gap-2">
            <Method m={sel.method} />
            <span className="font-mono text-[13px] text-text">{sel.path}</span>
          </div>
          <div className="font-mono text-[11px] text-dim">
            {sel.handler} · <span className="text-muted">{sel.op}</span>
          </div>
          <Panel title="Request" meta="uses your signed-in session">
            <div className="grid gap-2 text-[12px]">
              <label className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Path params</span>
                <div className="flex items-center gap-2 rounded-md border border-border bg-code-bg px-2.5 py-1.5 font-mono">
                  <span className="text-primary/80">org</span>
                  <span className="text-text">acme</span>
                </div>
              </label>
              <label className="grid gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-dim">Query</span>
                <div className="flex items-center gap-2 rounded-md border border-border bg-code-bg px-2.5 py-1.5 font-mono">
                  <span className="text-primary/80">limit</span>
                  <span className="text-text">20</span>
                  <span className="ml-3 text-primary/80">cursor</span>
                  <span className="text-dim">—</span>
                </div>
              </label>
              <div className="flex items-center gap-2 pt-1">
                <Button kind="primary" size="sm" icon={<Play size={11} />}>
                  Send
                </Button>
                <Badge tone="muted">cookie: aps_session</Badge>
                <span className="ml-auto font-mono text-[11px] text-dim">as usr_3f9a1c</span>
              </div>
            </div>
          </Panel>
          <Panel title="Response" meta="38 ms · 3 SQL" actions={<StatusCode code={200} />} className="flex-1">
            <Code className="max-h-[300px]">
              {"{\n  "}<Key>&quot;projects&quot;</Key>{": [\n    {\n      "}<Key>&quot;id&quot;</Key>{": "}<Str>&quot;prj_4f2a1c&quot;</Str>{",\n      "}<Key>&quot;name&quot;</Key>{": "}<Str>&quot;Billing v2&quot;</Str>{",\n      "}<Key>&quot;archived_at&quot;</Key>{": "}<Num>null</Num>{",\n      "}<Key>&quot;created_at&quot;</Key>{": "}<Str>&quot;2026-09-14T09:12:41Z&quot;</Str>{"\n    },\n    {\n      "}<Key>&quot;id&quot;</Key>{": "}<Str>&quot;prj_9b0e77&quot;</Str>{",\n      "}<Key>&quot;name&quot;</Key>{": "}<Str>&quot;Onboarding&quot;</Str>{",\n      "}<Key>&quot;archived_at&quot;</Key>{": "}<Num>null</Num>{",\n      "}<Key>&quot;created_at&quot;</Key>{": "}<Str>&quot;2026-09-11T16:03:08Z&quot;</Str>{"\n    }\n  ],\n  "}<Key>&quot;next_cursor&quot;</Key>{": "}<Str>&quot;eyJpZCI6InByal85YjBlNzcifQ&quot;</Str>{"\n}"}
              {"\n\n"}<Cmt>x-request-id: req_71c0aa2d3e</Cmt>
            </Code>
            <ul className="mt-3 grid gap-1 font-mono text-[11px]">
              {[
                ["auth.session.load", "1.8 ms", "sql"],
                ["orgs.membership.check", "1.4 ms", "sql"],
                ["projects.list", "31.2 ms", "sql ×2"],
              ].map(([n, ms, k]) => (
                <li key={n} className="flex items-center gap-2 text-muted">
                  <i className="h-1.5 w-1.5 rounded-sm bg-info" />
                  {n}
                  <span className="ml-auto text-dim">{k}</span>
                  <span className="w-14 text-right text-dim tnum">{ms}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}
