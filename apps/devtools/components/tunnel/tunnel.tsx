"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleCheck, CircleX, ExternalLink, Globe, KeyRound, Play, RefreshCw, RotateCw, ShieldAlert, Square, Wrench } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Checkbox, Field, Input } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { CopyButton } from "@/components/auth/common";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { isNoEnvEditor, useEnv, useSetEnv } from "@/lib/api/env";
import { isNoTunnel, useCheckTunnel, useRestartTunnel, useSaveTunnelHostname, useStartTunnel, useStopTunnel, useTunnel, useTunnelSetup, type TunnelInfo, type TunnelMode, type TunnelSetup, type TunnelStatus } from "@/lib/api/tunnel";
import { OS_NAMES, defaultTicked, envChangeFor, groupCallbacks, installStepsFor, normalizeHostname, shownValue, startBlocker, stateLabel, stateTone } from "@/lib/tunnel/tunnel";

/** The Tunnel screen (ADR-0086): the app on a public HTTPS address through the developer's cloudflared, the .env it needs and the addresses to register with providers. */
export function TunnelPage() {
  const tunnel = useTunnel();
  const info = tunnel.data;
  return (
    <Page>
      <PageHeader product="devtools" title="Tunnel" description="the app on a public HTTPS address with your cloudflared: webhooks, phones, and sign-in and passkeys on a real domain · /_portal/api/tunnel">
        <Link href="/environment">
          <Button size="sm" kind="secondary" icon={<ArrowRight size={11} />}>
            Environment
          </Button>
        </Link>
      </PageHeader>
      <Exposure status={info?.status} />
      {tunnel.error && !info ? (
        isNoTunnel(tunnel.error) ? (
          <Empty title="This orb dev runs no tunnels" hint="GET /_portal/api/tunnel answered 404: an orb from before the Tunnel screen. Rebuild orb from the current gorbital and start orb dev again." />
        ) : (
          <ProblemPanel error={tunnel.error} scope="portal" meta="GET /_portal/api/tunnel" onRetry={() => void tunnel.refetch()} retrying={tunnel.isFetching} />
        )
      ) : !info ? (
        <SkeletonLines lines={10} className="p-4" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {!info.cloudflared.found && (
            <div className="xl:col-span-2">
              <InstallHelp info={info} />
            </div>
          )}
          {!info.allowed && (
            <div className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-[12px] text-text xl:col-span-2">
              APP_ENV is <span className="font-mono">{info.app_env}</span>: orb dev starts tunnels only for development, because a tunnel puts the app on the internet.
            </div>
          )}
          <Controls info={info} />
          <StatusPanel status={info.status} />
          {(info.status.state === "connected" || (info.status.state === "starting" && info.status.public_url)) && <Setup status={info.status} />}
        </div>
      )}
    </Page>
  );
}

