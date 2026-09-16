import { Suspense } from "react";
import { TableEditor, TableEditorSkeleton } from "@/components/table-editor/table-editor";

/** The Table Editor: every relation of the app's database, its rows in an editable grid, schema changes as migrations. The selection lives in the query string, so the client component reads it under Suspense. */
export default function TablesPage() {
  return (
    <Suspense fallback={<TableEditorSkeleton />}>
      <TableEditor />
    </Suspense>
  );
}
