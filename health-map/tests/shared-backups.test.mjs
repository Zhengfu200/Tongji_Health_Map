import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { UpyunStore } from '../shared-backups-worker/upyun-store.ts';
import { handleRequest } from '../shared-backups-worker/index.ts';
import { validateUpload, MAX_SHARED_BYTES } from '../lib/shared-backups.ts';
import { createUpyunMock, fixtureBackup } from './shared-upyun-mock.mjs';

const upload = (changes = {}) => validateUpload({ id: crypto.randomUUID(), name: '校园分享', creator: '同学 A', backup: fixtureBackup, ...changes });
const request = (method = 'GET', path = '/backups', body, headers = {}) => new Request('http://localhost:8787' + path, {
  method, headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
});
function setup() {
  const mock = createUpyunMock();
  return { mock, store: new UpyunStore(mock.env, mock.fetcher) };
}

test('upload stores JSON in Upyun and metadata in D1; duplicate ID is idempotent', async () => {
  const { mock, store } = setup(), input = upload();
  const first = await store.upload(input), again = await store.upload(input);
  assert.deepEqual(again, first);
  assert.deepEqual(JSON.parse(mock.files.get('/test-bucket/backups/' + input.id + '.json')), fixtureBackup);
  assert.equal(mock.sqlite.prepare("SELECT status FROM shared_backups WHERE id = ?").get(input.id).status, 'ready');
  assert.equal(mock.requests.filter(item => item.method === 'PUT').length, 1);
  assert.deepEqual((await store.get(input.id)).backup, fixtureBackup);
  await assert.rejects(store.upload({ ...input, creator: '另一个人' }), /ID_CONFLICT/);
});

test('request signing follows Upyun HMAC-SHA1 authorization format', async () => {
  const { mock, store } = setup(), input = upload();
  await store.upload(input);
  const { method, path, headers } = mock.requests[0];
  const key = createHash('md5').update(mock.env.UPYUN_PASSWORD).digest('hex');
  const signature = createHmac('sha1', key).update(method + '&' + path + '&' + headers.Date).digest('base64');
  assert.equal(headers.Authorization, 'UPYUN test-operator:' + signature);
});

test('first upload creates the Upyun backups directory when absent', async () => {
  const { mock, store } = setup(), input = upload();
  mock.withoutDirectory();
  await store.upload(input);
  assert.deepEqual(mock.requests.map(item => item.method), ['PUT', 'POST', 'PUT']);
  assert.equal(mock.files.has('/test-bucket/backups/' + input.id + '.json'), true);
});

test('pending uploads stay hidden and the same ID can resume after storage failure', async () => {
  const { mock, store } = setup(), input = upload();
  mock.failPut();
  await assert.rejects(store.upload(input), /UNAVAILABLE/);
  assert.deepEqual((await store.list()).items, []);
  const firstDate = mock.sqlite.prepare("SELECT created_at FROM shared_backups WHERE id = ?").get(input.id).created_at;
  const summary = await store.upload(input);
  assert.equal(summary.createdAt, firstDate);
  assert.deepEqual((await store.list()).items.map(item => item.id), [input.id]);
});

test('upload resumes if D1 fails after the object was stored', async () => {
  const { mock, store } = setup(), input = upload();
  let fail = true;
  const db = { prepare(sql) {
    const prepared = mock.env.BACKUPS_DB.prepare(sql);
    if (!sql.includes("SET status = 'ready'")) return prepared;
    return { bind(...params) {
      const bound = prepared.bind(...params);
      return { async run() { if (fail) { fail = false; throw new Error('D1 unavailable'); } return bound.run(); } };
    } };
  } };
  const interrupted = new UpyunStore({ ...mock.env, BACKUPS_DB: db }, mock.fetcher);
  await assert.rejects(interrupted.upload(input), /D1 unavailable/);
  assert.equal(mock.files.has('/test-bucket/backups/' + input.id + '.json'), true);
  assert.deepEqual((await store.list()).items, []);
  assert.equal((await store.upload(input)).id, input.id);
});

test('concurrent distinct uploads remain visible; pagination is stable after new uploads', async () => {
  const { store } = setup();
  const inputs = Array.from({ length: 24 }, () => upload());
  await Promise.all(inputs.map(input => store.upload(input)));
  const first = await store.list();
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  await store.upload(upload());
  const second = await store.list(first.nextCursor);
  assert.equal(second.items.length, 4);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 24);
  await assert.rejects(store.list(crypto.randomUUID()), /INVALID_CURSOR/);
});