/** What is on the internet while a tunnel runs, always said. */
function Exposure({ status }: { status: TunnelStatus | undefined }) {
  const live = status && status.state !== "off" && status.state !== "failed";
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[12px] ${live ? "border-warn/30 bg-warn/8" : "border-hairline bg-bg/40"}`}>
      <ShieldAlert size={14} className={`mt-0.5 shrink-0 ${live ? "text-warn" : "text-dim"}`} />
      <div className="text-muted">
        <span className="text-text">{live ? "The app is on the internet while this tunnel runs." : "Only the app goes through a tunnel."}</span> Anyone with the URL reaches its sign-in, public routes and whatever a signed-in account can do. The dev console (<span className="font-mono">/_dev</span>), the dev operator on <span className="font-mono">/ops</span> and this portal refuse requests that come through it. Stop the tunnel when you&apos;re done.
      </div>
    </div>
  );
}

function InstallHelp({ info }: { info: TunnelInfo }) {
  const { mine, other } = installStepsFor(info.os, info.install);
  const [showOther, setShowOther] = useState(false);
  const steps = showOther ? [...mine, ...other] : mine;
  return (
    <Panel title={<span className="flex items-center gap-2"><Wrench size={13} className="text-primary" /> Install cloudflared</span>} meta={info.cloudflared.problem}>
      <div className="grid gap-3">
        <div className="text-[12px] text-muted">
          orb runs your own <span className="font-mono">cloudflared</span> and never downloads it. Install it for {OS_NAMES[info.os] ?? info.os}, then reload this page (or set <span className="font-mono">ORB_CLOUDFLARED</span> to its path).
        </div>
        <ul className="grid gap-2">
          {steps.map((s) => (
            <li key={s.os + s.label} className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-bg/40 px-3 py-2">
              <span className="min-w-[180px] text-[12px] text-text">{s.label}</span>
              {s.command && (
                <>
                  <code className="font-mono text-[12px] text-primary">{s.command}</code>
                  <span className="ml-auto">
                    <CopyButton text={s.command} />
                  </span>
                </>
              )}
              {s.url && (
                <a className="ml-auto inline-flex items-center gap-1 text-[12px] text-info hover:underline" href={s.url} target="_blank" rel="noreferrer">
                  {new URL(s.url).host} <ExternalLink size={11} />
                </a>
              )}
            </li>
          ))}
        </ul>
        {other.length > 0 && (
          <div>
            <Button size="sm" kind="ghost" onClick={() => setShowOther((v) => !v)}>
              {showOther ? "Only this machine" : "Other platforms"}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Mode, hostname, token, and start/stop. */
function Controls({ info }: { info: TunnelInfo }) {
  const s = info.status;
  const running = s.state !== "off" && s.state !== "failed";
  const [mode, setMode] = useState<TunnelMode>(s.mode ?? (info.hostname && info.token_source ? "named" : "quick"));
  const [hostname, setHostname] = useState(info.hostname ?? "");
  useEffect(() => {
    if (running && s.mode) setMode(s.mode);
  }, [running, s.mode]);
  useEffect(() => {
    if (info.hostname) setHostname((h) => h || info.hostname!);
  }, [info.hostname]);
  const start = useStartTunnel();
  const stop = useStopTunnel();
  const restart = useRestartTunnel();
  const save = useSaveTunnelHostname();
  const fromEnv = info.hostname_source === "ORB_TUNNEL_HOSTNAME";
  const typed = normalizeHostname(hostname);
  const blocker = startBlocker(info, mode, hostname);

  return (
    <Panel title={<span className="flex items-center gap-2"><Globe size={13} className="text-primary" /> Tunnel</span>} meta={info.cloudflared.found ? (info.cloudflared.version ?? info.cloudflared.path) : "cloudflared not found"}>
      <div className="grid gap-4">
        <Segmented<TunnelMode>
          value={mode}
          onChange={(m) => !running && setMode(m)}
          options={[
            { value: "quick", label: "Quick" },
            { value: "named", label: "Named" },
          ]}
        />
        {mode === "quick" ? (
          <div className="grid gap-1.5 text-[12px] text-muted">
            <div>
              A random <span className="font-mono">*.trycloudflare.com</span> URL, no Cloudflare account. Good for receiving webhooks and trying the API from a phone.
            </div>
            <div className="flex items-start gap-1.5 text-warn">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> The URL changes on every start: not for Google, Apple or GitHub callbacks, or passkeys.
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="text-[12px] text-muted">
              Your tunnel from the Cloudflare dashboard (Zero Trust → Networks → Tunnels), with a public hostname whose service is <span className="font-mono text-text">{info.target ?? "the app's address"}</span>. The URL stays the same: register it with sign-in providers once.
            </div>
            <Field label="Public hostname" htmlFor="tunnel-hostname" error={hostname && typed.error ? typed.error : undefined} hint={fromEnv ? "from ORB_TUNNEL_HOSTNAME in .env or the environment" : info.hostname_source === "settings" ? "saved in .orb/portal/tunnel.json" : "saved in .orb/portal/tunnel.json when the tunnel starts"}>
              <div className="flex gap-2">
                <Input id="tunnel-hostname" mono value={hostname} disabled={fromEnv || running} onChange={(e) => setHostname(e.target.value)} placeholder="dev-api.example.com" />
                {!fromEnv && (
                  <Button size="sm" kind="secondary" disabled={!typed.hostname || running || typed.hostname === info.hostname} loading={save.isPending} onClick={() => typed.hostname && save.mutate(typed.hostname)}>
                    Save
                  </Button>
                )}
              </div>
            </Field>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <KeyRound size={12} className="text-dim" />
              {info.token_source && !info.token_problem ? (
                <>
                  <Badge tone="ok">{info.token_source}</Badge>
                  <span className="text-muted">is set; the portal never shows it, and cloudflared gets it in its environment only.</span>
                </>
              ) : info.token_problem ? (
                <>
                  <Badge tone="danger">{info.token_source}</Badge>
                  <span className="text-danger">{info.token_problem}</span>
                </>
              ) : (
                <>
                  <Badge tone="warn">CLOUDFLARE_TUNNEL_TOKEN</Badge>
                  <span className="text-muted">
                    isn&apos;t set. Add it in <Link href="/environment" className="text-info hover:underline">Environment</Link> (a secret): the value after <span className="font-mono">--token</span> in the tunnel&apos;s install command.
                  </span>
                </>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          {running ? (
            <>
              <Button size="sm" kind="secondary" icon={<Square size={11} />} loading={stop.isPending} disabled={s.state === "stopping"} onClick={() => stop.mutate()}>
                Stop
              </Button>
              <Button size="sm" kind="ghost" icon={<RotateCw size={11} />} loading={restart.isPending} disabled={s.state !== "connected"} onClick={() => restart.mutate()}>
                Restart
              </Button>
            </>
          ) : (
            <Button size="sm" kind="primary" icon={<Play size={11} />} loading={start.isPending} disabled={blocker !== null} onClick={() => start.mutate({ mode, hostname: mode === "named" && !fromEnv ? (typed.hostname ?? "") : undefined })}>
              Start {mode} tunnel
            </Button>
          )}
          {!running && blocker && <span className="text-[11.5px] text-dim">{blocker}</span>}
          <span className="ml-auto text-[11px] text-dim">
            or <span className="font-mono">orb dev --tunnel {mode}</span>
          </span>
        </div>
      </div>
    </Panel>
  );
}

function StatusPanel({ status: s }: { status: TunnelStatus }) {
  const check = useCheckTunnel();
  const [showLog, setShowLog] = useState(false);
  const log = s.log ?? [];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Dot tone={stateTone(s.state)} pulse={s.state === "starting" || s.state === "connected"} /> {stateLabel(s)}
        </span>
      }
      meta={s.pid ? `cloudflared pid ${s.pid}` : undefined}
      actions={
        s.state === "connected" ? (
          <Button size="sm" kind="secondary" icon={<RefreshCw size={11} />} loading={check.isPending} onClick={() => check.mutate()}>
            Check now
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3 text-[12px]">
        {s.public_url ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-bg/40 px-3 py-2">
            <a href={s.public_url} target="_blank" rel="noreferrer" className="break-all font-mono text-[13px] text-primary hover:underline">
              {s.public_url}
            </a>
            <Badge tone={s.stable ? "ok" : "warn"}>{s.stable ? "stable" : "changes every run"}</Badge>
            <span className="ml-auto flex gap-1">
              <CopyButton text={s.public_url} />
            </span>
          </div>
        ) : (
          <div className="text-dim">{s.state === "off" ? "No tunnel is running." : s.state === "failed" ? "The tunnel stopped." : "Waiting for cloudflared…"}</div>
        )}
        {s.target && (
          <div className="text-muted">
            forwards to <span className="font-mono text-text">{s.target}</span>
            {s.restarts > 0 && <span className="text-dim"> · restarted {s.restarts}×</span>}
          </div>
        )}
        {s.problem && <div className="rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-text">{s.problem}</div>}
        {s.check && (
          <div className={`flex items-start gap-2 ${s.check.ok ? "text-ok" : "text-warn"}`}>
            {s.check.ok ? <CircleCheck size={13} className="mt-0.5 shrink-0" /> : <CircleX size={13} className="mt-0.5 shrink-0" />}
            <span>
              <span className="font-mono">GET {s.check.url}</span>
              {s.check.status ? ` · ${s.check.status}` : ""} · {Math.round(s.check.latency_ms)} ms
              <span className="block text-muted">{s.check.detail}</span>
            </span>
          </div>
        )}
        {log.length > 0 && (
          <div>
            <Button size="sm" kind="ghost" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Hide" : "Show"} cloudflared output ({log.length})
            </Button>
            {showLog && (
              <pre className="mt-2 max-h-[240px] overflow-auto rounded-md border border-hairline bg-bg/60 p-2 font-mono text-[11px] leading-relaxed text-muted">
                {log.map((l, i) => (
                  <div key={i} className={l.level === "ERR" || l.level === "FTL" ? "text-danger" : l.level === "WRN" ? "text-warn" : undefined}>
                    {l.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** The .env proposal (plan → diff → apply through the env editor) and the provider addresses. */
function Setup({ status }: { status: TunnelStatus }) {
  const setup = useTunnelSetup(status.public_url, true);
  if (setup.error && !setup.data) return <ProblemPanel error={setup.error} scope="portal" meta="GET /_portal/api/tunnel/setup" onRetry={() => void setup.refetch()} retrying={setup.isFetching} />;
  if (!setup.data) return <SkeletonLines lines={6} className="p-4" />;
  return (
    <>
      <EnvProposal setup={setup.data} />
      <Callbacks setup={setup.data} />
    </>
  );
}

function EnvProposal({ setup }: { setup: TunnelSetup }) {
  const changes = useMemo(() => setup.changes ?? [], [setup.changes]);
  const [ticked, setTicked] = useState(() => defaultTicked(changes));
  useEffect(() => setTicked(defaultTicked(changes)), [changes]);
  const env = useEnv();
  const apply = useSetEnv();
  const qc = useQueryClient();
  const noEditor = isNoEnvEditor(env.error);
  const body = envChangeFor(changes, ticked);
  const count = Object.keys(body.set).length;
  // The page's banner already says what the tunnel exposes.
  const warnings = (setup.warnings ?? []).filter((w) => !/is on the internet/.test(w));

  return (
    <Panel title=".env for this address" meta="plan → diff → apply · PUT /_portal/api/env" className="xl:col-span-2">
      <div className="grid gap-3">
        {warnings.map((w) => (
          <div key={w} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[12px] ${/changes every time/.test(w) ? "border-warn/30 bg-warn/8 text-text" : "border-hairline bg-bg/40 text-muted"}`}>
            <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${/changes every time/.test(w) ? "text-warn" : "text-dim"}`} /> {w}
          </div>
        ))}
        {changes.length === 0 ? (
          <div className="text-[12px] text-ok">.env already matches {setup.public_url}.</div>
        ) : (
          <div className="grid gap-2">
            {changes.map((c) => (
              <label key={c.key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border border-hairline px-3 py-2">
                <Checkbox
                  checked={ticked.has(c.key)}
                  onCheckedChange={(v) =>
                    setTicked((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(c.key);
                      else next.delete(c.key);
                      return next;
                    })
                  }
                  aria-label={`Apply ${c.key}`}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-text">{c.key}</span>
                    {c.optional && <Badge tone="muted">optional</Badge>}
                  </div>
                  <div className="mt-1 grid gap-0.5 font-mono text-[11.5px]">
                    <div className="break-all text-danger">− {shownValue(c.current)}</div>
                    <div className="break-all text-ok">+ {c.proposed}</div>
                  </div>
                  <div className="mt-1 text-[11.5px] text-muted">{c.reason}</div>
                </div>
              </label>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="sm" kind="primary" disabled={count === 0 || noEditor} loading={apply.isPending} onClick={() => apply.mutate(body, { onSuccess: () => void qc.invalidateQueries({ queryKey: ["portal", "tunnel", "setup"] }) })}>
                Apply {count} {count === 1 ? "change" : "changes"} to .env
              </Button>
              <span className="text-[11.5px] text-dim">{noEditor ? "This orb dev has no env editor: copy the values into .env." : "orb dev rebuilds and restarts the app when .env changes."}</span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Callbacks({ setup }: { setup: TunnelSetup }) {
  const groups = groupCallbacks(setup.callbacks ?? []);
  return (
    <Panel title="Register with providers" meta={setup.hostname} className="xl:col-span-2">
      <div className="grid gap-3">
        {!setup.stable && <div className="text-[12px] text-warn">These addresses change with the next quick tunnel. Register them only to try something once; use a named tunnel for anything you keep.</div>}
        {!setup.routes_known && <div className="text-[11.5px] text-dim">The app isn&apos;t serving its OpenAPI document, so these are gorbital&apos;s default paths rather than the app&apos;s routes.</div>}
        {groups.length === 0 ? (
          <div className="text-[12px] text-dim">The app serves no sign-in callbacks or provider webhooks.</div>
        ) : (
          groups.map((g) => (
            <div key={g.id} className="grid gap-1.5">
              <div className="flex items-center gap-2 text-[12px] font-medium text-text">
                {g.name}
                <Badge tone={g.configured ? "ok" : "muted"}>{g.configured ? "configured" : "not configured"}</Badge>
              </div>
              {g.items.map((c) => (
                <div key={c.path} className="grid gap-1 rounded-md border border-hairline bg-bg/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11.5px] text-muted">{c.label}</span>
                    <code className="break-all font-mono text-[12px] text-text">{c.url}</code>
                    <span className="ml-auto">
                      <CopyButton text={c.url} />
                    </span>
                  </div>
                  <div className="text-[11px] text-dim">{c.where}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
