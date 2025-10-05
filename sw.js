// sw.js — minimal offline cache (generated)
const CACHE = 'planner-v9';
const ASSETS = [
  "./",
  "./index.html",
  "./js/core.js",
  "./js/drawing.js",
  "./js/menu.js",
  "./js/mobile.js",
  "./js/print.js",
  "./js/tools.js",
  "./manifest.json",
  "./styles.css",
  "./styles/styles.css"
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.csv')){
    e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(res=>res || fetch(e.request)));
  }
});
