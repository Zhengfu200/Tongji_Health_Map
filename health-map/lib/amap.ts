import { CAMPUS_CENTER, CATEGORIES, isCoordinate, validPath, recordName, type Coordinate, type Language, type MapRecord } from './model.ts';

// The dynamically loaded SDK is contained in this adapter; app state never stores SDK objects.
type SDK = Record<string, any>;
export interface SearchResult { id: string; name: string; address: string; position: Coordinate }
export interface WalkResult { points: Coordinate[]; distance: number; duration: number }
export interface MapDraft { kind: 'place' | 'route' | 'walking'; position?: Coordinate; points?: Coordinate[]; editable?: boolean; connect?: boolean; endpointsOnly?: boolean }
export interface MapCallbacks { click: (p: Coordinate) => void; select: (id: string) => void; placeMove: (p: Coordinate) => void; routeMove: (p: Coordinate[]) => void }
declare global { interface Window { AMapLoader?: { load: (options: object) => Promise<SDK> }; _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string } } }
let loaderPromise: Promise<void> | undefined;
export function loadAMap(key: string, securityCode: string): Promise<SDK> {
  if (!key || !securityCode) return Promise.reject(new Error('MISSING_KEY'));
  window._AMapSecurityConfig = { securityJsCode: securityCode };
  if (!window.AMapLoader && !loaderPromise) {
    loaderPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://webapi.amap.com/loader.js';
      script.async = true;
      const timer = window.setTimeout(() => { script.remove(); reject(new Error('MAP_TIMEOUT')); }, 15000);
      script.onload = () => { clearTimeout(timer); window.AMapLoader ? resolve() : reject(new Error('MAP_LOAD_FAILED')); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('MAP_LOAD_FAILED')); };
      document.head.appendChild(script);
    }).catch(e => { loaderPromise = undefined; throw e; });
  }
  return (loaderPromise || Promise.resolve()).then(() => {
    if (!window.AMapLoader) throw new Error('MAP_LOAD_FAILED');
    return withDeadline(window.AMapLoader.load({ key, version: '2.0', plugins: ['AMap.Scale', 'AMap.PlaceSearch', 'AMap.Walking', 'AMap.PolylineEditor'] }), 18000);
  });
}
export function withDeadline<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SERVICE_TIMEOUT')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
function coordinate(value: any): Coordinate | undefined {
  const p = Array.isArray(value) ? value : [value?.getLng?.() ?? value?.lng, value?.getLat?.() ?? value?.lat];
  return isCoordinate(p) ? [p[0], p[1]] : undefined;
}
export function searchPlaces(sdk: SDK, query: string): Promise<SearchResult[]> {
  return withDeadline(new Promise((resolve, reject) => {
    const search = new sdk.PlaceSearch({ city: '上海', citylimit: true, pageSize: 20, extensions: 'base' });
    search.searchNearBy(query.trim(), CAMPUS_CENTER, 1800, (status: string, result: any) => {
      if (status === 'no_data') return resolve([]);
      if (status !== 'complete') return reject(new Error('SEARCH_ERROR'));
      const pois = result?.poiList?.pois;
      if (!Array.isArray(pois)) return reject(new Error('SEARCH_ERROR'));
      resolve(pois.flatMap((poi: any) => {
        const position = coordinate(poi.location);
        return position && typeof poi.name === 'string' ? [{ id: String(poi.id || poi.name), name: poi.name, address: typeof poi.address === 'string' ? poi.address : '', position }] : [];
      }));
    });
  }));
}
export function planWalking(sdk: SDK, start: Coordinate, end: Coordinate): Promise<WalkResult> {
  if (!isCoordinate(start) || !isCoordinate(end) || !validPath([start, end])) return Promise.reject(new Error('INVALID_ENDPOINTS'));
  return withDeadline(new Promise((resolve, reject) => {
    const walking = new sdk.Walking({ hideMarkers: true });
    walking.search(start, end, (status: string, result: any) => {
      if (status === 'no_data') return reject(new Error('NO_ROUTE'));
      if (status !== 'complete') return reject(new Error('WALK_ERROR'));
      const route = result?.routes?.[0];
      const points: Coordinate[] = [];
      for (const step of route?.steps || []) for (const raw of step.path || []) {
        const p = coordinate(raw), previous = points.at(-1);
        if (p && (!previous || p[0] !== previous[0] || p[1] !== previous[1])) points.push(p);
      }
      if (!validPath(points) || !Number.isFinite(Number(route?.distance)) || Number(route.distance) <= 0 || !Number.isFinite(Number(route?.time)) || Number(route.time) < 0) return reject(new Error('NO_ROUTE'));
      resolve({ points, distance: Number(route.distance), duration: Number(route.time) });
    });
  }));
}

