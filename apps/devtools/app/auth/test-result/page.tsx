import { TestResult } from "@/components/auth/test-result";

/** Where a sign-in test's popup lands (`/auth/test-result/#id=…&method=…`): it tells the opener and closes. */
export default function TestResultPage() {
  return <TestResult />;
}
