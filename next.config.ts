import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parsing runs in the server process; these load native/huge code at runtime
  // rather than being bundled.
  serverExternalPackages: ["ts-morph", "tar"],
};

export default nextConfig;
