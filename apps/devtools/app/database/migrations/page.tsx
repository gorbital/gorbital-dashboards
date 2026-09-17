import { MigrationsPage } from "@/components/migrations/migrations-page";

/** Every migration file with its SQL and state; apply, roll back, redo; create an empty one. */
export default function DatabaseMigrationsPage() {
  return <MigrationsPage />;
}
