"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Reads one query parameter and hands it to the page. Rendered inside a
 * `<Suspense>` by the page (the static export prerenders the rest of the
 * page around it), so entity selection lives in `?id=` and never in a
 * dynamic segment.
 */
export function QueryParam({ name, onValue }: { name: string; onValue: (value: string | null) => void }) {
  const params = useSearchParams();
  const value = params.get(name);
  useEffect(() => onValue(value), [value, onValue]);
  return null;
}

/** Writes a query parameter without a navigation; `useSearchParams` follows it. */
export function setQueryParam(name: string, value: string | null | undefined) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url);
}
