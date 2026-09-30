import { SharedError } from './shared-backups';
import { MAX_PHOTO_BYTES, PHOTO_TYPES, validatePhoto, type PlacePhoto } from './photo-model';

const apiUrl = (process.env.NEXT_PUBLIC_SHARED_BACKUPS_API_URL || '').replace(/\/$/, '');
export const photosEnabled = !!apiUrl;
export const photoUrl = (photo: PlacePhoto) => `${apiUrl}/photos/${photo.id}`;

export async function uploadPlacePhoto(file: File, signal?: AbortSignal): Promise<PlacePhoto> {
  if (!apiUrl) throw new SharedError('NOT_CONFIGURED', 503);
  if (!Object.hasOwn(PHOTO_TYPES, file.type)) throw new SharedError('PHOTO_TYPE');
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new SharedError('PHOTO_TOO_LARGE', 413);
  try {
    const query = new URLSearchParams({ name: file.name.slice(0,160) || 'photo' });
    const response = await fetch(`${apiUrl}/photos?${query}`, { method: 'POST', body: file,
      headers: { 'Content-Type': file.type }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    const body = await response.json() as { photo?: unknown; error?: { code?: string } };
    if (!response.ok) throw new SharedError(body.error?.code || 'UNAVAILABLE', response.status);
    return validatePhoto(body.photo);
  } catch (error) {
    if (error instanceof SharedError) throw error;
    throw new SharedError('UNAVAILABLE', 503);
  }
}
