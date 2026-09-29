import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = { ...process.env };
try {
  const source = readFileSync(new URL('../.env.shared-deploy', import.meta.url), 'utf8');
  const match = source.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(.+)$/m);
  if (match) env.CLOUDFLARE_API_TOKEN = match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
env.WRANGLER_SEND_METRICS = 'false';
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
