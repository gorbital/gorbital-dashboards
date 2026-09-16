import { Suspense } from "react";
import { Logs, LogsSkeleton } from "@/components/logs/logs";

/** Every source, from orb dev's log store (/_portal/api/logs); the whole view lives in the query string. */
export default function LogsPage() {
  return (
    <Suspense fallback={<LogsSkeleton />}>
      <Logs />
    </Suspense>
  );
}
