/**
 * SUSPENDED — Service Worker
 *
 * Strategy:
 *   - App shell (HTML/CSS/JS modules): stale-while-revalidate
 *   - Local images and JSON: cache-first with revalidation
 *   - Fonts (CDN): cache-first
 *   - Audio (local + Deezer previews): network-first (avoid quota explosions)
 *   - Deezer API and LRCLIB: never cache (responses are dynamic)
 */

const VERSION = 'suspended-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './manifest.webmanifest',
    './data/chansons.json',
    './src/visualizer.js',
    './src/equalizer.js',
    './src/deezer.js',
    './src/lyrics.js',
    './src/colors.js',
    './src/i18n.js',
    './src/storage.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Never cache cross-origin API responses
    if (url.hostname === 'api.deezer.com' || url.hostname === 'lrclib.net') return;

    // Audio: network first (avoid filling cache)
    if (req.destination === 'audio' || /\.mp3($|\?)/.test(url.pathname)) {
        event.respondWith(fetch(req).catch(() => caches.match(req)));
        return;
    }

    // Same-origin shell + JSON: stale-while-revalidate
    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
        return;
    }

    // Fonts / icons CDN: cache-first
    if (/(fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare)/.test(url.hostname)) {
        event.respondWith(cacheFirst(req, ASSET_CACHE));
        return;
    }

    // Deezer CDN images: cache-first
    if (url.hostname.endsWith('.dzcdn.net')) {
        event.respondWith(cacheFirst(req, ASSET_CACHE));
        return;
    }

    // Default: just go to network
});

async function staleWhileRevalidate(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((res) => {
        if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
        return res;
    }).catch(() => cached);
    return cached || fetchPromise;
}

async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
        const res = await fetch(req);
        if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
        return res;
    } catch {
        return cached || Response.error();
    }
}
