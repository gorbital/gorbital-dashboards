"use client";

import { useCallback, useEffect, useState } from "react";
import { bucketId, isLocked, readUnlock, writeUnlock, type GuardStatus } from "@/lib/storage/guard";

/**
 * The production-bucket guard's state for the store the status describes:
 * locked until unlocked for this session; the unlock is remembered per
 * bucket in sessionStorage and read back on mount, so a reload keeps it.
 */
export function useStorageGuard(status: GuardStatus | undefined) {
  const id = status ? bucketId(status) : undefined;
  const [unlocked, setUnlockedState] = useState(false);
  useEffect(() => {
    setUnlockedState(id ? readUnlock(id) : false);
  }, [id]);
  const setUnlocked = useCallback(
    (v: boolean) => {
      if (id) writeUnlock(id, v);
      setUnlockedState(v);
    },
    [id],
  );
  return { locked: isLocked(status, unlocked), unlocked, setUnlocked };
}