export class AMapController {
  sdk: SDK;
  map: any;
  callbacks: MapCallbacks;
  records: any[] = [];
  draftObjects: any[] = [];
  editor: any;
  editPolyline: any;
  editSignature = '';
  destroyed = false;
  ready = false;
  preview: any;
  satellite: any;
  roads: any;
  onClick: (event: any) => void;
  cancelReady?: () => void;
  constructor(sdk: SDK, container: HTMLElement, callbacks: MapCallbacks) {
    this.sdk = sdk; this.callbacks = callbacks;
    this.map = new sdk.Map(container, { center: CAMPUS_CENTER, zoom: 17, zooms: [3, 20], viewMode: '2D', features: ['bg', 'road', 'building', 'point'], showLabel: true, resizeEnable: true });
    this.map.addControl(new sdk.Scale());
    this.onClick = event => { const p = coordinate(event.lnglat); if (p) this.callbacks.click(p); };
    this.map.on('click', this.onClick);
  }
  waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const complete = () => { clearTimeout(timer); this.cancelReady = undefined; this.map.off('complete', complete); this.ready = true; resolve(); };
      const timer = setTimeout(() => { this.cancelReady = undefined; this.map.off('complete', complete); reject(new Error('MAP_TIMEOUT')); }, 18000);
      this.cancelReady = () => { clearTimeout(timer); this.map.off('complete', complete); reject(new Error('MAP_DISPOSED')); };
      this.map.on('complete', complete);
    });
  }
  render(records: MapRecord[], lang: Language, selectedId?: string) {
    this.map.remove(this.records); this.records = [];
    for (const r of records) {
      const active = r.id === selectedId;
      let overlay;
      if (r.kind === 'place') {
        const content = document.createElement('div');
        content.className = `map-pin${active ? ' active' : ''}`;
        content.style.setProperty('--pin-color', CATEGORIES[r.category].color);
        const dot = document.createElement('span');
        if (r.category === 'clinic') dot.className = 'pin-plus';
        else dot.textContent = CATEGORIES[r.category].symbol;
        const label = document.createElement('b'); label.textContent = recordName(r, lang);
        content.appendChild(dot); content.appendChild(label);
        overlay = new this.sdk.Marker({ position: r.position, content, anchor: 'bottom-center', zIndex: active ? 150 : 100, title: recordName(r, lang), bubble: false });
      } else overlay = new this.sdk.Polyline({ path: r.points, strokeColor: active ? '#063d94' : '#007da3', strokeWeight: active ? 7 : 5, strokeOpacity: .88, showDir: true, lineJoin: 'round', bubble: false });
      overlay.on('click', () => this.callbacks.select(r.id));
      this.records.push(overlay);
    }
    this.map.add(this.records);
  }
  clearDraft() {
    if (this.editor) { this.editor.close(); this.editor = undefined; }
    this.editPolyline = undefined; this.editSignature = '';
    this.map.remove(this.draftObjects); this.draftObjects = [];
  }
  renderDraft(draft?: MapDraft) {
    if (draft?.kind === 'route' && draft.editable && this.editor) {
      const signature = JSON.stringify(draft.points);
      if (signature !== this.editSignature) { this.editPolyline.setPath(draft.points); this.editSignature = signature; }
      return;
    }
    this.clearDraft();
    if (!draft) return;
    const points = draft.kind === 'place' ? (draft.position ? [draft.position] : []) : (draft.points || []);
    if (draft.kind !== 'place' && points.length >= 2 && draft.connect !== false) {
      const line = new this.sdk.Polyline({ path: points, strokeColor: '#175ad3', strokeWeight: 6, strokeStyle: draft.kind === 'walking' ? 'dashed' : 'solid', lineJoin: 'round', showDir: true, zIndex: 160 });
      this.draftObjects.push(line);
      if (draft.editable) {
        this.editPolyline = line; this.editSignature = JSON.stringify(points);
        this.editor = new this.sdk.PolylineEditor(this.map, line);
        const changed = () => {
          const next = line.getPath().map(coordinate).filter(Boolean) as Coordinate[];
          this.editSignature = JSON.stringify(next); this.callbacks.routeMove(next);
        };
        for (const event of ['adjust', 'addnode', 'removenode']) this.editor.on(event, changed);
        this.map.add(line); this.editor.open();
        return;
      }
    }
    const markerPoints = draft.endpointsOnly && points.length > 2 ? [points[0], points[points.length-1]] : points;
    markerPoints.forEach((p, index) => {
      const content = document.createElement('div'); content.className = `draft-pin${draft.kind === 'place' ? ' pin-plus' : ''}`;
      if (draft.kind !== 'place') content.textContent = String(index + 1);
      const marker = new this.sdk.Marker({ position: p, content, anchor: 'center', zIndex: 170, draggable: draft.kind === 'place', bubble: false });
      if (draft.kind === 'place') marker.on('dragend', (e: any) => { const next = coordinate(e.lnglat); if (next) this.callbacks.placeMove(next); });
      this.draftObjects.push(marker);
    });
    this.map.add(this.draftObjects);
  }
  setPreview(position?: Coordinate) {
    if (this.preview) { this.map.remove(this.preview); this.preview = undefined; }
    if (position) { this.preview = new this.sdk.Marker({ position, zIndex: 180 }); this.map.add(this.preview); this.focus([position]); }
  }
  focus(points: Coordinate[]) {
    if (points.length === 1) this.map.setZoomAndCenter(18, points[0]);
    else if (points.length > 1) {
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      this.map.setBounds(new this.sdk.Bounds([Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]), false, [70, 70, 70, 70]);
    }
  }
  setLayer(value: boolean) {
    if (!this.satellite) { this.satellite = new this.sdk.TileLayer.Satellite(); this.roads = new this.sdk.TileLayer.RoadNet(); }
    if (value) this.map.add([this.satellite, this.roads]); else this.map.remove([this.satellite, this.roads]);
  }
  home() { this.map.setZoomAndCenter(17, CAMPUS_CENTER); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.cancelReady?.(); this.cancelReady = undefined;
    this.clearDraft(); this.map.off('click', this.onClick); this.map.destroy();
  }
}
