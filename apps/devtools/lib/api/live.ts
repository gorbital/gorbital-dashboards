"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseDevStreamEvent, subscribeSSE, type EventsStatus } from "./client";

export type LiveTail<T> = {
  /** Newest first, at most `max`. */
  items: T[];
  /** Events the console dropped because we read too slowly, and the ones we pruned past `max`. */
  dropped: number;
  connection: EventsStatus;
  clear: () => void;
};

type Options<T> = {
  /** The stream's path through the proxy, such as /_portal/app/_dev/requests/stream. */
  path: string;
  /** The SSE event name of one item: "request" or "log". */
  event: string;
  /** Subscribe only while true (the app runs, serves the console, and the tail is on). */
  enabled: boolean;
  /** How many items to keep; the console itself keeps 500 requests and 1,000 logs. */
  max?: number;
  /** Called with every item, for pages that also want to update a query cache. */
  onItem?: (item: T) => void;
};

const idle: EventsStatus = { state: "connecting", attempt: 0 };

/**
 * Follows a dev console stream: each item lands at the front of `items`.
 * The list endpoint fills the backlog; pages merge the two by a key so an
 * item that arrived on the stream and in the list shows once.
 */
export function useLiveTail<T>({ path, event, enabled, max = 1000, onItem }: Options<T>): LiveTail<T> {
  const [items, setItems] = useState<T[]>([]);
  const [dropped, setDropped] = useState(0);
  const [connection, setConnection] = useState<EventsStatus>(idle);
  const onItemRef = useRef(onItem);
  onItemRef.current = onItem;

  useEffect(() => {
    if (!enabled) {
      setConnection(idle);
      return;
    }
    const stop = subscribeSSE(
      path,
      (m) => {
        const e = parseDevStreamEvent<T>(m.event, event, m.data);
        if (!e) return;
        if (e.type === "dropped") return setDropped((d) => d + e.count);
        if (e.type !== "item") return;
        onItemRef.current?.(e.item);
        setItems((prev) => (prev.length >= max ? [e.item, ...prev.slice(0, max - 1)] : [e.item, ...prev]));
      },
      setConnection,
    );
    return stop;
  }, [path, event, enabled, max]);

  const clear = useCallback(() => {
    setItems([]);
    setDropped(0);
  }, []);

  return { items, dropped, connection, clear };
}

/** Merges the stream's items (newest first) with the list's (newest first): no duplicates, stream first, capped. */
export function mergeTail<T>(live: T[], list: T[], key: (item: T) => string, max = 1000): T[] {
  if (live.length === 0) return list.slice(0, max);
  const seen = new Set(live.map(key));
  const out = [...live];
  for (const item of list) {
    if (out.length >= max) break;
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}
