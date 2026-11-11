const CACHE = 'bible-shell-10e99e1a62f8397f';
const ASSETS = ["./.nojekyll", "./app.js", "./books.json", "./browser.js", "./cloud.css", "./connect.css", "./connect.html", "./connect.js", "./db-worker.js", "./drive-sync.js", "./index.html", "./manifest.webmanifest", "./migration.js", "./panes.js", "./research.js", "./responsive.css", "./responsive.js", "./styles.css", "./sync-engine.js", "./topics.js", "./topics.json", "./vendor/LICENSE", "./vendor/fflate.LICENSE", "./vendor/fflate.min.js", "./vendor/sql-wasm.js", "./vendor/sql-wasm.wasm"];
self.addEventListener('message', e => { if (e.data?.type === 'PBS_ACTIVATE') self.skipWaiting(); });
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(async c => {
  for (const path of ASSETS) {
    const url = new URL(path, self.location.href);
    url.searchParams.set('build', CACHE);
    const response = await fetch(url, {cache:'reload'});
    if (!response.ok) throw new Error('App update download failed');
    await c.put(new URL(path, self.location.href), response);
  }
})));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bible-shell-') && k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  const u = new URL(e.request.url);
  const base = new URL('./', self.location.href);
  const relative = './' + u.pathname.slice(base.pathname.length);
  if (!ASSETS.includes(relative) && u.pathname !== base.pathname) return;
  e.respondWith(fetch(e.request, {cache:'no-store'}).then(r => {
    if (r.ok && r.type === 'basic') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const response = await cache.match(e.request, {ignoreSearch:true});
    return response || (e.request.mode === 'navigate' && await cache.match('./index.html')) || Response.error();
  }));
});
