"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import { gitKeys, isNoRepository, useGitStatus } from "@/lib/api/git";
import { useStatus } from "@/lib/api/queries";
import { useMounted } from "@/components/db-objects/common";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { BranchesTab } from "./branches";
import { ChangesTab } from "./changes";
import { NoRepository } from "./common";
import { HistoryTab } from "./history";
import { ConflictsPanel } from "./merge";
import { StatusHeader } from "./status-header";

type GitTab = "changes" | "branches" | "history";
const tabs: GitTab[] = ["changes", "branches", "history"];
const isTab = (v: string | null): v is GitTab => tabs.includes(v as GitTab);

/**
 * The Git screen (ADR-0076): the status header with fetch, pull and push;
 * the Changes tab (the two lists, the diff viewer with hunk staging, the
 * commit box); Branches (create, switch, delete, merge); History (the log
 * with a graph). `?tab=`, `?path=` (the selected file) and `?staged=` live
 * in the query string. The page hydrates inside a Suspense boundary, so it
 * renders a skeleton until mounted, like the Phase 4 and 8 pages.
 */
export function GitScreen() {
  const mounted = useMounted();
  const portal = useStatus();
  const status = useGitStatus(mounted);
  const [tab, setTab] = useState<GitTab>("changes");
  const [path, setPath] = useState<string | null>(null);
  const [staged, setStaged] = useState(false);
  const onTab = useCallback((v: string | null) => setTab(isTab(v) ? v : "changes"), []);
  const onPath = useCallback((v: string | null) => setPath(v), []);
  const onStaged = useCallback((v: string | null) => setStaged(v === "true"), []);
  const selectTab = (t: GitTab) => {
    setTab(t);
    setQueryParam("tab", t === "changes" ? null : t);
  };
  const select = (p: string | null, s: boolean) => {
    setPath(p);
    setStaged(s);
    setQueryParam("path", p);
    setQueryParam("staged", p && s ? "true" : null);
  };
  const project = mounted ? portal.data?.project : undefined;
  const st = status.data;
  // The status polls; when HEAD or the branch moved underneath (a commit or switch in the terminal), the branches and the log are stale too.
  const qc = useQueryClient();
  const head = st ? `${st.branch}@${st.head}:${st.state ?? ""}` : "";
  useEffect(() => {
    if (!head) return;
    void qc.invalidateQueries({ queryKey: gitKeys.branches });
    void qc.invalidateQueries({ queryKey: ["git", "log"] });
    void qc.invalidateQueries({ queryKey: ["git", "diff"] });
  }, [head, qc]);
  const description = st ? `${project ? `${project.name} · ` : ""}${st.detached ? `detached at ${st.branch}` : st.branch}${st.upstream ? ` → ${st.upstream}` : ""}` : "the app's repository, through your own git";
  const noRepo = status.error && !status.data && isNoRepository(status.error) ? status.error : undefined;
  const merging = Boolean(st && (st.state === "merging" || st.conflicts > 0));

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="tab" onValue={onTab} />
        <QueryParam name="path" onValue={onPath} />
        <QueryParam name="staged" onValue={onStaged} />
      </Suspense>
      <PageHeader product="devtools" title="Git" description={description} />
      <Page>
        {!mounted ? (
          <SkeletonLines lines={6} className="p-4" />
        ) : noRepo ? (
          <NoRepository code={noRepo.code} detail={noRepo.detail} />
        ) : status.error && !status.data ? (
          <ProblemPanel error={status.error} scope="portal" onRetry={() => void status.refetch()} retrying={status.isFetching} meta="GET /_portal/api/git/status" />
        ) : (
          <>
            <StatusHeader status={st} loading={status.isPending} />
            {merging && st && <ConflictsPanel status={st} onOpenFile={(p) => select(p, false)} />}
            <Tabs<GitTab>
              value={tab}
              onChange={selectTab}
              tabs={[
                { value: "changes", label: "Changes", badge: st ? st.files.length || undefined : undefined },
                { value: "branches", label: "Branches" },
                { value: "history", label: "History" },
              ]}
            >
              <TabPanel value="changes">
                <ChangesTab status={st} path={path} staged={staged} onSelect={select} />
              </TabPanel>
              <TabPanel value="branches">
                <BranchesTab status={st} />
              </TabPanel>
              <TabPanel value="history">
                <HistoryTab status={st} />
              </TabPanel>
            </Tabs>
          </>
        )}
      </Page>
    </>
  );
}
