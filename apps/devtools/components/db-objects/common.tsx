"use client";

import { type ReactNode, useEffect, useState } from "react";
import { DatabaseZap, RefreshCw, Search } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Input } from "@gorbital/dash/components/input";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { ConnectionProblem } from "@/components/overview/connection";
import { ApiError } from "@/lib/api/client";
import type { Status } from "@/lib/api/types";
import { useStatus } from "@/lib/api/queries";

type Gate = { status: ReturnType<typeof useStatus>; children: ReactNode };

/**
 * What every database page checks first: the portal answers, and the app
 * has a database (`portal.database`). Renders the connection problem or a
 * "no database" note instead of `children` otherwise; a skeleton while the
 * status loads so the prerender and the first client render agree.
 */
export function DbGate({ status, children }: Gate) {
  if (status.error && !status.data) return <ConnectionProblem error={status.error} retrying={status.isFetching} onRetry={() => void status.refetch()} />;
  if (!status.data) return <Panel><Skeleton className="h-3 w-40" /></Panel>;
  if (!status.data.portal.database) return <NoDatabase status={status.data} />;
  return <>{children}</>;
}

export function NoDatabase({ status }: { status: Status }) {
  return (
    <Panel>
      <Empty
        title={status.project.database ? "The database isn't reachable" : "This app has no database"}
        hint={status.project.database ? "orb dev reads DATABASE_URL from .env; the portal shows the schema once PostgreSQL answers" : "Apps created with the Minimal preset have no PostgreSQL; the Schema, Objects and Migrations pages need one"}
      />
    </Panel>
  );
}

/** A database read failed: the problem, and a Retry. 404 no_database and 503 database_unavailable get their own words. */
export function DbProblem({ error, retrying, onRetry }: { error: unknown; retrying: boolean; onRetry: () => void }) {
  if (error instanceof ApiError && (error.code === "no_database" || error.code === "database_unavailable")) {
    return (
      <Panel
        title={
          <span className="flex items-center gap-2">
            <DatabaseZap size={14} className="text-warn" /> {error.code === "no_database" ? "No database" : "Database unavailable"}
          </span>
        }
        meta={`${error.status} ${error.code}`}
        actions={
          <Button size="sm" kind="primary" icon={<RefreshCw size={11} />} onClick={onRetry} loading={retrying}>
            Retry
          </Button>
        }
      >
        <p className="text-[12px] text-muted">{error.detail}</p>
      </Panel>
    );
  }
  return <ConnectionProblem error={error} retrying={retrying} onRetry={onRetry} />;
}

/** A search box for the object tables: mono, with the icon, debounced through the caller's state. */
export function SearchInput({ value, onChange, placeholder = "Filter…", className = "", id, onEnter }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; id?: string; onEnter?: () => void }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
      <Input
        id={id}
        mono
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
          if (e.key === "Escape") onChange("");
        }}
        placeholder={placeholder}
        className="pl-7"
        aria-label={placeholder}
      />
    </span>
  );
}

/** Matches `q` against any of `fields`, case-insensitively; an empty query matches everything. */
export function matches(q: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

/**
 * False during the prerender and the first client render, true after mount.
 * The database pages hydrate inside a Suspense boundary (for the search
 * params) which React may hydrate after the status query has answered;
 * rendering the skeleton until mounted keeps both renders identical.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** The page as the prerender shows it: header and a shimmering panel. */
export function DbPageSkeleton({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader product="devtools" title={title} description={description} />
      <Page>
        <Panel>
          <Skeleton className="h-3 w-40" />
        </Panel>
      </Page>
    </>
  );
}

/** A value read from localStorage after mount (never during the prerender), written back on change. */
export function useStoredState<T>(key: string, initial: T, validate: (v: unknown) => v is T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (validate(parsed)) setValue(parsed);
      }
    } catch {
      // Blocked storage: keep the default.
    }
  }, [key, validate]);
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // Blocked or full: the choice lasts for this page only.
    }
  };
  return [value, set];
}
