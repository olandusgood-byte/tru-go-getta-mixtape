const CACHE='tgg-video-studio-v2.4.0';
const SHELL=['./','./index.html','./styles.css?v=2.3.0','./app.js?v=2.3.0','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  if(u.pathname.endsWith('/video-studio/')||u.pathname.endsWith('/video-studio/index.html')){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request)));
    return;
  }
  if(u.pathname.indexOf('/video-studio/')>=0){
    e.respondWith(caches.match(e.request).then(cached=>{
      const fresh=fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>cached);
      return cached||fresh;
    }));
  }
});