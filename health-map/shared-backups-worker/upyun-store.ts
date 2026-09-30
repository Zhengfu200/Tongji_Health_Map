import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { MAX_SHARED_BYTES, SHARED_PAGE_SIZE, SharedError, validateSummary, type SharedSummary, type SharedUpload } from '../lib/shared-backups';
import { validateBackup } from '../lib/model';

type Fetcher = typeof fetch;
type Row = { id: string; name: string; creator: string; created_at: string; places: number; routes: number; byte_size: number; sha256: string; status: 'pending' | 'ready' | 'deleted' };
type StoreEnv = Pick<SharedBackupsEnv, 'BACKUPS_DB' | 'UPYUN_BUCKET' | 'UPYUN_OPERATOR' | 'UPYUN_PASSWORD' | 'ADMIN_TOKEN'>;
const pathFor = (id: string) => 'backups/' + id + '.json';
const rowSql = 'SELECT id,name,creator,created_at,places,routes,byte_size,sha256,status FROM shared_backups';

function summary(row: Row): SharedSummary {
  return validateSummary({ id: row.id, name: row.name, creator: row.creator, createdAt: row.created_at, places: row.places, routes: row.routes, byteSize: row.byte_size });
}
async function boundedJson(response: Response, expectedHash: string) {
  if (Number(response.headers.get('content-length')) > MAX_SHARED_BYTES) throw new SharedError('TOO_LARGE', 413);
  if (!response.body) throw new SharedError('INVALID_BACKUP', 503);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_SHARED_BYTES) { await reader.cancel(); throw new SharedError('TOO_LARGE', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new SharedError('INVALID_BACKUP', 503);
  try { return validateBackup(JSON.parse(new TextDecoder().decode(bytes))); }
  catch { throw new SharedError('INVALID_BACKUP', 503); }
}

export class UpyunStore {
  constructor(private env: StoreEnv, private fetcher: Fetcher = (...args) => fetch(...args)) {}
  private db() {
    if (!this.env.BACKUPS_DB) throw new SharedError('NOT_CONFIGURED', 503);
    return this.env.BACKUPS_DB;
  }
  private async row(id: string) {
    return this.db().prepare(rowSql + ' WHERE id = ?').bind(id).first<Row>();
  }
  private async callUpyun(method: 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'POST', path: string, body?: string) {
    if (!this.env.UPYUN_BUCKET || !this.env.UPYUN_OPERATOR || !this.env.UPYUN_PASSWORD) throw new SharedError('NOT_CONFIGURED', 503);
    const uri = '/' + this.env.UPYUN_BUCKET + '/' + path;
    const date = new Date().toUTCString();
    const key = createHash('md5').update(this.env.UPYUN_PASSWORD).digest('hex');
    const signature = createHmac('sha1', key).update(method + '&' + uri + '&' + date).digest('base64');
    let response: Response;
    try {
      response = await this.fetcher('https://v0.api.upyun.com' + uri, {
        method,
        headers: { Authorization: 'UPYUN ' + this.env.UPYUN_OPERATOR + ':' + signature, Date: date, ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...(method === 'POST' ? { folder: 'true' } : {}) },
        ...(body ? { body } : {}), redirect: 'manual', signal: AbortSignal.timeout(15000),
      });
    } catch { throw new SharedError('UNAVAILABLE', 503); }
    if (response.ok || response.status === 404 || (method === 'POST' && response.status === 406)) return response;
    if (response.status === 401 || response.status === 403) throw new SharedError('UPYUN_AUTH', 503);
    if (response.status === 429) throw new SharedError('RATE_LIMITED', 429, response.headers.get('retry-after') || '60');
    throw new SharedError('UNAVAILABLE', 503);
  }
  private upyun(method: 'GET' | 'HEAD' | 'PUT' | 'DELETE', id: string, body?: string) {
    return this.callUpyun(method, pathFor(id), body);
  }
  private async exists(id: string) {
    const response = await this.upyun('HEAD', id);
    return response.status !== 404;
  }
  private async markDeleted(id: string) {
    await this.db().prepare("UPDATE shared_backups SET status = 'deleted' WHERE id = ? AND status = 'ready'").bind(id).run();
  }
  async list(cursor?: string, selectedId?: string) {
    let selectedExists: boolean | undefined;
    if (selectedId) {
      const selected = await this.row(selectedId);
      selectedExists = selected?.status === 'ready' && await this.exists(selectedId);
      if (selected?.status === 'ready' && !selectedExists) await this.markDeleted(selectedId);
    }
    let cursorRow: Row | null = null;
    if (cursor) {
      cursorRow = await this.row(cursor);
      if (!cursorRow) throw new SharedError('INVALID_CURSOR');
    }
    const query = rowSql + " WHERE status = 'ready' " + (cursorRow ? 'AND (created_at < ? OR (created_at = ? AND id < ?)) ' : '') + 'ORDER BY created_at DESC, id DESC LIMIT ?';
    const rows = await this.db().prepare(query).bind(...(cursorRow ? [cursorRow.created_at, cursorRow.created_at, cursorRow.id] : []), SHARED_PAGE_SIZE + 1).all<Row>();
    const items = rows.results.slice(0, SHARED_PAGE_SIZE).map(summary);
    return { items, ...(rows.results.length > SHARED_PAGE_SIZE ? { nextCursor: items.at(-1)?.id } : {}), ...(selectedId ? { selectedExists } : {}) };
  }
  async get(id: string) {
    const row = await this.row(id);
    if (!row || row.status !== 'ready') throw new SharedError('NOT_FOUND', 404);
    const response = await this.upyun('GET', id);
    if (response.status === 404) { await this.markDeleted(id); throw new SharedError('NOT_FOUND', 404); }
    return { summary: summary(row), backup: await boundedJson(response, row.sha256) };
  }
  async upload(input: SharedUpload) {
    const payload = JSON.stringify(input.backup);
    const hash = createHash('sha256').update(payload).digest('hex');
    const byteSize = new TextEncoder().encode(payload).byteLength;
    const date = new Date().toISOString();
    const places = input.backup.records.filter(record => record.kind === 'place').length;
    const routes = input.backup.records.filter(record => record.kind === 'route').length;
    await this.db().prepare("INSERT INTO shared_backups (id,name,creator,created_at,places,routes,byte_size,sha256,status) VALUES (?,?,?,?,?,?,?,?, 'pending') ON CONFLICT(id) DO NOTHING")
      .bind(input.id, input.name, input.creator, date, places, routes, byteSize, hash).run();
    const row = await this.row(input.id);
    if (!row) throw new SharedError('UNAVAILABLE', 503);
    if (row.sha256 !== hash || row.name !== input.name || row.creator !== input.creator || row.byte_size !== byteSize || row.places !== places || row.routes !== routes || row.status === 'deleted') throw new SharedError('ID_CONFLICT', 409);
    if (row.status === 'ready') return summary(row);
    let response = await this.upyun('PUT', input.id, payload);
    if (response.status === 404) {
      const folder = await this.callUpyun('POST', 'backups');
      if (!folder.ok && folder.status !== 406) throw new SharedError('UNAVAILABLE', 503);
      response = await this.upyun('PUT', input.id, payload);
    }
    if (!response.ok) throw new SharedError('UNAVAILABLE', 503);
    await this.db().prepare("UPDATE shared_backups SET status = 'ready' WHERE id = ? AND status = 'pending'").bind(input.id).run();
    return summary(row);
  }
  async remove(id: string, authorization: string | null) {
    const token = this.env.ADMIN_TOKEN;
    const given = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !given) throw new SharedError('NOT_FOUND', 404);
    const expected = Buffer.from(token), actual = Buffer.from(given);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new SharedError('NOT_FOUND', 404);
    const row = await this.row(id);
    if (!row || row.status === 'deleted') throw new SharedError('NOT_FOUND', 404);
    await this.upyun('DELETE', id);
    await this.db().prepare("UPDATE shared_backups SET status = 'deleted' WHERE id = ?").bind(id).run();
  }
}
