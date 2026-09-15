import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mock-data build: static export, served from `out/`.
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
  transpilePackages: ["@gorbital/dash"],
  agentRules: false,
  devIndicators: false,
};

export default nextConfig;
