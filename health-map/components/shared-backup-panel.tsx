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
  const keys: Record<string, CopyKey> = { TOO_LARGE: 'sharedTooLarge', RATE_LIMITED: 'sharedRateLimit', UPYUN_AUTH: 'sharedAuthError', NOT_CONFIGURED: 'sharedDisabled', NOT_FOUND: 'sharedNotFound', INVALID_UPLOAD: 'sharedInvalid', INVALID_BACKUP: 'sharedInvalid', EMPTY_BACKUP: 'sharedInvalid' };
  return keys[error.code] || fallback;
}
export function SharedBackupPanel({ language, refresh, onLoaded, onRemoved }: { language: Language; refresh: number; onLoaded: (value: SharedBackup) => void; onRemoved: (id: string, deleted?: boolean) => void }) {
  const t = (key: CopyKey) => copy[language][key];
  const [items, setItems] = useState<SharedSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [pending, setPending] = useState(false), [error, setError] = useState<CopyKey>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [detailErrors, setDetailErrors] = useState<Record<string, CopyKey>>({});
  const listSequence = useRef(0), detailSequence = useRef(0);
  const selections = useRef(new Map<string, number>());
  const alive = useRef(true), listBusy = useRef(false);
  const failedCursor = useRef<string | undefined>(undefined);
  const loadCallback = useRef(onLoaded); loadCallback.current = onLoaded;
  const removedCallback = useRef(onRemoved); removedCallback.current = onRemoved;
  useEffect(() => { alive.current = true; return () => { alive.current = false; listSequence.current++; selections.current.clear(); }; }, []);
  function remove(id: string, deleted = false) {
    selections.current.delete(id);
    setSelectedIds(previous => previous.filter(value => value !== id));
    setLoadingIds(previous => previous.filter(value => value !== id));
    setDetailErrors(previous => { const next = { ...previous }; delete next[id]; return next; });
    removedCallback.current(id, deleted);
  }
  async function load(next?: string) {
    if (!sharedServiceEnabled || (next && listBusy.current)) return;
    const sequence = ++listSequence.current; listBusy.current = true; failedCursor.current = next; setPending(true); setError(undefined);
    const selection = [...selections.current.entries()];
    function checkDeleted(id: string, version: number, exists?: boolean) {
      if (alive.current && sequence === listSequence.current && exists === false && selections.current.get(id) === version) remove(id, true);
    }
    try {
      const page = await listSharedBackups(next, selection[0]?.[0]);
      if (!alive.current || sequence !== listSequence.current) return;
      setItems(previous => next ? [...previous, ...page.items.filter(i => !previous.some(p => p.id === i.id))] : page.items);
      setCursor(page.nextCursor);
      if (selection.length) checkDeleted(selection[0][0], selection[0][1], page.selectedExists);
      // The API checks one selection per request. A missing item on the first
      // page can still exist on later pages, so verify each selected ID.
      if (!next) await Promise.all(selection.slice(1).map(async ([id, version]) => {
        try { const result = await listSharedBackups(undefined, id); checkDeleted(id, version, result.selectedExists); }
        catch { /* Keep the selection when its existence cannot be verified. */ }
      }));
    } catch (error) { if (alive.current && sequence === listSequence.current) setError(errorKey(error, 'sharedLoadError')); }
    finally { if (alive.current && sequence === listSequence.current) { listBusy.current = false; setPending(false); } }
  }
  useEffect(() => { void load(); }, [refresh]);
  async function select(id: string) {
    if (selections.current.has(id)) return;
    const sequence = ++detailSequence.current;
    selections.current.set(id, sequence);
    setSelectedIds(previous => [...previous, id]);
    setLoadingIds(previous => [...previous, id]);
    setDetailErrors(previous => { const next = { ...previous }; delete next[id]; return next; });
    try { const value = await getSharedBackup(id); if (alive.current && selections.current.get(id) === sequence) loadCallback.current(value); }
    catch (error) {
      if (alive.current && selections.current.get(id) === sequence) {
        remove(id);
        setDetailErrors(previous => ({ ...previous, [id]: errorKey(error, 'sharedLoadError') }));
      }
    }
    finally { if (alive.current && selections.current.get(id) === sequence) setLoadingIds(previous => previous.filter(value => value !== id)); }
  }
  return <section className="shared-list" aria-label={t('shared')}>
    <div className="section-heading"><h2>{t('shared')}</h2><Button size="sm" variant="ghost" disabled={!sharedServiceEnabled || pending} onClick={() => void load()}>{t('refreshShared')}</Button></div>
    {!sharedServiceEnabled ? <p className="subtle" role="status">{t('sharedDisabled')}</p> : <>
      {pending && <p role="status" className="subtle">{t('sharedLoading')}</p>}
      {error && <div role="alert" className="inline-error">{t(error)} <Button variant="outline" size="sm" onClick={() => void load(failedCursor.current)}>{t('retry')}</Button></div>}
      {!pending && !error && !items.length && <p className="subtle">{t('sharedEmpty')}</p>}
      <p className="subtle">{t('sharedSelectHelp')}</p>
      <div className="shared-cards">{items.map(item => <div key={item.id}>
        <label className={`shared-card ${selectedIds.includes(item.id) ? 'selected' : ''}`}>
          <span className="shared-card-content"><b>{item.name}</b><span>{t('creator')}: {item.creator}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</time><small>{item.places} {t('places')} · {item.routes} {t('routes')}</small>{loadingIds.includes(item.id) && <small role="status">{t('sharedLoading')}</small>}</span>
          <input type="checkbox" className="shared-card-checkbox" aria-label={`${t('showShared')}: ${item.name}`} checked={selectedIds.includes(item.id)} onChange={event => { if (event.target.checked) void select(item.id); else remove(item.id); }} />
        </label>
        {detailErrors[item.id] && <div role="alert" className="inline-error">{t(detailErrors[item.id])} <Button variant="outline" size="sm" onClick={() => void select(item.id)}>{t('retry')}</Button></div>}
      </div>)}</div>
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
