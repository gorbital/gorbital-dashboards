import { Suspense } from "react";
import { ObjectsPage } from "@/components/db-objects/objects-page";

/** Functions, triggers, enums, extensions, indexes and views; `?tab=` and `?schema=` pick what to show. */
export default function DatabaseObjectsPage() {
  return (
    <Suspense>
      <ObjectsPage />
    </Suspense>
  );
}
