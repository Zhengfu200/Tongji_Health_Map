import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(new URL('../shared-backups-worker/.dev.vars', import.meta.url), 'utf8');
const match = source.match(/^GITHUB_TOKEN\s*=\s*(.+)$/m);
const token = match?.[1].trim().replace(/^(["'])(.*)\1$/, '$2');
if (!token?.startsWith('github_pat_')) throw new Error('Set a repository-scoped fine-grained GitHub token in shared-backups-worker/.dev.vars first.');
const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-shared-wrangler.mjs', import.meta.url)), 'secret', 'put', 'GITHUB_TOKEN', '--config', 'shared-backups-worker/wrangler.jsonc'], {
  cwd: root, input: token, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
