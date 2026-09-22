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

/**
 * Whether this is the public demo at devtools.gorbital.dev, which is the
 * build that was made with mock data — not a developer who flipped
 * `localStorage.devtoolsData` on a local build, who wants the data and not
 * the demo's front door.
 *
 * The demo has no portal to sign in to, so its sign-in page is a showing of
 * the real one: the token comes filled in and going through it opens the
 * sample data.
 */
export function isDemo(): boolean {
  return process.env.NEXT_PUBLIC_DEVTOOLS_DATA === "mock";
}
