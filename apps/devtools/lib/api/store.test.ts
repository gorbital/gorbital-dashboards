import { beforeEach, describe, expect, it } from "vitest";
import { MAX_LINES, consoleStore, mergeLines } from "./store";
import type { OutputLine } from "./types";

const line = (ms: number, text: string, stream: OutputLine["stream"] = "app"): OutputLine => ({ time: new Date(Date.UTC(2026, 8, 15, 14, 0, 0, ms)).toISOString(), stream, text });

describe("mergeLines", () => {
  it("adds only lines it hasn't seen, ordered by time", () => {
    const existing = [line(300, "c"), line(500, "e")];
    const fetched = [line(100, "a"), line(300, "c"), line(400, "d")];
    expect(mergeLines(existing, fetched).map((l) => l.text)).toEqual(["a", "c", "d", "e"]);
  });

  it("returns the same array when nothing is new", () => {
    const existing = [line(1, "a")];
    expect(mergeLines(existing, [line(1, "a")])).toBe(existing);
  });

  it("keeps the newest MAX_LINES", () => {
    const many = Array.from({ length: MAX_LINES + 10 }, (_, i) => line(i, `l${i}`));
    const merged = mergeLines([], many);
    expect(merged).toHaveLength(MAX_LINES);
    expect(merged.at(-1)?.text).toBe(`l${MAX_LINES + 9}`);
  });
});

describe("consoleStore", () => {
  beforeEach(() => consoleStore.reset());

  it("tracks state, output and dropped events", () => {
    consoleStore.push({ type: "state", time: "t", state: { state: "running", addr: "", url: "", restarts: 0, console: true } });
    consoleStore.push({ type: "output", time: "t", output: line(1, "hi") });
    consoleStore.push({ type: "dropped", time: "t", count: 4 });
    const s = consoleStore.getSnapshot();
    expect(s.app?.state).toBe("running");
    expect(s.lines.map((l) => l.text)).toEqual(["hi"]);
    expect(s.dropped).toBe(4);
    consoleStore.clear();
    expect(consoleStore.getSnapshot().lines).toEqual([]);
    expect(consoleStore.getSnapshot().app?.state).toBe("running");
  });
});
