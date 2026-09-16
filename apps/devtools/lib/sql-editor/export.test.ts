import { describe, expect, it } from "vitest";
import { exportResult, toCSV, toJSON, toMarkdown } from "./export";

const columns = ["id", "name", "note"];
const rows = [
  ["1", "Website redesign", null],
  ["2", 'He said "hi", then left', "line one\nline two"],
];

describe("toCSV", () => {
  it("quotes commas, quotes and newlines, leaves NULL empty, ends lines with CRLF", () => {
    expect(toCSV(columns, rows)).toBe('id,name,note\r\n1,Website redesign,\r\n2,"He said ""hi"", then left","line one\nline two"\r\n');
  });

  it("writes only the header for an empty result", () => {
    expect(toCSV(["a"], [])).toBe("a\r\n");
  });
});

describe("toJSON", () => {
  it("is an array of objects keyed by column, NULL as null", () => {
    expect(JSON.parse(toJSON(columns, rows))).toEqual([
      { id: "1", name: "Website redesign", note: null },
      { id: "2", name: 'He said "hi", then left', note: "line one\nline two" },
    ]);
  });
});

describe("toMarkdown", () => {
  it("renders a header, a separator and one row per line with pipes escaped", () => {
    const md = toMarkdown(["a", "b"], [["x|y", null]]);
    expect(md).toBe("| a | b |\n| --- | --- |\n| x\\|y | *NULL* |\n");
  });
});

describe("exportResult", () => {
  it("handles a statement without a result set", () => {
    expect(exportResult({ command: "UPDATE 3", rows_affected: 3 }, "csv")).toBe("\r\n");
    expect(JSON.parse(exportResult({ command: "UPDATE 3", rows_affected: 3 }, "json"))).toEqual([]);
  });
});
