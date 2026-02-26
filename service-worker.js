const CACHE='gym-v11d-timer-nosave-1-farmers-notimer-dayselect-notimer';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./apple-touch-icon.png','./apple-touch-icon-180x180.png','./icon-192.png','./icon-512.png','./maskable-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE?null:caches.delete(k))))); self.clients.claim();});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const copy=r.clone(); caches.open(CACHE).then(ca=>ca.put(e.request,copy)).catch(()=>{}); return r;}).catch(()=>c)));});
