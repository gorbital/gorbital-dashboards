"use client";

import { useEffect, useState } from "react";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Gauge } from "@gorbital/dash/components/gauge";
import { Empty, KeyList, Panel } from "@gorbital/dash/components/panel";
import { Bar } from "@gorbital/dash/components/progress";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tile, TileGrid } from "@gorbital/dash/components/tile";
import { Sparkline } from "@gorbital/dash/charts/sparkline";
import { theme, toneColor } from "@gorbital/dash/theme";
import { ApiError } from "@/lib/api/client";
import { useHostSample, type ProcInfo } from "@/lib/api/observability";
import { useCapabilities, useSystem } from "@/lib/api/queries";
import { bytes, count, percentOf100, seconds } from "@/lib/observability/format";
import { gradeTone, loadGrade, usageGrade } from "@/lib/observability/grade";
import { addSample, emptySeries, sparkData, type SampleSeries } from "@/lib/observability/samples";
import { ago, when } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { ProblemPanel } from "@/components/shared/problem-panel";

/** Item 67: the host's CPU, load, memory and disk, the app and orb processes (every 2 s while this tab is open), and the Go runtime from /ops/system; 60 samples kept client-side. */
export function SystemTab() {
  const caps = useCapabilities();
  const sample = useHostSample(true);
  const system = useSystem(caps.ops, 2000);
  const [series, setSeries] = useState<SampleSeries>(emptySeries);
  const now = useNow();
  const h = sample.data;
  const rt = system.data?.runtime;

  useEffect(() => {
    if (!h) return;
    setSeries((s) => addSample(s, { at: h.sampled_at, cpu: h.host.cpu_percent, app_cpu: h.app?.cpu_percent, memory: h.memory.percent, app_rss: h.app?.rss, goroutines: rt?.goroutines, heap: rt?.heap_in_use_bytes }));
  }, [h, rt]);

  const noSampler = sample.error instanceof ApiError && sample.error.code === "no_system_sampler";
  if (sample.error && !h) {
    if (noSampler) return <Empty title="This orb doesn't sample the system" hint="orb dev from this phase samples the machine every 2 seconds with gopsutil; update orb (go install ./cli/orb) and restart it." />;
    return <ProblemPanel error={sample.error} scope="portal" meta="GET /_portal/api/system" onRetry={() => void sample.refetch()} retrying={sample.isFetching} />;
  }

  const cpuGrade = h ? usageGrade(h.host.cpu_percent) : "good";
  const memGrade = h ? usageGrade(h.memory.percent) : "good";
  const diskGrade = h?.disk ? usageGrade(h.disk.percent) : "good";

  return (
    <div className="flex flex-col gap-3">
      <TileGrid cols={5}>
        <Tile label="CPU" value={h ? percentOf100(h.host.cpu_percent) : "—"} hero loading={sample.isPending} icon={<Cpu size={12} />} spark={sparkData(series.cpu)} sparkColor={toneColor[gradeTone[cpuGrade]]} footer={h ? `${h.host.cores} cores · ${h.host.os}/${h.host.arch}` : undefined} />
        <Tile label="Load" value={h ? h.host.load1.toFixed(2) : "—"} unit={h ? `${h.host.load5.toFixed(2)} · ${h.host.load15.toFixed(2)}` : undefined} loading={sample.isPending} deltaTone={h ? (loadGrade(h.host.load1, h.host.cores) === "poor" ? "bad" : loadGrade(h.host.load1, h.host.cores) === "ok" ? "flat" : "good") : "flat"} footer="1 · 5 · 15 min averages" />
        <Tile label="Memory" value={h ? percentOf100(h.memory.percent) : "—"} loading={sample.isPending} icon={<MemoryStick size={12} />} spark={sparkData(series.memory)} sparkColor={toneColor[gradeTone[memGrade]]} footer={h ? `${bytes(h.memory.used)} of ${bytes(h.memory.total)} · ${bytes(h.memory.available)} available` : undefined} />
        <Tile label="Disk" value={h?.disk ? percentOf100(h.disk.percent) : "—"} loading={sample.isPending} icon={<HardDrive size={12} />} deltaTone={diskGrade === "poor" ? "bad" : "flat"} footer={h?.disk ? `${bytes(h.disk.free)} free of ${bytes(h.disk.total)}` : "no volume information"} />
        <Tile label="Goroutines" value={rt ? count(rt.goroutines) : "—"} loading={caps.ops && system.isPending} spark={rt ? sparkData(series.goroutines) : undefined} sparkColor={theme.info} footer={rt ? `${bytes(rt.heap_in_use_bytes)} heap · ${count(rt.gcs)} GCs` : caps.ops ? "/ops/system" : "no ops API"} />
      </TileGrid>
      <div className="grid grid-cols-3 gap-3">
        <Panel title="Host" meta={h ? h.host.hostname : undefined}>
          {!h ? (
            <SkeletonLines lines={6} />
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-around gap-2">
                <Gauge value={h.host.cpu_percent} label={percentOf100(h.host.cpu_percent)} caption="cpu" color={toneColor[gradeTone[cpuGrade]]} size={104} />
                <Gauge value={h.memory.percent} label={percentOf100(h.memory.percent)} caption="memory" color={toneColor[gradeTone[memGrade]]} size={104} />
                {h.disk && <Gauge value={h.disk.percent} label={percentOf100(h.disk.percent)} caption="disk" color={toneColor[gradeTone[diskGrade]]} size={104} />}
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between font-mono text-[10.5px] text-dim">
                  <span>memory</span>
                  <span className="tnum">
                    {bytes(h.memory.used)} used · {bytes(h.memory.available)} available
                  </span>
                </div>
                <Bar value={h.memory.percent} max={100} color={toneColor[gradeTone[memGrade]]} height={4} />
                {h.disk && (
                  <>
                    <div className="flex items-center justify-between font-mono text-[10.5px] text-dim">
                      <span className="truncate" title={h.disk.path}>
                        disk · {h.disk.path}
                      </span>
                      <span className="tnum">
                        {bytes(h.disk.used)} of {bytes(h.disk.total)}
                      </span>
                    </div>
                    <Bar value={h.disk.percent} max={100} color={toneColor[gradeTone[diskGrade]]} height={4} />
                  </>
                )}
              </div>
              <KeyList
                rows={[
                  { k: "Load", v: `${h.host.load1.toFixed(2)} · ${h.host.load5.toFixed(2)} · ${h.host.load15.toFixed(2)} on ${h.host.cores} cores` },
                  { k: "Uptime", v: h.host.uptime_seconds > 0 ? seconds(h.host.uptime_seconds) : "—" },
                  { k: "Sampled", v: `${ago(h.sampled_at, now)} · every 2 s` },
                ]}
              />
            </div>
          )}
        </Panel>
        <Panel title="Processes" meta="the app and orb dev, from outside">
          {!h ? (
            <SkeletonLines lines={6} />
          ) : (
            <div className="grid gap-3">
              {h.app ? <ProcCard title="app" proc={h.app} cpu={series.app_cpu} rss={series.app_rss} now={now} /> : <Empty title="App not running" hint="The app's process appears while orb dev runs it." />}
              <ProcCard title="orb dev" proc={h.orb} now={now} />
            </div>
          )}
        </Panel>
        <Panel title="Go runtime" meta="/ops/system · inside the app">
          {!caps.running ? (
            <Empty title="App not running" hint="The runtime figures come from the app itself." />
          ) : !caps.ops ? (
            <Empty title="No ops API" hint="The Minimal preset has no /ops/system." />
          ) : system.error && !system.data ? (
            <ProblemPanel error={system.error} scope="ops" console={caps.consoleDeclared} meta="GET /ops/system" onRetry={() => void system.refetch()} retrying={system.isFetching} />
          ) : !rt ? (
            <SkeletonLines lines={6} />
          ) : (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <SparkStat label="goroutines" value={count(rt.goroutines)} data={series.goroutines} color={theme.info} />
                <SparkStat label="heap in use" value={bytes(rt.heap_in_use_bytes)} data={series.heap} color={theme.violet} />
              </div>
              <KeyList
                rows={[
                  { k: "Go", v: rt.go_version },
                  { k: "GOMAXPROCS", v: String(rt.gomaxprocs) },
                  { k: "GC runs", v: count(rt.gcs) },
                  { k: "Last GC pause", v: `${rt.last_gc_pause_ms.toFixed(3)} ms` },
                  { k: "Workers", v: system.data ? `${system.data.jobs.workers} on ${(system.data.jobs.queues ?? []).join(", ") || "no queues"}` : "—" },
                  { k: "Instance", v: system.data ? `${system.data.instance.version}${system.data.instance.modified ? " (modified)" : ""} · up ${seconds(system.data.instance.uptime_seconds)}` : "—" },
                ]}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function ProcCard({ title, proc, cpu, rss, now }: { title: string; proc: ProcInfo; cpu?: number[]; rss?: number[]; now: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-bg/40 p-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-text">{title}</span>
        <Badge tone="muted">pid {proc.pid}</Badge>
        <span className="ml-auto font-mono text-[11px] text-dim">{proc.started_at ? `started ${ago(proc.started_at, now)}` : ""}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <SparkStat label="cpu" value={percentOf100(proc.cpu_percent)} data={cpu} color={theme.primary} />
        <SparkStat label="rss" value={bytes(proc.rss)} data={rss} color={theme.violet} />
      </div>
      <KeyList
        rows={[
          { k: "Threads", v: String(proc.threads) },
          { k: "Open files", v: proc.open_files >= 0 ? String(proc.open_files) : "—" },
          { k: "Started", v: proc.started_at ? when(proc.started_at) : "—" },
        ]}
      />
    </div>
  );
}

function SparkStat({ label, value, data, color }: { label: string; value: string; data?: number[]; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-hairline bg-surface px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-1 text-[15px] font-semibold leading-none tnum">{value}</div>
      {data && data.length > 0 && (
        <div className="pointer-events-none absolute bottom-0 right-0 opacity-80">
          <Sparkline data={sparkData(data)} width={110} height={30} color={color} />
        </div>
      )}
    </div>
  );
}
