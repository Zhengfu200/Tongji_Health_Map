'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { copy, type CopyKey } from '@/lib/i18n';
import type { Backup, Language } from '@/lib/model';
import { getSharedBackup, listSharedBackups, uploadSharedBackup, sharedServiceEnabled, SharedError, type SharedBackup, type SharedSummary, type SharedUpload } from '@/lib/shared-backups';

function errorKey(error: unknown, fallback: CopyKey): CopyKey {
  if (!(error instanceof SharedError)) return fallback;
  const keys: Record<string, CopyKey> = { TOO_LARGE: 'sharedTooLarge', RATE_LIMITED: 'sharedRateLimit', GITHUB_AUTH: 'sharedAuthError', NOT_CONFIGURED: 'sharedDisabled', NOT_FOUND: 'sharedNotFound', INVALID_UPLOAD: 'sharedInvalid', INVALID_BACKUP: 'sharedInvalid', EMPTY_BACKUP: 'sharedInvalid' };
  return keys[error.code] || fallback;
}
export function SharedBackupPanel({ language, refresh, selectedId, onLoaded, onDeleted }: { language: Language; refresh: number; selectedId?: string; onLoaded: (value: SharedBackup) => void; onDeleted: () => void }) {
  const t = (key: CopyKey) => copy[language][key];
  const [items, setItems] = useState<SharedSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [pending, setPending] = useState(false), [error, setError] = useState<CopyKey>();
  const [loadingId, setLoadingId] = useState<string>();
  const [detailError, setDetailError] = useState<{ id: string; key: CopyKey }>();
  const listSequence = useRef(0), detailSequence = useRef(0);
  const alive = useRef(true), listBusy = useRef(false);
  const failedCursor = useRef<string | undefined>(undefined);
  const loadCallback = useRef(onLoaded); loadCallback.current = onLoaded;
  const deletedCallback = useRef(onDeleted); deletedCallback.current = onDeleted;
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  useEffect(() => { alive.current = true; return () => { alive.current = false; listSequence.current++; detailSequence.current++; }; }, []);
  async function load(next?: string) {
    if (!sharedServiceEnabled || (next && listBusy.current)) return;
    const sequence = ++listSequence.current; listBusy.current = true; failedCursor.current = next; setPending(true); setError(undefined);
    const selection = selectedRef.current;
    if (!next) { detailSequence.current++; setLoadingId(undefined); setDetailError(undefined); }
    const detailVersion = detailSequence.current;
    try {
      const page = await listSharedBackups(next, selection);
      if (!alive.current || sequence !== listSequence.current) return;
      setItems(previous => next ? [...previous, ...page.items.filter(i => !previous.some(p => p.id === i.id))] : page.items);
      setCursor(page.nextCursor);
      if (selection && page.selectedExists === false && selectedRef.current === selection && detailVersion === detailSequence.current) deletedCallback.current();
    } catch (error) { if (alive.current && sequence === listSequence.current) setError(errorKey(error, 'sharedLoadError')); }
    finally { if (alive.current && sequence === listSequence.current) { listBusy.current = false; setPending(false); } }
  }
  useEffect(() => { void load(); }, [refresh]);
  async function select(id: string) {
    const sequence = ++detailSequence.current; setLoadingId(id); setDetailError(undefined);
    try { const value = await getSharedBackup(id); if (alive.current && sequence === detailSequence.current) loadCallback.current(value); }
    catch (error) { if (alive.current && sequence === detailSequence.current) setDetailError({ id, key: errorKey(error, 'sharedLoadError') }); }
    finally { if (alive.current && sequence === detailSequence.current) setLoadingId(undefined); }
  }
  return <section className="shared-list" aria-label={t('shared')}>
    <div className="section-heading"><h2>{t('shared')}</h2><Button size="sm" variant="ghost" disabled={!sharedServiceEnabled || pending} onClick={() => void load()}>{t('refreshShared')}</Button></div>
    {!sharedServiceEnabled ? <p className="subtle" role="status">{t('sharedDisabled')}</p> : <>
      {pending && <p role="status" className="subtle">{t('sharedLoading')}</p>}
      {error && <div role="alert" className="inline-error">{t(error)} <Button variant="outline" size="sm" onClick={() => void load(failedCursor.current)}>{t('retry')}</Button></div>}
      {!pending && !error && !items.length && <p className="subtle">{t('sharedEmpty')}</p>}
      <div className="shared-cards">{items.map(item => <button key={item.id} aria-pressed={selectedId === item.id} className={`shared-card ${selectedId === item.id ? 'selected' : ''}`} onClick={() => void select(item.id)}>
        <b>{item.name}</b><span>{t('creator')}: {item.creator}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</time><small>{item.places} {t('places')} · {item.routes} {t('routes')}</small>
      </button>)}</div>
      {loadingId && <p className="subtle" role="status">{t('sharedLoading')}</p>}
      {detailError && <div role="alert" className="inline-error">{t(detailError.key)} <Button variant="outline" size="sm" onClick={() => void select(detailError.id)}>{t('retry')}</Button></div>}
      {cursor && <Button className="full-width" variant="outline" disabled={pending} onClick={() => void load(cursor)}>{t('moreShared')}</Button>}
    </>}
  </section>;
}
export function SharedUploadDialog({ backup, language, onClose, onUploaded }: { backup: Backup; language: Language; onClose: () => void; onUploaded: () => void }) {
  const t = (key: CopyKey) => copy[language][key];
  const [name, setName] = useState(''), [creator, setCreator] = useState('');
  const [pending, setPending] = useState(false), [error, setError] = useState<CopyKey>();
  const attempt = useRef<SharedUpload | undefined>(undefined), busy = useRef(false);
  async function submit() {
    if (busy.current) return;
    const trimmedName = name.trim(), trimmedCreator = creator.trim();
    if (!attempt.current || attempt.current.name !== trimmedName || attempt.current.creator !== trimmedCreator) attempt.current = { id: crypto.randomUUID(), name: trimmedName, creator: trimmedCreator, backup };
    busy.current = true; setPending(true); setError(undefined);
    try { await uploadSharedBackup(attempt.current); onUploaded(); }
    catch (error) { setError(errorKey(error, 'uploadFailed')); }
    finally { busy.current = false; setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy.current) onClose(); }}><DialogContent className="confirm-dialog" showCloseButton={false}>
    <DialogTitle>{t('uploadShared')}</DialogTitle><DialogDescription>{t('publicNotice')}</DialogDescription>
    <form onSubmit={e => { e.preventDefault(); void submit(); }}>
      <label className="field"><span>{t('backupName')} *</span><Input required maxLength={80} value={name} disabled={pending} onChange={e => setName(e.target.value)} autoFocus /></label>
      <label className="field"><span>{t('creator')} *</span><Input required maxLength={40} value={creator} disabled={pending} onChange={e => setCreator(e.target.value)} /></label>
      <p className="import-count">{backup.records.filter(r => r.kind === 'place').length} {t('places')} · {backup.records.filter(r => r.kind === 'route').length} {t('routes')}</p>
      {error && <p role="alert" className="inline-error">{t(error)}</p>}
      <div className="editor-actions"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t('cancel')}</Button><Button type="submit" disabled={pending || !name.trim() || !creator.trim()}>{t(pending ? 'uploadingShared' : 'uploadShared')}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
