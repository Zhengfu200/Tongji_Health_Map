import test from 'node:test';
import assert from 'node:assert/strict';
import { UpyunStore } from '../shared-backups-worker/upyun-store.ts';
import { handleRequest } from '../shared-backups-worker/index.ts';
import { validateBackup, parseBackup } from '../lib/model.ts';
import { MAX_PHOTO_BYTES, PHOTO_ID_PATTERN } from '../lib/photo-model.ts';
import { createUpyunMock, fixtureBackup } from './shared-upyun-mock.mjs';
import { onRequestPost } from '../functions/api/photos/index.ts';
import { onRequestGet } from '../functions/api/photos/[id].ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');
function request(body = png, changes = {}) {
  return new Request('http://localhost:8787/photos?name=campus.png', { method: 'POST',
    headers: { Origin: 'http://localhost:5173', 'Content-Type': 'image/png', ...changes }, body });
}
test('photo upload and download preserve binary bytes and signed storage headers', async () => {
  const mock = createUpyunMock(), store = new UpyunStore(mock.env, mock.fetcher);
  const response = await handleRequest(request(), mock.env, store);
  assert.equal(response.status, 201);
  const { photo } = await response.json();
  assert.match(photo.id, PHOTO_ID_PATTERN); assert.equal(photo.byteSize, png.length);
  assert.deepEqual(Buffer.from(mock.files.get('/test-bucket/photos/' + photo.id)), png);
  const put = mock.requests.at(-1);
  assert.equal(put.headers['Content-Type'], 'image/png');
  assert.equal(put.headers['x-upyun-auto-mkdir'], 'true');
  assert.ok(put.headers.Authorization.startsWith('UPYUN test-operator:'));
  const downloaded = await handleRequest(new Request('http://localhost:8787/photos/' + photo.id), mock.env, store);
  assert.equal(downloaded.status, 200); assert.equal(downloaded.headers.get('Content-Type'), 'image/png');
  assert.equal(downloaded.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
  const data = structuredClone(fixtureBackup); data.records[0].photos = [photo];
  assert.deepEqual(parseBackup(JSON.stringify(data)), validateBackup(data));
  assert.deepEqual(validateBackup(fixtureBackup), fixtureBackup);
  mock.sqlite.close();
});
test('invalid image, type, size, origin, rate limit and storage failure never claim upload success', async () => {
  const mock = createUpyunMock(), store = new UpyunStore(mock.env, mock.fetcher);
  for (const [req, status] of [[request('not a png'),400], [request(png, {'Content-Type':'image/svg+xml'}),400],
    [request(new Uint8Array(MAX_PHOTO_BYTES + 1)),413], [request(png, {Origin:'https://foreign.example'}),403], [request(png, {Origin:''}),403]]) {
    assert.equal((await handleRequest(req, mock.env, store)).status, status);
  }
  assert.equal(mock.files.size, 0);
  const denied = { ...mock.env, PHOTO_UPLOAD_LIMITER: { limit: async () => ({success:false}) } };
  assert.equal((await handleRequest(request(), denied, store)).status,429);
  mock.failPut(); assert.equal((await handleRequest(request(), mock.env, store)).status,503);
  assert.equal(mock.files.size, 0);
  for (const path of ['/photos/../../backups/anything', '/photos/not-a-uuid.png', '/photos/' + crypto.randomUUID() + '.png']) {
    assert.equal((await handleRequest(new Request('http://localhost:8787' + path), mock.env, store)).status,404);
  }
  mock.sqlite.close();
});
test('backup rejects unsafe, duplicate and oversized photo references', () => {
  const valid = {id:crypto.randomUUID()+'.png', name:'campus.png',contentType:'image/png',byteSize:png.length};
  for (const photos of [[{...valid,id:'javascript:alert(1)'}], [{...valid,contentType:'image/svg+xml'}],
    [{...valid,byteSize:MAX_PHOTO_BYTES+1}], [valid,valid], Array.from({length:7},()=>({...valid,id:crypto.randomUUID()+'.png'}))]) {
    const data = structuredClone(fixtureBackup); data.records[0].photos = photos;
    assert.throws(()=>validateBackup(data));
  }
});
test('Pages photo routes forward binary data, client IP, query and image response', async () => {
  const page = 'https://preview.tongji-health-map.pages.dev';
  const id = crypto.randomUUID()+'.png';
  const env = {SHARED_BACKUPS:{fetch:async req=>{
    assert.equal(req.headers.get('CF-Connecting-IP'),'192.0.2.1');
    if(req.method==='POST') {
      assert.equal(new URL(req.url).pathname,'/photos');
      assert.equal(new URL(req.url).searchParams.get('name'),'campus.png');
      assert.deepEqual(Buffer.from(await req.arrayBuffer()),png);
      return Response.json({photo:{id}}, {status:201});
    }
    assert.equal(new URL(req.url).pathname,'/photos/'+id);
    return new Response(png,{headers:{'Content-Type':'image/png'}});
  }}};
  const posted = await onRequestPost({env,request:new Request(page+'/api/photos?name=campus.png',{
    method:'POST',body:png,headers:{Origin:page,'CF-Connecting-IP':'192.0.2.1','Content-Type':'image/png'}})});
  assert.equal(posted.status,201);
  const got = await onRequestGet({env,params:{id},request:new Request(page+'/api/photos/'+id,{headers:{'CF-Connecting-IP':'192.0.2.1'}})});
  assert.equal(got.headers.get('Content-Type'),'image/png');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()),png);
});
