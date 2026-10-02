import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPlaces, planWalking, withDeadline } from '../lib/amap.ts';
import { createMockSdk } from './mock-sdk.mjs';
test('campus search returns coordinates and ignores invalid POIs',async()=>{
  const {sdk,state}=createMockSdk();state.searchResult.poiList.pois.push({name:'bad',location:{lng:undefined,lat:31}});
  const found=await searchPlaces(sdk,'食堂');assert.equal(found.length,1);assert.deepEqual(found[0].position,[121.5017,31.285]);
  assert.equal(state.calls[0].options.city,'上海');assert.equal(state.calls[0].radius,3000);
});
test('search distinguishes no data and network/API error',async()=>{
  const {sdk,state}=createMockSdk();state.searchStatus='no_data';assert.deepEqual(await searchPlaces(sdk,'x'),[]);
  state.searchStatus='error';await assert.rejects(searchPlaces(sdk,'x'),/SEARCH_ERROR/);
});
test('walking normalizes paths, deduplicates junctions, preserves distance and seconds',async()=>{
  const {sdk}=createMockSdk();const result=await planWalking(sdk,[121.5016,31.2848],[121.5025,31.2853]);
  assert.equal(result.points.length,3);assert.equal(result.distance,240);assert.equal(result.duration,180);
});
test('walking distinguishes no route, invalid endpoints, malformed response and API errors',async()=>{
  const {sdk,state}=createMockSdk();const start=[121,31],end=[121.01,31];
  state.walkingStatus='no_data';await assert.rejects(planWalking(sdk,start,end),/NO_ROUTE/);
  state.walkingStatus='error';await assert.rejects(planWalking(sdk,start,end),/WALK_ERROR/);
  state.walkingStatus='complete';state.walkingResult={routes:[]};await assert.rejects(planWalking(sdk,start,end),/NO_ROUTE/);
  await assert.rejects(planWalking(sdk,start,start),/INVALID_ENDPOINTS/);
});
test('service deadline rejects stalled requests and propagates success',async()=>{
  await assert.rejects(withDeadline(new Promise(()=>{}),10),/SERVICE_TIMEOUT/);
  assert.equal(await withDeadline(Promise.resolve(42),10),42);
});
