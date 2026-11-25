const CACHE = 'todoocard-web-shell-v6';
const FILES = ['./', './index.html', './js/templates.js', './js/payload.js', './js/ble.js', './js/transfer-profiles.js', './js/card-connection.js', './js/ble-legacy.js', './js/ble-20261124b.js',
               './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const scopeURL = new URL(self.registration.scope);
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE &&
    (k.startsWith('todo-shell-v') || k.startsWith('todoocard-web-shell-'))).map(k => caches.delete(k))))
    .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== scopeURL.origin ||
      !url.pathname.startsWith(scopeURL.pathname)) return;
  // 在线检查新版本，断网才回退缓存，避免旧蓝牙模块一直生效。
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(e.request, { cache: 'no-cache' });
      if (response.ok) await cache.put(e.request, response.clone()).catch(() => {});
      return response;
    } catch (error) {
      const cached = await cache.match(e.request);
      if (cached) return cached;
      if (url.search && FILES.some(file => new URL(file, scopeURL).pathname === url.pathname)) {
        const shell = await cache.match(new URL(url.pathname, scopeURL).href);
        if (shell) return shell;
      }
      // 只有页面导航可回退 HTML，不能让缺失的 JS 获得 HTML 响应。
      if (e.request.mode === 'navigate') {
        const page = await cache.match(new URL('./index.html', scopeURL).href);
        if (page) return page;
      }
      throw error;
    }
  })());
});
