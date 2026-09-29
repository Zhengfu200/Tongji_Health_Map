import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createMockSdk } from './mock-sdk.mjs';
const dom = new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:5173/',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','Element','Node','NodeFilter','MutationObserver','DocumentFragment','Event','MouseEvent','CustomEvent','navigator','getComputedStyle']) Object.defineProperty(globalThis,name,{value:name==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[name],configurable:true,writable:true});
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);globalThis.PointerEvent=dom.window.MouseEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
process.env.NEXT_PUBLIC_AMAP_KEY='test-only';process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE='test-only';
process.env.NEXT_PUBLIC_SHARED_BACKUPS_API_URL='http://localhost:8787';
const originalFetch = globalThis.fetch;
const {render,screen,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
const {default:HealthMap}=await import('../components/health-map.tsx');
const {STORAGE_KEY,EMPTY_DATA}=await import('../lib/model.ts');
let sdk,state;
beforeEach(()=>{window.localStorage.clear();const mock=createMockSdk();sdk=mock.sdk;state=mock.state;window.AMapLoader={load:async()=>sdk};globalThis.localStorage=window.localStorage;});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
async function mount(){render(React.createElement(HealthMap));await waitFor(()=>assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,false));}
function clickMap(p){act(()=>state.maps.at(-1).click(p));}
const saved=()=>JSON.parse(window.localStorage.getItem(STORAGE_KEY)).records;
async function addPlace(name='测试地点'){
  fireEvent.click(screen.getByRole('button',{name:'标注地点',exact:true}));clickMap([121.5016,31.2848]);fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:name}});fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));
}
test('place creation, cancel restores position, drag changes saved position, deletion',async()=>{
  await mount();await addPlace();assert.equal(saved().length,1);
  fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));clickMap([121.502,31.285]);fireEvent.click(screen.getAllByRole('button',{name:'取消',exact:true}).at(-1));assert.deepEqual(saved()[0].position,[121.5016,31.2848]);
  fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));
  act(()=>state.markers.findLast(m=>m.options.draggable).emit('dragend',{lnglat:{lng:121.503,lat:31.286}}));
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.deepEqual(saved()[0].position,[121.503,31.286]);
  fireEvent.click(screen.getByRole('button',{name:'删除',exact:true}));fireEvent.click(screen.getByRole('button',{name:'删除',exact:true}));assert.equal(saved().length,0);
});
test('draw, undo, finish, edit a vertex, save and rehydrate route',async()=>{
  await mount();fireEvent.click(screen.getByRole('button',{name:'绘制路线',exact:true}));clickMap([121.5016,31.2848]);assert.equal(screen.getByRole('button',{name:'完成绘制'}).disabled,true);
  clickMap([121.502,31.285]);clickMap([121.503,31.286]);fireEvent.click(screen.getByRole('button',{name:'撤销一点'}));
  fireEvent.click(screen.getByRole('button',{name:'完成绘制'}));
  act(()=>{const editor=state.editors.at(-1);editor.line.setPath([[121.5016,31.2848],[121.5021,31.2851]]);editor.emit('adjust');});
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.equal(saved()[0].points.length,2);assert.deepEqual(saved()[0].points[1],[121.5021,31.2851]);assert.ok(saved()[0].distance>0);
  cleanup();await mount();assert.ok(screen.getByRole('button',{name:/校园散步路线/}));
});
test('walking result saved, cancel discards edited geometry and keeps planned time',async()=>{
  await mount();fireEvent.click(screen.getByRole('button',{name:'步行规划',exact:true}));clickMap([121.5016,31.2848]);clickMap([121.5025,31.2853]);
  fireEvent.click(screen.getByRole('button',{name:'生成步行路线'}));await screen.findByRole('button',{name:'保存路线'});fireEvent.click(screen.getByRole('button',{name:'保存路线'}));fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));
  assert.equal(saved()[0].source,'walking');assert.equal(saved()[0].duration,180);
  fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));clickMap([121.504,31.287]);fireEvent.click(screen.getAllByRole('button',{name:'取消',exact:true}).at(-1));assert.equal(saved()[0].source,'walking');assert.equal(saved()[0].points.length,3);
  fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));clickMap([121.504,31.287]);fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.equal(saved()[0].source,'manual');assert.equal(saved()[0].duration,undefined);
});
test('walking failure keeps endpoints and can switch to manual drawing',async()=>{
  await mount();state.walkingStatus='no_data';fireEvent.click(screen.getByRole('button',{name:'步行规划',exact:true}));clickMap([121.5016,31.2848]);clickMap([121.5025,31.2853]);fireEvent.click(screen.getByRole('button',{name:'生成步行路线'}));
  await screen.findByText(/高德未返回步行路线/);assert.ok(screen.getByText('121.501600, 31.284800'));assert.ok(screen.getByText('121.502500, 31.285300'));
  fireEvent.click(screen.getByRole('button',{name:'改为手绘路线'}));assert.equal(screen.getByRole('button',{name:'完成绘制'}).disabled,false);
});
test('search results require confirmation before being added',async()=>{
  await mount();fireEvent.change(screen.getByPlaceholderText(/搜索校园地点/),{target:{value:'食堂'}});fireEvent.submit(screen.getByRole('textbox',{name:'搜索'}).closest('form'));
  await screen.findByText('测试资源');assert.equal(window.localStorage.getItem(STORAGE_KEY),null);fireEvent.click(screen.getByText('测试资源'));fireEvent.click(screen.getByRole('button',{name:'确认并添加地点'}));assert.equal(screen.getByLabelText('中文名称 *').value,'测试资源');fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.equal(saved()[0].address,'测试地址');
});
test('quota failure retains original record and shows failure without success',async()=>{
  await mount();await addPlace();fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:'不能保存的修改'}});
  const original=dom.window.Storage.prototype.setItem;dom.window.Storage.prototype.setItem=()=>{throw new Error('QuotaExceededError');};
  try{fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.ok(screen.getByText(/保存失败/));assert.equal(saved()[0].nameZh,'测试地点');assert.ok(screen.getByRole('textbox',{name:'中文名称 *'}));}finally{dom.window.Storage.prototype.setItem=original;}
});
test('corrupt local data is retained and blocks new edits',async()=>{
  window.localStorage.setItem(STORAGE_KEY,'{corrupted');render(React.createElement(HealthMap));await screen.findByText(/本地数据无法读取/);assert.equal(window.localStorage.getItem(STORAGE_KEY),'{corrupted');assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,true);
});
test('language switch persists and English uses Chinese name fallback',async()=>{
  await mount();await addPlace();fireEvent.click(screen.getByRole('button',{name:'Switch to English'}));assert.equal(document.documentElement.lang,'en');assert.equal(window.localStorage.getItem('tongji-health-map:language'),'en');assert.ok(screen.getByRole('heading',{name:'测试地点'}));
});
test('import confirmation counts records, cancel is safe, malformed file is rejected',async()=>{
  await mount();await addPlace();fireEvent.click(screen.getByRole('button',{name:'我的标注',exact:true}));
  const input=document.querySelector('input[type=file]');
  fireEvent.change(input,{target:{files:[{size:50,text:async()=>JSON.stringify(EMPTY_DATA)}]}});await screen.findByRole('button',{name:'确认替换'});fireEvent.click(screen.getAllByRole('button',{name:'取消',exact:true}).at(-1));assert.equal(saved().length,1);
  fireEvent.change(input,{target:{files:[{size:10,text:async()=>'{broken'}]}});await screen.findByText(/导入失败/);assert.equal(saved().length,1);
  fireEvent.change(input,{target:{files:[{size:50,text:async()=>JSON.stringify(EMPTY_DATA)}]}});await screen.findByRole('button',{name:'确认替换'});fireEvent.click(screen.getByRole('button',{name:'确认替换'}));assert.equal(saved().length,0);
});
test('canceling pending walking request ignores late result; unmount destroys SDK',async()=>{
  let callback; sdk.Walking=class{search(a,b,cb){callback=cb;}};await mount();fireEvent.click(screen.getByRole('button',{name:'步行规划',exact:true}));clickMap([121.5016,31.2848]);clickMap([121.5025,31.2853]);fireEvent.click(screen.getByRole('button',{name:'生成步行路线'}));fireEvent.click(screen.getAllByRole('button',{name:'取消',exact:true}).at(-1));await act(async()=>callback('complete',state.walkingResult));assert.equal(screen.queryByRole('button',{name:'保存路线'}),null);cleanup();assert.equal(state.maps[0].destroyed,true);
});
test('map loading error is visible and retry initializes a working map',async()=>{
  window.AMapLoader={load:async()=>{throw new Error('INVALID_USER_KEY');}};render(React.createElement(HealthMap));await screen.findByText('地图未能加载');assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,true);
  window.AMapLoader={load:async()=>sdk};fireEvent.click(screen.getByRole('button',{name:'重新加载'}));await waitFor(()=>assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,false));
});
test('category filter hides saved places from both list and SDK overlays',async()=>{
  await mount();await addPlace();fireEvent.click(screen.getByRole('button',{name:'我的标注',exact:true}));fireEvent.click(screen.getByRole('button',{name:/心理咨询/}));assert.equal(screen.queryByRole('button',{name:/测试地点/}),null);assert.equal(state.maps.at(-1).overlays.size,0);
  fireEvent.click(screen.getByRole('button',{name:/全部/}));assert.ok(screen.getByRole('button',{name:/测试地点/}));assert.equal(state.maps.at(-1).overlays.size,1);
});
test('selected walking endpoints are not connected before an actual plan exists',async()=>{
  await mount();fireEvent.click(screen.getByRole('button',{name:'步行规划',exact:true}));clickMap([121.5016,31.2848]);clickMap([121.5025,31.2853]);
  assert.equal([...state.maps.at(-1).overlays].filter(o=>o.options?.path).length,0);
  fireEvent.click(screen.getByRole('button',{name:'生成步行路线'}));await screen.findByRole('button',{name:'保存路线'});
  assert.equal([...state.maps.at(-1).overlays].filter(o=>o.options?.position).length,2);assert.equal([...state.maps.at(-1).overlays].filter(o=>o.options?.path).length,1);
});



