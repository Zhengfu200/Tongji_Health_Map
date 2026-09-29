import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  ...(process.env.HEALTH_MAP_STATIC_EXPORT === "1"
    ? { output: "export", turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) } }
    : {}),
};

export default nextConfig;
