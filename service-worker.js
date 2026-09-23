// Service worker di Scheda Botanica PRO — by Lollo ®2026
// Strategia: "app shell" in cache, così l'app si apre anche offline dopo la prima visita.
// Non tocca IndexedDB (dati, foto, audio): quelli restano sempre gestiti dall'app stessa.

const CACHE_NOME = 'scheda-botanica-app-v18'; // cambia il numero quando pubblichi un aggiornamento importante
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
    caches.open(CACHE_NOME).then((cache) =>
      // Un file alla volta, invece di cache.addAll(): se UN file manca o ha
      // un percorso sbagliato sul sito pubblicato, gli altri si mettono in
      // cache lo stesso e il service worker arriva comunque ad attivarsi.
      // Con addAll() invece basta un solo file rotto per far fallire tutta
      // l'installazione — e Chrome, senza un service worker attivo, rifiuta
      // di offrire "Installa" (è probabilmente quello che è successo qui).
      Promise.all(FILE_APP_SHELL.map((file) =>
        cache.add(file).then(() => null).catch((err) => { console.warn('service worker: file non messo in cache:', file, err); return file; })
      )).then((esiti) => {
        const falliti = esiti.filter(Boolean);
        // Segnalazione letta dalla pagina (vedi app.js): un postMessage qui
        // arriverebbe troppo presto al primissimo avvio (la pagina non è
        // ancora "controllata"), quindi la scriviamo in cache e la pagina
        // la legge lei quando è pronta.
        if (falliti.length) return cache.put('./__sw-diagnostica__', new Response(JSON.stringify(falliti)));
        return cache.delete('./__sw-diagnostica__');
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomi) =>
      // La cache delle tile non va mai cancellata qui: contiene le zone
      // scaricate apposta per l'offline, non fa parte dell'app shell.
      // Cancella esclusivamente le vecchie cache dell'app botanica. Sullo stesso
      // dominio GitHub Pages possono vivere altre app, che non vanno toccate.
      Promise.all(nomi.filter((n) =>
        n !== CACHE_NOME && n !== CACHE_TILE &&
        (n.startsWith('scheda-botanica-app-') || /^scheda-botanica-v\d+$/.test(n))
      ).map((n) => caches.delete(n)))
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
        .catch(() => richiesta.mode === 'navigate'
          ? caches.match('./index.html')
          : new Response('Risorsa non disponibile offline', { status: 503, statusText: 'Offline' }));
    })
  );
});
