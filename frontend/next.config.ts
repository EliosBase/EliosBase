import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // snarkjs uses file:// URLs that Turbopack can't trace
  serverExternalPackages: ['snarkjs'],
  turbopack: {},
};

export default nextConfig;
