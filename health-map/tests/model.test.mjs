import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_DATA, STORAGE_KEY, validateBackup, parseBackup, saveBackup, pathDistance, recordName, validPath } from '../lib/model.ts';
const place = { id:'p1', kind:'place', nameZh:'测试地点', nameEn:'Test place', description:'', updatedAt:'2026-09-29T00:00:00.000Z', category:'rest', position:[121.5016,31.2848], address:'', hours:'', contact:'' };
const route = { id:'r1', kind:'route', nameZh:'测试路线', nameEn:'', description:'', updatedAt:place.updatedAt, category:'relaxation', points:[[121.5016,31.2848],[121.5026,31.2848]], source:'manual', distance:1 };
const backup = (...records) => ({ ...EMPTY_DATA, records });
test('export/import round trip preserves places and computes manual route length', () => {
  const cleaned = validateBackup(backup(place,route));
  assert.deepEqual(parseBackup(JSON.stringify(cleaned)), cleaned);
  assert.ok(cleaned.records[1].distance > 90 && cleaned.records[1].distance < 100);
});
test('invalid coordinates, categories, duplicate IDs and short routes are rejected', () => {
  for (const record of [{...place,position:[181,31]}, {...place,position:['121',31]}, {...place,category:'unknown'}, {...route,points:[[121,31]]}, {...route,points:[[121,31],[121,31]]}, {...place,updatedAt:'unknown'}]) assert.throws(() => validateBackup(backup(record)));
  assert.throws(() => validateBackup(backup(place,place)));
  assert.throws(() => parseBackup('{broken'));
  assert.throws(() => validateBackup({...backup(place), coordinateSystem:'WGS84'}));
  assert.throws(() => validateBackup({...backup(place), version:2}));
});
test('backup strips unknown fields including credentials and manual duration', () => {
  const clean = validateBackup({...backup({...place,apiKey:'secret'}, {...route,duration:50}),securityJsCode:'secret'});
  assert.ok(!JSON.stringify(clean).includes('secret'));
  assert.equal(clean.records[1].duration,undefined);
});
test('saving failure throws and does not mutate current data', () => {
  const previous = backup(place), captured = JSON.stringify(previous);
  assert.throws(() => saveBackup({setItem(){throw new Error('QuotaExceededError');}},backup(place,route)));
  assert.equal(JSON.stringify(previous),captured);
});
test('save validates first and writes only the application key', () => {
  const writes = [];
  const clean = saveBackup({setItem(k,v){writes.push([k,v]);}},backup(place));
  assert.equal(writes[0][0],STORAGE_KEY);
  assert.deepEqual(JSON.parse(writes[0][1]),clean);
  assert.throws(() => saveBackup({setItem(){assert.fail('Invalid data must not be written');}},backup({...place,position:[NaN,31]})));
});
test('language fallback, valid paths and metric distance', () => {
  assert.equal(recordName(place,'en'),'Test place');
  assert.equal(recordName({...place,nameEn:''},'en'),'测试地点');
  assert.equal(validPath([]),false); assert.equal(validPath([[121,31],[121,31]]),false);
  assert.ok(Math.abs(pathDistance([[0,0],[0,1]]) - 111195) < 2);
});
