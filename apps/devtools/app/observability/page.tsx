import { Suspense } from "react";
import { Observability } from "@/components/observability/observability";

/** Service health, the API, the database, queries, advice, the machine, jobs and sign-ins (ADR-0073). The section lives in `?tab=`, so the client component reads it under Suspense. */
export default function ObservabilityPage() {
  return (
    <Suspense fallback={null}>
      <Observability />
    </Suspense>
  );
}
