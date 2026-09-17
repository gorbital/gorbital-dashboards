"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and while React hydrates, true afterwards. The page
 * sits in a Suspense boundary that hydrates after the layout, by which time
 * the layout's status query may already have data; reading it during
 * hydration would differ from the prerendered HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
