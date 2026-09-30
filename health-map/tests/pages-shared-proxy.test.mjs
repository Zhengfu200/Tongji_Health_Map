import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequestGet as list, onRequestPost as upload } from '../functions/api/backups/index.ts';
import { onRequestGet as detail } from '../functions/api/backups/[id].ts';
import { onRequestDelete as remove } from '../functions/api/admin/backups/[id].ts';

const page = 'https://preview.tongji-health-map.pages.dev';
const id = '01234567-89ab-4cde-8fab-0123456789ab';
const context = (request, fetcher, params = {}) => ({ request, env: { SHARED_BACKUPS: { fetch: fetcher } }, params });

test('Pages proxy rewrites only the path and preserves query, body, client IP and Worker response', async () => {
  const seen = [];
  const fetcher = async request => {
    seen.push(request);
    return Response.json({ items: [] }, { status: 200, headers: { 'Retry-After': '17' } });
  };
  const listed = await list(context(new Request(page + '/api/backups?cursor=' + id), fetcher));
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('Retry-After'), '17');
  assert.equal(new URL(seen[0].url).pathname, '/backups');
  assert.equal(new URL(seen[0].url).searchParams.get('cursor'), id);

  const posted = await upload(context(new Request(page + '/api/backups', {
    method: 'POST', headers: { Origin: page, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' }, body: '{"hello":true}',
  }), fetcher));
  assert.equal(posted.status, 200);
  assert.equal(seen[1].headers.get('CF-Connecting-IP'), '192.0.2.10');
  assert.equal(seen[1].headers.get('Origin'), 'https://tongji-health-map.pages.dev');
  assert.equal(await seen[1].text(), '{"hello":true}');

  await upload(context(new Request(page + '/api/backups', {
    method: 'POST', headers: { Origin: page, 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.20' }, body: '{}',
  }), fetcher));
  assert.equal(seen[2].headers.get('CF-Connecting-IP'), '198.51.100.20');
});

test('detail and admin delete keep their existing Worker paths and credentials', async () => {
  const seen = [];
  const fetcher = async request => { seen.push(request); return Response.json({ deleted: true }); };
  await detail(context(new Request(page + '/api/backups/' + id), fetcher, { id }));
  await remove(context(new Request(page + '/api/admin/backups/' + id, {
    method: 'DELETE', headers: { Authorization: 'Bearer test-token' },
  }), fetcher, { id }));
  assert.equal(new URL(seen[0].url).pathname, '/backups/' + id);
  assert.equal(new URL(seen[1].url).pathname, '/admin/backups/' + id);
  assert.equal(seen[1].headers.get('Authorization'), 'Bearer test-token');
});

test('cross-site Origin is rejected before the bound Worker is called', async () => {
  let calls = 0;
  const response = await upload(context(new Request(page + '/api/backups', {
    method: 'POST', headers: { Origin: 'https://foreign.example', 'Content-Type': 'application/json' }, body: '{}',
  }), async () => { calls++; return Response.json({}); }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: 'ORIGIN_DENIED' } });
  assert.equal(calls, 0);
});

test('missing binding and failed service call return explicit 503 responses', async () => {
  const request = new Request(page + '/api/backups');
  const missing = await list({ request, env: {}, params: {} });
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { error: { code: 'NOT_CONFIGURED' } });
  const failed = await list(context(request, async () => { throw Error('binding unavailable'); }));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: { code: 'UNAVAILABLE' } });
});
