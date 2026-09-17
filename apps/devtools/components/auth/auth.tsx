"use client";

import { Suspense, useCallback, useState } from "react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty } from "@gorbital/dash/components/panel";
import { Table } from "@gorbital/dash/components/table";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import { useCapabilities } from "@/lib/api/queries";
import { Gate } from "@/components/shared/gate";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { Providers } from "./providers";
import { RateLimits } from "./rate-limits";
import { UserSheet } from "./user-sheet";
import { Users } from "./users";

type AuthTab = "users" | "providers" | "rate-limits";
const tabs: AuthTab[] = ["users", "providers", "rate-limits"];
const isTab = (v: string | null): v is AuthTab => tabs.includes(v as AuthTab);

/** The Authentication screen: accounts (with one open in a sheet), sign-in methods and rate limiters. The tab and the selected account live in `?tab=` and `?user=`. */
export function Auth() {
  const caps = useCapabilities();
  const hasAuth = caps.status.data ? caps.status.data.project.features.includes("auth") || caps.status.data.project.preset === "full" : true;
  const enabled = caps.ops && hasAuth;
  const [tab, setTab] = useState<AuthTab>("users");
  const [user, setUser] = useState<string | null>(null);
  const onTab = useCallback((v: string | null) => setTab(isTab(v) ? v : "users"), []);
  const onUser = useCallback((v: string | null) => setUser(v), []);
  const selectTab = (t: AuthTab) => {
    setTab(t);
    setQueryParam("tab", t === "users" ? null : t);
  };
  const selectUser = (id: string | null) => {
    setUser(id);
    setQueryParam("user", id);
  };

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="tab" onValue={onTab} />
        <QueryParam name="user" onValue={onUser} />
      </Suspense>
      <PageHeader product="devtools" title="Authentication" description="accounts, sign-in methods and rate limiters · /ops/auth" />
      <Page>
        <Gate need="ops" loading={<Table columns={[]} rows={[]} rowKey={() => ""} loading />}>
          {!hasAuth ? (
            <Empty title="This app has no auth module" hint="The Full preset, or orb add auth, brings accounts, sessions and the /ops/auth endpoints." />
          ) : (
            <Tabs<AuthTab>
              value={tab}
              onChange={selectTab}
              tabs={[
                { value: "users", label: "Users" },
                { value: "providers", label: "Providers" },
                { value: "rate-limits", label: "Rate limits" },
              ]}
            >
              <TabPanel value="users">
                <Users enabled={enabled} consoleDeclared={caps.consoleDeclared} selected={user} onSelect={selectUser} />
              </TabPanel>
              <TabPanel value="providers">
                <Providers enabled={enabled} consoleDeclared={caps.consoleDeclared} />
              </TabPanel>
              <TabPanel value="rate-limits">
                <RateLimits enabled={enabled} consoleDeclared={caps.consoleDeclared} />
              </TabPanel>
            </Tabs>
          )}
        </Gate>
      </Page>
      <UserSheet id={enabled ? user : null} enabled={enabled} console={caps.console} consoleDeclared={caps.consoleDeclared} onClose={() => selectUser(null)} />
    </>
  );
}
