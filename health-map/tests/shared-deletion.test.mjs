import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore, handleRequest } from '../shared-backups-worker/index.ts';
import { createGitHubMock, fixtureBackup, mockEnv } from './shared-github-mock.mjs';
const input = () => ({ id: crypto.randomUUID(), name: 'Deletion test', creator: 'A', backup: fixtureBackup });
async function setup(count=3) {
  const mock=createGitHubMock(), store=new GitHubStore(mockEnv,mock.fetcher), entries=[];
  for(let i=0;i<count;i++) entries.push(await store.upload(input()));
  return {mock,store,entries};
}
const path=id=>`backups/${id}.json`;
test('missing files hide without index mutation; restored file reappears; orphan file stays hidden',async()=>{
  const {mock,store,entries}=await setup();
  const oldIndex=mock.files()['index.json'], content=mock.files()[path(entries[0].id)];
  mock.changeFiles({[path(entries[0].id)]:null});
  const before=mock.requests.length, page=await store.list(undefined,entries[0].id);
  assert.equal(mock.requests.length-before,3);assert.equal(page.selectedExists,false);assert.equal(page.items.length,2);
  assert.equal(mock.files()['index.json'],oldIndex);
  assert.ok(mock.requests.slice(before).every(r=>r.method==='GET'));
  mock.changeFiles({[path(entries[1].id)]:null,[path(entries[2].id)]:null});
  assert.deepEqual((await store.list()).items,[]);
  mock.changeFiles({[path(entries[0].id)]:content,[path(crypto.randomUUID())]:content});
  assert.deepEqual((await store.list(undefined,entries[0].id)).items.map(i=>i.id),[entries[0].id]);
  assert.equal((await store.list(undefined,entries[0].id)).selectedExists,true);
});
test('filtered pages fill to 20 and a deleted cursor still locates the next page',async()=>{
  const {mock,store}=await setup(25);const initial=await store.list();
  mock.changeFiles(Object.fromEntries(initial.items.slice(0,3).map(i=>[path(i.id),null])));
  const first=await store.list();assert.equal(first.items.length,20);assert.ok(first.nextCursor);
  mock.changeFiles({[path(first.nextCursor)]:null});
  const second=await store.list(first.nextCursor,first.items[0].id);
  assert.equal(second.items.length,2);assert.equal(second.selectedExists,true);assert.equal(second.nextCursor,undefined);
  assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,22);
});
test('index and tree stay at the captured commit when the branch advances',async()=>{
  const {mock,entries}=await setup(1);let deleted=false;
  const store=new GitHubStore(mockEnv,async(url,init)=>{
    const response=await mock.fetcher(url,init);
    if(String(url).includes('/git/ref/')&&!deleted){deleted=true;mock.changeFiles({[path(entries[0].id)]:null});}
    return response;
  });
  assert.equal((await store.list(undefined,entries[0].id)).selectedExists,true);
  assert.equal((await store.list(undefined,entries[0].id)).selectedExists,false);
});
test('selectedId validation and incomplete, invalid, oversized or failed trees never imply deletion',async()=>{
  const {mock,entries}=await setup(1);
  for(const response of [
    ()=>Response.json({truncated:true,tree:[]}),
    ()=>Response.json({truncated:false,tree:[{}]}),
    ()=>Response.json({tree:[]}),
    ()=>new Response('x'.repeat(8*1024*1024+1)),
    ()=>new Response('{}',{status:429}),
    ()=>new Response('{}',{status:500}),
    ()=>new Response('invalid'),
  ]){
    const store=new GitHubStore(mockEnv,(url,init)=>String(url).includes('/git/trees/')?Promise.resolve(response()):mock.fetcher(url,init));
    const result=await handleRequest(new Request(`http://localhost/backups?selectedId=${entries[0].id}`),mockEnv,store);
    assert.ok(result.status>=400);assert.ok((await result.json()).error);
  }
  const store=new GitHubStore(mockEnv,mock.fetcher);
  for(const id of ['bad','']) assert.equal((await handleRequest(new Request(`http://localhost/backups?selectedId=${id}`),mockEnv,store)).status,400);
  assert.equal((await handleRequest(new Request('http://localhost/__test/backups/'+entries[0].id+'/delete-file',{method:'POST'}),mockEnv,store)).status,404);
  assert.equal((await store.list()).selectedExists,undefined);
});
test('symlinks and directories are not backup files',async()=>{
  const {mock,entries}=await setup(1);
  for(const [type,mode] of [['blob','120000'],['tree','040000']]){
    const store=new GitHubStore(mockEnv,(url,init)=>String(url).includes('/git/trees/')?Promise.resolve(Response.json({truncated:false,tree:[{path:path(entries[0].id),type,mode}]})):mock.fetcher(url,init));
    assert.equal((await store.list(undefined,entries[0].id)).selectedExists,false);
  }
});
