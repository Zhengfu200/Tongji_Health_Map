import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPlacesPage } from '../lib/amap.ts';
import { normalizeSearch, searchKeywords, rankPlaces } from '../lib/place-search.ts';

const poi = (id, name, extra = {}) => ({ id, name, address: '四平路1239号', location: { lng: 121.5016, lat: 31.2848 }, ...extra });
test('normalization, campus qualifiers and aliases expand recall', () => {
  assert.equal(normalizeSearch(' ＡＢＣ（馆） '), 'abc馆');
  assert.ok(searchKeywords('同济大学食堂').includes('食堂'));
  assert.ok(searchKeywords('同济大学食堂').includes('饮食广场'));
  assert.ok(searchKeywords('Tongji University library').includes('图书馆'));
  assert.ok(searchKeywords('四平路 咖啡').includes('咖啡'));
});
test('ranking favors exact names, cross-field terms and aliases; retains pinyin matches', () => {
  const p = (id, name, address = '', type = '') => ({ id, name, address, type, position: [121.5016, 31.2848] });
  assert.equal(rankPlaces([p('address', '商店', '图书馆路'), p('partial', '同济大学图书馆'), p('exact', '图书馆')], '图书馆')[0].id, 'exact');
  assert.equal(rankPlaces([p('name', '咖啡店', '远处'), p('both', '咖啡店', '四平路')], '四平路 咖啡')[0].id, 'both');
  assert.equal(rankPlaces([p('other', '商店'), p('alias', '学苑饮食广场')], '食堂')[0].id, 'alias');
  assert.equal(rankPlaces([p('outside', '社区食堂'), p('campus', '同济大学学苑饮食广场')], '同济大学食堂')[0].id, 'campus');
  assert.equal(rankPlaces([p('pinyin', '同济大学图书馆')], 'tushuguan').length, 1);
});
test('search paginates every keyword, removes duplicates and rejects distant or invalid POIs', async () => {
  const calls = [];
  const sdk = { PlaceSearch: class {
    constructor(options) { this.options = options; }
    searchNearBy(keyword, center, radius, cb) {
      calls.push({ keyword, radius, ...this.options });
      const page = this.options.pageIndex;
      cb('complete', { poiList: { count: 51, pois: page === 1 ? [poi('one', '图书馆'), poi('far', '远处图书馆', { location: { lng: 121.6, lat: 31.3 } }), poi('bad', '无坐标', { location: null })] : [poi('two', '第二图书馆')] } });
    }
  } };
  const first = await searchPlacesPage(sdk, '同济大学图书馆');
  assert.deepEqual(first.results.map(p => p.id), ['one']);
  assert.equal(first.next.length, searchKeywords('同济大学图书馆').length);
  assert.ok(first.next.every(c => c.page === 2));
  const second = await searchPlacesPage(sdk, '同济大学图书馆', first.next);
  assert.deepEqual(second.results.map(p => p.id), ['two']);
  assert.deepEqual(second.next, []);
  assert.equal(rankPlaces([...first.results, ...second.results, ...first.results], '图书馆').length, 2);
  assert.ok(calls.every(c => c.radius === 3000 && c.type === '' && c.pageSize === 50));
});
test('failed pagination rejects so the same cursor can be retried; blank queries make no calls', async () => {
  const sdk = { PlaceSearch: class { searchNearBy(q, c, r, cb) { cb('error', {}); } } };
  await assert.rejects(searchPlacesPage(sdk, '图书馆', [{ keyword: '图书馆', page: 2 }]), /SEARCH_ERROR/);
  assert.deepEqual(await searchPlacesPage({}, '  '), { results: [], next: [] });
});

test('suggestion index supplies campus buildings absent from nearby search, within radius only', async () => {
  let suggestionCalls=0;
  const sdk={
    PlaceSearch:class { searchNearBy(q,c,r,cb){cb('no_data',{});} },
    AutoComplete:class { search(q,cb){suggestionCalls++;cb('complete',{tips:[
      {id:'B00156Z10Q',name:'同济大学四平路校区西南一楼',district:'上海市杨浦区',location:{lng:121.499119,lat:31.283741}},
      {id:'far',name:'外地西南一楼',location:{lng:121.43448,lat:31.147059}},
      {id:'district',name:'无坐标提示',location:''},
    ]});} },
  };
  const page=await searchPlacesPage(sdk,'西南一');
  assert.deepEqual(page.results.map(p=>p.id),['B00156Z10Q']);
  assert.deepEqual(page.results[0].position,[121.499119,31.283741]);
  await searchPlacesPage(sdk,'西南一',[{keyword:'西南一',page:2}]);
  assert.equal(suggestionCalls,1);
});

test('suggestions deduplicate POIs and optional suggestion errors retain nearby results', async () => {
  const sdk={
    PlaceSearch:class {searchNearBy(q,c,r,cb){cb('complete',{poiList:{count:1,pois:[poi('one','图书馆')]}});} },
    AutoComplete:class {search(q,cb){cb('complete',{tips:[{id:'one',name:'图书馆',location:{lng:121.5016,lat:31.2848}}]});} },
  };
  assert.equal((await searchPlacesPage(sdk,'图书馆')).results.length,1);
  sdk.AutoComplete=class {search(q,cb){cb('error',{});} };
  assert.equal((await searchPlacesPage(sdk,'图书馆')).results.length,1);
});
