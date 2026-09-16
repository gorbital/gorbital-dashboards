"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, HardDrive, Cloud } from "lucide-react";
import { Badge, Dot } from "@gorbital/dash/components/badge";
import { Segmented } from "@gorbital/dash/components/pill";
import { Skeleton } from "@gorbital/dash/components/spinner";
import { dataMode } from "@/lib/api/mode";
import { storageKeys, type StorageStatus } from "@/lib/api/storage";

const driverNames: Record<string, string> = { local: "Local disk", s3: "Amazon S3", spaces: "DigitalOcean Spaces", r2: "Cloudflare R2", minio: "MinIO" };

/** Item 73: the driver, bucket, endpoint or region, the status with its ping, the error, the public URL; a "local" badge for the development driver. */
export function DriverCard({ status, loading }: { status?: StorageStatus; loading?: boolean }) {
  const s = status;
  const ping = s ? (s.ping_ms < 1 ? `${(s.ping_ms * 1000).toFixed(0)} µs` : s.ping_ms < 100 ? `${s.ping_ms.toFixed(1)} ms` : `${Math.round(s.ping_ms)} ms`) : "";
  return (
    <section className="panel flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3">
      <Cell label="Driver">
        {s ? (
          <span className="flex items-center gap-2">
            {s.local ? <HardDrive size={13} className="text-primary" /> : <Cloud size={13} className="text-info" />}
            <span className="font-medium text-text">{driverNames[s.driver] ?? s.driver}</span>
            <span className="font-mono text-[11px] text-dim">{s.driver}</span>
            {s.local && <Badge tone="accent">local</Badge>}
          </span>
        ) : (
          <Skeleton className="h-3 w-24" />
        )}
      </Cell>
      <Cell label="Bucket">{s ? <span className="font-mono text-text">{s.bucket || "—"}</span> : <Skeleton className="h-3 w-20" />}</Cell>
      <Cell label={s?.local ? "Directory" : "Endpoint"}>
        {s ? (
          <span className="flex items-center gap-2 font-mono text-text">
            <span className="max-w-[420px] truncate" title={s.endpoint}>
              {s.endpoint || "—"}
            </span>
            {s.region && <Badge tone="muted">{s.region}</Badge>}
          </span>
        ) : (
          <Skeleton className="h-3 w-40" />
        )}
      </Cell>
      <Cell label="Status">
        {s ? (
          <span className="flex items-center gap-2">
            <Dot tone={s.status === "ok" ? "ok" : "danger"} pulse={s.status === "ok"} />
            <span className={s.status === "ok" ? "text-ok" : "text-danger"}>{s.status}</span>
            <span className="font-mono text-[11px] text-dim tnum">{ping}</span>
          </span>
        ) : (
          <Skeleton className="h-3 w-16" />
        )}
      </Cell>
      {s?.error && (
        <Cell label="Error">
          <span className="font-mono text-[11.5px] text-danger">{s.error}</span>
        </Cell>
      )}
      {s?.public_url && (
        <Cell label="Public URL">
          <a href={s.public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11.5px] text-text hover:text-primary">
            {s.public_url}
            <ExternalLink size={11} className="text-dim" />
          </a>
        </Cell>
      )}
      {loading && s && <Skeleton className="h-2 w-2" rounded="rounded-full" />}
      <MockProfileSwitch current={s?.driver} />
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">{label}</span>
      <span className="text-[12px]">{children}</span>
    </div>
  );
}

/** Mock mode only: switch the in-memory store between the local directory and a Spaces bucket, to see the guard. */
function MockProfileSwitch({ current }: { current?: string }) {
  const qc = useQueryClient();
  if (dataMode() !== "mock") return null;
  const value = current === "spaces" ? "spaces" : "local";
  return (
    <div className="ml-auto flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">mock</span>
      <Segmented<"local" | "spaces">
        value={value}
        options={[
          { value: "local", label: "local" },
          { value: "spaces", label: "spaces" },
        ]}
        onChange={async (p) => {
          const m = await import("@/lib/api/mock/storage");
          m.setMockStorageProfile(p);
          void qc.invalidateQueries({ queryKey: storageKeys.all });
        }}
      />
    </div>
  );
}
