import { describe, expect, it } from "vitest";
import { mergeTail } from "./live";

type Item = { id: string; n: number };
const key = (i: Item) => i.id;

describe("mergeTail", () => {
  it("returns the list alone when nothing arrived on the stream", () => {
    expect(mergeTail<Item>([], [{ id: "a", n: 1 }], key)).toEqual([{ id: "a", n: 1 }]);
    expect(mergeTail<Item>([], [{ id: "a", n: 1 }, { id: "b", n: 2 }], key, 1)).toEqual([{ id: "a", n: 1 }]);
  });

  it("puts the stream first, drops what the list repeats, and caps the total", () => {
    const live: Item[] = [{ id: "c", n: 3 }, { id: "b", n: 2 }];
    const list: Item[] = [{ id: "b", n: 2 }, { id: "a", n: 1 }, { id: "z", n: 0 }];
    expect(mergeTail(live, list, key).map((i) => i.id)).toEqual(["c", "b", "a", "z"]);
    expect(mergeTail(live, list, key, 3).map((i) => i.id)).toEqual(["c", "b", "a"]);
  });
});
