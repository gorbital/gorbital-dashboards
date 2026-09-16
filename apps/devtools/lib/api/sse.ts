/** One dispatched Server-Sent Event: `event` defaults to "message" as in the spec. */
export type SSEMessage = { event: string; data: string; id?: string; retry?: number };

/**
 * An incremental text/event-stream parser: feed it chunks as they arrive,
 * in any split, and it dispatches complete events. Comments (`: keep-alive`)
 * are dropped, multi-line `data:` fields are joined with "\n", and CRLF
 * line endings are accepted.
 */
export function createSSEParser(onMessage: (m: SSEMessage) => void) {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;

  const dispatch = () => {
    if (data.length > 0) onMessage({ event: event || "message", data: data.join("\n"), id, retry });
    event = "";
    data = [];
    retry = undefined;
  };

  const line = (l: string) => {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return;
    const colon = l.indexOf(":");
    const field = colon < 0 ? l : l.slice(0, colon);
    let value = colon < 0 ? "" : l.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    switch (field) {
      case "event":
        event = value;
        break;
      case "data":
        data.push(value);
        break;
      case "id":
        id = value;
        break;
      case "retry": {
        const n = Number(value);
        if (Number.isInteger(n) && n >= 0) retry = n;
        break;
      }
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        let l = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (l.endsWith("\r")) l = l.slice(0, -1);
        line(l);
      }
    },
    /** Flushes a final event that arrived without its trailing blank line. */
    end() {
      if (buffer) {
        line(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
        buffer = "";
      }
      dispatch();
    },
  };
}

/** Reads a response body as SSE until it ends or `signal` aborts. Resolves when the stream ends; rejects on a read error. */
export async function readSSE(body: ReadableStream<Uint8Array>, onMessage: (m: SSEMessage) => void, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    await body.cancel().catch(() => {});
    return;
  }
  const parser = createSSEParser(onMessage);
  const decoder = new TextDecoder();
  const reader = body.getReader();
  const abort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
    parser.feed(decoder.decode());
    parser.end();
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
