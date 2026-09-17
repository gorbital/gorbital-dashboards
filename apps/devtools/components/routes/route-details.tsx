"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Globe, KeyRound, Lock, RotateCw, ShieldCheck, Timer, UserCheck, Webhook } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Panel } from "@gorbital/dash/components/panel";
import { SkeletonLines, Spinner } from "@gorbital/dash/components/spinner";
import { Tooltip } from "@gorbital/dash/components/tooltip";
import type { Tone } from "@gorbital/dash/theme";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useOpenInEditor } from "@/lib/api/git";
import type { RouteList, RouteSourcePos } from "@/lib/api/routes";
import { guardChip, listGuards, sourceLabel, type GuardKind, type JoinedRoute } from "@/lib/routes/join";

const guardTone: Record<GuardKind, Tone> = { public: "ok", authenticated: "muted", permission: "info", role: "info", rate_limit: "warn", webhook: "violet", other: "muted" };
const guardIcon: Partial<Record<GuardKind, typeof KeyRound>> = { public: Globe, authenticated: UserCheck, permission: KeyRound, role: ShieldCheck, rate_limit: Timer, webhook: Webhook };

export function GuardBadge({ guard, truncate }: { guard: string; truncate?: boolean }) {
  const chip = guardChip(guard);
  const Icon = guardIcon[chip.kind];
  return (
    <Tooltip content={chip.title}>
      <span className="min-w-0">
        <Badge tone={guardTone[chip.kind]} className={truncate ? "max-w-[150px]" : ""}>
          {Icon && <Icon size={9} className="shrink-0" />}
          <span className={truncate ? "truncate" : ""}>{chip.label}</span>
        </Badge>
      </span>
    </Tooltip>
  );
}

/** The list's badges: public (or secured), the guards that say more than that, at most `max` with a count for the rest. */
export function RouteBadges({ route, guardsKnown, max = 2 }: { route: JoinedRoute; guardsKnown: boolean; max?: number }) {
  const info = route.info;
  const guards = info && guardsKnown ? listGuards(info.guards) : [];
  const shown = guards.slice(0, max);
  const rest = guards.length - shown.length;
  return (
    <span className="flex flex-nowrap items-center gap-1">
      {info?.public ? (
        <Badge tone="ok">
          <Globe size={9} /> public
        </Badge>
      ) : (
        route.secured && (
          <Badge tone="warn">
            <Lock size={9} /> secured
          </Badge>
        )
      )}
      {info?.deprecated && <Badge tone="danger">deprecated</Badge>}
      {!route.inConsole && (
        <Tooltip content="In the source, but the running app doesn't serve it yet: it was added since the last build.">
          <span>
            <Badge tone="violet">source only</Badge>
          </span>
        </Tooltip>
      )}
      {shown.map((g) => (
        <GuardBadge key={g} guard={g} truncate />
      ))}
      {rest > 0 && (
        <Tooltip content={guards.slice(max).join(", ")}>
          <span>
            <Badge tone="muted">+{rest}</Badge>
          </span>
        </Tooltip>
      )}
      {route.tags.map((t) => (
        <Badge key={t} tone="info">
          {t}
        </Badge>
      ))}
      {route.source === "handler" && <Badge tone="muted">handler</Badge>}
    </span>
  );
}

