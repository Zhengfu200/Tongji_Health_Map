export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PLACE_PHOTOS = 6;
export const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type PhotoType = keyof typeof PHOTO_TYPES;
export const PHOTO_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export interface PlacePhoto { id: string; name: string; contentType: PhotoType; byteSize: number }

export function validatePhoto(value: unknown): PlacePhoto {
  const p = value as PlacePhoto | null;
  if (!p || typeof p.id !== 'string' || !PHOTO_ID_PATTERN.test(p.id)
    || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 160
    || !Object.hasOwn(PHOTO_TYPES, p.contentType) || !p.id.endsWith('.' + PHOTO_TYPES[p.contentType])
    || !Number.isSafeInteger(p.byteSize) || p.byteSize < 1 || p.byteSize > MAX_PHOTO_BYTES) throw new Error('INVALID_PHOTO');
  return { id: p.id, name: p.name, contentType: p.contentType, byteSize: p.byteSize };
}
export function validatePhotos(value: unknown): PlacePhoto[] {
  if (!Array.isArray(value) || value.length > MAX_PLACE_PHOTOS) throw new Error('INVALID_PHOTO');
  const photos = value.map(validatePhoto);
  if (new Set(photos.map(p => p.id)).size !== photos.length) throw new Error('INVALID_PHOTO');
  return photos;
}

export function matchesPhotoType(bytes: Uint8Array, type: PhotoType): boolean {
  if (type === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
  return bytes.length >= 16 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
}
