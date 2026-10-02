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
const {render,screen,fireEvent,waitFor,cleanup,act,within}=await import('@testing-library/react');
const {default:HealthMap}=await import('../components/health-map.tsx');
const {STORAGE_KEY,EMPTY_DATA}=await import('../lib/model.ts');
const {GUIDE_HIDDEN_KEY}=await import('../lib/user-guide.ts');
let sdk,state;
beforeEach(()=>{window.localStorage.clear();const mock=createMockSdk();sdk=mock.sdk;state=mock.state;window.AMapLoader={load:async()=>sdk};globalThis.localStorage=window.localStorage;});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
async function dismissGuide(){const dialog=await screen.findByRole('dialog',{name:/^(使用说明|User guide)$/});fireEvent.click(within(dialog).getByRole('button',{name:/^(关闭|Close)$/}));await waitFor(()=>assert.equal(screen.queryByRole('dialog',{name:/^(使用说明|User guide)$/}),null));}
async function mount(){render(React.createElement(HealthMap));if(localStorage.getItem(GUIDE_HIDDEN_KEY)!=='true')await dismissGuide();await waitFor(()=>assert.equal(screen.getByRole('button',{name:/^(标注地点|Add place)$/}).disabled,false));}
function clickMap(p){act(()=>state.maps.at(-1).click(p));}
const saved=()=>JSON.parse(window.localStorage.getItem(STORAGE_KEY)).records;
async function addPlace(name='测试地点'){
  fireEvent.click(screen.getByRole('button',{name:'标注地点',exact:true}));clickMap([121.5016,31.2848]);fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:name}});fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));
}
test('guide appears on every visit until opted out and can be reopened and enabled again',async()=>{
  render(React.createElement(HealthMap));
  let dialog=await screen.findByRole('dialog',{name:'使用说明'});
  assert.ok(within(dialog).getByRole('heading',{name:'共享备份如何工作'}));
  assert.equal(within(dialog).getByRole('checkbox',{name:'不再显示'}).getAttribute('aria-checked'),'false');
  await dismissGuide(); assert.equal(localStorage.getItem(GUIDE_HIDDEN_KEY),null);
  cleanup(); render(React.createElement(HealthMap)); dialog=await screen.findByRole('dialog',{name:'使用说明'});
  fireEvent.click(within(dialog).getByRole('checkbox',{name:'不再显示'})); await dismissGuide();
  assert.equal(localStorage.getItem(GUIDE_HIDDEN_KEY),'true');
  cleanup(); await mount(); assert.equal(screen.queryByRole('dialog'),null);
  fireEvent.click(screen.getByRole('button',{name:'使用说明',exact:true}));
  dialog=await screen.findByRole('dialog',{name:'使用说明'});
  assert.equal(within(dialog).getByRole('checkbox',{name:'不再显示'}).getAttribute('aria-checked'),'true');
  fireEvent.click(within(dialog).getByRole('checkbox',{name:'不再显示'})); await dismissGuide();
  assert.equal(localStorage.getItem(GUIDE_HIDDEN_KEY),null);
  cleanup(); render(React.createElement(HealthMap)); await screen.findByRole('dialog',{name:'使用说明'});
});
test('guide language follows saved language and switching keeps checkbox and place draft',async()=>{
  localStorage.setItem('tongji-health-map:language','en');
  render(React.createElement(HealthMap));
  let dialog=await screen.findByRole('dialog',{name:'User guide'});
  assert.ok(within(dialog).getByRole('heading',{name:'How shared backups work'}));
  fireEvent.click(within(dialog).getByRole('checkbox',{name:'Don’t show again'}));
  fireEvent.click(within(dialog).getByRole('button',{name:'切换为中文'}));
  dialog=await screen.findByRole('dialog',{name:'使用说明'});
  assert.equal(within(dialog).getByRole('checkbox',{name:'不再显示'}).getAttribute('aria-checked'),'true');
  assert.equal(localStorage.getItem('tongji-health-map:language'),'zh');
  await dismissGuide();
  await waitFor(()=>assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,false));
  fireEvent.click(screen.getByRole('button',{name:'标注地点',exact:true}));clickMap([121.5016,31.2848]);
  fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:'说明期间保留的草稿'}});
  fireEvent.click(screen.getByRole('button',{name:'使用说明',exact:true}));
  dialog=await screen.findByRole('dialog',{name:'使用说明'});
  fireEvent.click(within(dialog).getByRole('button',{name:'Switch to English'}));
  await dismissGuide();
  assert.equal(screen.getByLabelText('Chinese name *').value,'说明期间保留的草稿');
  fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));assert.equal(saved()[0].nameZh,'说明期间保留的草稿');
  cleanup();await mount();assert.equal(document.documentElement.lang,'en');
});
test('guide preference write failure still closes, reports error, and preserves personal data',async()=>{
  await mount();await addPlace();const before=localStorage.getItem(STORAGE_KEY);
  fireEvent.click(screen.getByRole('button',{name:'使用说明',exact:true}));
  const dialog=await screen.findByRole('dialog',{name:'使用说明'});
  fireEvent.click(within(dialog).getByRole('checkbox',{name:'不再显示'}));
  const original=dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem=function(key,value){if(key===GUIDE_HIDDEN_KEY)throw Error('QuotaExceededError');return original.call(this,key,value);};
  try {await dismissGuide();assert.ok(screen.getByText(/说明显示偏好未能保存/));assert.equal(localStorage.getItem(STORAGE_KEY),before);assert.equal(localStorage.getItem(GUIDE_HIDDEN_KEY),null);}
  finally{dom.window.Storage.prototype.setItem=original;}
});
test('guide preference read failure does not block map and escape saves the preference',async()=>{
  const original=dom.window.Storage.prototype.getItem;
  dom.window.Storage.prototype.getItem=function(key){if(key===GUIDE_HIDDEN_KEY)throw Error('SecurityError');return original.call(this,key);};
  try {render(React.createElement(HealthMap));const dialog=await screen.findByRole('dialog',{name:'使用说明'});fireEvent.click(within(dialog).getByRole('checkbox',{name:'不再显示'}));fireEvent.keyDown(document,{key:'Escape',code:'Escape'});await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null));await waitFor(()=>assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,false));}
  finally{dom.window.Storage.prototype.getItem=original;}
  assert.equal(localStorage.getItem(GUIDE_HIDDEN_KEY),'true');
});
test('guide retains route geometry and restores focus to the header entry',async()=>{
  await mount();fireEvent.click(screen.getByRole('button',{name:'绘制路线',exact:true}));clickMap([121.5016,31.2848]);clickMap([121.502,31.285]);
  fireEvent.click(screen.getByRole('button',{name:'完成绘制'}));fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:'保留路线'}});
  fireEvent.click(screen.getByRole('button',{name:'使用说明',exact:true}));await dismissGuide();
  await waitFor(()=>assert.equal(document.activeElement,screen.getByRole('button',{name:'使用说明',exact:true})));
  assert.equal(screen.getByLabelText('中文名称 *').value,'保留路线');
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.equal(saved()[0].points.length,2);
});
test('place photo upload blocks save, keeps latest edits, persists on refresh and supports removal',async()=>{
  await mount(); fireEvent.click(screen.getByRole('button',{name:'标注地点',exact:true})); clickMap([121.5016,31.2848]);
  fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:'图片地点'}});
  let finish;
  globalThis.fetch=async()=>new Promise(resolve=>{finish=resolve;});
  const input=screen.getByLabelText('上传图片',{selector:'input'});
  const file=new window.File(['png'],'campus.png',{type:'image/png'});
  fireEvent.change(input,{target:{files:[file]}});
  assert.equal(screen.getByRole('button',{name:'保存',exact:true}).disabled,true);
  fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:'上传时修改的名称'}});
  const photo={id:crypto.randomUUID()+'.png',name:'campus.png',contentType:'image/png',byteSize:3};
  await act(async()=>finish(Response.json({photo},{status:201})));
  await waitFor(()=>assert.equal(screen.getByRole('button',{name:'保存',exact:true}).disabled,false));
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));
  assert.equal(saved()[0].nameZh,'上传时修改的名称'); assert.deepEqual(saved()[0].photos,[photo]);
  assert.ok(screen.getByRole('link',{name:'查看原图: campus.png'}));
  cleanup(); await mount(); fireEvent.click(screen.getByRole('button',{name:/上传时修改的名称/}));
  assert.ok(screen.getByRole('link',{name:'查看原图: campus.png'}));
  fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:'移除图片: campus.png'}));
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true})); assert.deepEqual(saved()[0].photos,[]);
});
test('failed photo upload preserves the place draft and can be retried',async()=>{
  await mount(); fireEvent.click(screen.getByRole('button',{name:'标注地点',exact:true})); clickMap([121.5016,31.2848]);
  fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:'失败保留'}});
  const input=screen.getByLabelText('上传图片',{selector:'input'});
  globalThis.fetch=async()=>Response.json({error:{code:'UNAVAILABLE'}},{status:503});
  fireEvent.change(input,{target:{files:[new window.File(['png'],'campus.png',{type:'image/png'})]}});
  await screen.findByRole('alert');
  assert.equal(screen.getByLabelText('中文名称 *').value,'失败保留');
  assert.equal(screen.getByRole('button',{name:'保存',exact:true}).disabled,false);
  const photo={id:crypto.randomUUID()+'.png',name:'campus.png',contentType:'image/png',byteSize:3};
  globalThis.fetch=async()=>Response.json({photo},{status:201});
  fireEvent.change(input,{target:{files:[new window.File(['png'],'campus.png',{type:'image/png'})]}});
  await screen.findByRole('button',{name:'移除图片: campus.png'});
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true})); assert.deepEqual(saved()[0].photos,[photo]);
});
test('place creation, cancel restores position, drag changes saved position, deletion',async()=>{
  await mount();await addPlace();assert.equal(saved().length,1);
  const navigation=screen.getByRole('link',{name:'导航到这里'});
  assert.equal(new URL(navigation.href).searchParams.get('to'),'121.501600,31.284800,测试地点');
  assert.equal(navigation.target,'_blank');assert.ok(navigation.rel.includes('noopener'));
  fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));clickMap([121.502,31.285]);fireEvent.click(screen.getAllByRole('button',{name:'取消',exact:true}).at(-1));assert.deepEqual(saved()[0].position,[121.5016,31.2848]);
  fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));
  act(()=>state.markers.findLast(m=>m.options.draggable).emit('dragend',{lnglat:{lng:121.503,lat:31.286}}));
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.deepEqual(saved()[0].position,[121.503,31.286]);
  assert.equal(new URL(screen.getByRole('link',{name:'导航到这里'}).href).searchParams.get('to'),'121.503000,31.286000,测试地点');
  fireEvent.click(screen.getByRole('button',{name:'删除',exact:true}));fireEvent.click(screen.getByRole('button',{name:'删除',exact:true}));assert.equal(saved().length,0);
});
test('draw, undo, finish, edit a vertex, save and rehydrate route',async()=>{
  await mount();fireEvent.click(screen.getByRole('button',{name:'绘制路线',exact:true}));clickMap([121.5016,31.2848]);assert.equal(screen.getByRole('button',{name:'完成绘制'}).disabled,true);
  clickMap([121.502,31.285]);clickMap([121.503,31.286]);fireEvent.click(screen.getByRole('button',{name:'撤销一点'}));
  fireEvent.click(screen.getByRole('button',{name:'完成绘制'}));
  act(()=>{const editor=state.editors.at(-1);editor.line.setPath([[121.5016,31.2848],[121.5021,31.2851]]);editor.emit('adjust');});
  fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.equal(saved()[0].points.length,2);assert.deepEqual(saved()[0].points[1],[121.5021,31.2851]);assert.ok(saved()[0].distance>0);
  cleanup();await mount();assert.ok(screen.getByRole('button',{name:/校园散步路线/}));
  fireEvent.click(screen.getByRole('button',{name:/校园散步路线/}));assert.equal(screen.queryByRole('link',{name:'导航到这里'}),null);
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

test('editing a search query ignores late responses from the previous query',async()=>{
  const callbacks=[];
  sdk.PlaceSearch=class { searchNearBy(query,center,radius,callback){callbacks.push({query,callback});} };
  await mount();
  const input=screen.getByRole('textbox',{name:'搜索'});
  fireEvent.change(input,{target:{value:'旧查询'}});fireEvent.submit(input.closest('form'));
  fireEvent.change(input,{target:{value:'新查询'}});fireEvent.submit(input.closest('form'));
  await act(async()=>callbacks.find(c=>c.query==='新查询').callback('complete',{poiList:{count:1,pois:[{id:'new',name:'新地点',location:{lng:121.5016,lat:31.2848}}]}}));
  await screen.findByText('新地点');
  await act(async()=>callbacks.find(c=>c.query==='旧查询').callback('complete',state.searchResult));
  assert.equal(screen.queryByText('测试资源'),null);assert.ok(screen.getByText('新地点'));
});

test('load more retains first page on failure, supports retry and avoids duplicates',async()=>{
  let fail=true;
  sdk.PlaceSearch=class {
    constructor(options){this.page=options.pageIndex;}
    searchNearBy(query,center,radius,cb){
      if(this.page===2&&fail)return queueMicrotask(()=>cb('error',{}));
      const pois=[{id:'one',name:'第一地点',location:{lng:121.5016,lat:31.2848}},...(this.page===2?[{id:'two',name:'第二地点',location:{lng:121.502,lat:31.285}}]:[])];
      queueMicrotask(()=>cb('complete',{poiList:{count:51,pois}}));
    }
  };
  await mount();const input=screen.getByRole('textbox',{name:'搜索'});
  fireEvent.change(input,{target:{value:'地点'}});fireEvent.submit(input.closest('form'));
  fireEvent.click(await screen.findByRole('button',{name:'加载更多地点'}));
  await screen.findByText(/搜索失败/);assert.ok(screen.getByText('第一地点'));
  fail=false;fireEvent.click(screen.getByRole('button',{name:'加载更多地点'}));
  await screen.findByText('第二地点');assert.equal(screen.getAllByText('第一地点').length,1);
  assert.equal(screen.queryByRole('button',{name:'加载更多地点'}),null);
  assert.equal(localStorage.getItem(STORAGE_KEY),null);
});
test('quota failure retains original record and shows failure without success',async()=>{
  await mount();await addPlace();fireEvent.click(screen.getByRole('button',{name:'编辑',exact:true}));fireEvent.change(screen.getByLabelText('中文名称 *'),{target:{value:'不能保存的修改'}});
  const original=dom.window.Storage.prototype.setItem;dom.window.Storage.prototype.setItem=()=>{throw new Error('QuotaExceededError');};
  try{fireEvent.click(screen.getByRole('button',{name:'保存',exact:true}));assert.ok(screen.getByText(/保存失败/));assert.equal(saved()[0].nameZh,'测试地点');assert.ok(screen.getByRole('textbox',{name:'中文名称 *'}));}finally{dom.window.Storage.prototype.setItem=original;}
});
test('corrupt local data is retained and blocks new edits',async()=>{
  window.localStorage.setItem(STORAGE_KEY,'{corrupted');render(React.createElement(HealthMap));await dismissGuide();await screen.findByText(/本地数据无法读取/);assert.equal(window.localStorage.getItem(STORAGE_KEY),'{corrupted');assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,true);
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
  window.AMapLoader={load:async()=>{throw new Error('INVALID_USER_KEY');}};render(React.createElement(HealthMap));await dismissGuide();await screen.findByText('地图未能加载');assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,true);
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



const sharedFixture = (await import('./shared-upyun-mock.mjs')).fixtureBackup;
function sharedItem(name='公开备份', creator='同学 A') { return { id: crypto.randomUUID(), name, creator, createdAt:'2026-09-29T08:00:00Z', places:1, routes:1, byteSize:800 }; }
test('shared backup renders places and routes read-only, filters, and restores personal annotations unchanged',async()=>{
  const item=sharedItem();
  globalThis.fetch=async url=>Response.json(String(url).endsWith('/backups') ? {items:[item]} : {summary:item,backup:sharedFixture});
  await mount();await addPlace('我的私有地点');
  const before=localStorage.getItem(STORAGE_KEY);
  fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));
  fireEvent.click(await screen.findByRole('checkbox',{name:/公开备份/}));
  await screen.findByText('只读查看 · 个人标注未被更改',{selector:'small'});
  assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,true);
  fireEvent.click(screen.getByRole('button',{name:/共享运动地点/}));
  assert.equal(new URL(screen.getByRole('link',{name:'导航到这里'}).href).searchParams.get('to'),'121.501600,31.284800,共享运动地点');
  fireEvent.click(screen.getByRole('button',{name:'Switch to English'}));
  assert.equal(new URL(screen.getByRole('link',{name:'Navigate here'}).href).searchParams.get('to'),'121.501600,31.284800,Shared sports place');
  fireEvent.click(screen.getByRole('button',{name:'切换为中文'}));
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
test('concurrent selections merge matching IDs; cancelling pending requests and switching source ignore late responses',async()=>{
  const a=sharedItem('备份 A'), b=sharedItem('备份 B'); const resolvers={};
  globalThis.fetch=async url=>String(url).endsWith('/backups') ? Response.json({items:[a,b]}) : new Promise(resolve=>{resolvers[String(url).split('/').at(-1)]=resolve;});
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));
  fireEvent.click(await screen.findByRole('checkbox',{name:/备份 A/}));fireEvent.click(screen.getByRole('checkbox',{name:/备份 B/}));
  await act(async()=>{resolvers[b.id](Response.json({summary:b,backup:sharedFixture}));});
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,2));
  await act(async()=>{resolvers[a.id](Response.json({summary:a,backup:sharedFixture}));});
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,4));
  assert.equal(screen.getAllByRole('button',{name:/共享运动地点/}).length,2);
  assert.equal(screen.getAllByRole('button',{name:/共享步行路线/}).length,2);
  assert.equal(document.querySelector('.shared-banner b').textContent,'已显示备份: 2');
  fireEvent.click(screen.getByRole('checkbox',{name:/备份 A/}));
  assert.equal(state.maps.at(-1).overlays.size,2);
  fireEvent.click(screen.getByRole('checkbox',{name:/备份 A/}));
  fireEvent.click(screen.getByRole('checkbox',{name:/备份 A/}));
  await act(async()=>{resolvers[a.id](Response.json({summary:a,backup:sharedFixture}));});
  assert.equal(state.maps.at(-1).overlays.size,2);
  assert.equal(screen.getByRole('checkbox',{name:/备份 A/}).checked,false);
  fireEvent.click(screen.getByRole('checkbox',{name:/备份 A/}));fireEvent.click(screen.getByRole('tab',{name:'我的标注'}));
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
  fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));fireEvent.click(await screen.findByRole('checkbox',{name:/公开备份/}));
  await waitFor(()=>assert.ok(document.querySelector('.shared-banner')));
  fireEvent.click(screen.getByRole('button',{name:/运动健身\s*1/}));
  fireEvent.click(screen.getByRole('button',{name:/共享运动地点/}));
  deleted=true;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
  await screen.findByText('已删除的备份已从地图移除，其余勾选的备份继续显示；个人标注保持不变。');
  assert.equal(queries.at(-1).searchParams.get('selectedId'),item.id);
  assert.equal(document.querySelector('.shared-banner'),null);assert.equal(state.maps.at(-1).overlays.size,0);
  assert.equal(screen.getByRole('button',{name:'下载 JSON'}).disabled,true);
  assert.equal(localStorage.getItem(STORAGE_KEY),before);
  fireEvent.click(screen.getByRole('button',{name:'Switch to English'}));
  assert.ok(screen.getByText('Deleted backups have been removed from the map. Other selected backups remain visible; your annotations are unchanged.'));
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
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));fireEvent.click(await screen.findByRole('checkbox',{name:/公开备份/}));
  await waitFor(()=>assert.ok(document.querySelector('.shared-banner')));
  for(const value of ['old','exists','failed']){
    mode=value;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
    await waitFor(()=>assert.equal(screen.getByRole('button',{name:'刷新列表'}).disabled,false));
    assert.ok(document.querySelector('.shared-banner'));assert.equal(screen.getByRole('button',{name:'下载 JSON'}).disabled,false);
  }
  mode='deleted';fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
  await waitFor(()=>assert.ok(!document.querySelector('.shared-banner')));
});
test('refresh removes only deleted selected backups including IDs outside the first page',async()=>{
  const a=sharedItem('备份 A'),b=sharedItem('备份 B');let deleted=false;const queries=[];
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.pathname==='/backups'){
      queries.push(u.searchParams.get('selectedId'));
      return Response.json({items:deleted?[]:[a,b],selectedExists:!(deleted&&u.searchParams.get('selectedId')===b.id)});
    }
    return Response.json({summary:u.pathname.endsWith(a.id)?a:b,backup:sharedFixture});
  };
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));
  fireEvent.click(await screen.findByRole('checkbox',{name:/备份 A/}));fireEvent.click(screen.getByRole('checkbox',{name:/备份 B/}));
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,4));
  deleted=true;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,2));
  assert.ok(queries.includes(a.id));assert.ok(queries.includes(b.id));
  assert.equal(document.querySelector('.shared-banner span').textContent,'备份 A');
  assert.equal(screen.getByRole('button',{name:'下载 JSON'}).disabled,false);
});
test('delayed deletion cannot remove a reselected backup or change the personal source',async()=>{
  const a=sharedItem('备份 A');let resolveList,delay=false;
  globalThis.fetch=async url=>new URL(url).pathname==='/backups'
    ?delay?new Promise(resolve=>{resolveList=resolve;}):Response.json({items:[a]})
    :Response.json({summary:a,backup:sharedFixture});
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));fireEvent.click(await screen.findByRole('checkbox',{name:/备份 A/}));
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,2));
  delay=true;fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/备份 A/}));fireEvent.click(screen.getByRole('checkbox',{name:/备份 A/}));
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,2));
  await act(async()=>{resolveList(Response.json({items:[a],selectedExists:false}));});
  assert.equal(screen.getByRole('checkbox',{name:/备份 A/}).checked,true);
  assert.equal(state.maps.at(-1).overlays.size,2);
  fireEvent.click(screen.getByRole('button',{name:'刷新列表'}));fireEvent.click(screen.getByRole('tab',{name:'我的标注'}));
  await act(async()=>{resolveList(Response.json({items:[],selectedExists:false}));});
  assert.equal(document.querySelector('.shared-banner'),null);
  assert.equal(screen.getByRole('button',{name:'标注地点',exact:true}).disabled,false);
});
test('failed selection unchecks only that backup and retry merges it with the successful selection',async()=>{
  const a=sharedItem('备份 A'),b=sharedItem('备份 B');let fail=true;
  globalThis.fetch=async url=>new URL(url).pathname==='/backups'?Response.json({items:[a,b]})
    :String(url).endsWith(b.id)&&fail?Response.json({error:{code:'UNAVAILABLE'}},{status:503})
    :Response.json({summary:String(url).endsWith(a.id)?a:b,backup:sharedFixture});
  await mount();fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));
  fireEvent.click(await screen.findByRole('checkbox',{name:/备份 A/}));fireEvent.click(screen.getByRole('checkbox',{name:/备份 B/}));
  await screen.findByRole('alert');
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,2));
  assert.equal(screen.getByRole('checkbox',{name:/备份 A/}).checked,true);
  assert.equal(screen.getByRole('checkbox',{name:/备份 B/}).checked,false);
  fail=false;fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,4));
  fireEvent.click(screen.getByRole('checkbox',{name:/备份 A/}));fireEvent.click(screen.getByRole('checkbox',{name:/备份 B/}));
  assert.equal(state.maps.at(-1).overlays.size,0);
  assert.equal(screen.getByRole('button',{name:'下载 JSON'}).disabled,true);
});
test('merged backups preserve distinct details, filter together, and download valid JSON despite matching original IDs',async()=>{
  const a=sharedItem('备份 A'),b=sharedItem('备份 B');
  const other=structuredClone(sharedFixture);
  other.records[0].nameZh='备份 B 地点';other.records[0].position=[121.504,31.286];
  other.records[1].nameZh='备份 B 路线';
  globalThis.fetch=async url=>new URL(url).pathname==='/backups'?Response.json({items:[a,b]})
    :Response.json({summary:String(url).endsWith(a.id)?a:b,backup:String(url).endsWith(a.id)?sharedFixture:other});
  await mount();await addPlace('个人标注');const before=localStorage.getItem(STORAGE_KEY);
  fireEvent.click(screen.getByRole('tab',{name:'共享备份'}));
  fireEvent.click(await screen.findByRole('checkbox',{name:/备份 A/}));fireEvent.click(screen.getByRole('checkbox',{name:/备份 B/}));
  await waitFor(()=>assert.equal(state.maps.at(-1).overlays.size,4));
  fireEvent.click(screen.getByRole('button',{name:/备份 B 地点/}));
  assert.equal(new URL(screen.getByRole('link',{name:'导航到这里'}).href).searchParams.get('to'),'121.504000,31.286000,备份 B 地点');
  assert.ok(screen.getByText('121.504000, 31.286000'));assert.equal(screen.queryByRole('button',{name:'编辑',exact:true}),null);
  fireEvent.click(screen.getByRole('button',{name:'标注详情',exact:true}));
  fireEvent.click(screen.getByRole('button',{name:/运动健身\s*2/}));
  assert.equal(state.maps.at(-1).overlays.size,2);assert.equal(screen.queryByRole('button',{name:/备份 B 路线/}),null);
  let blob;const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL;
  const originalClick=window.HTMLAnchorElement.prototype.click;
  try{
    URL.createObjectURL=value=>{blob=value;return 'blob:test-merged';};URL.revokeObjectURL=()=>{};
    window.HTMLAnchorElement.prototype.click=()=>{};
    fireEvent.click(screen.getByRole('button',{name:'下载 JSON'}));
    const merged=(await import('../lib/model.ts')).parseBackup(await blob.text());
    assert.equal(merged.records.length,4);assert.equal(new Set(merged.records.map(record=>record.id)).size,4);
    assert.ok(merged.records.some(record=>record.nameZh==='备份 B 地点'));
    assert.equal(localStorage.getItem(STORAGE_KEY),before);
  }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;window.HTMLAnchorElement.prototype.click=originalClick;}
});
