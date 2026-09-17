import { Suspense } from "react";
import { SchemaPage } from "@/components/schema/schema-page";

/** The tables and their foreign keys as a diagram; `?schema=` picks the schemas (public by default). */
export default function DatabaseSchemaPage() {
  return (
    <Suspense>
      <SchemaPage />
    </Suspense>
  );
}
