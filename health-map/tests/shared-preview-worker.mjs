// Browser-only fixture. Uses local D1 and in-memory storage; never calls Upyun.
import { UpyunStore } from '../shared-backups-worker/upyun-store.ts';
import { handleRequest } from '../shared-backups-worker/index.ts';
import { UUID_PATTERN } from '../lib/shared-backups.ts';

const files = new Map();
async function fakeUpyun(url, init) {
  const path = new URL(url).pathname;
  if (init.method === 'PUT') { files.set(path, init.body); return new Response('', { status: 200 }); }
  if (init.method === 'DELETE') { files.delete(path); return new Response('', { status: 200 }); }
  if (!files.has(path)) return new Response('', { status: 404 });
  return new Response(init.method === 'HEAD' ? null : files.get(path), { status: 200 });
}
const previewWorker = {
  fetch(request, env) {
    const match = new URL(request.url).pathname.match(/^\/__test\/backups\/([^/]+)\/delete-file$/);
    if (match && request.method === 'POST') {
      if (request.headers.get('Origin') && request.headers.get('Origin') !== 'http://localhost:5173') return Response.json({}, { status: 403 });
      if (!UUID_PATTERN.test(match[1])) return Response.json({}, { status: 400 });
      files.delete('/test-bucket/backups/' + match[1].toLowerCase() + '.json');
      return Response.json({ deleted: true }, { headers: { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Cache-Control': 'no-store' } });
    }
    return handleRequest(request, env, new UpyunStore(env, fakeUpyun));
  },
};
export default previewWorker;
