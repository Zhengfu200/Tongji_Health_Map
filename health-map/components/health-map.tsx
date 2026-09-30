'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { HeartPulse, MapPin, Route as RouteIcon, Search, LocateFixed, Plus, Minus, Layers, X, Pencil, Trash2, ArrowLeft, Undo2, Check, ExternalLink, Navigation, ShieldCheck, Globe2, ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AMapController, loadAMap, planWalking, searchPlaces, type MapDraft, type SearchResult, type WalkResult } from '@/lib/amap';
import { CATEGORIES, CATEGORY_IDS, EMPTY_DATA, LANGUAGE_KEY, MAX_BACKUP_BYTES, STORAGE_KEY, isCoordinate, parseBackup, pathDistance, recordName, saveBackup, validPath, type Backup, type Category, type Coordinate, type Language, type MapRecord, type Place, type Route } from '@/lib/model';
import { copy, type CopyKey } from '@/lib/i18n';
import { SharedBackupPanel, SharedUploadDialog } from '@/components/shared-backup-panel';
import { CategoryIcon } from '@/components/category-icon';
import { sharedServiceEnabled, type SharedBackup } from '@/lib/shared-backups';
import { placeNavigationUrl } from '@/lib/navigation';
import { PlacePhotoEditor, PlacePhotoGallery } from '@/components/place-photos';

type Mode = { kind: 'browse' } | { kind: 'place'; record: Place } | { kind: 'draw'; points: Coordinate[] } | { kind: 'route'; record: Route; editable: boolean } | { kind: 'walking'; start?: Coordinate; end?: Coordinate; picking: 'start' | 'end'; pending: boolean; result?: WalkResult; error?: CopyKey };
type Confirmation = { kind: 'import'; backup: Backup } | { kind: 'delete'; record: MapRecord };
type Status = 'missing' | 'loading' | 'ready' | 'error';
const key = process.env.NEXT_PUBLIC_AMAP_KEY || '';
const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || '';
const distance = (n: number) => n >= 1000 ? `${(n/1000).toFixed(2)} km` : `${Math.round(n)} m`;
const positionText = (p?: Coordinate) => p && isCoordinate(p) ? `${p[0].toFixed(6)}, ${p[1].toFixed(6)}` : '—';
function Field({ title, children }: { title: string; children: ReactNode }) { return <label className="field"><span>{title}</span>{children}</label>; }

