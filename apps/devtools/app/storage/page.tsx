import { Suspense } from "react";
import { Storage, StorageSkeleton } from "@/components/storage/storage";

/** The app's file storage (ADR-0075), from /ops/storage. The folder, the open object and the view live in the query string, so the client component reads them under Suspense. */
export default function StoragePage() {
  return (
    <Suspense fallback={<StorageSkeleton />}>
      <Storage />
    </Suspense>
  );
}
