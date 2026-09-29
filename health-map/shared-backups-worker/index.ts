import { MAX_SHARED_BYTES, SHARED_PAGE_SIZE, UUID_PATTERN, SharedError, validateSummary, validateUpload, type SharedSummary, type SharedUpload } from '../lib/shared-backups';
import { validateBackup } from '../lib/model';

type Fetcher = typeof fetch;
type Index = { version: 1; items: SharedSummary[] };
const INDEX_LIMIT = 4 * 1024 * 1024;
const TREE_LIMIT = 8 * 1024 * 1024;
async function boundedText(response: Response | Request, limit: number) {
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
  return new TextDecoder().decode(bytes);
}
export class GitHubStore {
  constructor(private env: Pick<SharedBackupsEnv, 'GITHUB_OWNER' | 'GITHUB_REPO' | 'GITHUB_BRANCH' | 'GITHUB_TOKEN'>, private fetcher: Fetcher = (...args) => fetch(...args)) {}
  private async call(path: string, method = 'GET', data?: unknown, raw = false): Promise<Response> {
    if (!this.env.GITHUB_TOKEN) throw new SharedError('NOT_CONFIGURED', 503);
    const response = await this.fetcher(`https://api.github.com/repos/${encodeURIComponent(this.env.GITHUB_OWNER)}/${encodeURIComponent(this.env.GITHUB_REPO)}${path}`, {
      method, headers: { Authorization: `Bearer ${this.env.GITHUB_TOKEN}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'tongji-health-map-backups', 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return response;
    const retry = response.headers.get('retry-after');
    if (response.status === 429 || (response.status === 403 && (retry || response.headers.get('x-ratelimit-remaining') === '0'))) throw new SharedError('RATE_LIMITED', 429, retry || '60');
    if (response.status === 401 || response.status === 403) throw new SharedError('GITHUB_AUTH', 503);
    if (response.status === 409 || response.status === 422) throw new SharedError('CONFLICT', 409);
    if (response.status === 404) throw new SharedError('NOT_FOUND', 404);
    throw new SharedError('UNAVAILABLE', 503);
  }
  private async json<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
    return JSON.parse(await boundedText(await this.call(path, method, data), INDEX_LIMIT)) as T;
  }
  private async file(path: string, ref: string, limit: number) {
    return JSON.parse(await boundedText(await this.call(`/contents/${path}?ref=${encodeURIComponent(ref)}`, 'GET', undefined, true), limit));
  }
  private async head() {
    const ref = await this.json<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(this.env.GITHUB_BRANCH)}`);
    const commit = await this.json<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    return { sha: ref.object.sha, tree: commit.tree.sha };
  }
  private async index(ref: string): Promise<Index> {
    const index = await this.file('index.json', ref, INDEX_LIMIT) as Index;
    if (index.version !== 1 || !Array.isArray(index.items)) throw new SharedError('INVALID_INDEX', 503);
    const items = index.items.map(validateSummary);
    if (new Set(items.map(i => i.id)).size !== items.length) throw new SharedError('INVALID_INDEX', 503);
    return { version: 1, items };
  }
  private async backupFiles(ref: string) {
    const response = await this.call(`/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    let result;
    try { result = JSON.parse(await boundedText(response, TREE_LIMIT)); }
    catch { throw new SharedError('INVALID_TREE', 503); }
    if (result?.truncated !== false || !Array.isArray(result.tree)) throw new SharedError('INVALID_TREE', 503);
    const files = new Set<string>();
    for (const entry of result.tree) {
      if (!entry || typeof entry.path !== 'string' || !['blob', 'tree', 'commit'].includes(entry.type)
        || !['100644', '100755', '040000', '160000', '120000'].includes(entry.mode)) throw new SharedError('INVALID_TREE', 503);
      if (entry.type === 'blob' && ['100644', '100755'].includes(entry.mode)) files.add(entry.path);
    }
    return files;
  }
  async list(cursor?: string, selectedId?: string) {
    const ref = await this.json<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(this.env.GITHUB_BRANCH)}`);
    const [index, files] = await Promise.all([this.index(ref.object.sha), this.backupFiles(ref.object.sha)]);
    const items = index.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    // Cursor is the last item, so new uploads cannot shift a subsequent page.
    const position = cursor ? items.findIndex(i => i.id === cursor) : -1;
    if (cursor && position < 0) throw new SharedError('INVALID_CURSOR');
    const exists = (item: SharedSummary) => files.has(`backups/${item.id}.json`);
    const remaining = items.slice(position + 1).filter(exists);
    const page = remaining.slice(0, SHARED_PAGE_SIZE);
    return { items: page, ...(remaining.length > page.length ? { nextCursor: page.at(-1)?.id } : {}),
      ...(selectedId ? { selectedExists: items.some(item => item.id === selectedId && exists(item)) } : {}) };
  }
  async get(id: string) {
    const head = await this.head();
    const index = await this.index(head.sha);
    const summary = index.items.find(i => i.id === id);
    if (!summary) throw new SharedError('NOT_FOUND', 404);
    const backup = validateBackup(await this.file(`backups/${id}.json`, head.sha, MAX_SHARED_BYTES));
    return { summary, backup };
  }
  async upload(input: SharedUpload) {
    const payload = JSON.stringify(input.backup);
    const summary: SharedSummary = { id: input.id, name: input.name, creator: input.creator, createdAt: new Date().toISOString(), places: input.backup.records.filter(r => r.kind === 'place').length, routes: input.backup.records.filter(r => r.kind === 'route').length, byteSize: new TextEncoder().encode(payload).byteLength };
    for (let attempt = 0; attempt < 4; attempt++) {
      const head = await this.head();
      const index = await this.index(head.sha);
      const existing = index.items.find(i => i.id === input.id);
      if (existing) {
        const saved = validateBackup(await this.file(`backups/${input.id}.json`, head.sha, MAX_SHARED_BYTES));
        if (existing.name !== input.name || existing.creator !== input.creator || JSON.stringify(saved) !== payload) throw new SharedError('ID_CONFLICT', 409);
        return existing;
      }
      index.items.push(summary);
      const indexText = JSON.stringify(index);
      if (new TextEncoder().encode(indexText).byteLength > INDEX_LIMIT) throw new SharedError('INDEX_FULL', 503);
      const tree = await this.json<{ sha: string }>('/git/trees', 'POST', { base_tree: head.tree, tree: [
        { path: `backups/${input.id}.json`, mode: '100644', type: 'blob', content: payload },
        { path: 'index.json', mode: '100644', type: 'blob', content: indexText },
      ] });
      const commit = await this.json<{ sha: string }>('/git/commits', 'POST', { message: `Add shared backup ${input.id}`, tree: tree.sha, parents: [head.sha] });
      try {
        await this.call(`/git/refs/heads/${encodeURIComponent(this.env.GITHUB_BRANCH)}`, 'PATCH', { sha: commit.sha, force: false });
        return summary;
      } catch (error) {
        if (!(error instanceof SharedError) || error.code !== 'CONFLICT' || attempt === 3) throw error;
        // Retry only an actual advancing head, not validation failures.
        if ((await this.head()).sha === head.sha) throw error;
      }
    }
    throw new SharedError('CONFLICT', 409);
  }
}
export async function handleRequest(request: Request, env: SharedBackupsEnv, store = new GitHubStore(env)): Promise<Response> {
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
      const text = await boundedText(request, MAX_SHARED_BYTES + 4096);
      try { parsed = JSON.parse(text); } catch { throw new SharedError('INVALID_UPLOAD'); }
      const summary = await store.upload(validateUpload(parsed));
      return Response.json({ summary }, { status: 201, headers });
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
export default { fetch(request: Request, env: SharedBackupsEnv) { return handleRequest(request, env); } };
