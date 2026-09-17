"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, AlertTriangle } from "lucide-react";
import { Page, PageHeader } from "@gorbital/dash/components/page";
import { Panel } from "@gorbital/dash/components/panel";
import { Spinner } from "@gorbital/dash/components/spinner";
import { errorMessage } from "@/lib/api/errors";
import { fetchSignInTestResult, SIGN_IN_TEST_CHANNEL, type SignInTestResult } from "@/lib/api/signin-tests";
import { failureLabel, finishedMessage, parseResultHash } from "@/lib/signin-tests/signin-tests";

type View = { phase: "reading" } | { phase: "missing" } | { phase: "done"; result: SignInTestResult } | { phase: "error"; message: string };

/**
 * The end of a sign-in test's popup: tells the Authentication screen the
 * test finished (BroadcastChannel, and a message to the opener on this
 * origin only), shows the outcome briefly and closes itself on success.
 */
export function TestResult() {
  const [view, setView] = useState<View>({ phase: "reading" });

  useEffect(() => {
    const parsed = parseResultHash(window.location.hash);
    if (!parsed) {
      setView({ phase: "missing" });
      return;
    }
    const msg = finishedMessage(parsed.id);
    try {
      const channel = new BroadcastChannel(SIGN_IN_TEST_CHANNEL);
      channel.postMessage(msg);
      channel.close();
    } catch {
      // No BroadcastChannel: the opener message and its polling still work.
    }
    try {
      window.opener?.postMessage(msg, window.location.origin);
    } catch {
      // The opener went away.
    }

    let stopped = false;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const read = async (attempt: number) => {
      try {
        const result = await fetchSignInTestResult(parsed.id);
        if (stopped) return;
        // The callback may land a moment before the result is written.
        if (result.state === "pending" && attempt < 6) {
          setTimeout(() => void read(attempt + 1), 1000);
          return;
        }
        setView({ phase: "done", result });
        if (result.state === "passed") closeTimer = setTimeout(() => window.close(), 1500);
      } catch (err) {
        if (!stopped) setView({ phase: "error", message: errorMessage(err) });
      }
    };
    void read(0);
    return () => {
      stopped = true;
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, []);

  return (
    <>
      <PageHeader product="devtools" title="Sign-in test" description="the end of a test started on the Authentication screen" />
      <Page>
        <Panel>
          <div className="grid max-w-xl gap-2 text-[12.5px]">
            {view.phase === "reading" && (
              <div className="flex items-center gap-2 text-muted">
                <Spinner size={12} /> Reading the result…
              </div>
            )}
            {view.phase === "missing" && <div className="text-muted">Nothing to show: this page opens at the end of a sign-in test, from Authentication → Test sign-in.</div>}
            {view.phase === "error" && (
              <div className="flex items-start gap-2">
                <CircleX size={14} className="mt-0.5 shrink-0 text-danger" />
                <span className="text-text">Couldn&apos;t read the result: {view.message}</span>
              </div>
            )}
            {view.phase === "done" && <Outcome result={view.result} />}
            {view.phase !== "reading" && <div className="text-dim">You can close this window.</div>}
          </div>
        </Panel>
      </Page>
    </>
  );
}

function Outcome({ result }: { result: SignInTestResult }) {
  if (result.state === "passed") {
    return (
      <div className="flex items-start gap-2">
        <CircleCheck size={14} className="mt-0.5 shrink-0 text-ok" />
        <span className="text-text">
          Passed{result.identity?.email ? `: signed in as ${result.identity.email}` : ""}. The Authentication screen has the details.
        </span>
      </div>
    );
  }
  if (result.state === "pending") {
    return (
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
        <span className="text-text">The result isn&apos;t in yet; the Authentication screen keeps waiting for it.</span>
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <div className="flex items-start gap-2">
        {result.state === "expired" ? <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" /> : <CircleX size={14} className="mt-0.5 shrink-0 text-danger" />}
        <span className="font-medium text-text">{result.state === "expired" ? "The test expired" : failureLabel(result.code)}</span>
      </div>
      {result.message && <div className="text-text">{result.message}</div>}
      {result.fix && <div className="text-muted">{result.fix}</div>}
    </div>
  );
}
