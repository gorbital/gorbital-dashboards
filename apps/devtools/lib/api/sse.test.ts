import { describe, expect, it } from "vitest";
import { createSSEParser, readSSE, type SSEMessage } from "./sse";

const collect = () => {
  const out: SSEMessage[] = [];
  return { out, parser: createSSEParser((m) => out.push(m)) };
};

describe("createSSEParser", () => {
  it("dispatches events however the chunks are split", () => {
    const { out, parser } = collect();
    const text = 'retry: 3000\n\nevent: state\ndata: {"state":"running"}\n\nevent: output\ndata: {"a":1}\n\n';
    for (let i = 0; i < text.length; i += 7) parser.feed(text.slice(i, i + 7));
    expect(out).toEqual([
      { event: "state", data: '{"state":"running"}', id: undefined, retry: undefined },
      { event: "output", data: '{"a":1}', id: undefined, retry: undefined },
    ]);
  });

  it("drops keep-alive comments and keeps retry with its event", () => {
    const { out, parser } = collect();
    parser.feed(': keep-alive\n\n: another\n\nretry: 500\nevent: end\ndata: {"reason":"max_duration"}\n\n');
    expect(out).toEqual([{ event: "end", data: '{"reason":"max_duration"}', id: undefined, retry: 500 }]);
  });

  it("joins multi-line data and accepts CRLF", () => {
    const { out, parser } = collect();
    parser.feed("data: one\r\ndata: two\r\n\r\n");
    parser.feed("data:no-space\n\n");
    expect(out.map((m) => m.data)).toEqual(["one\ntwo", "no-space"]);
    expect(out[0].event).toBe("message");
  });

  it("flushes a trailing event without its blank line on end()", () => {
    const { out, parser } = collect();
    parser.feed("event: state\ndata: {}");
    expect(out).toHaveLength(0);
    parser.end();
    expect(out).toEqual([{ event: "state", data: "{}", id: undefined, retry: undefined }]);
  });
});

describe("readSSE", () => {
  it("reads a body to its end", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode("event: a\nda"));
        c.enqueue(enc.encode("ta: 1\n\nevent: b\ndata: 2\n\n"));
        c.close();
      },
    });
    const out: SSEMessage[] = [];
    await readSSE(body, (m) => out.push(m));
    expect(out.map((m) => `${m.event}=${m.data}`)).toEqual(["a=1", "b=2"]);
  });
});
