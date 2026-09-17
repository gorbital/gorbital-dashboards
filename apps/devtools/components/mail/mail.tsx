"use client";

import { Suspense, useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@gorbital/dash/components/button";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Empty } from "@gorbital/dash/components/panel";
import { Tabs, TabPanel } from "@gorbital/dash/components/tabs";
import { fmtInt } from "@gorbital/dash/lib/format";
import { isNoMailCatcher, mailKeys, useInbox, useMailPreviews } from "@/lib/api/mail";
import { keys, useCapabilities } from "@/lib/api/queries";
import { QueryParam, setQueryParam } from "@/components/shared/query-param";
import { Delivery } from "./delivery";
import { Inbox } from "./inbox";
import { Previews } from "./previews";

type Tab = "inbox" | "previews" | "delivery";

/**
 * The Mail screen: the inbox orb dev caught (ADR-0074), the app's email
 * previews, and the Phase 1 delivery sections. The tab and the selected
 * message or preview live in the query string (`?tab=&id=&preview=`).
 */
export function Mail() {
  const caps = useCapabilities();
  const qc = useQueryClient();
  const project = caps.status.data?.project;
  const hasMail = Boolean(project && (project.mail || project.features.includes("mail")));
  const [tab, setTab] = useState<Tab>("inbox");
  const [id, setId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const onTab = useCallback((v: string | null) => setTab(v === "previews" || v === "delivery" ? v : "inbox"), []);
  const onId = useCallback((v: string | null) => setId(v), []);
  const onPreview = useCallback((v: string | null) => setPreview(v), []);

  // The header's counts: the inbox query the Inbox tab shares (no search), and the previews.
  const inbox = useInbox("", Boolean(caps.status.data));
  const previews = useMailPreviews(caps.console);
  const noCatcher = isNoMailCatcher(inbox.error);

  const pickTab = useCallback((t: Tab) => {
    setTab(t);
    setQueryParam("tab", t === "inbox" ? null : t);
  }, []);
  const selectMessage = useCallback((v: string | null) => {
    setId(v);
    setQueryParam("id", v);
  }, []);
  const selectPreview = useCallback((v: string | null) => {
    setPreview(v);
    setQueryParam("preview", v);
  }, []);
  const onSent = useCallback(
    (sentId: string | undefined) => {
      void qc.invalidateQueries({ queryKey: mailKeys.all });
      pickTab("inbox");
      selectMessage(sentId ?? null);
    },
    [qc, pickTab, selectMessage],
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: mailKeys.all });
    void qc.invalidateQueries({ queryKey: keys.mail });
    void qc.invalidateQueries({ queryKey: keys.suppressions });
    void qc.invalidateQueries({ queryKey: keys.devMail });
  };

  const description = inbox.data
    ? `${fmtInt(inbox.data.count)} caught at ${inbox.data.smtp_addr}${inbox.data.count >= inbox.data.max ? ` · at the ${fmtInt(inbox.data.max)} limit, oldest dropped` : ""} · MAIL_DELIVERY=devmail`
    : noCatcher
      ? "no mail catcher in this orb dev: the app sends to Mailpit or a provider"
      : "the inbox orb dev catches, the app's email previews, and how it delivers";

  if (caps.status.data && !hasMail) {
    return (
      <>
        <PageHeader product="devtools" title="Mail" description="the inbox orb dev catches, and how the app sends email" />
        <Page>
          <Empty title="This app doesn't send email" hint="orb add mail wires a provider and the development inbox; this page fills in after that." />
        </Page>
      </>
    );
  }

  return (
    <>
      <Suspense fallback={null}>
        <QueryParam name="tab" onValue={onTab} />
        <QueryParam name="id" onValue={onId} />
        <QueryParam name="preview" onValue={onPreview} />
      </Suspense>
      <PageHeader product="devtools" title="Mail" description={description}>
        <Button size="sm" kind="ghost" icon={<RefreshCw size={11} />} onClick={refresh} loading={inbox.isFetching}>
          Refresh
        </Button>
      </PageHeader>
      <Page>
        <Tabs<Tab>
          value={tab}
          onChange={pickTab}
          tabs={[
            { value: "inbox", label: "Inbox", badge: inbox.data ? fmtInt(inbox.data.count) : undefined },
            { value: "previews", label: "Previews", badge: previews.data ? previews.data.length : undefined },
            { value: "delivery", label: "Delivery" },
          ]}
        >
          <TabPanel value="inbox">
            <Inbox selectedId={id} onSelect={selectMessage} />
          </TabPanel>
          <TabPanel value="previews">
            <Previews selected={preview} onSelect={selectPreview} onSent={onSent} />
          </TabPanel>
          <TabPanel value="delivery">
            <Delivery />
          </TabPanel>
        </Tabs>
      </Page>
    </>
  );
}
