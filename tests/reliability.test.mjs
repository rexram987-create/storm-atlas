import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as Three from '../dist/vendor/three.module.js';

const swSource=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');
const simSource=(await readFile(new URL('../dist/sim.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export function','function');
function worker(failedPaths=[]){
  const handlers={},stores=new Map(),failed=new Set(failedPaths);
  const fetch=async request=>{
    const path=new URL(typeof request==='string'?request:request.url,'https://example.test').pathname;
    if(failed.has(path))throw Error('temporary network failure');
    return new Response(path);
  };
  const caches={async open(name){
    if(!stores.has(name))stores.set(name,new Map());
    const data=stores.get(name),key=r=>new URL(typeof r==='string'?r:r.url,'https://example.test').pathname;
    return {async add(path){data.set(key(path),await fetch(path));},async addAll(paths){const responses=await Promise.all(paths.map(fetch));paths.forEach((p,i)=>data.set(key(p),responses[i]));},async match(request){return data.get(key(request))?.clone();},async put(request,response){data.set(key(request),response);}};
  },async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);},async match(request){for(const name of stores.keys()){const r=await (await caches.open(name)).match(request);if(r)return r;}}};
  vm.runInNewContext(swSource,{self:{addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},location:{origin:'https://example.test'},caches,fetch,URL,Response,Promise,console});
  return {handlers,caches,failed,async install(){let pending;handlers.install({waitUntil:p=>pending=p});await pending;},async request(path,mode='cors'){let response;const pending=[];handlers.fetch({request:{method:'GET',url:'https://example.test'+path,mode},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});const result=await response;await Promise.all(pending);return result;}};
}
test('one missing recording does not prevent caching the offline explanations',async()=>{
  const w=worker(['/assets/audio/thunder.mp3']);
  await w.install();
  w.failed.add('/storms/hurricane/');
  const response=await w.request('/storms/hurricane/','navigate');
  assert.equal(response.status,200);
  assert.equal(await response.text(),'/index.html');
});
test('a recording missing during install is cached when a later request succeeds',async()=>{
  const w=worker(['/assets/audio/thunder.mp3']);
  try{await w.install();}catch{}
  w.failed.delete('/assets/audio/thunder.mp3');
  assert.equal((await w.request('/assets/audio/thunder.mp3')).status,200);
  w.failed.add('/assets/audio/thunder.mp3');
  assert.equal((await w.request('/assets/audio/thunder.mp3')).status,200);
});
test('a failed essential script prevents activation of an incomplete new version',async()=>{
  const w=worker(['/app.js']);
  await assert.rejects(w.install());
});
function simulator(){
  const queue=new Map(),elements=new Map(),listeners=new Map();let id=0,renders=0,canvas;
  const element=()=>({value:'50',setAttribute(){},addEventListener(){},remove(){},setPointerCapture(){}});
  const document={hidden:false,getElementById(name){if(!elements.has(name))elements.set(name,element());return elements.get(name);},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  class Renderer{constructor(){this.domElement=canvas=element();}setPixelRatio(){}setSize(){}render(){renders++;}dispose(){}}
  const context={THREE:{...Three,WebGLRenderer:Renderer},createStormAudio:()=>({update(){},destroy(){}}),document,devicePixelRatio:1,matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{queue.set(++id,fn);return id;},cancelAnimationFrame:key=>queue.delete(key),ResizeObserver:class{observe(){}disconnect(){}},IntersectionObserver:class{observe(){}disconnect(){}}};
  vm.runInNewContext(simSource+'\nthis.createSimulator=createSimulator;',context);
  const destroy=context.createSimulator({clientWidth:400,clientHeight:350,appendChild(){}},'hurricane');
  const tick=time=>{const frames=[...queue.values()];queue.clear();frames.forEach(fn=>fn(time));};
  return {queue,elements,document,listeners,destroy,tick,get renders(){return renders;},get canvas(){return canvas;}};
}
test('paused simulation stops requesting frames and zoom still redraws once',()=>{
  const s=simulator();s.tick(16);s.elements.get('pause').onclick();s.tick(32);
  const count=s.renders;
  assert.equal(s.queue.size,0);
  s.tick(48);assert.equal(s.renders,count);
  s.elements.get('zoom-in').onclick();s.tick(64);
  assert.equal(s.renders,count+1);assert.equal(s.queue.size,0);
  s.elements.get('pause').onclick();s.tick(80);assert.equal(s.queue.size,1);
  s.destroy();assert.equal(s.queue.size,0);
});
test('hidden page stops requesting frames and resumes when visible',()=>{
  const s=simulator();s.tick(16);s.document.hidden=true;
  s.listeners.get('visibilitychange')?.();s.tick(32);
  assert.equal(s.queue.size,0);
  s.document.hidden=false;s.listeners.get('visibilitychange')?.();
  assert.equal(s.queue.size,1);s.destroy();
});
