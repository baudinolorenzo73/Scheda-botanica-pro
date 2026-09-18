// Service worker di Scheda Botanica PRO — by Lollo ®2026
// Strategia: "app shell" in cache, così l'app si apre anche offline dopo la prima visita.
// Non tocca IndexedDB (dati, foto, audio): quelli restano sempre gestiti dall'app stessa.

const CACHE_NOME = 'scheda-botanica-v1'; // cambia il numero quando pubblichi un aggiornamento importante

const FILE_APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(FILE_APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomi) =>
      Promise.all(nomi.filter((n) => n !== CACHE_NOME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;

  // Solo richieste GET dello stesso sito passano dalla cache;
  // le chiamate a servizi esterni (mappa, PlantNet) vanno sempre in rete.
  if (richiesta.method !== 'GET' || new URL(richiesta.url).origin !== self.location.origin) {
    return;
  }

  evento.respondWith(
    caches.match(richiesta).then((risposta) => {
      if (risposta) return risposta;
      return fetch(richiesta)
        .then((rete) => {
          const copia = rete.clone();
          caches.open(CACHE_NOME).then((cache) => cache.put(richiesta, copia));
          return rete;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
