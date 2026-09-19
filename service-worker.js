// Service worker di Scheda Botanica PRO — by Lollo ®2026
// Strategia: "network-first" — prova sempre a prendere la versione più recente
// da internet, e la salva per l'uso offline. Solo se non c'è connessione usa
// l'ultima copia salvata. Così ogni aggiornamento dell'app arriva subito da
// solo, senza dover mai "svuotare la cache" a mano sul telefono.
// Non tocca IndexedDB (dati, foto, audio): quelli restano sempre gestiti dall'app stessa.

const CACHE_NOME = 'scheda-botanica-v2'; // cambialo di nuovo se in futuro torni alla strategia "cache-first"

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

  // Solo richieste GET dello stesso sito passano da qui;
  // le chiamate a servizi esterni (mappa, PlantNet) vanno sempre in rete, dirette.
  if (richiesta.method !== 'GET' || new URL(richiesta.url).origin !== self.location.origin) {
    return;
  }

  evento.respondWith(
    fetch(richiesta)
      .then((rete) => {
        const copia = rete.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(richiesta, copia));
        return rete;
      })
      .catch(() => caches.match(richiesta).then((risposta) => risposta || caches.match('./index.html')))
  );
});
