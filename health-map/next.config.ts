import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  ...(process.env.HEALTH_MAP_STATIC_EXPORT === "1"
    ? { output: "export" }
    : {}),
};

export default nextConfig;
