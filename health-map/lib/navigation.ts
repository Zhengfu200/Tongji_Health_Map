import { recordName, type Language, type Place } from './model';

// AMap URI supports GCJ-02 destinations on desktop and mobile. An omitted
// origin lets mobile AMap use the current location; desktop can choose one.
// https://lbs.amap.com/api/uri-api/guide/travel/route
export function placeNavigationUrl(place: Pick<Place, 'position' | 'nameZh' | 'nameEn'>, language: Language): string {
  const [longitude, latitude] = place.position;
  // Commas separate the three destination fields in the URI API.
  const name = recordName(place, language).replace(/,/g, '，');
  const url = new URL('https://uri.amap.com/navigation');
  url.search = new URLSearchParams({
    to: `${longitude.toFixed(6)},${latitude.toFixed(6)},${name}`,
    mode: 'walk',
    src: 'TongjiHealthMap',
    callnative: '1',
  }).toString();
  return url.toString();
}
