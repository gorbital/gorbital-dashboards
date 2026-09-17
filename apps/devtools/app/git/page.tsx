import { Suspense } from "react";
import { GitScreen } from "@/components/git/git";

/** The app's repository through the developer's own git (ADR-0076): status, changes and diffs, commits, branches, merges, the log. The tab and the selected file live in the query string, so the client component reads them under Suspense. */
export default function GitPage() {
  return (
    <Suspense fallback={null}>
      <GitScreen />
    </Suspense>
  );
}
