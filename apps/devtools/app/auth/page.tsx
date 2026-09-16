import { Suspense } from "react";
import { Auth } from "@/components/auth/auth";

/** Accounts, sign-in methods and rate limiters, from /ops/auth. The tab and the selected account live in the query string, so the client component reads them under Suspense. */
export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <Auth />
    </Suspense>
  );
}
