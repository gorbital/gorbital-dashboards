import { describe, expect, it } from "vitest";
import { buildRunRequest, gateRun, scriptControlsTransaction, statementLabel } from "./run";

const settings = { mode: "rollback" as const, rowLimit: 500, timeoutSeconds: 30 };

describe("buildRunRequest", () => {
  it("sends the whole buffer with the mode, the limit and the timeout", () => {
    expect(buildRunRequest("SELECT 1;\nSELECT 2;", "", settings, false)).toEqual({ sql: "SELECT 1;\nSELECT 2;", mode: "rollback", row_limit: 500, timeout_seconds: 30 });
  });

  it("sends the selection when asked and there is one", () => {
    expect(buildRunRequest("SELECT 1;\nSELECT 2;", "SELECT 2;", settings, true).sql).toBe("SELECT 2;");
  });

  it("falls back to the buffer when the selection is only whitespace or the caller didn't ask", () => {
    expect(buildRunRequest("SELECT 1;", "  \n", settings, true).sql).toBe("SELECT 1;");
    expect(buildRunRequest("SELECT 1;", "SELECT 2;", settings, false).sql).toBe("SELECT 1;");
  });

  it("carries the other modes and limits through", () => {
    const req = buildRunRequest("UPDATE t SET a = 1", "", { mode: "commit", rowLimit: 10_000, timeoutSeconds: 300 }, false);
    expect(req).toMatchObject({ mode: "commit", row_limit: 10_000, timeout_seconds: 300 });
  });
});

describe("gateRun", () => {
  const warnings = [{ kind: "drop", message: "drops a database object", line: 3 }];
  it("blocks a commit until confirmed", () => {
    expect(gateRun("commit", warnings)).toBe("confirm");
  });
  it("only notes warnings when nothing is committed", () => {
    expect(gateRun("rollback", warnings)).toBe("banner");
    expect(gateRun("readonly", warnings)).toBe("banner");
  });
  it("does nothing without warnings", () => {
    expect(gateRun("commit", [])).toBe("none");
    expect(gateRun("rollback", [])).toBe("none");
  });
});

describe("scriptControlsTransaction", () => {
  it("finds BEGIN/COMMIT/ROLLBACK/END at the start of a line, any case", () => {
    expect(scriptControlsTransaction("BEGIN;\nUPDATE t SET a = 1;\ncommit;")).toBe(true);
    expect(scriptControlsTransaction("  start transaction;")).toBe(true);
    expect(scriptControlsTransaction("SELECT 1;\n  END;")).toBe(true);
  });
  it("ignores the words inside a statement", () => {
    expect(scriptControlsTransaction("SELECT CASE WHEN a THEN 1 END FROM t;")).toBe(false);
    expect(scriptControlsTransaction("SELECT * FROM commits;")).toBe(false);
  });
});

describe("statementLabel", () => {
  it("keeps the verb and the count", () => {
    expect(statementLabel("SELECT 12", 0)).toBe("SELECT 12");
    expect(statementLabel("INSERT 0 3", 0)).toBe("INSERT 3");
    expect(statementLabel("CREATE TABLE", 1)).toBe("CREATE");
    expect(statementLabel("", 2)).toBe("#3");
  });
});
