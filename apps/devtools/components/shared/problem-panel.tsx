"use client";

import { AlertTriangle, KeyRound, PlugZap, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { Panel } from "@gorbital/dash/components/panel";
import { ApiError, NotConnectedError } from "@/lib/api/client";
import { describeError, type ErrorScope } from "@/lib/api/errors";
import { ConnectionProblem } from "@/components/overview/connection";

type Props = {
  error: unknown;
  /** Where the request went: the meaning of a 401 or 404 depends on it. */
  scope: ErrorScope;
  /** `status.app.console`, for the 401-from-/ops case. */
  console?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  /** Mono text next to the title, such as the endpoint. */
  meta?: string;
};

/** What a page shows in place of its data when the app or the portal refused the request. */
export function ProblemPanel({ error, scope, console, onRetry, retrying, meta }: Props) {
  if (error instanceof NotConnectedError || (scope === "portal" && error instanceof ApiError && error.unauthorized)) {
    return <ConnectionProblem error={error} retrying={Boolean(retrying)} onRetry={onRetry ?? (() => {})} />;
  }
  const d = describeError(error, { scope, console });
  const icon = d.kind === "operator_not_accepted" || d.kind === "no_console" ? <Terminal size={14} className="text-warn" /> : d.kind === "not_signed_in" ? <KeyRound size={14} className="text-warn" /> : d.kind === "app_unavailable" ? <PlugZap size={14} className="text-warn" /> : <AlertTriangle size={14} className="text-danger" />;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {icon} {d.title}
        </span>
      }
      meta={meta ?? d.detail}
      actions={
        onRetry && (
          <Button size="sm" kind="secondary" icon={<RefreshCw size={11} />} onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        )
      }
    >
      <div className="grid max-w-3xl gap-3 text-[12px] text-muted">
        <p>{d.hint}</p>
        {d.kind === "operator_not_accepted" && (
          <Code>
            <Cmt># in the gorbital repository, then in your app</Cmt>
            {"\n$ go install ./cli/orb\n$ orb dev"}
          </Code>
        )}
        {d.kind === "no_console" && scope === "dev" && (
          <Code>
            <Cmt># the console needs a token; orb dev sets one when it starts the app</Cmt>
            {"\n$ orb dev"}
          </Code>
        )}
        {meta && d.detail && <p className="font-mono text-[11px] text-dim">{d.detail}</p>}
      </div>
    </Panel>
  );
}
