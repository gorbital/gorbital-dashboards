"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CircleCheck, CircleMinus, CircleX, ExternalLink, Fingerprint, KeyRound, Mail, Play, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Button } from "@gorbital/dash/components/button";
import { Field, Input, Textarea } from "@gorbital/dash/components/input";
import { Panel } from "@gorbital/dash/components/panel";
import { Skeleton, Spinner } from "@gorbital/dash/components/spinner";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useSendPreview } from "@/lib/api/mail";
import { dataMode } from "@/lib/api/mode";
import {
  startSignInTest,
  useRefreshSignInTests,
  useSignInLiveCheck,
  useSignInTestResult,
  useSignInTests,
  useStartTotpTest,
  useVerifyIdToken,
  useVerifyTotp,
  type CheckLink,
  type RedirectProvider,
  type SignInCheck,
  type SignInMethodKey,
  type SignInTestMethod,
  type SignInTestResult,
  type SignInTestStart,
  type TOTPTestResult,
  type TOTPTestStart,
} from "@/lib/api/signin-tests";
import { checkLinkHref, checkTone, failureLabel, identityRows, normalizeTotpCode, passkeyRows, POPUP_FEATURES, resultUrl, summarizeChecks, totpDone, totpHeadline } from "@/lib/signin-tests/signin-tests";
import { ProblemPanel } from "@/components/shared/problem-panel";
import { CopyButton } from "./common";

const POPUP_NAME = "orb-sign-in-test";

const methodIcon = (key: SignInMethodKey) => {
  if (key === "email") return <Mail size={13} />;
  if (key === "authenticator_app") return <KeyRound size={13} />;
  if (key === "passkeys") return <Fingerprint size={13} />;
  return <span className="font-mono text-[11px] uppercase">{key.slice(0, 2)}</span>;
};

