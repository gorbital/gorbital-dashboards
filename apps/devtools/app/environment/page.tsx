import { Environment } from "@/components/environment/environment";

/** The app's .env against .env.example, edited in place by orb dev (/_portal/api/env), joined with what the running app read (/_dev/config). */
export default function EnvironmentPage() {
  return <Environment />;
}