test('HTTP routes retain validation, CORS, rate limit and JSON contract', async () => {
  const { mock, store } = setup(), input = upload();
  assert.equal((await handleRequest(request('POST', '/backups', input), mock.env, store)).status, 201);
  const page = await handleRequest(request(), mock.env, store);
  assert.equal((await page.json()).items.length, 1);
  assert.equal(page.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal((await handleRequest(request('OPTIONS'), mock.env, store)).status, 204);
  assert.equal((await handleRequest(new Request('http://localhost:8787/backups', { headers: { Origin: 'https://evil.example' } }), mock.env, store)).status, 403);
  assert.equal((await handleRequest(request('GET', '/backups?selectedId=bad'), mock.env, store)).status, 400);
  assert.equal((await handleRequest(request('GET', '/backups/' + input.id), mock.env, store)).status, 200);
  const limited = await handleRequest(request('POST', '/backups', upload()), { ...mock.env, UPLOAD_LIMITER: { limit: async () => ({ success: false }) } }, store);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
});

test('large, empty and invalid backup uploads are rejected', async () => {
  assert.throws(() => upload({ name: ' ' }), /INVALID_UPLOAD/);
  assert.throws(() => upload({ backup: { ...fixtureBackup, records: [] } }), /EMPTY_BACKUP/);
  assert.throws(() => upload({ backup: { ...fixtureBackup, coordinateSystem: 'WGS-84' } }), /INVALID_BACKUP/);
  const huge = { ...fixtureBackup, records: Array.from({ length: 100 }, (_, i) => ({ ...fixtureBackup.records[0], id: String(i), description: '中'.repeat(9999) })) };
  assert.throws(() => upload({ backup: huge }), /TOO_LARGE/);
  const { mock, store } = setup();
  const response = await handleRequest(new Request('http://localhost:8787/backups', {
    method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: 'x'.repeat(MAX_SHARED_BYTES + 4097),
  }), mock.env, store);
  assert.equal(response.status, 413);
});

test('storage and D1 failures do not return partial success', async () => {
  const { mock, store } = setup(), input = upload();
  mock.failPut();
  const failed = await handleRequest(request('POST', '/backups', input), mock.env, store);
  assert.equal(failed.status, 503);
  assert.deepEqual((await store.list()).items, []);
  const broken = new UpyunStore({ ...mock.env, BACKUPS_DB: { prepare() { throw new Error('D1 unavailable'); } } }, mock.fetcher);
  const result = await handleRequest(request(), mock.env, broken);
  assert.equal(result.status, 503);
  assert.ok((await result.json()).error);
  const invalidAuth = new UpyunStore({ ...mock.env, UPYUN_OPERATOR: 'wrong' }, async () => new Response('', { status: 401 }));
  assert.equal((await handleRequest(request('POST', '/backups', upload()), mock.env, invalidAuth)).status, 503);
});

test('admin deletion updates storage and D1; a deleted cursor can continue paging', async () => {
  const { mock, store } = setup(), inputs = Array.from({ length: 23 }, () => upload());
  for (const input of inputs) await store.upload(input);
  const first = await store.list(), cursor = first.nextCursor;
  const denied = await handleRequest(request('DELETE', '/admin/backups/' + cursor), mock.env, store);
  assert.equal(denied.status, 404);
  const deleted = await handleRequest(request('DELETE', '/admin/backups/' + cursor, undefined, { Authorization: 'Bearer test-admin-token' }), mock.env, store);
  assert.equal(deleted.status, 200);
  assert.equal(mock.files.has('/test-bucket/backups/' + cursor + '.json'), false);
  const next = await store.list(cursor, cursor);
  assert.equal(next.selectedExists, false);
  assert.equal(next.items.length, 3);
});

test('missing selected or opened file is hidden while transient storage failure retains it', async () => {
  const { mock, store } = setup(), input = upload();
  await store.upload(input);
  mock.failGet();
  await assert.rejects(store.get(input.id), /UNAVAILABLE/);
  assert.equal((await store.list()).items.length, 1);
  mock.files.delete('/test-bucket/backups/' + input.id + '.json');
  assert.equal((await store.list(undefined, input.id)).selectedExists, false);
  assert.deepEqual((await store.list()).items, []);
});

test('changed object content is rejected instead of being shown under an old summary', async () => {
  const { mock, store } = setup(), input = upload();
  await store.upload(input);
  mock.files.set('/test-bucket/backups/' + input.id + '.json', JSON.stringify({ ...fixtureBackup, records: [fixtureBackup.records[0]] }));
  await assert.rejects(store.get(input.id), /INVALID_BACKUP/);
  assert.equal((await store.list()).items.length, 1);
});
