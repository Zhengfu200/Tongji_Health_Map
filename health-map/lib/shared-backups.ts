import { validateBackup, type Backup } from './model';

export const MAX_SHARED_BYTES = 1024 * 1024;
export const SHARED_PAGE_SIZE = 20;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface SharedSummary {
  id: string; name: string; creator: string; createdAt: string;
  places: number; routes: number; byteSize: number;
}
export interface SharedBackup { summary: SharedSummary; backup: Backup }
export interface SharedPage { items: SharedSummary[]; nextCursor?: string }
export interface SharedUpload { id: string; name: string; creator: string; backup: Backup }
export class SharedError extends Error {
  constructor(public code: string, public status = 400, public retryAfter?: string) { super(code); }
}
export function validateUpload(value: unknown): SharedUpload {
  const input = value as Partial<SharedUpload> | null;
  if (!input || typeof input !== 'object' || typeof input.id !== 'string' || !UUID_PATTERN.test(input.id)) throw new SharedError('INVALID_UPLOAD');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const creator = typeof input.creator === 'string' ? input.creator.trim() : '';
  if (!name || name.length > 80 || !creator || creator.length > 40) throw new SharedError('INVALID_UPLOAD');
  let backup: Backup;
  try { backup = validateBackup(input.backup); } catch { throw new SharedError('INVALID_BACKUP'); }
  if (!backup.records.length) throw new SharedError('EMPTY_BACKUP');
  if (new TextEncoder().encode(JSON.stringify(backup)).byteLength > MAX_SHARED_BYTES) throw new SharedError('TOO_LARGE', 413);
  return { id: input.id.toLowerCase(), name, creator, backup };
}
export function validateSummary(value: unknown): SharedSummary {
  const s = value as SharedSummary | null;
  if (!s || typeof s.id !== 'string' || !UUID_PATTERN.test(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80
    || typeof s.creator !== 'string' || !s.creator.trim() || s.creator.length > 40 || typeof s.createdAt !== 'string' || !Number.isFinite(Date.parse(s.createdAt))
    || ![s.places, s.routes, s.byteSize].every(n => Number.isSafeInteger(n) && n >= 0) || s.byteSize > MAX_SHARED_BYTES) throw new SharedError('INVALID_RESPONSE', 502);
  return { id: s.id, name: s.name, creator: s.creator, createdAt: s.createdAt, places: s.places, routes: s.routes, byteSize: s.byteSize };
}
const apiUrl = (process.env.NEXT_PUBLIC_SHARED_BACKUPS_API_URL || '').replace(/\/$/, '');
export const sharedServiceEnabled = !!apiUrl;
async function request(path: string, init?: RequestInit): Promise<unknown> {
  if (!apiUrl) throw new SharedError('NOT_CONFIGURED', 503);
  try {
    const response = await fetch(`${apiUrl}${path}`, { ...init, signal: AbortSignal.timeout(30000), cache: 'no-store' });
    const body = await response.json() as { error?: { code?: string } };
    if (!response.ok) throw new SharedError(typeof body?.error?.code === 'string' ? body.error.code : 'UNAVAILABLE', response.status, response.headers.get('Retry-After') || undefined);
    return body;
  } catch (error) {
    if (error instanceof SharedError) throw error;
    throw new SharedError('UNAVAILABLE', 503);
  }
}
export async function listSharedBackups(cursor?: string): Promise<SharedPage> {
  const body = await request(`/backups${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`) as SharedPage;
  if (!Array.isArray(body?.items) || body.items.length > SHARED_PAGE_SIZE || (body.nextCursor !== undefined && typeof body.nextCursor !== 'string')) throw new SharedError('INVALID_RESPONSE', 502);
  return { items: body.items.map(validateSummary), nextCursor: body.nextCursor };
}
export async function getSharedBackup(id: string): Promise<SharedBackup> {
  if (!UUID_PATTERN.test(id)) throw new SharedError('INVALID_UPLOAD');
  const body = await request(`/backups/${id}`) as SharedBackup;
  const summary = validateSummary(body?.summary);
  if (summary.id !== id) throw new SharedError('INVALID_RESPONSE', 502);
  return { summary, backup: validateBackup(body.backup) };
}
export async function uploadSharedBackup(input: SharedUpload): Promise<SharedSummary> {
  const clean = validateUpload(input);
  const body = await request('/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean) }) as { summary: SharedSummary };
  const summary = validateSummary(body?.summary);
  if (summary.id !== clean.id) throw new SharedError('INVALID_RESPONSE', 502);
  return summary;
}
