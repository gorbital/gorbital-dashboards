/**
 * The production-bucket guard (roadmap item 76): a store that isn't on this
 * machine (`local: false`) is read-only until the developer unlocks it for
 * the session. The unlock is remembered per bucket in `sessionStorage`
 * (this tab only), every access in try/catch.
 */

export type GuardStatus = { driver: string; bucket: string; endpoint?: string; local: boolean };

/** What one unlock covers: the driver, the bucket and the endpoint together. */
export function bucketId(s: GuardStatus): string {
  return `${s.driver}:${s.bucket}@${s.endpoint ?? ""}`;
}

type StoreLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY = "devtools.storage.unlocked";

function sessionStore(): StoreLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

function readSet(store: StoreLike | undefined): Set<string> {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSet(store: StoreLike | undefined, set: Set<string>) {
  try {
    if (set.size === 0) store?.removeItem(STORAGE_KEY);
    else store?.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Storage may be unavailable; the unlock then lasts as long as the page.
  }
}

/** Whether the bucket was unlocked earlier in this session. */
export function readUnlock(id: string, store: StoreLike | undefined = sessionStore()): boolean {
  return readSet(store).has(id);
}

/** Remembers (or forgets) the unlock for this session. */
export function writeUnlock(id: string, unlocked: boolean, store: StoreLike | undefined = sessionStore()) {
  const set = readSet(store);
  if (unlocked) set.add(id);
  else set.delete(id);
  writeSet(store, set);
}

/** Read-only right now: a store elsewhere that hasn't been unlocked. A local store is never locked. */
export function isLocked(status: GuardStatus | undefined, unlocked: boolean): boolean {
  return Boolean(status && !status.local && !unlocked);
}

/** The banner's first line. */
export function guardMessage(s: GuardStatus): string {
  return `This is the ${s.driver} bucket ${s.bucket} — not on this machine.`;
}
