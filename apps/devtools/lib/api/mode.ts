export type DataMode = "mock" | "live";

/**
 * Where the data comes from. The build sets the default with
 * NEXT_PUBLIC_DEVTOOLS_DATA (the public demo builds with "mock"); a browser
 * overrides it with localStorage.devtoolsData, which is read on every call
 * so a change takes effect on the next request.
 */
export function dataMode(): DataMode {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("devtoolsData") : null;
    if (stored === "mock" || stored === "live") return stored;
  } catch {
    // Storage can be blocked; fall through to the build's default.
  }
  return process.env.NEXT_PUBLIC_DEVTOOLS_DATA === "mock" ? "mock" : "live";
}
