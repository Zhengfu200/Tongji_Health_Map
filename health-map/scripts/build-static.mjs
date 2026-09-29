import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Export an uploadable site into out/ without changing the default build mode.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)),
  "build",
], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  env: { ...process.env, HEALTH_MAP_STATIC_EXPORT: "1" },
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
