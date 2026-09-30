import { MAX_SHARED_BYTES, UUID_PATTERN, SharedError, validateUpload } from '../lib/shared-backups';
import { UpyunStore } from './upyun-store';
import { MAX_PHOTO_BYTES, PHOTO_TYPES, PHOTO_ID_PATTERN, type PhotoType } from '../lib/photo-model';

async function boundedBytes(response: Response | Request, limit: number) {
  if (Number(response.headers.get('content-length')) > limit) throw new SharedError('TOO_LARGE', 413);
  if (!response.body) throw new SharedError('INVALID_UPLOAD');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new SharedError('TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function handleRequest(request: Request, env: SharedBackupsEnv, store = new UpyunStore(env)): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
  if (origin && allowed.includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Expose-Headers', 'Retry-After');
  try {
    if (origin && !allowed.includes(origin)) throw new SharedError('ORIGIN_DENIED', 403);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); headers.set('Access-Control-Allow-Headers', 'Content-Type'); headers.set('Access-Control-Max-Age', '600');
      return new Response(null, { status: 204, headers });
    }
    const url = new URL(request.url);
    if (url.pathname === '/photos' && request.method === 'POST') {
      if (!origin) throw new SharedError('ORIGIN_REQUIRED', 403);
      if (!(await env.PHOTO_UPLOAD_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' })).success) throw new SharedError('RATE_LIMITED', 429, '60');
      const contentType = request.headers.get('Content-Type') || '';
      if (!Object.hasOwn(PHOTO_TYPES, contentType)) throw new SharedError('PHOTO_TYPE');
      const name = url.searchParams.get('name')?.trim();
      if (!name || name.length > 160) throw new SharedError('INVALID_UPLOAD');
      const bytes = await boundedBytes(request, MAX_PHOTO_BYTES);
      return Response.json({ photo: await store.uploadPhoto(bytes, contentType as PhotoType, name) }, { status: 201, headers });
    }
    const photo = url.pathname.match(/^\/photos\/([^/]+)$/);
    if (photo && request.method === 'GET') {
      if (!PHOTO_ID_PATTERN.test(photo[1])) throw new SharedError('NOT_FOUND', 404);
      const response = await store.getPhoto(photo[1]);
      for (const key of ['Access-Control-Allow-Origin', 'Vary']) {
        const value = headers.get(key); if (value) response.headers.set(key, value);
      }
      return response;
    }
    if (url.pathname === '/backups' && request.method === 'GET') {
      const cursor = url.searchParams.get('cursor') || undefined;
      if (cursor && !UUID_PATTERN.test(cursor)) throw new SharedError('INVALID_CURSOR');
      const selectedId = url.searchParams.get('selectedId');
      if (selectedId !== null && !UUID_PATTERN.test(selectedId)) throw new SharedError('INVALID_UPLOAD');
      return Response.json(await store.list(cursor?.toLowerCase(), selectedId?.toLowerCase()), { headers });
    }
    if (url.pathname === '/backups' && request.method === 'POST') {
      if (!origin) throw new SharedError('ORIGIN_REQUIRED', 403);
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!(await env.UPLOAD_LIMITER.limit({ key: ip })).success) throw new SharedError('RATE_LIMITED', 429, '60');
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SharedError('INVALID_UPLOAD');
      let parsed: unknown;
      const text = new TextDecoder().decode(await boundedBytes(request, MAX_SHARED_BYTES + 4096));
      try { parsed = JSON.parse(text); } catch { throw new SharedError('INVALID_UPLOAD'); }
      const summary = await store.upload(validateUpload(parsed));
      return Response.json({ summary }, { status: 201, headers });
    }
    const admin = url.pathname.match(/^\/admin\/backups\/([^/]+)$/);
    if (admin && request.method === 'DELETE') {
      if (!UUID_PATTERN.test(admin[1])) throw new SharedError('NOT_FOUND', 404);
      await store.remove(admin[1].toLowerCase(), request.headers.get('Authorization'));
      return Response.json({ deleted: true }, { headers });
    }
    const match = url.pathname.match(/^\/backups\/([^/]+)$/);
    if (match && request.method === 'GET') {
      if (!UUID_PATTERN.test(match[1])) throw new SharedError('NOT_FOUND', 404);
      return Response.json(await store.get(match[1].toLowerCase()), { headers });
    }
    throw new SharedError('NOT_FOUND', 404);
  } catch (error) {
    const problem = error instanceof SharedError ? error : new SharedError('UNAVAILABLE', 503);
    if (problem.status >= 500) console.error(JSON.stringify({ event: 'shared_backup_error', code: problem.code }));
    if (problem.retryAfter) headers.set('Retry-After', problem.retryAfter);
    return Response.json({ error: { code: problem.code } }, { status: problem.status, headers });
  }
}
const worker = { fetch(request: Request, env: SharedBackupsEnv) { return handleRequest(request, env); } };
export default worker;
