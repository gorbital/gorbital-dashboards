"use client";

import { useStatus } from "@/lib/api/queries";

/** The orb version (already "v…") once the portal answers; the fallback before that and when nothing answers. */
export function PortalVersion({ fallback }: { fallback: string }) {
  const { data } = useStatus();
  return <>{data ? data.portal.version : fallback}</>;
}
