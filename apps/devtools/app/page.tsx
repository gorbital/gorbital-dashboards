import type { Metadata } from "next";
import { demoHomeMetadata } from "@gorbital/dash/lib/seo";
import { Overview } from "@/components/overview/overview";

export const metadata: Metadata = demoHomeMetadata();

/** The bench: the app's state and output as orb dev reports them, live. Everything here reads the portal API. */
export default function OverviewPage() {
  return <Overview />;
}
