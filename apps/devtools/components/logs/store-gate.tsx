"use client";

import { Database } from "lucide-react";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { Panel } from "@gorbital/dash/components/panel";

/** What the Logs page shows when the portal answers 404 `no_log_store`: an orb dev from before ADR-0072. */
export function NoLogStore({ meta }: { meta?: string }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Database size={14} className="text-warn" /> This orb dev keeps no log store
        </span>
      }
      meta={meta ?? "404 no_log_store"}
    >
      <div className="grid max-w-3xl gap-3 text-[12px] text-muted">
        <p>The Logs screen reads the records orb dev stores under .orb/portal/logs as it runs the app (ADR-0072). This orb dev predates the store, or runs an app it can't follow. Rebuild orb from the current source and start it again in the app's directory.</p>
        <Code>
          <Cmt># in the gorbital repository, then in your app</Cmt>
          {"\n$ go install ./cli/orb\n$ orb dev"}
        </Code>
      </div>
    </Panel>
  );
}
