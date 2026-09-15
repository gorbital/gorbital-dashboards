import { AlertOctagon, AlertTriangle, Lightbulb, ExternalLink } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Segmented } from "@gorbital/dash/components/pill";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Panel } from "@gorbital/dash/components/panel";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { findings } from "@/lib/mock";

const meta = {
  error: { tone: "danger", Icon: AlertOctagon, label: "error" },
  warning: { tone: "warn", Icon: AlertTriangle, label: "warning" },
  hint: { tone: "muted", Icon: Lightbulb, label: "hint" },
} as const;

export default function Audit() {
  const n = (l: string) => findings.filter((f) => f.level === l).length;
  return (
    <>
      <PageHeader product="devtools" title="Audit" searchHint="Jump to route, module, setting">
        <Badge tone="muted">orb audit · 41 rules · 0.8 s</Badge>
        <Segmented options={[{ value: "all", label: "All" }, { value: "errors", label: "Errors" }, { value: "warnings", label: "Warnings" }, { value: "hints", label: "Hints" }]} value="all" />
      </PageHeader>
      <Page>
        <TileGrid>
          <Tile label="Errors" value={String(n("error"))} delta="block orb release" deltaTone="bad" hero />
          <Tile label="Warnings" value={String(n("warning"))} delta="−1 since yesterday" />
          <Tile label="Hints" value={String(n("hint"))} deltaTone="flat" delta="style and docs" />
          <Tile label="Rules passed" value="34" unit="of 41" delta="83%" deltaTone="flat" />
        </TileGrid>
        <Panel title="Findings" meta="what a careful reviewer would flag" flush>
          <ul className="stagger">
            {findings.map((f, i) => {
              const m = meta[f.level];
              return (
                <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 border-t border-hairline px-4 py-3.5 first:border-0 hover:bg-elevated/40">
                  <m.Icon size={16} className={`mt-0.5 ${f.level === "error" ? "text-danger" : f.level === "warning" ? "text-warn" : "text-dim"}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-text">{f.title}</span>
                      <Badge tone={m.tone}>{f.rule}</Badge>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-dim">{f.where}</div>
                    <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-muted">{f.detail}</p>
                  </div>
                  <div className="flex items-start gap-1">
                    <Button size="sm" kind="ghost" icon={<ExternalLink size={11} />}>
                      Open
                    </Button>
                    <Button size="sm" kind="ghost">
                      Suppress
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </Page>
    </>
  );
}
