import { Badge } from "@apistock/dash/components/badge";
import type { ReleaseStatus } from "@/lib/mock";

const tone = { rolling: "accent", live: "ok", succeeded: "ok", failed: "danger", "rolled back": "warn", queued: "muted" } as const;

export function StatusBadge({ status }: { status: ReleaseStatus }) {
  return (
    <Badge tone={tone[status]} className="w-[84px] justify-center">
      {status}
    </Badge>
  );
}
