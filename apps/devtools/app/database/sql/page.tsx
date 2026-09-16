import { Suspense } from "react";
import { PageHeader } from "@gorbital/dash/components/page";
import { SkeletonLines } from "@gorbital/dash/components/spinner";
import { SqlEditor } from "@/components/sql-editor/sql-editor";

/**
 * The SQL Editor: scripts against the app's database, one transaction per
 * run. `?snippet=<name>` opens a saved query, which is why the client
 * component sits in a Suspense boundary (useSearchParams in a static export).
 */
export default function SqlEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-col">
          <PageHeader product="devtools" title="SQL Editor" crumb="Database" description="one transaction per run, rolled back unless you commit" />
          <div className="grid flex-1 grid-cols-[236px_minmax(0,1fr)] gap-3 px-6 pb-5 pt-4">
            <div className="panel p-3">
              <SkeletonLines lines={6} />
            </div>
            <div className="panel p-3">
              <SkeletonLines lines={4} />
            </div>
          </div>
        </div>
      }
    >
      <SqlEditor />
    </Suspense>
  );
}
