import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore, handleRequest } from '../shared-backups-worker/index.ts';
import worker from '../shared-backups-worker/index.ts';
import { validateUpload, MAX_SHARED_BYTES } from '../lib/shared-backups.ts';
import { createGitHubMock, fixtureBackup, mockEnv } from './shared-github-mock.mjs';
const upload = (changes = {}) => validateUpload({ id: crypto.randomUUID(), name: '校园分享', creator: '同学 A', backup: fixtureBackup, ...changes });
function setup() { const mock = createGitHubMock(); return { mock, store: new GitHubStore(mockEnv, mock.fetcher) }; }
const request = (method = 'GET', path = '/backups', body) => new Request(`http://localhost:8787${path}`, { method, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

test('default transport calls global fetch without a store receiver, as required by Workers', async () => {
  const originalFetch = globalThis.fetch, mock = createGitHubMock();
  globalThis.fetch = function (...args) {
    assert.ok(this === undefined || this === globalThis, 'fetch must retain its global receiver');
    return mock.fetcher(...args);
  };
  try {
    assert.deepEqual((await new GitHubStore(mockEnv).list()).items, []);
  } finally { globalThis.fetch = originalFetch; }
});

test('atomic upload preserves old files, Unicode and v1 backup; repeated ID is idempotent', async () => {
  const { mock, store } = setup(), input = upload();
  const first = await store.upload(input), again = await store.upload(input);
  assert.deepEqual(again, first);
  assert.deepEqual(JSON.parse(mock.files()[`backups/${input.id}.json`]), fixtureBackup);
  assert.equal(mock.files()['README.md'], 'Preserve this file');
  assert.equal(JSON.parse(mock.files()['index.json']).items.length, 1);
  assert.equal(mock.requests.filter(r => r.path === '/git/trees').length, 1);
  assert.equal(first.places, 1); assert.equal(first.routes, 1);
  assert.deepEqual((await store.get(input.id)).backup, fixtureBackup);
  await assert.rejects(store.upload({ ...input, creator: '另一个人' }), /ID_CONFLICT/);
});
test('simultaneous uploads merge rather than overwrite; conflict retries are bounded', async () => {
  const { mock, store } = setup();
  const inputs = [upload(), upload(), upload()];
  await Promise.all(inputs.map(i => store.upload(i)));
  assert.equal(JSON.parse(mock.files()['index.json']).items.length, 3);
  for (const input of inputs) assert.ok(mock.files()[`backups/${input.id}.json`]);
  mock.conflict(4);
  await assert.rejects(store.upload(upload()), /CONFLICT/);
  assert.equal(JSON.parse(mock.files()['index.json']).items.length, 3);
  assert.ok(mock.requests.filter(r => r.method === 'PATCH').every(r => r.body.force === false));
});
test('cursor pagination has 20 items, descending timestamps and no repeats after new upload', async () => {
  const { store } = setup();
  for (let i = 0; i < 22; i++) await store.upload(upload({ name: `备份 ${i}` }));
  const first = await store.list(); assert.equal(first.items.length, 20); assert.ok(first.nextCursor);
  const second = await store.list(first.nextCursor); assert.equal(second.items.length, 2); assert.equal(second.nextCursor, undefined);
  assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 22);
  assert.ok(first.items.every((s, i) => !i || first.items[i - 1].createdAt >= s.createdAt));
  await assert.rejects(store.list(crypto.randomUUID()), /INVALID_CURSOR/);
});
test('validates coordinates, Unicode byte size, names, nonempty backups and request limits', async () => {
  assert.throws(() => upload({ name: ' ' }), /INVALID_UPLOAD/);
  assert.throws(() => upload({ creator: 'a'.repeat(41) }), /INVALID_UPLOAD/);
  assert.throws(() => upload({ backup: { ...fixtureBackup, coordinateSystem: 'WGS-84' } }), /INVALID_BACKUP/);
  assert.throws(() => upload({ backup: { ...fixtureBackup, records: [] } }), /EMPTY_BACKUP/);
  const huge = { ...fixtureBackup, records: Array.from({ length: 100 }, (_, i) => ({ ...fixtureBackup.records[0], id: String(i), description: '中'.repeat(9999) })) };
  assert.throws(() => upload({ backup: huge }), /TOO_LARGE/);
  const { store } = setup();
  const response = await handleRequest(new Request('http://localhost:8787/backups', { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: 'x'.repeat(MAX_SHARED_BYTES + 4097) }), mockEnv, store);
  assert.equal(response.status, 413);
});
test('HTTP upload, retrieval, preflight, origins and limits; failures never report success', async () => {
  const { store } = setup(), input = upload();
  assert.equal((await handleRequest(request('POST', '/backups', input), mockEnv, store)).status, 201);
  const page = await handleRequest(request(), mockEnv, store); assert.equal((await page.json()).items.length, 1);
  assert.equal(page.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal((await handleRequest(request('OPTIONS'), mockEnv, store)).status, 204);
  const denied = new Request('http://localhost:8787/backups', { headers: { Origin: 'https://evil.example' } });
  assert.equal((await handleRequest(denied, mockEnv, store)).status, 403);
  const limited = await handleRequest(request('POST', '/backups', upload()), { ...mockEnv, UPLOAD_LIMITER: { limit: async () => ({ success: false }) } }, store);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await handleRequest(request('GET', `/backups/${crypto.randomUUID()}`), mockEnv, store)).status, 404);
  for (const status of [401, 403, 429, 500]) {
    const failureStore = new GitHubStore(mockEnv, async () => new Response('{}', { status }));
    const failure = await handleRequest(request('POST', '/backups', upload()), mockEnv, failureStore);
    assert.equal(failure.status, status === 429 ? 429 : 503);
  }
  // The production adapter must not confuse Cloudflare's execution context with a store.
  const adapter = await worker.fetch(request(), { ...mockEnv, GITHUB_TOKEN: '' }, {});
  assert.equal((await adapter.json()).error.code, 'NOT_CONFIGURED');
});
