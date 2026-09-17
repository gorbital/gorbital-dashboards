import type { LogRecord } from "@/lib/api/logs";

/**
 * What the live tail holds: the records that arrived, newest first, and
 * the ones held back while the reader is scrolled into the list (so rows
 * don't move under the cursor), counted in the "N new records" pill.
 */
export type TailState = {
  items: LogRecord[];
  pending: LogRecord[];
  held: boolean;
  /** Records pruned past the cap. */
  dropped: number;
};

export type TailAction = { type: "record"; record: LogRecord } | { type: "hold"; held: boolean } | { type: "flush" } | { type: "clear" };

export const initialTail: TailState = { items: [], pending: [], held: false, dropped: 0 };

const cap = (list: LogRecord[], max: number) => (list.length > max ? { list: list.slice(0, max), dropped: list.length - max } : { list, dropped: 0 });

/** Applies one action; `max` bounds items and pending together, like the console's own buffer. */
export function reduceTail(state: TailState, action: TailAction, max = 1000): TailState {
  switch (action.type) {
    case "record": {
      const { record } = action;
      if (state.items.some((r) => r.id === record.id) || state.pending.some((r) => r.id === record.id)) return state;
      if (state.held) {
        const { list, dropped } = cap([record, ...state.pending], max);
        return { ...state, pending: list, dropped: state.dropped + dropped };
      }
      const { list, dropped } = cap([record, ...state.items], max);
      return { ...state, items: list, dropped: state.dropped + dropped };
    }
    case "hold":
      if (action.held === state.held) return state;
      return action.held ? { ...state, held: true } : reduceTail({ ...state, held: false }, { type: "flush" }, max);
    case "flush": {
      if (state.pending.length === 0) return state;
      const { list, dropped } = cap([...state.pending, ...state.items], max);
      return { ...state, items: list, pending: [], dropped: state.dropped + dropped };
    }
    case "clear":
      return { ...initialTail, held: state.held };
  }
}

/** The tail's records and the pages' records as one list, newest first, no record twice, at most `max`. */
export function mergeRecords(tail: LogRecord[], pages: LogRecord[], max = 2000): LogRecord[] {
  if (tail.length === 0) return pages.length > max ? pages.slice(0, max) : pages;
  const byId = new Map<number, LogRecord>();
  for (const r of pages) byId.set(r.id, r);
  for (const r of tail) byId.set(r.id, r);
  const all = [...byId.values()].sort((a, b) => b.id - a.id);
  return all.length > max ? all.slice(0, max) : all;
}
