'use strict';
// Incrementare APP_SHELL_VERSION a ogni rilascio che modifica un asset offline.
// Il numero è separato dalla versione dei dati per forzare l’aggiornamento della PWA.
const APP_SHELL_VERSION = '3.20.0';
// Cache versionata per percorso: altri progetti sullo stesso dominio restano indipendenti.
const CACHE_NOME = 'scheda-botanica-app-v' + APP_SHELL_VERSION.replace(/\D/g, '') + '-' + new URL(self.registration.scope).pathname;
const CACHE_TILE = 'scheda-botanica-tile-v1';
const CACHE_DIAGNOSTICA = './__sw-diagnostica__';
const FILE_APP_SHELL = [
  './', './index.html', './css/app.css', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './app.js', './js/config.js', './js/utils.js', './js/database.js', './icone.js',
  './data/guida-specie.js', './lib/leaflet.js', './lib/leaflet.css',
  './lib/jszip.js', './lib/xlsx.js', './lib/xlsx-populate.js', './lib/qrcode-generator.js',
];
const HOST_TILE = ['tile.openstreetmap.org', 'a.tile.openstreetmap.org', 'b.tile.openstreetmap.org', 'c.tile.openstreetmap.org'];
self.addEventListener('install', (event) => {
  // Carica gli asset uno alla volta per poter segnalare quelli mancanti,
  // senza perdere la diagnosi dietro a un cache.addAll() atomico.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NOME);
    const falliti = [];
    for (const file of FILE_APP_SHELL) {
      try {
        const richiesta = new Request(new URL(file, self.registration.scope), { cache: 'reload' });
        const risposta = await fetch(richiesta);
        if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
        await cache.put(richiesta, risposta);
      } catch {
        falliti.push(file);
      }
    }
    await cache.put(new URL(CACHE_DIAGNOSTICA, self.registration.scope), new Response(JSON.stringify(falliti), {
      headers: { 'Content-Type': 'application/json' },
    }));
    // Nessuno skipWaiting: le finestre aperte continuano con la stessa versione.
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const scope = new URL(self.registration.scope).pathname;
    const nomi = await caches.keys();
    await Promise.all(nomi.filter((n) => n !== CACHE_NOME &&
      (/^scheda-botanica-app-v\d+$/.test(n) ||
       (n.startsWith('scheda-botanica-app-') && n.endsWith('-' + scope))))
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const tile = HOST_TILE.includes(url.hostname);
  if (!tile && (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname))) return;
  event.respondWith((async () => {
    const cache = await caches.open(tile ? CACHE_TILE : CACHE_NOME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const response = await fetch(req);
      if (response.ok || (tile && response.type === 'opaque')) {
        event.waitUntil(cache.put(req, response.clone()).catch(() => {}));
      }
      return response;
    } catch {
      if (req.mode === 'navigate') {
        const home = await cache.match(new URL('./index.html', self.registration.scope));
        if (home) return home;
      }
      return new Response('Risorsa non disponibile offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
