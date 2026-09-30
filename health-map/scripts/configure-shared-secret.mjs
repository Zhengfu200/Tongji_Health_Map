import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(new URL('../shared-backups-worker/.dev.vars', import.meta.url), 'utf8');
const secrets = ['UPYUN_PASSWORD', 'ADMIN_TOKEN'].map(name => {
  const match = source.match(new RegExp('^' + name + '\\s*=\\s*(.+)$', 'm'));
  const value = match?.[1].trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!value || value.startsWith('replace-with-') || (name === 'ADMIN_TOKEN' && value.length < 32)) {
    throw new Error('Set ' + name + ' in shared-backups-worker/.dev.vars first (ADMIN_TOKEN: at least 32 characters).');
  }
  return { name, value };
});
for (const { name, value } of secrets) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-shared-wrangler.mjs', import.meta.url)), 'secret', 'put', name, '--config', 'shared-backups-worker/wrangler.jsonc'], {
    cwd: root, input: value, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
