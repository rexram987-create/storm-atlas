const CACHE="storm-atlas-v7";
const ASSETS=["/recordings.js", "/assets/audio/blizzard.mp3", "/assets/audio/hurricane.mp3", "/assets/audio/hail.mp3", "/assets/audio/thunder.mp3", "/assets/audio/ice.mp3","/audio.js","/", "/style.css", "/manifest.webmanifest", "/data.js", "/sim.js", "/index.html", "/app.js", "/vendor/three.module.js", "/vendor/three.core.js", "/vendor/THREE-LICENSE.txt", "/assets/thunderstorm.webp", "/assets/hail.webp", "/assets/dust.webp", "/assets/hurricane.webp", "/assets/icon-512.png", "/assets/ice.webp", "/assets/tornado.webp", "/assets/icon-192.png", "/assets/blizzard.webp", "/storms/hail/index.html", "/storms/blizzard/index.html", "/storms/ice/index.html", "/storms/hurricane/index.html", "/storms/dust/index.html", "/storms/tornado/index.html", "/storms/thunderstorm/index.html"];
// A failed media download must not prevent the text and controls from working offline.
const MEDIA=ASSETS.filter(path=>/\.(mp3|webp|png)$/.test(path));
const CORE=ASSETS.filter(path=>!MEDIA.includes(path));
self.addEventListener('install',e=>{e.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(CORE);
 await Promise.allSettled(MEDIA.map(path=>cache.add(path)));
 await self.skipWaiting();
})());});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('storm-atlas-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==location.origin)return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>r.ok?r:caches.match('/index.html')).catch(()=>caches.match('/index.html')));return;}
e.respondWith((async()=>{
 const cache=await caches.open(CACHE),cached=await cache.match(e.request);
 if(cached)return cached;
 const response=await fetch(e.request);
 if(response.ok&&ASSETS.includes(url.pathname))e.waitUntil(cache.put(e.request,response.clone()).catch(()=>{}));
 return response;
})());});
