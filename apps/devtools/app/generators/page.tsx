import { Suspense } from "react";
import { Generators } from "@/components/generators/generators";

/** Every generator with a form and a diff preview (ADR-0077). `?generator=` opens a card's sheet, so the client component reads it under Suspense. */
export default function GeneratorsPage() {
  return (
    <Suspense fallback={null}>
      <Generators />
    </Suspense>
  );
}
