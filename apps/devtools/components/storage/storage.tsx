"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Columns3, List, RefreshCw } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Code, Cmt } from "@gorbital/dash/components/code";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Segmented } from "@gorbital/dash/components/pill";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { useCapabilities } from "@/lib/api/queries";
import { DEFAULT_PAGE_SIZE, isStorageOff, storageKeys, useStorageStatus } from "@/lib/api/storage";
import { normalizePrefix, parentPrefix, validKey } from "@/lib/storage/keys";
import { Gate } from "@/components/shared/gate";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { useHydrated } from "@/components/sql-editor/use-hydrated";
import { Browser, type View } from "./browser";
import { DriverCard } from "./driver-card";
import { GuardBanner } from "./guard-banner";
import { useStorageGuard } from "./use-guard";

type UrlState = { prefix: string; key?: string; view: View; limit: number };

/** The view is the query string: `?prefix=images/&key=images/logo.svg&view=columns&limit=50`. Written with a null state so `useSearchParams` follows (see the Logs page). */
function writeUrl(s: UrlState) {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams();
  if (s.prefix) p.set("prefix", s.prefix);
  if (s.key) p.set("key", s.key);
  if (s.view === "columns") p.set("view", "columns");
  if (s.limit !== DEFAULT_PAGE_SIZE) p.set("limit", String(s.limit));
  const url = new URL(window.location.href);
  url.search = p.toString();
  window.history.replaceState(null, "", url);
}

const description = "the app's file storage · /ops/storage";

/** The page before the query string is known: the static export prerenders this. */
export function StorageSkeleton() {
  return (
    <>
      <PageHeader product="devtools" title="Storage" description={description} />
      <Page>
        <SkeletonLines lines={8} className="p-4" />
      </Page>
    </>
  );
}

/** The Storage screen (Phase 10): the driver card, the production guard and the file browser, with the folder, the open object and the view in the URL. */
export function Storage() {
  const hydrated = useHydrated();
  const params = useSearchParams();
  const state = useMemo((): UrlState => {
    const rawKey = params.get("key") ?? "";
    const key = rawKey && validKey(rawKey) ? rawKey : undefined;
    const rawLimit = Number(params.get("limit"));
    const limit = Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 1000 ? rawLimit : DEFAULT_PAGE_SIZE;
    // The open object always lives in the current folder; its parent wins over a stray prefix.
    const prefix = key ? parentPrefix(key) : normalizePrefix(params.get("prefix") ?? "");
    return { prefix, key, view: params.get("view") === "columns" ? "columns" : "list", limit };
  }, [params]);

  const caps = useCapabilities();
  const status = useStorageStatus(caps.ops);
  const guard = useStorageGuard(status.data);
  const qc = useQueryClient();

  const onPrefix = useCallback((prefix: string) => writeUrl({ ...state, prefix: normalizePrefix(prefix), key: undefined }), [state]);
  const onKey = useCallback((key: string | undefined) => writeUrl({ ...state, prefix: key ? parentPrefix(key) : state.prefix, key }), [state]);
  const onView = (view: View) => writeUrl({ ...state, view });

  if (!hydrated) return <StorageSkeleton />;

  const s = status.data;
  return (
    <>
      <PageHeader product="devtools" title="Storage" description={s ? `${s.driver} · ${s.bucket}${s.region ? ` · ${s.region}` : ""} · /ops/storage` : description}>
        <Segmented<View>
          value={state.view}
          options={[
            {
              value: "list",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <List size={12} /> List
                </span>
              ),
            },
            {
              value: "columns",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Columns3 size={12} /> Columns
                </span>
              ),
            },
          ]}
          onChange={onView}
        />
        <Button size="md" kind="secondary" icon={<RefreshCw size={12} />} onClick={() => void qc.invalidateQueries({ queryKey: storageKeys.all })} loading={status.isFetching && !status.data}>
          Refresh
        </Button>
      </PageHeader>
      <Page>
        <Gate need="ops" loading={<SkeletonLines lines={8} className="p-4" />}>
          {isStorageOff(status.error) ? (
            <Panel title="Storage is off" meta="404 storage_off">
              <div className="grid max-w-3xl gap-3 text-[12px] text-muted">
                <p>The app has no file store: STORAGE_DRIVER is empty in production, or its configuration failed (the app&apos;s start error says which). In development the local driver needs nothing running.</p>
                <Code>
                  <Cmt># in the app's directory; local by default, or --driver s3|spaces|r2|minio</Cmt>
                  {"\n$ orb add storage\n$ orb dev"}
                </Code>
              </div>
            </Panel>
          ) : status.error && !s ? (
            <ProblemPanel error={status.error} scope="ops" console={caps.consoleDeclared} onRetry={() => void status.refetch()} retrying={status.isFetching} meta="GET /ops/storage" />
          ) : (
            <>
              {s && !s.local && <GuardBanner status={s} unlocked={guard.unlocked} onUnlock={() => guard.setUnlocked(true)} onLock={() => guard.setUnlocked(false)} />}
              <DriverCard status={s} loading={status.isFetching} />
              {s ? <Browser status={s} prefix={state.prefix} selectedKey={state.key} view={state.view} limit={state.limit} locked={guard.locked} onPrefix={onPrefix} onKey={onKey} /> : <Empty title="Reading the store" hint="GET /ops/storage" />}
            </>
          )}
        </Gate>
      </Page>
    </>
  );
}
