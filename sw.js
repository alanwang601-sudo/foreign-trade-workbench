/* 外贸工作台 Web 版 Service Worker
 * 提供离线缓存，让"添加到主屏幕"的 App 在无网络时也能打开 */
const CACHE = 'ftw-cache-v22-workbench-v613-customer-name-sticky';
const ASSETS = [
  './',
  './index.html',
  './web.js',
  './styles.css',
  './v4-workbench.css',
  './v4-workbench.js',
  './v5-workbench.css',
  './v5-workbench.js',
  './v6-workbench.css',
  './v6-workbench.js',
  './products-seed.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './sb-sync.js',
  './pg-sync.js',
  './cloudbase-patch.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // 只处理同源 GET 请求，不缓存 API 调用
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      // 有缓存先返回缓存，后台更新
      const network = fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
