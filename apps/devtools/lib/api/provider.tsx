"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "@gorbital/dash/components/toast";
import { TooltipProvider } from "@gorbital/dash/components/tooltip";
import { apiFetch, subscribeEvents } from "./client";
import { keys } from "./queries";
import { applySchemaEvent, invalidateSchemaViews, isRebuildFinished, schemaStatusKey, schemaToast } from "./schema-status";
import { consoleStore } from "./store";
import type { AppState, OutputList, SchemaStatus, Status } from "./types";

/**
 * Wraps the app once: the query cache, toasts, tooltips, and the one events
 * subscription that feeds the console store, patches the status query so
 * every page sees a state change the moment it happens, and keeps the
 * schema status current so the database screens refetch when the schema
 * changes (from code, the portal or the SQL Editor).
 */
export function DevtoolsProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, staleTime: 5000 },
        },
      }),
  );

  useEffect(() => {
    let lastState: AppState | undefined;
    const stop = subscribeEvents(
      (e) => {
        consoleStore.push(e);
        if (e.type === "schema") {
          const previous = client.getQueryData<SchemaStatus | null>(schemaStatusKey);
          applySchemaEvent(client, e.schema);
          const t = schemaToast(e.schema, previous);
          if (t) (t.kind === "success" ? toast.success : toast.info)(t.title, { description: t.description });
          return;
        }
        if (e.type !== "state") return;
        client.setQueryData<Status>(keys.status, (old) => (old ? { ...old, app: e.state } : old));
        if (e.state.state !== lastState) {
          const previous = lastState;
          lastState = e.state.state;
          void client.invalidateQueries({ queryKey: keys.status });
          if (e.state.state === "running") void client.invalidateQueries({ queryKey: ["dev"] });
          // A rebuild may have migrated: the schema views refetch too.
          if (isRebuildFinished(previous, e.state.state)) invalidateSchemaViews(client);
          void client.invalidateQueries({ queryKey: keys.readiness });
        }
      },
      (s) => {
        consoleStore.setConnection(s);
        if (s.state === "open") {
          // Subscribed first, then the backlog: nothing falls between.
          apiFetch<OutputList>("/_portal/api/output?limit=200")
            .then((out) => consoleStore.backfill(out.lines))
            .catch(() => {});
        }
      },
    );
    return () => {
      stop();
      consoleStore.reset();
    };
  }, [client]);

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  );
}