export default function HealthMap() {
  const [language, setLanguage] = useState<Language>('zh');
  const [data, setData] = useState<Backup>(EMPTY_DATA);
  const [sharedView, setSharedView] = useState(false);
  const [sharedBackups, setSharedBackups] = useState<SharedBackup[]>([]);
  const [sharedRefresh, setSharedRefresh] = useState(0);
  const [uploadBackup, setUploadBackup] = useState<Backup>();
  // Scope IDs by backup so matching IDs from different uploads remain distinct
  // in map click handlers, details, React keys, and merged JSON downloads.
  const mergedSharedData = useMemo<Backup>(() => ({ ...EMPTY_DATA, records: sharedBackups.flatMap(value => value.backup.records.map(record => ({ ...record, id: `${value.summary.id}:${record.id}` }))) }), [sharedBackups]);
  const displayData = sharedView ? mergedSharedData : data;
  const [hydrated, setHydrated] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'browse' });
  const [photoBusy, setPhotoBusy] = useState(false);
  const [filter, setFilter] = useState<Category | 'all' | 'relaxation'>('all');
  const [selectedId, setSelectedId] = useState<string>();
  const [status, setStatus] = useState<Status>(key && securityCode ? 'loading' : 'missing');
  const [mapAttempt, setMapAttempt] = useState(0);
  const [satellite, setSatellite] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | undefined>();
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<CopyKey>();
  const [preview, setPreview] = useState<SearchResult>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [message, setMessage] = useState<{ key: CopyKey; error?: boolean }>();
  const [panelOpen, setPanelOpen] = useState(true);
  const mapElement = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AMapController | undefined>(undefined);
  const searchSequence = useRef(0), walkingSequence = useRef(0);
  const latest = useRef({ mode, data, language, status, storageBlocked });
  latest.current = { mode, data, language, status, storageBlocked };
  const t = (name: CopyKey) => copy[language][name];
  const visible = displayData.records.filter(r => filter === 'all' || r.category === filter);
  const selected = displayData.records.find(r => r.id === selectedId);
  const active = mode.kind !== 'browse';
  const mapEnabled = status === 'ready' && hydrated && !storageBlocked && !sharedView && !uploadBackup;
  const notify = (name: CopyKey, error = false) => setMessage({ key: name, error });

  useEffect(() => {
    try {
      const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage === 'en' || savedLanguage === 'zh') setLanguage(savedLanguage);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setData(parseBackup(raw));
    } catch { setStorageBlocked(true); }
    setHydrated(true);
    if ((!key || !securityCode) && window.matchMedia?.('(max-width: 700px)').matches) setPanelOpen(false);
  }, []);
  useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; }, [language]);
  useEffect(() => {
    if (!message || message.error) return;
    const timer = setTimeout(() => setMessage(undefined), 4500);
    return () => clearTimeout(timer);
  }, [message]);
  function onMapClick(p: Coordinate) {
    const current = latest.current.mode;
    if (latest.current.storageBlocked) return;
    if (current.kind === 'place') setMode({ ...current, record: { ...current.record, position: p } });
    if (current.kind === 'draw') setMode({ ...current, points: [...current.points, p] });
    if (current.kind === 'route' && current.editable) setMode({ ...current, record: { ...current.record, points: [...current.record.points, p] } });
    if (current.kind === 'walking') {
      walkingSequence.current++;
      setMode({ ...current, [current.picking]: p, picking: current.picking === 'start' ? 'end' : 'start', pending: false, result: undefined, error: undefined });
    }
  }
  const callbacks = useRef({ onMapClick }); callbacks.current = { onMapClick };
  useEffect(() => {
    if (!key || !securityCode || !mapElement.current) return;
    let disposed = false;
    let instance: AMapController | undefined;
    setStatus('loading');
    loadAMap(key, securityCode).then(async sdk => {
      if (disposed || !mapElement.current) return;
      instance = new AMapController(sdk, mapElement.current, {
        click: p => callbacks.current.onMapClick(p),
        select: id => {
          const current = latest.current.mode;
          if (current.kind === 'browse') { setSelectedId(id); setPanelOpen(true); }
          else if (current.kind === 'walking') {
            const r = latest.current.data.records.find(r => r.id === id);
            if (r?.kind === 'place') callbacks.current.onMapClick(r.position);
          }
        },
        placeMove: p => { const current = latest.current.mode; if (current.kind === 'place') setMode({ ...current, record: { ...current.record, position: p } }); },
        routeMove: points => { const current = latest.current.mode; if (current.kind === 'route') setMode({ ...current, record: { ...current.record, points } }); },
      });
      controller.current = instance;
      await instance.waitForReady();
      if (!disposed) setStatus('ready');
    }).catch(() => { instance?.destroy(); if (!disposed) { controller.current = undefined; setStatus('error'); } });
    return () => { disposed = true; instance?.destroy(); controller.current = undefined; searchSequence.current++; walkingSequence.current++; };
  }, [mapAttempt]);
  useEffect(() => {
    if (status !== 'ready') return;
    controller.current?.render(visible.filter(r => !(mode.kind === 'place' || mode.kind === 'route') || r.id !== mode.record.id), language, selectedId);
  }, [displayData, filter, language, selectedId, mode.kind, status]);
  useEffect(() => {
    if (status !== 'ready' || !sharedView || !mergedSharedData.records.length) return;
    controller.current?.focus(mergedSharedData.records.flatMap(r => r.kind === 'place' ? [r.position] : r.points));
  }, [mergedSharedData, sharedView, status]);
  useEffect(() => {
    if (status !== 'ready') return;
    let draft: MapDraft | undefined;
    if (mode.kind === 'place') draft = { kind: 'place', position: isCoordinate(mode.record.position) ? mode.record.position : undefined };
    if (mode.kind === 'draw') draft = { kind: 'route', points: mode.points };
    if (mode.kind === 'route') draft = { kind: 'route', points: mode.record.points, editable: mode.editable, endpointsOnly: !mode.editable };
    if (mode.kind === 'walking') draft = { kind: 'walking', points: mode.result ? mode.result.points : [mode.start, mode.end].filter(Boolean) as Coordinate[], connect: !!mode.result, endpointsOnly: true };
    controller.current?.renderDraft(draft);
  }, [mode, status]);
  useEffect(() => { if (status === 'ready') controller.current?.setPreview(preview?.position); }, [preview, status]);
  useEffect(() => { if (status === 'ready') controller.current?.setLayer(satellite); }, [satellite, status]);
  function commit(next: Backup, recovery = false) {
    if (sharedView) return false;
    if (storageBlocked && !recovery) { notify('restoreError', true); return false; }
    try { const clean = saveBackup(localStorage, next); setData(clean); setStorageBlocked(false); return true; }
    catch { notify('storageError', true); return false; }
  }
  function cancel() { if (photoBusy) return; walkingSequence.current++; setMode({ kind: 'browse' }); }
  function preparePlace(position?: Coordinate, poi?: SearchResult) {
    if (!mapEnabled || active) return;
    setPreview(undefined); setSelectedId(undefined); setPanelOpen(true);
    setMode({ kind: 'place', record: { id: crypto.randomUUID(), kind: 'place', category: 'clinic', nameZh: poi?.name || '', nameEn: '', description: '', position: position || [NaN, NaN], address: poi?.address || '', hours: '', contact: '', updatedAt: new Date().toISOString() } });
  }
  function makeRoute(points: Coordinate[], walking?: WalkResult): Route {
    return { id: crypto.randomUUID(), kind: 'route', category: 'relaxation', nameZh: '校园散步路线', nameEn: '', description: '', points: points.map(p => [...p]), source: walking ? 'walking' : 'manual', distance: walking?.distance || pathDistance(points), ...(walking ? { duration: walking.duration } : {}), updatedAt: new Date().toISOString() };
  }
  function saveRecord(record: MapRecord) {
    if (photoBusy) return;
    if (!record.nameZh.trim() || (record.kind === 'place' ? !isCoordinate(record.position) : !validPath(record.points))) { notify('invalid', true); return; }
    const clean = { ...record, nameZh: record.nameZh.trim(), nameEn: record.nameEn.trim(), updatedAt: new Date().toISOString(), ...(record.kind === 'route' && record.source === 'manual' ? { distance: pathDistance(record.points), duration: undefined } : {}) };
    if (commit({ ...data, records: [...data.records.filter(r => r.id !== clean.id), clean] })) { setMode({ kind: 'browse' }); setSelectedId(clean.id); setFilter('all'); notify('savedOk'); }
  }
  function editRecord(record: MapRecord) {
    if (!mapEnabled) return;
    setPreview(undefined); setPanelOpen(true);
    if (record.kind === 'place') setMode({ kind: 'place', record: { ...record, position: [...record.position] } });
    else setMode({ kind: 'route', record: { ...record, points: record.points.map(p => [...p]), source: 'manual', duration: undefined }, editable: true });
    controller.current?.focus(record.kind === 'place' ? [record.position] : record.points);
  }
  function startDraw(points: Coordinate[] = []) { walkingSequence.current++; setSelectedId(undefined); setPreview(undefined); setMode({ kind: 'draw', points }); setPanelOpen(true); }
  async function runSearch() {
    if (!query.trim() || !mapEnabled || active || !controller.current) return;
    const sequence = ++searchSequence.current;
    setSearchPending(true); setSearchError(undefined); setResults(undefined); setPreview(undefined);
    try { const found = await searchPlaces(controller.current.sdk, query); if (sequence === searchSequence.current) { setResults(found); if (!found.length) setSearchError('searchEmpty'); } }
    catch { if (sequence === searchSequence.current) setSearchError('searchError'); }
    finally { if (sequence === searchSequence.current) setSearchPending(false); }
  }
  async function calculate() {
    if (mode.kind !== 'walking' || !mode.start || !mode.end || !controller.current) return;
    const sequence = ++walkingSequence.current, captured = mode;
    setMode({ ...mode, pending: true, result: undefined, error: undefined });
    try { const result = await planWalking(controller.current.sdk, mode.start, mode.end); if (sequence === walkingSequence.current) { setMode({ ...captured, pending: false, result }); controller.current?.focus(result.points); } }
    catch (error) { if (sequence === walkingSequence.current) setMode({ ...captured, pending: false, error: error instanceof Error && error.message === 'NO_ROUTE' ? 'walkingEmpty' : 'walkingError' }); }
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(displayData, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `tongji-health-map-${new Date().toISOString().slice(0,10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importData(file?: File) {
    if (sharedView || active || uploadBackup) return;
    if (!file) return;
    try { if (file.size > MAX_BACKUP_BYTES) throw new Error('TOO_LARGE'); setConfirmation({ kind: 'import', backup: parseBackup(await file.text()) }); }
    catch { notify('badImport', true); }
    if (fileInput.current) fileInput.current.value = '';
  }
  function confirmAction() {
    if (!confirmation) return;
    const next = confirmation.kind === 'import' ? confirmation.backup : { ...data, records: data.records.filter(r => r.id !== confirmation.record.id) };
    if (commit(next, confirmation.kind === 'import')) { walkingSequence.current++; setMode({ kind: 'browse' }); notify(confirmation.kind === 'import' ? 'imported' : 'removedOk'); setConfirmation(undefined); setSelectedId(undefined); setFilter('all'); setPreview(undefined); }
  }
  function switchLanguage() { const next = language === 'zh' ? 'en' : 'zh'; setLanguage(next); try { localStorage.setItem(LANGUAGE_KEY, next); } catch { notify('languageError', true); } }
  function selectRecord(r: MapRecord) { setSelectedId(r.id); setPreview(undefined); controller.current?.focus(r.kind === 'place' ? [r.position] : r.points); }
  function switchSource(shared: boolean) {
    if (active || confirmation || uploadBackup) return;
    searchSequence.current++; walkingSequence.current++;
    setSharedView(shared); setSharedBackups([]); setSelectedId(undefined); setFilter('all');
    setMessage(undefined);
    setResults(undefined); setSearchError(undefined); setSearchPending(false); setPreview(undefined); setPanelOpen(true);
  }
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: object, options: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: 'read_health_map_annotations',
      title: 'Read campus annotations',
      description: 'Read the saved personal places and routes, with GCJ-02 coordinates. This does not include API credentials.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input: unknown) => {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object');
        return latest.current.data;
      },
    };
    try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser API. */ }
    return () => lifecycle.abort();
  }, []);
  function renderForm() {
    if (mode.kind !== 'place' && mode.kind !== 'route') return null;
    const draft = mode.record;
    const update = (changes: Partial<Place> | Partial<Route>) => {
      if (mode.kind === 'place') setMode({ ...mode, record: { ...mode.record, ...changes } as Place });
      else setMode({ ...mode, record: { ...mode.record, ...changes } as Route });
    };
    return <form className="editor" onSubmit={e => { e.preventDefault(); saveRecord(draft); }}>
      <div className="section-heading"><h2>{draft.kind === 'place' ? t('addPlace') : t('routeName')}</h2><Button type="button" variant="ghost" size="icon" aria-label={t('cancel')} disabled={photoBusy} onClick={cancel}><X /></Button></div>
      <p className="instruction">{draft.kind === 'place' ? (isCoordinate(draft.position) ? t('relocation') : t('pickPlace')) : (mode.kind === 'route' && mode.editable ? t('nodeEdit') : t('planned'))}</p>
      <Field title={`${t('titleZh')} *`}><Input required maxLength={160} value={draft.nameZh} onChange={e => update({ nameZh: e.target.value })} autoFocus /></Field>
      <Field title={t('titleEn')}><Input maxLength={160} value={draft.nameEn} onChange={e => update({ nameEn: e.target.value })} /></Field>
      {draft.kind === 'place' ? <>
        <Field title={t('category')}><select value={draft.category} onChange={e => update({ category: e.target.value as Category })}>{CATEGORY_IDS.map(id => <option key={id} value={id}>{CATEGORIES[id][language]}</option>)}</select></Field>
        <div className="coordinate-readout"><MapPin size={16} /><span>{isCoordinate(draft.position) ? positionText(draft.position) : t('pickPlace')}</span></div>
        <Field title={t('address')}><Input maxLength={500} value={draft.address} onChange={e => update({ address: e.target.value })} /></Field>
        <Field title={t('hours')}><Input maxLength={500} value={draft.hours} onChange={e => update({ hours: e.target.value })} /></Field>
        <Field title={t('contact')}><Input maxLength={500} value={draft.contact} onChange={e => update({ contact: e.target.value })} /></Field>
        <PlacePhotoEditor key={draft.id} photos={draft.photos || []} language={language} onBusyChange={setPhotoBusy} onChange={photos => setMode(current => current.kind === 'place' && current.record.id === draft.id ? { ...current, record: { ...current.record, photos } } : current)} />
      </> : <>
        <div className="route-stats"><span>{t('routeLength')}<b>{distance(draft.source === 'walking' ? draft.distance : pathDistance(draft.points))}</b></span><span>{t('vertices')}<b>{draft.points.length}</b></span></div>
        {draft.source === 'walking' && draft.duration !== undefined && <p>{t('estimatedTime')} · {Math.ceil(draft.duration / 60)} {t('minutes')}</p>}
        {data.records.some(r => r.id === draft.id && r.kind === 'route' && r.source === 'walking') && <p className="subtle">{t('editWalkingNote')}</p>}
        {mode.kind === 'route' && mode.editable && <details className="vertex-list"><summary>{t('vertices')} ({draft.points.length})</summary>{draft.points.map((p,i) => <div key={i}><code>{i+1}. {positionText(p)}</code><Button type="button" size="icon-sm" variant="ghost" aria-label={`${t('removeNode')} ${i+1}`} onClick={() => update({ points: draft.points.filter((_,j) => j !== i) })}><X /></Button></div>)}</details>}
      </>}
      <Field title={t('description')}><Textarea maxLength={5000} rows={3} value={draft.description} onChange={e => update({ description: e.target.value })} /></Field>
      <div className="editor-actions"><Button type="button" variant="outline" disabled={photoBusy} onClick={cancel}>{t('cancel')}</Button><Button type="submit" disabled={photoBusy || !mapEnabled || !draft.nameZh.trim() || (draft.kind === 'place' ? !isCoordinate(draft.position) : !validPath(draft.points))}><Check />{t('save')}</Button></div>
    </form>;
  }
  function renderWalking() {
    if (mode.kind !== 'walking') return null;
    const walking = mode;
    function setEndpoint(role: 'start' | 'end', value: string) {
      const place = data.records.find(r => r.kind === 'place' && r.id === value) as Place | undefined;
      walkingSequence.current++;
      setMode({ ...walking, [role]: place?.position, pending: false, result: undefined, error: undefined });
      if (place) controller.current?.focus([place.position]);
    }
    return <div className="editor">
      <div className="section-heading"><h2>{t('planRoute')}</h2><Button variant="ghost" size="icon" aria-label={t('cancel')} onClick={cancel}><X /></Button></div>
      {(['start', 'end'] as const).map(role => <div className="endpoint" key={role}>
        <label htmlFor={`endpoint-${role}`}>{t(role)}</label>
        <Button variant={walking.picking === role ? 'default' : 'outline'} onClick={() => setMode({ ...walking, picking: role })}><MapPin />{t(role === 'start' ? 'pickStart' : 'pickEnd')}</Button>
        <code>{positionText(walking[role])}</code>
        <select id={`endpoint-${role}`} value={data.records.find(r => r.kind === 'place' && walking[role] && r.position[0] === walking[role]?.[0] && r.position[1] === walking[role]?.[1])?.id || ''} onChange={e => setEndpoint(role, e.target.value)}><option value="">{t('chooseSaved')}</option>{data.records.filter((r): r is Place => r.kind === 'place').map(r => <option key={r.id} value={r.id}>{recordName(r, language)}</option>)}</select>
      </div>)}
      <Button className="full-width" disabled={!walking.start || !walking.end || !validPath([walking.start, walking.end]) || walking.pending} onClick={calculate}><Navigation />{t(walking.pending ? 'planning' : 'calculate')}</Button>
      {walking.error && <p role="alert" className="inline-error">{t(walking.error)}</p>}
      {walking.result && <div className="walk-result"><h3>{t('planned')}</h3><div className="route-stats"><span>{t('routeLength')}<b>{distance(walking.result.distance)}</b></span><span>{t('estimatedTime')}<b>{Math.ceil(walking.result.duration/60)} {t('minutes')}</b></span></div><Button className="full-width" onClick={() => { if (walking.result) setMode({ kind: 'route', record: makeRoute(walking.result.points, walking.result), editable: false }); }}>{t('saveRoute')}</Button></div>}
      <Button variant="outline" className="full-width" onClick={() => startDraw([walking.start, walking.end].filter(Boolean) as Coordinate[])}>{t('manualFallback')}</Button>
      <p className="subtle">{t('distanceNotice')}</p><Button variant="ghost" className="full-width" onClick={cancel}>{t('cancel')}</Button>
    </div>;
  }
  function renderDetails() {
    if (!selected) return null;
    const route = selected.kind === 'route';
    return <section className="detail-panel">
      <Button variant="ghost" onClick={() => setSelectedId(undefined)}><ArrowLeft />{t(sharedView ? 'detail' : 'saved')}</Button>
      <div className="detail-category" style={{ color: selected.kind === 'route' ? '#007da3' : CATEGORIES[selected.category].color }}>{route ? <RouteIcon size={20} /> : <MapPin size={20} />}{selected.kind === 'route' ? t('relaxation') : CATEGORIES[selected.category][language]}</div>
      <h2>{recordName(selected, language)}</h2>
      {language === 'zh' && selected.nameEn && <p className="subtle">{selected.nameEn}</p>}
      <p className="description">{selected.description || t('noDescription')}</p>
      {selected.kind === 'place' && <PlacePhotoGallery photos={selected.photos || []} language={language} />}
      {selected.kind === 'place' ? <dl className="detail-fields">{([[t('address'), selected.address], [t('hours'), selected.hours], [t('contact'), selected.contact], [t('position'), positionText(selected.position)]]).filter(([,v]) => v).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <><div className="route-stats"><span>{t('routeLength')}<b>{distance(selected.distance)}</b></span>{selected.duration !== undefined && <span>{t('estimatedTime')}<b>{Math.ceil(selected.duration/60)} {t('minutes')}</b></span>}</div><p className="subtle">{t('source')}: {t(selected.source === 'manual' ? 'manual' : 'walking')}</p><p className="subtle">{t('distanceNotice')}</p></>}
      {selected.kind === 'place' && <div className="place-navigation"><Button asChild className="full-width"><a href={placeNavigationUrl(selected, language)} target="_blank" rel="noopener noreferrer"><Navigation />{t('navigateToPlace')}</a></Button><p className="subtle">{t('navigationHelp')}</p></div>}
      {!sharedView && <div className="editor-actions"><Button variant="outline" disabled={!mapEnabled} onClick={() => editRecord(selected)}><Pencil />{t('edit')}</Button><Button variant="outline" className="danger-button" disabled={storageBlocked} onClick={() => setConfirmation({ kind: 'delete', record: selected })}><Trash2 />{t('remove')}</Button></div>}
    </section>;
  }
  return <main className="health-app">
    <header className="app-header">
      <a href="/" className="brand" aria-label="Tongji Health Map"><span className="brand-mark"><HeartPulse /></span><span><b>TONGJI <span>HEALTH MAP</span></b><small>{language === 'zh' ? '同济大学 · 健康生活地图' : 'Tongji University · Health resources'}</small></span></a>
      <div className="header-meta"><span className="campus-label"><MapPin size={15} />{t('campus')}</span><span className="local-label"><ShieldCheck size={15} />{t(sharedView ? 'shared' : 'local')}</span></div>
      <Button variant="ghost" className="language-toggle" onClick={switchLanguage} aria-label={language === 'zh' ? 'Switch to English' : '切换为中文'}><Globe2 size={17} />{language === 'zh' ? 'EN' : '中文'}</Button>
    </header>
    <div className="workspace">
      <aside className={`sidebar ${panelOpen ? 'expanded' : 'collapsed'}`} aria-label={t('resources')}>
        <button className="mobile-handle" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen}><span />{t(panelOpen ? 'hidePanel' : 'viewPanel')}{panelOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
        <div className="sidebar-scroll">
          <div className="source-tabs" role="tablist" aria-label={t('source')} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || active || confirmation || uploadBackup) return; e.preventDefault(); switchSource(!sharedView); document.getElementById(sharedView ? 'mine-tab' : 'shared-tab')?.focus(); }}><button id="mine-tab" role="tab" aria-controls="source-content" aria-selected={!sharedView} tabIndex={sharedView ? -1 : 0} disabled={active || !!confirmation || !!uploadBackup} onClick={() => switchSource(false)}>{t('saved')}</button><button id="shared-tab" role="tab" aria-controls="source-content" aria-selected={sharedView} tabIndex={sharedView ? 0 : -1} disabled={active || !!confirmation || !!uploadBackup} onClick={() => switchSource(true)}>{t('shared')}</button></div>
          <div id="source-content" role="tabpanel" aria-labelledby={sharedView ? 'shared-tab' : 'mine-tab'}>
          {sharedView && <SharedBackupPanel language={language} refresh={sharedRefresh} onLoaded={value => { setSharedBackups(previous => [...previous.filter(item => item.summary.id !== value.summary.id), value]); setSelectedId(undefined); setFilter('all'); setPreview(undefined); setMessage(undefined); }} onRemoved={(id, deleted) => { setSharedBackups(previous => previous.filter(item => item.summary.id !== id)); setSelectedId(undefined); setFilter('all'); setPreview(undefined); if (deleted) notify('sharedSelectionDeleted', true); }} />}
          {sharedView && sharedBackups.length > 0 && <div className="shared-banner"><b>{t('selectedShared')}: {sharedBackups.length}</b><span>{sharedBackups.map(value => value.summary.name).join(' · ')}</span><small>{t('sharedReadonly')}</small><Button variant="outline" size="sm" onClick={() => switchSource(false)}>{t('returnMine')}</Button></div>}
          {storageBlocked && <p className="inline-error" role="alert">{t('restoreError')}</p>}
          {mode.kind === 'place' || mode.kind === 'route' ? renderForm() : mode.kind === 'walking' ? renderWalking() : mode.kind === 'draw' ? <section className="editor drawing-panel"><span className="section-icon"><RouteIcon /></span><h2>{t('drawing')}</h2><p className="instruction">{t('drawingHelp')}</p><div className="route-stats"><span>{t('vertices')}<b>{mode.points.length}</b></span><span>{t('routeLength')}<b>{distance(pathDistance(mode.points))}</b></span></div><Button variant="outline" className="full-width" disabled={!mode.points.length} onClick={() => setMode({ ...mode, points: mode.points.slice(0,-1) })}><Undo2 />{t('undo')}</Button><Button className="full-width" disabled={!validPath(mode.points)} onClick={() => setMode({ kind: 'route', record: makeRoute(mode.points), editable: true })}><Check />{t('finish')}</Button><Button variant="ghost" className="full-width" onClick={cancel}>{t('cancel')}</Button></section> : selected ? renderDetails() : sharedView && !sharedBackups.length ? null : <>
            {!sharedView && <section className="search-section"><div className="section-heading"><h1>{t('resources')}</h1><span className="small-badge">{t('campus')}</span></div><form className="search-box" onSubmit={e => { e.preventDefault(); void runSearch(); }}><Search size={18} /><Input aria-label={t('search')} placeholder={t('searchPlaceholder')} value={query} disabled={!mapEnabled} maxLength={100} onChange={e => setQuery(e.target.value)} /><Button type="submit" size="icon-sm" disabled={!mapEnabled || !query.trim() || searchPending} aria-label={t('search')}><Search size={16} /></Button></form></section>}
            {(results !== undefined || searchError || searchPending) && <section className="search-results"><div className="section-heading"><h2>{t('searchResults')}</h2><Button variant="ghost" size="icon-sm" aria-label={t('close')} onClick={() => { searchSequence.current++; setResults(undefined); setSearchError(undefined); setSearchPending(false); setPreview(undefined); }}><X /></Button></div>{searchPending && <p className="subtle" role="status">{t('searchBusy')}</p>}{searchError && <p className="subtle" role="status">{t(searchError)}</p>}{results?.map(poi => <div key={poi.id} className={`search-result ${preview?.id === poi.id ? 'selected' : ''}`}><button onClick={() => setPreview(poi)}><MapPin size={18} /><span><b>{poi.name}</b><small>{poi.address}</small></span></button>{preview?.id === poi.id && <Button size="sm" className="full-width" onClick={() => preparePlace(poi.position, poi)}>{t('confirmPlace')}</Button>}</div>)}</section>}
            <section className="category-section"><div className="category-grid"><button className={`category-chip ${filter === 'all' ? 'selected' : ''}`} onClick={() => { setFilter('all'); setPreview(undefined); }}><Layers size={18} />{t('all')}<span>{displayData.records.length}</span></button>{CATEGORY_IDS.map(id => <button className={`category-chip ${filter === id ? 'selected' : ''}`} style={{ '--category-color': CATEGORIES[id].color } as CSSProperties} key={id} onClick={() => { setFilter(id); setPreview(undefined); }}><CategoryIcon category={id} />{CATEGORIES[id][language]}<span>{displayData.records.filter(r => r.category === id).length}</span></button>)}<button className={`category-chip ${filter === 'relaxation' ? 'selected' : ''}`} onClick={() => { setFilter('relaxation'); setPreview(undefined); }}><RouteIcon size={18} />{t('relaxation')}<span>{displayData.records.filter(r => r.kind === 'route').length}</span></button></div></section>
            <section className="annotations"><div className="section-heading"><h2>{t(sharedView ? 'sharedAnnotations' : 'saved')}</h2><span className="annotation-count">{visible.length}</span></div>{visible.length ? <div className="record-list">{visible.map(r => <button className="record-card" key={r.id} onClick={() => selectRecord(r)}><span className="record-icon" style={{ color: r.kind === 'place' ? CATEGORIES[r.category].color : '#007da3' }}>{r.kind === 'place' ? <CategoryIcon category={r.category} size={22} /> : <RouteIcon size={20} />}</span><span><b>{recordName(r, language)}</b><small>{r.kind === 'place' ? CATEGORIES[r.category][language] : `${t('relaxation')} · ${distance(r.distance)}`}</small></span><ChevronDown className="card-chevron" size={16} /></button>)}</div> : <div className="empty-state"><span><MapPin size={28} /></span><h3>{filter === 'all' ? t('emptyTitle') : t('filteredEmpty')}</h3><p>{t('emptyBody')}</p></div>}</section>
          </>}
          </div>
        </div>
        <footer className="sidebar-footer"><div><Button variant="ghost" size="sm" disabled={!hydrated || (sharedView && !sharedBackups.length)} onClick={exportData}><ArrowDownToLine />{t(sharedView ? 'downloadShared' : 'export')}</Button>{!sharedView && <Button variant="ghost" size="sm" disabled={!hydrated || active || !!uploadBackup} onClick={() => fileInput.current?.click()}><ArrowUpFromLine />{t('import')}</Button>}</div>{!sharedView && <Button className="full-width" variant="outline" size="sm" disabled={!hydrated || active || storageBlocked || !data.records.length || !sharedServiceEnabled} onClick={() => setUploadBackup(data)}>{t('uploadShared')}</Button>}<p>{t(sharedView ? 'sharedReadonly' : 'localNotice')}</p><input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => void importData(e.target.files?.[0])} /></footer>
      </aside>
      <section className="map-area" aria-label={language === 'zh' ? '校园地图' : 'Campus map'}>
        <div ref={mapElement} className="map-container" />
        {status !== 'ready' && <div className="map-unavailable"><div className="setup-card"><div className="setup-icon"><MapPin /></div><span className="setup-eyebrow">TONGJI · SIPING CAMPUS</span><h2>{t(status === 'missing' ? 'noKeyTitle' : status === 'loading' ? 'loading' : 'mapError')}</h2>{status === 'missing' ? <><p>{t('noKeyBody')}</p><ol className="setup-steps"><li>{t('configStep1')}</li><li>{t('configStep2')}</li><li>{t('configStep3')}</li></ol><code className="config-example">NEXT_PUBLIC_AMAP_KEY=…<br />NEXT_PUBLIC_AMAP_SECURITY_CODE=…</code><a className="setup-link" href="https://lbs.amap.com/api/javascript-api-v2/prerequisites" target="_blank" rel="noreferrer">{t('applyKey')}<ExternalLink size={16} /></a></> : status === 'error' ? <><p>{t('mapErrorBody')}</p><Button onClick={() => setMapAttempt(mapAttempt + 1)}>{t('retry')}</Button></> : <p className="subtle">AMap JS API 2.0</p>}</div></div>}
        <div className="map-toolbar"><Button disabled={!mapEnabled || active} onClick={() => preparePlace()}><Plus /><span>{t('addPlace')}</span></Button><Button variant="outline" disabled={!mapEnabled || active} onClick={() => startDraw()}><RouteIcon /><span>{t('drawRoute')}</span></Button><Button variant="outline" disabled={!mapEnabled || active} onClick={() => { setSelectedId(undefined); setPreview(undefined); setPanelOpen(true); setMode({ kind: 'walking', picking: 'start', pending: false }); }}><Navigation /><span>{t('planRoute')}</span></Button></div>
        {active && <div className="map-instruction"><MapPin size={17} /><span>{mode.kind === 'place' ? t('pickPlace') : mode.kind === 'draw' ? t('drawing') : mode.kind === 'walking' ? t(mode.picking === 'start' ? 'pickStart' : 'pickEnd') : mode.editable ? t('nodeEdit') : t('planned')}</span></div>}
        <div className="map-controls"><Button variant="outline" size="icon" disabled={status !== 'ready'} aria-label={t('home')} title={t('home')} onClick={() => controller.current?.home()}><LocateFixed /></Button><div><Button variant="outline" size="icon" disabled={status !== 'ready'} aria-label={t('zoomIn')} onClick={() => controller.current?.map.zoomIn()}><Plus /></Button><Button variant="outline" size="icon" disabled={status !== 'ready'} aria-label={t('zoomOut')} onClick={() => controller.current?.map.zoomOut()}><Minus /></Button></div><Button variant="outline" size="icon" disabled={status !== 'ready'} aria-label={t(satellite ? 'standard' : 'satellite')} title={t(satellite ? 'standard' : 'satellite')} aria-pressed={satellite} onClick={() => setSatellite(!satellite)}><Layers /></Button></div>
        <div className="map-context"><span><MapPin size={14} />{t('campus')}</span><span>{displayData.records.length} {t('total')}</span></div>
        <div className="map-legend"><RouteIcon size={16} /><span>{t('relaxation')}</span></div>
      </section>
    </div>
    {message && <div className={`notification ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}><span>{t(message.key)}</span><Button size="icon-sm" variant="ghost" aria-label={t('close')} onClick={() => setMessage(undefined)}><X /></Button></div>}
    {uploadBackup && <SharedUploadDialog backup={uploadBackup} language={language} onClose={() => setUploadBackup(undefined)} onUploaded={() => { setUploadBackup(undefined); setSharedRefresh(value => value + 1); notify('sharedUploaded'); }} />}
    <Dialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(undefined); }}><DialogContent className="confirm-dialog" showCloseButton={false}><DialogTitle>{t(confirmation?.kind === 'import' ? 'importTitle' : 'deleteTitle')}</DialogTitle><DialogDescription>{t(confirmation?.kind === 'import' ? 'importBody' : 'deleteBody')}</DialogDescription>{confirmation?.kind === 'import' ? <p className="import-count">{confirmation.backup.records.filter(r => r.kind === 'place').length} {t('places')} · {confirmation.backup.records.filter(r => r.kind === 'route').length} {t('routes')}</p> : confirmation && <p>{recordName(confirmation.record, language)}</p>}<div className="editor-actions"><Button variant="outline" onClick={() => setConfirmation(undefined)}>{t('cancel')}</Button><Button className={confirmation?.kind === 'delete' ? 'danger-solid' : ''} onClick={confirmAction}>{t(confirmation?.kind === 'import' ? 'replace' : 'remove')}</Button></div></DialogContent></Dialog>
  </main>;
}
