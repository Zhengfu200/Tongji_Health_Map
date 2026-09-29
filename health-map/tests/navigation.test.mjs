import test from 'node:test';
import assert from 'node:assert/strict';
import { placeNavigationUrl } from '../lib/navigation.ts';

test('navigation keeps GCJ-02 longitude/latitude order and safely encodes destination names', () => {
  const place = { position: [121.501612345, 31.284812345], nameZh: '食堂,北门 & #1 + 入口', nameEn: '' };
  const url = new URL(placeNavigationUrl(place, 'zh'));
  assert.equal(url.origin, 'https://uri.amap.com');
  assert.equal(url.pathname, '/navigation');
  assert.equal(url.searchParams.get('to'), '121.501612,31.284812,食堂，北门 & #1 + 入口');
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.get('mode'), 'walk');
  assert.equal(url.searchParams.get('callnative'), '1');
  assert.equal(url.searchParams.has('from'), false);
});

test('navigation uses the selected language and falls back to the Chinese name', () => {
  const place = { position: [121.5016, 31.2848], nameZh: '运动场', nameEn: 'Sports field' };
  assert.ok(new URL(placeNavigationUrl(place, 'en')).searchParams.get('to').endsWith(',Sports field'));
  assert.ok(new URL(placeNavigationUrl({ ...place, nameEn: '  ' }, 'en')).searchParams.get('to').endsWith(',运动场'));
});