const sharedFixture = (await import('./shared-github-mock.mjs')).fixtureBackup;
function sharedItem(name='公开备份', creator='同学 A') { return { id: crypto.randomUUID(), name, creator, createdAt:'2026-09-29T08:00:00Z', places:1, routes:1, byteSize:800 }; }
test('shared backup renders places and routes read-only, filters, and restores personal annotations unchanged',async()=>{
  const item=sharedItem();
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/backups') ? {items:[item]} : {summary:item,backup:sharedFixture});
  await mount();await addPlace('我的私有地点');
  const before=localStorage.getItem(STORAGE_KEY);
  fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));
  fireEvent.click(await screen.findByRole('button',{name:/公开备份/}));
  await screen.findByText('只读查看 · 个人标注未被更改',{selector:'small'});
  assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,true);
  fireEvent.click(screen.getByRole('button',{name:/共享运动地点/}));
  assert.equal(screen.queryByRole('button',{name:'编辑',exact:true}),null);
  assert.equal(screen.queryByRole('button',{name:'删除',exact:true}),null);
  assert.equal(localStorage.getItem(STORAGE_KEY),before);
  fireEvent.click(screen.getByRole('button',{name:'标注详情',exact:true}));
  assert.ok(screen.getByRole('button',{name:/共享步行路线/}));
  fireEvent.click(screen.getByRole('button',{name:/校医院\s*0/}));
  assert.equal(state.maps.at(-1).overlays.size,0);
  fireEvent.click(screen.getByRole('button',{name:'Switch to English'}));
  assert.ok(screen.getByRole('tab',{name:'Shared backups'}));
  fireEvent.click(screen.getByRole('tab',{name:'My annotations'}));
  assert.ok(screen.getByRole('button',{name:/我的私有地点/}));
  assert.equal(localStorage.getItem(STORAGE_KEY),before);
});
test('late shared responses cannot replace newer selections or personal source',async()=>{
  const a=sharedItem('备份 A'), b=sharedItem('备份 B'); const resolvers={};
  globalThis.fetch=async url=>String(url).endsWith('/backups') ? Response.json({items:[a,b]}) : new Promise(resolve=>{resolvers[String(url).split('/').at(-1)]=resolve;});
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));
  fireEvent.click(await screen.findByRole('button',{name:/备份 A/}));fireEvent.click(screen.getByRole('button',{name:/备份 B/}));
  await act(async()=>{resolvers[b.id](Response.json({summary:b,backup:sharedFixture}));});
  await waitFor(()=>assert.equal(document.querySelector('.shared-banner b').textContent,'备份 B'));
  await act(async()=>{resolvers[a.id](Response.json({summary:a,backup:sharedFixture}));});
  assert.equal(document.querySelector('.shared-banner b').textContent,'备份 B');
  fireEvent.click(screen.getByRole('button',{name:/备份 A/}));fireEvent.click(screen.getByRole('tab',{name:'我的标注'}));
  await act(async()=>{resolvers[a.id](Response.json({summary:a,backup:sharedFixture}));});
  assert.equal(document.querySelector('.shared-banner'),null);
  assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,false);
});
test('upload failure preserves form and same retry ID; success publishes saved annotations only',async()=>{
  const sent=[];let fail=true;
  globalThis.fetch=async(url,init)=>{
    if(!init?.body)return Response.json({items:[]});
    const body=JSON.parse(init.body);sent.push(body);
    if(fail)return Response.json({error:{code:'UNAVAILABLE'}},{status:503});
    return Response.json({summary:{...sharedItem(body.name,body.creator),id:body.id}});
  };
  await mount();await addPlace('待分享地点');
  fireEvent.click(screen.getByRole('button',{name:'上传共享备份',exact:true}));
  fireEvent.change(screen.getByLabelText('备份名称 *'),{target:{value:'我的校园地图'}});
  fireEvent.change(screen.getByLabelText('创建者 *'),{target:{value:'小李'}});
  fireEvent.click(screen.getAllByRole('button',{name:'上传共享备份',exact:true}).at(-1));
  await screen.findByText('上传失败，请重试；填写的信息已保留。');
  assert.equal(screen.getByLabelText('备份名称 *').value,'我的校园地图');
  assert.equal(screen.getByLabelText('创建者 *').value,'小李');
  assert.equal(screen.getByRole('tab',{name:'共享备份',hidden:true}).disabled,true);
  fail=false;fireEvent.click(screen.getAllByRole('button',{name:'上传共享备份',exact:true}).at(-1));
  await screen.findByText('共享备份已上传');
  assert.equal(sent.length,2);assert.equal(sent[0].id,sent[1].id);
  assert.equal(sent[1].backup.records[0].nameZh,'待分享地点');
  assert.equal(saved().length,1);
  fireEvent.click(screen.getByRole('button',{name:'标注地点',exact:true}));
  assert.equal(screen.getByRole('tab',{name:'共享备份'}).disabled,true);
});
test('refresh hides deleted selection, clears details/filter/overlays and preserves exact personal storage',async()=>{
  const item=sharedItem();let deleted=false;const queries=[];
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.pathname==='/backups'){queries.push(u);return Response.json({items:deleted?[]:[item],...(u.searchParams.has('selectedId')?{selectedExists:!deleted}:{})});}
    return Response.json({summary:item,backup:sharedFixture});
  };
  await mount();await addPlace('Personal');const before=localStorage.getItem(STORAGE_KEY);
  fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));fireEvent.click(await screen.findByRole('button',{name:/公开备份/}));
  await waitFor(()=>assert.ok(document.querySelector('.shared-banner')));
  fireEvent.click(screen.getByRole('button',{name:/运动健身\s*1/}));
  fireEvent.click(screen.getByRole('button',{name:/共享运动地点/}));
  deleted=true;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
  await screen.findByText('这份共享备份已被删除，地图已清空；个人标注保持不变。');
  assert.equal(queries.at(-1).searchParams.get('selectedId'),item.id);
  assert.equal(document.querySelector('.shared-banner'),null);assert.equal(state.maps.at(-1).overlays.size,0);
  assert.equal(screen.getByRole('button',{name:'下载 JSON'}).disabled,true);
  assert.equal(localStorage.getItem(STORAGE_KEY),before);
  fireEvent.click(screen.getByRole('button',{name:'Switch to English'}));
  assert.ok(screen.getByText('This shared backup was deleted. The map has been cleared; your annotations are unchanged.'));
  fireEvent.click(screen.getByRole('tab',{name:'My annotations'}));assert.ok(screen.getByRole('button',{name:/Personal/}));
  assert.equal(localStorage.getItem(STORAGE_KEY),before);
});
test('refresh failures and missing optional field preserve selection even outside first page; retry can clear it',async()=>{
  const item=sharedItem();let mode='initial';
  globalThis.fetch=async url=>{
    if(new URL(url).pathname!=='/backups')return Response.json({summary:item,backup:sharedFixture});
    if(mode==='failed')return Response.json({error:{code:'UNAVAILABLE'}},{status:503});
    return Response.json(mode==='initial'?{items:[item]}:mode==='old'?{items:[]}:{items:[],selectedExists:mode!=='deleted'});
  };
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));fireEvent.click(await screen.findByRole('button',{name:/公开备份/}));
  await waitFor(()=>assert.ok(document.querySelector('.shared-banner')));
  for(const value of ['old','exists','failed']){
    mode=value;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
    await waitFor(()=>assert.equal(screen.getByRole('button',{name:'刷新列表'}).disabled,false));
    assert.ok(document.querySelector('.shared-banner'));assert.equal(screen.getByRole('button',{name:'下载 JSON'}).disabled,false);
  }
  mode='deleted';fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
  await waitFor(()=>assert.ok(!document.querySelector('.shared-banner')));
});
test('refresh invalidates old detail; delayed deletion response cannot clear a newer selection',async()=>{
  const a=sharedItem('备份 A'), b=sharedItem('备份 B');let listResolve,detailResolve,delayList=false,delayDetail=false;
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.pathname==='/backups')return delayList?new Promise(resolve=>{listResolve=resolve;}):Response.json({items:[a,b],selectedExists:true});
    if(delayDetail)return new Promise(resolve=>{detailResolve=resolve;});
    return Response.json({summary:u.pathname.endsWith(a.id)?a:b,backup:sharedFixture});
  };
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));fireEvent.click(await screen.findByRole('button',{name:/备份 A/}));
  await waitFor(()=>assert.equal(document.querySelector('.shared-banner b')?.textContent,'备份 A'));
  delayDetail=true;fireEvent.click(screen.getByRole('button',{name:/备份 A/}));
  delayList=true;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
  await act(async()=>{listResolve(Response.json({items:[b],selectedExists:false}));});
  await waitFor(()=>assert.ok(!document.querySelector('.shared-banner')));
  await act(async()=>{detailResolve(Response.json({summary:a,backup:sharedFixture}));});
  assert.equal(document.querySelector('.shared-banner'),null);
  delayDetail=false;fireEvent.click(screen.getByRole('button',{name:/备份 B/}));
  await waitFor(()=>assert.equal(document.querySelector('.shared-banner b')?.textContent,'备份 B'));
  fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
  fireEvent.click(screen.getByRole('button',{name:/备份 B/}));
  await act(async()=>{listResolve(Response.json({items:[b],selectedExists:false}));});
  assert.equal(document.querySelector('.shared-banner b').textContent,'备份 B');
});
test('deletion result captured for A cannot clear B selected during refresh or the personal source',async()=>{
  const a=sharedItem('备份 A'),b=sharedItem('备份 B');let resolveList,delay=false;
  globalThis.fetch=async url=>new URL(url).pathname==='/backups'
    ?delay?new Promise(resolve=>{resolveList=resolve;}):Response.json({items:[a,b]})
    :Response.json({summary:String(url).endsWith(a.id)?a:b,backup:sharedFixture});
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));fireEvent.click(await screen.findByRole('button',{name:/备份 A/}));
  await waitFor(()=>assert.equal(document.querySelector('.shared-banner b')?.textContent,'备份 A'));
  delay=true;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));fireEvent.click(screen.getByRole('button',{name:/备份 B/}));
  await waitFor(()=>assert.equal(document.querySelector('.shared-banner b')?.textContent,'备份 B'));
  await act(async()=>{resolveList(Response.json({items:[b],selectedExists:false}));});
  assert.equal(document.querySelector('.shared-banner b').textContent,'备份 B');
  fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));fireEvent.click(screen.getByRole('tab',{name:'我的标注'}));
  await act(async()=>{resolveList(Response.json({items:[],selectedExists:false}));});
  assert.equal(document.querySelector('.shared-banner'),null);
  assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,false);
  assert.equal(screen.queryByText('这份共享备份已被删除，地图已清空；个人标注保持不变。'),null);
});
