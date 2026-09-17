"use client";

import { Fingerprint, KeyRound, Mail, Smartphone } from "lucide-react";
import { Badge } from "@gorbital/dash/components/badge";
import { Code, Cmt, Key } from "@gorbital/dash/components/code";
import { Panel } from "@gorbital/dash/components/panel";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { useSignInMethods, type SignInMethod } from "@/lib/api/auth";
import { ProblemPanel } from "@/components/shared/problem-panel";

const icon = (key: string) => {
  if (key === "email_password") return <Mail size={13} />;
  if (key === "authenticator_app") return <KeyRound size={13} />;
  if (key.startsWith("passkeys")) return <Fingerprint size={13} />;
  if (key.endsWith("_ios") || key.endsWith("_android")) return <Smartphone size={13} />;
  return <span className="font-mono text-[11px] uppercase">{key.slice(0, 2)}</span>;
};

/** The sign-in methods from `/ops/auth/providers`: enabled ones with how they're set up, the rest with what turns them on. */
export function Providers({ enabled, consoleDeclared }: { enabled: boolean; consoleDeclared?: boolean }) {
  const methods = useSignInMethods(enabled);
  if (methods.error && !methods.data) {
    return <ProblemPanel error={methods.error} scope="ops" console={consoleDeclared} meta="GET /ops/auth/providers" onRetry={() => void methods.refetch()} retrying={methods.isFetching} />;
  }
  const list = methods.data ?? [];
  const on = list.filter((m) => m.enabled).length;
  return (
    <Panel title="Sign-in methods" meta={methods.data ? `${on} of ${list.length} configured · /ops/auth/providers · setup steps in AUTH_PROVIDERS.md` : "/ops/auth/providers"}>
      {methods.isPending ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {list.map((m) => (
            <MethodCard key={m.key} m={m} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function MethodCard({ m }: { m: SignInMethod }) {
  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-3 ${m.enabled ? "border-border bg-elevated/60" : "border-hairline"}`}>
      <div className="flex items-start gap-2">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${m.enabled ? "bg-primary/12 text-primary" : "bg-elevated text-dim"}`}>{icon(m.key)}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium leading-tight text-text">{m.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10.5px] text-dim">{m.key}</span>
            <Badge tone={m.enabled ? "ok" : "muted"} mono={false}>
              {m.enabled ? "enabled" : "not configured"}
            </Badge>
          </div>
        </div>
      </div>
      {m.enabled && m.detail && <p className="font-mono text-[11px] text-muted">{m.detail}</p>}
      {!m.enabled && m.missing && m.missing.length > 0 && (
        <Code className="text-[11px]">
          <Cmt># .env</Cmt>
          {m.missing.map((v) => (
            <span key={v}>
              {"\n"}
              <Key>{v}</Key>=
            </span>
          ))}
        </Code>
      )}
      {!m.enabled && m.guide && <p className="font-mono text-[10.5px] text-dim">{m.guide}</p>}
    </div>
  );
}
