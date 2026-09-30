import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = { ...process.env };
const args = process.argv.slice(2);
if (args[0] === 'deploy' && !args.includes('--dry-run')) {
  const config = JSON.parse(readFileSync(new URL('../shared-backups-worker/wrangler.jsonc', import.meta.url), 'utf8'));
  if (!config.vars.UPYUN_BUCKET || !config.vars.UPYUN_OPERATOR || config.vars.UPYUN_OPERATOR.startsWith('REPLACE_') || !config.d1_databases?.[0]?.database_id) {
    throw new Error('Configure the Upyun bucket, operator and D1 database ID before deploying the shared Worker.');
  }
}
try {
  const source = readFileSync(new URL('../.env.shared-deploy', import.meta.url), 'utf8');
  const match = source.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(.+)$/m);
  if (match) env.CLOUDFLARE_API_TOKEN = match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
env.WRANGLER_SEND_METRICS = 'false';
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)), ...args], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
