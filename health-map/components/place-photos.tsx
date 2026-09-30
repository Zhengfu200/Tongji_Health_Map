'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/i18n';
import type { Language } from '@/lib/model';
import { MAX_PLACE_PHOTOS, type PlacePhoto } from '@/lib/photo-model';
import { photoUrl, photosEnabled, uploadPlacePhoto } from '@/lib/place-photos';
import { SharedError } from '@/lib/shared-backups';

function PhotoImage({ photo }: { photo: PlacePhoto }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="photo-unavailable">{photo.name}</span>
    : <img src={photoUrl(photo)} alt={photo.name} loading="lazy" onError={() => setFailed(true)} />;
}

export function PlacePhotoGallery({ photos, language }: { photos: PlacePhoto[]; language: Language }) {
  if (!photos.length) return null;
  return <section className="place-photos" aria-label={copy[language].placePhotos}>
    <h3>{copy[language].placePhotos}</h3>
    <div className="photo-grid">{photos.map(photo => <a className="photo-card" key={photo.id} href={photoUrl(photo)} target="_blank" rel="noopener noreferrer" aria-label={`${copy[language].viewPhoto}: ${photo.name}`}><PhotoImage photo={photo} /></a>)}</div>
  </section>;
}

export function PlacePhotoEditor({ photos, language, onChange, onBusyChange }: {
  photos: PlacePhoto[]; language: Language; onChange: (photos: PlacePhoto[]) => void; onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const t = copy[language];
  useEffect(() => () => abort.current?.abort(), []);

  async function upload(files: File[]) {
    if (!files.length || uploading.current) return;
    setError(undefined);
    if (photos.length + files.length > MAX_PLACE_PHOTOS) { setError(t.photoCountError); return; }
    uploading.current = true; setBusy(true); onBusyChange(true);
    const controller = new AbortController(); abort.current = controller;
    const next = [...photos];
    try {
      for (const file of files) {
        const photo = await uploadPlacePhoto(file, controller.signal);
        if (controller.signal.aborted) return;
        next.push(photo); onChange([...next]);
      }
    } catch (problem) {
      if (!controller.signal.aborted) {
        const code = problem instanceof SharedError ? problem.code : '';
        setError(code === 'PHOTO_TYPE' ? t.photoTypeError : code === 'PHOTO_TOO_LARGE' || code === 'TOO_LARGE' ? t.photoSizeError : code === 'RATE_LIMITED' ? t.sharedRateLimit : code === 'NOT_CONFIGURED' ? t.photosDisabled : t.photoUploadError);
      }
    } finally {
      uploading.current = false;
      if (!controller.signal.aborted) { setBusy(false); onBusyChange(false); }
    }
  }
  return <section className="place-photos" aria-label={t.placePhotos}>
    <div className="section-heading"><h3>{t.placePhotos}</h3><span className="subtle">{photos.length}/{MAX_PLACE_PHOTOS}</span></div>
    <p className="subtle">{t.photoHelp}</p>
    <div className="photo-grid">{photos.map(photo => <div className="photo-card" key={photo.id}><PhotoImage photo={photo} /><Button type="button" size="icon-sm" variant="outline" className="photo-remove" disabled={busy} aria-label={`${t.removePhoto}: ${photo.name}`} onClick={() => onChange(photos.filter(p => p.id !== photo.id))}><X size={14} /></Button></div>)}</div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label={t.uploadPhoto} disabled={busy || !photosEnabled || photos.length >= MAX_PLACE_PHOTOS} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; void upload(files); }} />
    <Button type="button" variant="outline" className="full-width" disabled={busy || !photosEnabled || photos.length >= MAX_PLACE_PHOTOS} onClick={() => input.current?.click()}><ImagePlus size={16} />{busy ? t.uploadingShared : t.uploadPhoto}</Button>
    {busy && <p className="subtle" role="status">{t.photoUploading}</p>}
    {!photosEnabled && <p className="subtle">{t.photosDisabled}</p>}
    {error && <p className="photo-error" role="alert">{error}</p>}
  </section>;
}
