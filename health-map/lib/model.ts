import { validatePhotos, type PlacePhoto } from './photo-model';
export type Language = 'zh' | 'en';
export type Coordinate = [number, number];
export const CATEGORY_IDS = ['clinic', 'counseling', 'fitness', 'dining', 'rest', 'international'] as const;
export type Category = typeof CATEGORY_IDS[number];
export const CATEGORIES: Record<Category, { zh: string; en: string; color: string }> = {
  clinic: { zh: '校医院', en: 'Campus clinic', color: '#da5468' },
  counseling: { zh: '心理咨询', en: 'Counseling', color: '#8261bb' },
  fitness: { zh: '运动健身', en: 'Sports & fitness', color: '#dd852d' },
  dining: { zh: '健康餐饮', en: 'Healthy dining', color: '#36916d' },
  rest: { zh: '安静休息区', en: 'Quiet spaces', color: '#3a8caa' },
  international: { zh: '国际学生服务', en: 'International services', color: '#497ac6' },
};
export interface BaseRecord { id: string; nameZh: string; nameEn: string; description: string; updatedAt: string }
export interface Place extends BaseRecord {
  kind: 'place'; category: Category; position: Coordinate; address: string; hours: string; contact: string;
  photos?: PlacePhoto[];
}
export interface Route extends BaseRecord {
  kind: 'route'; category: 'relaxation'; points: Coordinate[]; source: 'manual' | 'walking'; distance: number; duration?: number;
}
export type MapRecord = Place | Route;
export interface Backup { version: 1; coordinateSystem: 'GCJ-02'; records: MapRecord[] }
export const STORAGE_KEY = 'tongji-health-map:v1';
export const LANGUAGE_KEY = 'tongji-health-map:language';
export const EMPTY_DATA: Backup = { version: 1, coordinateSystem: 'GCJ-02', records: [] };
// Approximate initial camera only; it is not a claimed resource location or campus boundary.
export const CAMPUS_CENTER: Coordinate = [121.5016, 31.2848];
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function isCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'number' && Number.isFinite(v))
    && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}
export function pathDistance(points: Coordinate[]): number {
  let meters = 0;
  const rad = Math.PI / 180;
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1], [x2, y2] = points[i];
    const a = Math.sin((y2-y1)*rad/2)**2 + Math.cos(y1*rad)*Math.cos(y2*rad)*Math.sin((x2-x1)*rad/2)**2;
    meters += 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1-a)));
  }
  return Math.round(meters);
}
export function validPath(points: Coordinate[]): boolean {
  return points.length >= 2 && points.every(isCoordinate) && pathDistance(points) > 0;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BACKUP');
  return value as Record<string, unknown>;
}
function field(obj: Record<string, unknown>, key: string, required = false): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length > 10000 || (required && !value.trim())) throw new Error('INVALID_BACKUP');
  return value;
}
export function validateBackup(input: unknown): Backup {
  const data = object(input);
  if (data.version !== 1 || data.coordinateSystem !== 'GCJ-02' || !Array.isArray(data.records) || data.records.length > 10000) throw new Error('INVALID_BACKUP');
  const ids = new Set<string>();
  const records: MapRecord[] = data.records.map(raw => {
    const r = object(raw);
    const base: BaseRecord = { id: field(r, 'id', true), nameZh: field(r, 'nameZh', true), nameEn: field(r, 'nameEn'), description: field(r, 'description'), updatedAt: field(r, 'updatedAt', true) };
    if (ids.has(base.id) || !Number.isFinite(Date.parse(base.updatedAt))) throw new Error('INVALID_BACKUP');
    ids.add(base.id);
    if (r.kind === 'place') {
      if (!CATEGORY_IDS.includes(r.category as Category) || !isCoordinate(r.position)) throw new Error('INVALID_BACKUP');
      return { ...base, kind: 'place', category: r.category as Category, position: [...r.position], address: field(r, 'address'), hours: field(r, 'hours'), contact: field(r, 'contact'), ...(r.photos !== undefined ? { photos: validatePhotos(r.photos) } : {}) };
    }
    if (r.kind !== 'route' || r.category !== 'relaxation' || !['manual', 'walking'].includes(r.source as string) || !Array.isArray(r.points) || r.points.length > 50000 || !validPath(r.points as Coordinate[])) throw new Error('INVALID_BACKUP');
    if (typeof r.distance !== 'number' || !Number.isFinite(r.distance) || r.distance <= 0 || (r.duration !== undefined && (typeof r.duration !== 'number' || !Number.isFinite(r.duration) || r.duration < 0))) throw new Error('INVALID_BACKUP');
    return { ...base, kind: 'route', category: 'relaxation', points: (r.points as Coordinate[]).map(p => [...p]), source: r.source as Route['source'], distance: r.source === 'manual' ? pathDistance(r.points as Coordinate[]) : r.distance, ...(r.source === 'walking' && typeof r.duration === 'number' ? { duration: r.duration } : {}) };
  });
  return { version: 1, coordinateSystem: 'GCJ-02', records };
}
export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('BACKUP_TOO_LARGE');
  return validateBackup(JSON.parse(text));
}
export function saveBackup(storage: Pick<Storage, 'setItem'>, data: Backup): Backup {
  const clean = validateBackup(data);
  const json = JSON.stringify(clean);
  if (new TextEncoder().encode(json).length > MAX_BACKUP_BYTES) throw new Error('BACKUP_TOO_LARGE');
  // Persist before updating visible state. A quota or permission error must never claim success.
  storage.setItem(STORAGE_KEY, json);
  return clean;
}
export function recordName(r: Pick<BaseRecord, 'nameZh' | 'nameEn'>, lang: Language): string {
  return lang === 'en' && r.nameEn.trim() ? r.nameEn : r.nameZh;
}
