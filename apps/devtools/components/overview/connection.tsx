"use client";

import { KeyRound, PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { Panel } from "@gorbital/dash/components/panel";
import { ApiError, NotConnectedError } from "@/lib/api/client";

type Props = { error: unknown; retrying: boolean; onRetry: () => void };

/** What the page shows instead of its tiles when the portal can't be read. */
export function ConnectionProblem({ error, retrying, onRetry }: Props) {
  const retry = (
    <Button size="sm" kind="primary" icon={<RefreshCw size={11} />} onClick={onRetry} loading={retrying}>
      Retry
    </Button>
  );
  if (error instanceof NotConnectedError) {
    return (
      <Panel
        title={
          <span className="flex items-center gap-2">
            <PlugZap size={14} className="text-warn" /> orb dev isn&apos;t running
          </span>
        }
        meta="nothing answers on this origin"
        actions={retry}
      >
        <div className="grid max-w-3xl gap-3 text-[12px] text-muted">
          <p>The Dev Portal reads from the orb dev that runs your app. Start it in the app&apos;s directory, then open the link it prints:</p>
          <Code>
            <Cmt># in your gorbital app</Cmt>
            {"\n$ orb dev\n\n"}
            <Cmt>  ✓ API          http://127.0.0.1:8080</Cmt>
            {"\n"}
            <Cmt>  ✓ Dev Portal   http://127.0.0.1:3100/_portal/auth?t=…   ← open this</Cmt>
          </Code>
          <p>
            Running the UI from source on <span className="font-mono text-text">:3101</span>? The dev server proxies <span className="font-mono text-text">/_portal/*</span> to{" "}
            <span className="font-mono text-text">http://127.0.0.1:3100</span> (set <span className="font-mono text-text">ORB_PORTAL_URL</span> to change it). Without an orb dev,{" "}
            <span className="font-mono text-text">localStorage.devtoolsData = &quot;mock&quot;</span> shows the sample data instead.
          </p>
        </div>
      </Panel>
    );
  }
  if (error instanceof ApiError && error.unauthorized) {
    return (
      <Panel
        title={
          <span className="flex items-center gap-2">
            <KeyRound size={14} className="text-warn" /> Not signed in
          </span>
        }
        meta="401 from the portal"
        actions={retry}
      >
        <div className="grid max-w-3xl gap-3 text-[12px] text-muted">
          <p>
            Open the Dev Portal link printed by <span className="font-mono text-text">orb dev</span>. It sets the <span className="font-mono text-text">orb_portal</span> cookie for this browser; every orb dev run
            prints a new one.
          </p>
          <Code>
            <Cmt>  ✓ Dev Portal   http://127.0.0.1:3100/_portal/auth?t=…</Cmt>
            {"\n"}
            <Cmt>  # from the source on :3101, use the same path on this origin: http://localhost:3101/_portal/auth?t=…</Cmt>
          </Code>
        </div>
      </Panel>
    );
  }
  const detail = error instanceof ApiError ? `${error.status} ${error.code}${error.detail ? ` · ${error.detail}` : ""}` : error instanceof Error ? error.message : String(error);
  return (
    <Panel title="The portal refused the request" meta="see orb dev's output" actions={retry}>
      <p className="font-mono text-[12px] text-danger">{detail}</p>
    </Panel>
  );
}