/** What `/_portal/api/routes` is doing, above the table: reading (it may build the app), refused, or its warnings. */
export function RouteInfoStatus({ loading, error, data, onRetry, retrying }: { loading: boolean; error: unknown; data?: RouteList; onRetry: () => void; retrying: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 text-[11.5px] text-muted">
        <Spinner size={11} /> Reading guards, middleware and source positions. The first time, orb builds the app, so this can take a few seconds.
      </div>
    );
  }
  if (error && !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11.5px]">
        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <span className="text-text">{notFound ? "This orb can't read guards and source positions yet." : "Guards and source positions aren't available."}</span>{" "}
          {!notFound && <span className="whitespace-pre-wrap font-mono text-[11px] text-muted">{errorMessage(error)}</span>}
          <div className="mt-0.5 text-dim">The list still comes from the running app&apos;s dev console.</div>
        </div>
        {!notFound && (
          <Button size="sm" kind="ghost" icon={<RotateCw size={11} />} onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-dim">
      {!data.guards_known && <span className="text-warn">Guards unknown (v0.1 app): its OpenAPI has no x-gorbital-guards.</span>}
      {data.source !== "app" && <span>OpenAPI read from {data.source === "export" ? "go run ./cmd/api openapi" : "a file"}</span>}
      {data.warnings.length > 0 && (
        <details className="min-w-0">
          <summary className="cursor-pointer select-none hover:text-muted">
            {data.warnings.length} warning{data.warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 grid gap-0.5 font-mono text-[10.5px] text-muted">
            {data.warnings.map((w, i) => (
              <li key={i} className="whitespace-pre-wrap break-words">
                {w}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SourceLink({ pos }: { pos: RouteSourcePos | null }) {
  const open = useOpenInEditor();
  const [copied, setCopied] = useState(false);
  if (!pos) return <span className="text-dim">not in the app&apos;s source</span>;
  const label = sourceLabel(pos);
  const copy = () => {
    void navigator.clipboard?.writeText(label).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Tooltip content={`Open ${label} in your editor`}>
        <button type="button" onClick={() => open.mutate({ path: pos.file, line: pos.line })} className="flex min-w-0 items-center gap-1 text-left font-mono text-primary hover:underline" disabled={open.isPending}>
          <span className="min-w-0 truncate [direction:rtl]">
            <bdi>{label}</bdi>
          </span>
          {open.isPending ? <Spinner size={10} /> : <ExternalLink size={10} className="shrink-0 text-dim" />}
        </button>
      </Tooltip>
      <Tooltip content={copied ? "Copied" : "Copy file:line"}>
        <button type="button" onClick={copy} aria-label={`Copy ${label}`} className="ml-auto grid h-5 w-5 shrink-0 place-items-center rounded text-dim hover:bg-elevated hover:text-text">
          {copied ? <Check size={10} /> : <Copy size={10} />}
        </button>
      </Tooltip>
    </span>
  );
}

/** The route as the source describes it: module, handler, where it's registered, guards and middleware. */
export function RouteDetails({ route, loading, failed, guardsKnown }: { route: JoinedRoute; loading: boolean; failed: boolean; guardsKnown: boolean }) {
  const info = route.info;
  return (
    <Panel title="Guards and source" meta={info ? (info.module ? `module ${info.module}` : "from a library") : undefined}>
      {loading ? (
        <SkeletonLines lines={4} />
      ) : !info ? (
        <p className="text-[11.5px] text-muted">{failed ? "Orb couldn't read the app's routes; see the note above the list." : "Orb didn't find this route in the OpenAPI document: a plain handler, such as /docs."}</p>
      ) : (
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-[11.5px]">
          <dt className="pt-[3px] text-dim">Access</dt>
          <dd className="flex flex-wrap gap-1">
            {info.public ? (
              <Badge tone="ok">
                <Globe size={9} /> public: no sign-in required
              </Badge>
            ) : (
              <Badge tone="warn">
                <Lock size={9} /> signed in
              </Badge>
            )}
            {info.deprecated && <Badge tone="danger">deprecated</Badge>}
          </dd>
          <dt className="pt-[3px] text-dim">Guards</dt>
          <dd className="flex min-w-0 flex-wrap gap-1">
            {!guardsKnown ? <span className="pt-[3px] text-warn">guards unknown (v0.1 app)</span> : info.guards.length === 0 ? <span className="pt-[3px] text-dim">none</span> : info.guards.map((g) => <GuardBadge key={g} guard={g} />)}
          </dd>
          <dt className="text-dim">Middleware</dt>
          <dd className="min-w-0">
            {info.middleware.length === 0 ? (
              <span className="text-dim">none beyond the app&apos;s stack</span>
            ) : (
              <ol className="grid gap-0.5">
                {info.middleware.map((m, i) => (
                  <li key={i} className="flex gap-1.5 font-mono text-[11px] text-text">
                    <span className="text-dim tnum">{i + 1}.</span>
                    <span className="min-w-0 break-all">{m}</span>
                  </li>
                ))}
              </ol>
            )}
            {info.middleware.length > 1 && <div className="mt-0.5 text-[10.5px] text-dim">outermost first</div>}
          </dd>
          <dt className="text-dim">Module</dt>
          <dd className="font-mono text-text">{info.module || <span className="font-sans text-dim">none: a library&apos;s route</span>}</dd>
          <dt className="text-dim">Handler</dt>
          <dd className="font-mono text-text">{info.handler || <span className="font-sans text-dim">unknown</span>}</dd>
          <dt className="text-dim">Registered</dt>
          <dd className="min-w-0">
            <SourceLink pos={info.source} />
          </dd>
          {(info.handler_source || info.source) && (
            <>
              <dt className="text-dim">Handler at</dt>
              <dd className="min-w-0">
                <SourceLink pos={info.handler_source} />
              </dd>
            </>
          )}
        </dl>
      )}
    </Panel>
  );
}
