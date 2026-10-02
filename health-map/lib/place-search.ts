import { CAMPUS_CENTER, pathDistance, type Coordinate } from './model.ts';

export const SEARCH_RADIUS = 3000;
export const SEARCH_PAGE_SIZE = 50;
export interface SearchResult { id: string; name: string; address: string; position: Coordinate; type?: string; distance?: number }
export interface SearchCursor { keyword: string; page: number }
export interface SearchPage { results: SearchResult[]; next: SearchCursor[] }

const aliases = [
  ['食堂', '餐厅', '饮食广场', 'canteen', 'cafeteria'],
  ['校医院', '卫生服务', 'clinic'],
  ['图书馆', 'library'],
  ['体育馆', 'gym'],
  ['咖啡', 'coffee'],
  ['宿舍', '学生公寓', 'dormitory'],
] as const;

export function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, '');
}
function coreQuery(query: string): string {
  // Campus qualifiers are context, rather than a mandatory part of every POI name.
  return query.normalize('NFKC').toLowerCase().replace(/同济大学|同济|四平路校区|四平校区|tongji\s+university|tongji/gi, '').trim() || query.trim();
}
function alternatives(term: string): readonly string[] {
  return aliases.find(group => group.some(alias => normalizeSearch(alias) === term)) || [term];
}
export function searchKeywords(query: string): string[] {
  const core = coreQuery(query), compact = normalizeSearch(core);
  const keywords = new Set([query.normalize('NFKC').trim(), compact]);
  for (const group of aliases) {
    const matched = group.find(alias => compact.includes(normalizeSearch(alias)));
    if (matched) for (const alias of group.slice(0, 3)) keywords.add(compact.replace(normalizeSearch(matched), alias));
  }
  // Individual terms allow a name and an address to match separate fields.
  for (const term of core.split(/[\p{P}\p{Z}\s]+/u).filter(Boolean)) keywords.add(term);
  return [...keywords].filter(Boolean).slice(0, 8);
}
export function rankPlaces(places: SearchResult[], query: string): SearchResult[] {
  const unique = new Map<string, SearchResult>();
  for (const place of places) if (!unique.has(place.id)) unique.set(place.id, place);
  const core = normalizeSearch(coreQuery(query));
  const campusRequested = /同济|tongji/i.test(query);
  const terms = coreQuery(query).split(/[\p{P}\p{Z}\s]+/u).filter(Boolean).map(normalizeSearch);
  const score = (place: SearchResult) => {
    const name = normalizeSearch(place.name), address = normalizeSearch(place.address), type = normalizeSearch(place.type || '');
    const coreVariants = alternatives(core).map(normalizeSearch);
    let points = name === core ? 1000 : name.includes(core) ? 600 : coreVariants.some(v => name.includes(v)) ? 550 : address.includes(core) ? 240 : type.includes(core) ? 120 : 0;
    if (campusRequested && /同济|tongji/.test(name + address)) points += 500;
    let matched = 0;
    for (const term of terms) {
      const variants = alternatives(term).map(normalizeSearch);
      if (variants.some(v => name.includes(v))) { points += 100; matched++; }
      else if (variants.some(v => address.includes(v))) { points += 40; matched++; }
      else if (variants.some(v => type.includes(v))) { points += 20; matched++; }
    }
    return points + (matched === terms.length ? 300 : 0);
  };
  // Keep SDK fuzzy/pinyin matches even when their literal fields do not match.
  return [...unique.values()].sort((a, b) => score(b) - score(a)
    || (a.distance ?? pathDistance([CAMPUS_CENTER, a.position])) - (b.distance ?? pathDistance([CAMPUS_CENTER, b.position]))
    || a.name.localeCompare(b.name, 'zh-CN'));
}
