// Service worker di Scheda Botanica PRO — by Lollo ®2026
// Strategia: "app shell" in cache, così l'app si apre anche offline dopo la prima visita.
// Non tocca IndexedDB (dati, foto, audio): quelli restano sempre gestiti dall'app stessa.

const CACHE_NOME = 'scheda-botanica-v4'; // cambia il numero quando pubblichi un aggiornamento importante
// Cache separata per le tile della mappa (OpenStreetMap): tenerla a parte
// significa che "svuotare"/aggiornare l'app shell non cancella le zone di
// mappa già scaricate per l'uso offline. NOME USATO ANCHE DA index.html
// (funzioni della cache mappa): se lo cambi, cambialo in entrambi i posti.
const CACHE_TILE = 'scheda-botanica-tile-v1';

const FILE_APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './app.js',
  './icone.js',
  './data/guida-specie.js',
  './lib/leaflet.js',
  './lib/leaflet.css',
  './lib/jszip.js',
  './lib/xlsx.js',
  './lib/qrcode-generator.js',
];

// Host dei server di tile della mappa: le richieste verso questi domini
// vengono servite dalla cache (cache-first) invece che passare dritte in
// rete, e ogni tile scaricata viene salvata lì per la prossima volta.
const HOST_TILE = ['tile.openstreetmap.org', 'a.tile.openstreetmap.org', 'b.tile.openstreetmap.org', 'c.tile.openstreetmap.org'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(FILE_APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomi) =>
      // La cache delle tile non va mai cancellata qui: contiene le zone
      // scaricate apposta per l'offline, non fa parte dell'app shell.
      Promise.all(nomi.filter((n) => n !== CACHE_NOME && n !== CACHE_TILE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  const url = new URL(richiesta.url);

  // Tile della mappa: cache-first. La risposta di un server senza CORS è
  // "opaca" (JS non può leggerne i byte), ma può comunque essere salvata in
  // cache e ri-mostrata come immagine: è la tecnica giusta per queste tile,
  // che non permettono la lettura diretta via fetch() dalla pagina.
  if (richiesta.method === 'GET' && HOST_TILE.includes(url.hostname)) {
    evento.respondWith(
      caches.open(CACHE_TILE).then((cache) =>
        cache.match(richiesta).then((risposta) => {
          if (risposta) return risposta;
          return fetch(richiesta)
            .then((rete) => { cache.put(richiesta, rete.clone()); return rete; })
            .catch(() => risposta); // offline e non ancora in cache: niente da mostrare per questa tile
        })
      )
    );
    return;
  }

  // Solo richieste GET dello stesso sito passano dalla cache;
  // le chiamate a servizi esterni (PlantNet) vanno sempre in rete.
  if (richiesta.method !== 'GET' || url.origin !== self.location.origin) {
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