/** The "Test sign-in" tab: every method's checks, and a live test for each (`/_dev/auth/test`). */
export function SignInTests({ enabled, consoleDeclared, focus }: { enabled: boolean; consoleDeclared?: boolean; focus: SignInMethodKey | null }) {
  const tests = useSignInTests(enabled);
  const loaded = Boolean(tests.data);

  useEffect(() => {
    if (!focus || !loaded) return;
    const el = document.getElementById(`signin-test-${focus}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, loaded]);

  if (tests.error && !tests.data) {
    return <ProblemPanel error={tests.error} scope="dev" console={consoleDeclared} meta="GET /_dev/auth/test" onRetry={() => void tests.refetch()} retrying={tests.isFetching} />;
  }
  if (!tests.data) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[140px] w-full" rounded="rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-bg/40 px-3 py-2 text-[12px] text-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
        <div>
          Checks read the app&apos;s configuration without calling anyone; <span className="text-text">Check</span> also asks the provider. <span className="text-text">Test now</span> runs the real sign-in in a popup without creating an account or a session: the app reports what the provider sent and forgets it. Public URL <span className="font-mono text-text">{tests.data.public_url}</span>.
        </div>
      </div>
      {tests.data.methods.map((m) => (
        <MethodPanel key={m.key} m={m} highlighted={focus === m.key} />
      ))}
    </div>
  );
}

function MethodPanel({ m, highlighted }: { m: SignInTestMethod; highlighted: boolean }) {
  const refresh = useRefreshSignInTests();
  const liveCheck = useSignInLiveCheck();
  const [refreshing, setRefreshing] = useState(false);
  const network = m.live.kind === "redirect" && m.configured;
  const summary = summarizeChecks(m.checks);
  const live = liveCheck.data?.method === m.key ? liveCheck.data.checks : undefined;

  const onCheck = async () => {
    if (network) {
      liveCheck.mutate(m.key as RedirectProvider);
      return;
    }
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div id={`signin-test-${m.key}`} className={`scroll-mt-4 rounded-xl ${highlighted ? "ring-2 ring-primary/40" : ""}`}>
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${m.configured ? "bg-primary/12 text-primary" : "bg-elevated text-dim"}`}>{methodIcon(m.key)}</span>
            {m.name}
            <Badge tone={m.configured ? "ok" : "muted"} mono={false}>
              {m.configured ? "configured" : "not configured"}
            </Badge>
          </span>
        }
        meta={summary.label}
        actions={
          <Button size="sm" kind="secondary" icon={<RefreshCw size={11} />} loading={liveCheck.isPending || refreshing} onClick={() => void onCheck()}>
            Check
          </Button>
        }
      >
        <div className="grid gap-4">
          <CheckList checks={m.checks} />
          {live && (
            <div className="grid gap-2">
              <SectionTitle>Live checks</SectionTitle>
              <CheckList checks={live} />
            </div>
          )}
          <div className="grid gap-3 border-t border-hairline pt-3">
            {m.live.kind === "redirect" || m.live.kind === "ceremony" ? <RoundTrip m={m} /> : m.live.kind === "code" ? <TotpTest m={m} /> : <EmailTest m={m} />}
          </div>
          {m.id_token && (m.key === "google" || m.key === "apple") && (
            <div className="grid gap-3 border-t border-hairline pt-3">
              <IdTokenForm provider={m.key} />
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wide text-dim">{children}</div>;
}

const statusText = { ok: "text-ok", warn: "text-warn", danger: "text-danger", info: "text-info", muted: "text-dim" } as const;

function StatusIcon({ status }: { status: SignInCheck["status"] }) {
  const cls = `mt-0.5 shrink-0 ${statusText[checkTone(status)]}`;
  if (status === "ok") return <CircleCheck size={13} className={cls} aria-label="ok" />;
  if (status === "warn") return <AlertTriangle size={13} className={cls} aria-label="warning" />;
  if (status === "fail") return <CircleX size={13} className={cls} aria-label="failing" />;
  return <CircleMinus size={13} className={cls} aria-label="skipped" />;
}

function CheckList({ checks }: { checks: SignInCheck[] }) {
  if (checks.length === 0) return <div className="text-[12px] text-dim">No checks for this method.</div>;
  return (
    <ul className="grid gap-1.5">
      {checks.map((c) => (
        <li key={c.code} className="flex items-start gap-2 text-[12px]">
          <StatusIcon status={c.status} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={c.status === "skip" ? "text-muted" : "text-text"}>{c.message}</span>
              <span className="font-mono text-[10.5px] text-dim">{c.code}</span>
            </div>
            {c.fix && <div className="mt-0.5 text-muted">{c.fix}</div>}
            {((c.variables && c.variables.length > 0) || c.link) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {c.variables?.map((v) => (
                  <Badge key={v} tone="muted">
                    {v}
                  </Badge>
                ))}
                {c.link && <CheckLinkButton link={c.link} />}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CheckLinkButton({ link }: { link: CheckLink }) {
  const l = checkLinkHref(link);
  if (l.external) {
    return (
      <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] text-info hover:underline">
        {l.label} <ExternalLink size={10} />
      </a>
    );
  }
  return (
    <Link href={l.href} className="text-[11.5px] text-info hover:underline">
      {l.label} →
    </Link>
  );
}

function Rows({ rows }: { rows: { k: string; v: string }[] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[11.5px]">
      {rows.map((r) => (
        <div key={r.k} className="contents">
          <dt className="text-dim">{r.k}</dt>
          <dd className="break-all text-text">{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A finished (or pending) round trip or ID token check. */
function ResultView({ result, waiting = true }: { result: SignInTestResult; waiting?: boolean }) {
  if (result.state === "pending" && !waiting) return <div className="text-[12px] text-warn">Nothing came back before the test expired. Start it again.</div>;
  if (result.state === "pending") {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <Spinner size={12} /> Waiting for the result…
      </div>
    );
  }
  const passed = result.state === "passed";
  return (
    <div className={`grid gap-2 rounded-md border px-3 py-2 ${passed ? "border-ok/30 bg-ok/8" : result.state === "expired" ? "border-warn/30 bg-warn/8" : "border-danger/30 bg-danger/8"}`}>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {passed ? <CircleCheck size={13} className="text-ok" /> : result.state === "expired" ? <AlertTriangle size={13} className="text-warn" /> : <CircleX size={13} className="text-danger" />}
        <span className="font-medium text-text">{passed ? "Passed" : result.state === "expired" ? "Expired" : failureLabel(result.code)}</span>
        {result.code && !passed && <span className="font-mono text-[10.5px] text-dim">{result.code}</span>}
      </div>
      {!passed && result.message && <div className="text-[12px] text-text">{result.message}</div>}
      {!passed && result.fix && <div className="text-[12px] text-muted">{result.fix}</div>}
      {!passed && result.link && (
        <div>
          <CheckLinkButton link={result.link} />
        </div>
      )}
      {result.identity && <Rows rows={identityRows(result.identity)} />}
      {result.passkey && <Rows rows={passkeyRows(result.passkey)} />}
      {result.warnings && result.warnings.length > 0 && <CheckList checks={result.warnings} />}
    </div>
  );
}

function Unavailable({ m }: { m: SignInTestMethod }) {
  if (m.live.available) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
      <AlertTriangle size={12} className="shrink-0 text-warn" />
      <span>{m.live.reason ?? "The live test isn't available here."}</span>
      {m.live.link && <CheckLinkButton link={m.live.link} />}
    </div>
  );
}

/** Google, Apple, GitHub (the provider's redirect) and passkeys (a ceremony on the app's origin), in a popup. */
function RoundTrip({ m }: { m: SignInTestMethod }) {
  const [test, setTest] = useState<SignInTestStart | null>(null);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [blocked, setBlocked] = useState(false);
  const watch = useSignInTestResult(test);
  const mock = dataMode() === "mock";
  const ceremony = m.live.kind === "ceremony";

  const onTest = async () => {
    setProblem(null);
    setBlocked(false);
    setTest(null);
    // Open the window in the click itself, or popup blockers step in; mock mode never leaves the page.
    const popup = mock ? null : window.open("", POPUP_NAME, POPUP_FEATURES);
    if (popup) {
      try {
        popup.document.title = "Sign-in test";
        popup.document.body.textContent = "Starting the sign-in test…";
      } catch {
        // A window left on another origin by an earlier test: it navigates anyway.
      }
    }
    setStarting(true);
    try {
      const s = await startSignInTest(m.key as RedirectProvider | "passkeys", resultUrl(window.location.origin));
      if (popup) popup.location.href = s.url;
      else if (!mock) setBlocked(true);
      setTest(s);
    } catch (err) {
      popup?.close();
      setProblem(err);
    } finally {
      setStarting(false);
    }
  };

  const busy = starting || watch.waiting;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" kind="primary" icon={<Play size={11} />} loading={busy} disabled={!m.live.available} onClick={() => void onTest()}>
          Test now
        </Button>
        {watch.waiting && (
          <Button size="sm" kind="ghost" onClick={() => setTest(null)}>
            Stop waiting
          </Button>
        )}
        <span className="text-[11.5px] text-dim">{ceremony ? "creates a throwaway passkey in a popup" : `signs in with ${m.name} in a popup${mock && m.live.available ? " (mock mode: no popup, a pretend result)" : ""}`}</span>
      </div>
      <Unavailable m={m} />
      {m.callback_url && (
        <div className="grid gap-1 rounded-md border border-hairline bg-bg/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-muted">Callback URL</span>
            <code className="break-all font-mono text-[12px] text-text">{m.callback_url}</code>
            <span className="ml-auto">
              <CopyButton text={m.callback_url} />
            </span>
          </div>
          <div className="text-[11px] text-dim">
            Register this in the provider console. If the provider shows its own error page (for example Google&apos;s &quot;Error 400: redirect_uri_mismatch&quot;), the result never arrives here: check the registered URL matches exactly.
          </div>
        </div>
      )}
      {ceremony && (
        <div className="grid gap-2 rounded-md border border-hairline bg-bg/40 px-3 py-2 text-[12px] text-muted">
          <Rows rows={[{ k: "origin", v: m.origin ?? "" }, { k: "rp_id", v: m.rp_id ?? "" }].filter((r) => r.v)} />
          <div>
            The test creates a throwaway passkey named <span className="font-mono text-text">gorbital passkey test (safe to delete)</span> in the browser&apos;s or the operating system&apos;s password manager. The server never stores it, and the page asks the browser to forget it where that is supported; otherwise delete it from the password manager.
          </div>
        </div>
      )}
      {blocked && test && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-warn">
          <AlertTriangle size={12} /> The browser blocked the popup.
          <a href={test.url} target={POPUP_NAME} rel="opener" className="text-info hover:underline">
            Open the {ceremony ? "passkey" : "sign-in"} page
          </a>
        </div>
      )}
      {problem != null && <StartProblem error={problem} />}
      {watch.result && <ResultView result={watch.result} waiting={watch.waiting} />}
      {!watch.result && test && watch.waiting && (
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <Spinner size={12} /> Waiting for the popup to finish…
        </div>
      )}
      {!watch.waiting && test && !watch.result && watch.error != null && <StartProblem error={watch.error} />}
      {!watch.waiting && test && !watch.result && watch.error == null && <div className="text-[12px] text-warn">Nothing came back before the test expired. Start it again.</div>}
    </>
  );
}

function StartProblem({ error }: { error: unknown }) {
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-[12px]">
      <CircleX size={13} className="mt-0.5 shrink-0 text-danger" />
      <div className="min-w-0">
        <span className="text-text">{errorMessage(error)}</span>
        {code && <span className="ml-2 font-mono text-[10.5px] text-dim">{code}</span>}
      </div>
    </div>
  );
}

/** A native app's ID token (Google Sign-In, Sign in with Apple), checked as the app's token endpoint would. */
function IdTokenForm({ provider }: { provider: "google" | "apple" }) {
  const [token, setToken] = useState("");
  const [nonce, setNonce] = useState("");
  const verify = useVerifyIdToken();
  const tokenId = `id-token-${provider}`;
  const nonceId = `id-token-nonce-${provider}`;
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!token.trim()) return;
        verify.mutate({ provider, id_token: token.trim(), nonce });
        setToken("");
      }}
    >
      <SectionTitle>Verify an ID token</SectionTitle>
      <div className="text-[12px] text-muted">Paste an ID token a {provider === "google" ? "mobile app got from Google Sign-In" : "native app got from Sign in with Apple"}. The app checks the signature, issuer, audience, expiry and nonce, answers with what the token says, and keeps nothing.</div>
      <Field label="id_token" htmlFor={tokenId}>
        <Textarea id={tokenId} mono rows={3} value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJhbGciOiJSUzI1NiIs…" autoComplete="off" spellCheck={false} />
      </Field>
      <Field label="nonce" htmlFor={nonceId} hint={provider === "apple" ? "the nonce before hashing, as sent to POST /v1/auth/apple/token" : "the nonce the app passed to Google Sign-In, if any"}>
        <Input id={nonceId} mono value={nonce} onChange={(e) => setNonce(e.target.value)} autoComplete="off" spellCheck={false} />
      </Field>
      <div>
        <Button type="submit" size="sm" kind="secondary" icon={<ShieldCheck size={11} />} loading={verify.isPending} disabled={!token.trim()}>
          Verify
        </Button>
      </div>
      {verify.error && <StartProblem error={verify.error} />}
      {verify.data && !verify.isPending && <ResultView result={verify.data} />}
    </form>
  );
}

/** The authenticator app: a throwaway secret, a QR code and a code to check. */
function TotpTest({ m }: { m: SignInTestMethod }) {
  const start = useStartTotpTest();
  const verify = useVerifyTotp();
  const [test, setTest] = useState<TOTPTestStart | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<TOTPTestResult | undefined>();
  const normalized = normalizeTotpCode(code);
  const done = totpDone(result);
  // The start repeats checks the panel already shows; only new ones or changed statuses are worth a line.
  const startChecks = (test?.checks ?? []).filter((c) => !m.checks.some((x) => x.code === c.code && x.status === c.status));

  const begin = () => {
    setResult(undefined);
    setCode("");
    verify.reset();
    start.mutate(undefined, { onSuccess: (s) => setTest(s) });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" kind="primary" icon={<Play size={11} />} loading={start.isPending} disabled={!m.live.available} onClick={begin}>
          {test ? "Start over" : "Test now"}
        </Button>
        <span className="text-[11.5px] text-dim">a throwaway secret: scan it, type the code; nothing is stored and no account changes</span>
      </div>
      <Unavailable m={m} />
      {test && (
        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
          {/* A data URL from the app: next/image adds nothing here. */}
          <img src={test.qr_code} alt={`QR code for ${test.issuer}`} width={168} height={168} className="rounded-md border border-hairline bg-white p-1.5" />
          <div className="grid content-start gap-3">
            <div className="grid gap-1">
              <div className="text-[11.5px] text-muted">
                {test.issuer} · {test.account}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-[12.5px] tracking-wide text-text">{test.secret}</code>
                <CopyButton text={test.secret} label="Copy secret" />
              </div>
            </div>
            {startChecks.length > 0 && <CheckList checks={startChecks} />}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!normalized || done) return;
                verify.mutate({ id: test.id, code: normalized }, { onSuccess: (r) => setResult(r) });
              }}
            >
              <Field label="Code from the app" htmlFor={`totp-code-${m.key}`}>
                <Input id={`totp-code-${m.key}`} mono inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="w-[120px] tracking-widest" disabled={done} />
              </Field>
              <Button type="submit" size="sm" kind="secondary" loading={verify.isPending} disabled={!normalized || done}>
                Verify
              </Button>
            </form>
            {verify.error && <StartProblem error={verify.error} />}
            {result && <TotpResultView r={result} />}
          </div>
        </div>
      )}
    </>
  );
}

function TotpResultView({ r }: { r: TOTPTestResult }) {
  const h = totpHeadline(r);
  const box = h.tone === "ok" ? "border-ok/30 bg-ok/8" : h.tone === "warn" ? "border-warn/30 bg-warn/8" : "border-danger/30 bg-danger/8";
  return (
    <div className={`grid gap-1 rounded-md border px-3 py-2 text-[12px] ${box}`}>
      <div className="flex flex-wrap items-center gap-2">
        {h.tone === "ok" ? <CircleCheck size={13} className="text-ok" /> : h.tone === "warn" ? <AlertTriangle size={13} className="text-warn" /> : <CircleX size={13} className="text-danger" />}
        <span className="font-medium text-text">{h.title}</span>
        <span className="font-mono text-[10.5px] text-dim">{r.code}</span>
        {!r.passed && <span className="ml-auto text-[11px] text-dim">{r.attempts_left} {r.attempts_left === 1 ? "attempt" : "attempts"} left</span>}
      </div>
      <div className="text-text">{r.message}</div>
      {r.fix && <div className="text-muted">{r.fix}</div>}
    </div>
  );
}

/** Email codes: a test message through the configured delivery. */
function EmailTest({ m }: { m: SignInTestMethod }) {
  const [to, setTo] = useState("");
  const send = useSendPreview();
  const valid = /^[^\s@]+@[^\s@]+$/.test(to.trim());
  return (
    <>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          send.mutate({ name: "test", to: to.trim() });
        }}
      >
        <Field label="Send a test email to" htmlFor="signin-test-email">
          <Input id="signin-test-email" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" className="w-[260px]" />
        </Field>
        <Button type="submit" size="sm" kind="primary" icon={<Send size={11} />} loading={send.isPending} disabled={!valid || !m.live.available}>
          Send test email
        </Button>
      </form>
      <Unavailable m={m} />
      {send.data?.sent && !send.isPending && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ok">
          <CircleCheck size={13} /> Accepted by the configured delivery for <span className="font-mono">{send.data.to}</span>.
          <CheckLinkButton link="mail" />
        </div>
      )}
      {send.error && <StartProblem error={send.error} />}
    </>
  );
}
