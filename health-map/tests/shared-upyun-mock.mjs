import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const fixtureBackup = {
  version: 1, coordinateSystem: 'GCJ-02', records: [
    { id: 'place-fixture', kind: 'place', category: 'fitness', nameZh: '共享运动地点', nameEn: 'Shared sports place', description: '仅用于隔离测试', updatedAt: '2026-09-29T00:00:00Z', position: [121.5016, 31.2848], address: '', hours: '', contact: '' },
    { id: 'route-fixture', kind: 'route', category: 'relaxation', nameZh: '共享步行路线', nameEn: 'Shared walk', description: '', updatedAt: '2026-09-29T00:00:00Z', points: [[121.5016, 31.2848], [121.503, 31.286]], source: 'manual', distance: 188 },
  ],
};

export function createUpyunMock() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../shared-backups-worker/migrations/0001_create_shared_backups.sql', import.meta.url), 'utf8'));
  const files = new Map(), requests = [];
  let failedPut = 0, failedGet = 0, folderExists = true;
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...params) {
          return {
            async first() { return statement.get(...params) || null; },
            async all() { return { results: statement.all(...params) }; },
            async run() { return statement.run(...params); },
          };
        },
      };
    },
  };
  async function fetcher(url, init = {}) {
    const path = new URL(url).pathname;
    const method = init.method || 'GET';
    requests.push({ method, path, headers: init.headers });
    if (!init.headers?.Authorization?.startsWith('UPYUN test-operator:')) return new Response('', { status: 401 });
    if (method === 'POST' && path === '/test-bucket/backups') {
      if (init.headers.folder !== 'true') return new Response('', { status: 400 });
      if (folderExists) return new Response('', { status: 406 });
      folderExists = true;
      return new Response('', { status: 200 });
    }
    if (method === 'PUT') {
      if (!folderExists) return new Response('', { status: 404 });
      if (failedPut) { failedPut--; return new Response('', { status: 503 }); }
      files.set(path, init.body);
      return new Response('', { status: 200 });
    }
    if (method === 'DELETE') { files.delete(path); return new Response('', { status: 200 }); }
    if (method === 'GET' && failedGet) { failedGet--; return new Response('', { status: 503 }); }
    if (!files.has(path)) return new Response('', { status: 404 });
    return new Response(method === 'HEAD' ? null : files.get(path), { status: 200 });
  }
  const env = { BACKUPS_DB: db, UPYUN_BUCKET: 'test-bucket', UPYUN_OPERATOR: 'test-operator', UPYUN_PASSWORD: 'test-only-password', ADMIN_TOKEN: 'test-admin-token', ALLOWED_ORIGINS: 'http://localhost:5173', UPLOAD_LIMITER: { limit: async () => ({ success: true }) }, PHOTO_UPLOAD_LIMITER: { limit: async () => ({ success: true }) } };
  return { env, files, requests, fetcher, sqlite, failPut(count = 1) { failedPut = count; }, failGet(count = 1) { failedGet = count; }, withoutDirectory() { folderExists = false; } };
}
