"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@gorbital/dash/components/button";
import { Field, Input, Select } from "@gorbital/dash/components/input";
import { Empty, Panel } from "@gorbital/dash/components/panel";
import { Table } from "@gorbital/dash/components/table";
import { useRateLimiters, useResetRateLimit, type RateLimiter } from "@/lib/api/auth";
import { limiterKeyExample } from "@/lib/auth";
import { ProblemPanel } from "@/components/shared/problem-panel";

/** The app's rate limiters and a form that forgets one key's budget. */
export function RateLimits({ enabled, consoleDeclared }: { enabled: boolean; consoleDeclared?: boolean }) {
  const limiters = useRateLimiters(enabled);
  const reset = useResetRateLimit();
  const list = limiters.data ?? [];
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  useEffect(() => {
    if (!name && list.length > 0) setName(list[0].name);
  }, [list, name]);
  const limiter = list.find((l) => l.name === name);
  const submit = () => {
    if (!name || !key.trim()) return;
    reset.mutate({ name, key: key.trim() }, { onSuccess: () => setKey("") });
  };
  if (limiters.error && !limiters.data) {
    return <ProblemPanel error={limiters.error} scope="ops" console={consoleDeclared} meta="GET /ops/auth/rate-limits" onRetry={() => void limiters.refetch()} retrying={limiters.isFetching} />;
  }
  return (
    <div className="grid gap-3">
      <Panel title="Reset a budget" meta="POST /ops/auth/rate-limits/reset · audited as ops.rate_limit.reset, naming the limiter only">
        <form
          className="grid grid-cols-[220px_minmax(0,1fr)_auto] items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Limiter" htmlFor="rl-name">
            <Select id="rl-name" value={name} onChange={(e) => setName(e.target.value)} disabled={list.length === 0}>
              {list.length === 0 && <option value="">none</option>}
              {list.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Key" htmlFor="rl-key" hint={limiter ? `${limiter.keys} · the next request from that key counts as its first` : undefined}>
            <Input id="rl-key" mono value={key} onChange={(e) => setKey(e.target.value)} placeholder={limiter ? limiterKeyExample(limiter) : "key"} autoComplete="off" spellCheck={false} />
          </Field>
          <Button type="submit" size="sm" kind="primary" icon={<RotateCcw size={11} />} disabled={!name || !key.trim()} loading={reset.isPending} className="mt-[22px]">
            Reset
          </Button>
        </form>
      </Panel>
      <Panel title="Limiters" meta="keys are stored hashed, so budgets can't be listed · /ops/auth/rate-limits" flush>
        <Table<RateLimiter>
          rows={list}
          rowKey={(l) => l.name}
          loading={limiters.isPending}
          dense
          selected={name || undefined}
          onRowClick={(l) => setName(l.name)}
          columns={[
            { key: "n", header: "Limiter", width: "160px", cell: (l) => <span className="font-mono text-text">{l.name}</span> },
            { key: "k", header: "Key", width: "220px", cell: (l) => <span className="text-muted">{l.keys}</span> },
            { key: "d", header: "Limits", cell: (l) => <span className="text-dim">{l.description}</span> },
            {
              key: "a",
              header: "",
              width: "80px",
              align: "right",
              cell: (l) => (
                <Button size="sm" kind="ghost" icon={<RotateCcw size={11} />} onClick={() => setName(l.name)}>
                  Reset…
                </Button>
              ),
            },
          ]}
          empty={<Empty title="No rate limiters" hint="The app declares none, or runs without the rate limit store." />}
        />
      </Panel>
    </div>
  );
}
