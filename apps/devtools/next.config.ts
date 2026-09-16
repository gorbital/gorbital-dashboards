import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/** Where `orb dev` serves the portal; the dev server proxies `/_portal/*` there. */
const portalUrl = (process.env.ORB_PORTAL_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");

export default function nextConfig(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // Static export, served by orb dev from `out/`. Rewrites can't be exported, so
    // the proxy to orb dev exists only while `next dev` runs.
    ...(dev ? { rewrites: async () => [{ source: "/_portal/:path*", destination: `${portalUrl}/_portal/:path*` }] } : { output: "export" }),
    trailingSlash: false,
    // The dev server is opened as localhost or 127.0.0.1 (the cookie's host decides); both may load its dev resources.
    allowedDevOrigins: ["localhost", "127.0.0.1"],
    images: { unoptimized: true },
    transpilePackages: ["@gorbital/dash"],
    agentRules: false,
    devIndicators: false,
  };
}
