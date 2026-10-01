/* Service worker — Generatore Turni (PWA)
   Strategia: precache di tutti i file dell'app all'installazione, poi
   - pagina (navigazione): rete prima, cache come ripiego (così gli aggiornamenti arrivano subito
     e senza connessione l'app si apre lo stesso);
   - altri file: cache prima.
   Per pubblicare un aggiornamento cambia VERSIONE qui sotto: i vecchi file vengono eliminati. */
const VERSIONE = "turni-v1";
const FILE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(VERSIONE).then(c=> c.addAll(FILE)).then(()=> self.skipWaiting()));
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys()
      .then(chiavi=> Promise.all(chiavi.filter(k=> k!==VERSIONE).map(k=> caches.delete(k))))
      .then(()=> self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  if(req.method!=="GET") return;
  const url = new URL(req.url);
  if(url.origin!==self.location.origin) return; // link esterni (WhatsApp, ecc.): non toccarli

  if(req.mode==="navigate"){
    e.respondWith(
      fetch(req)
        .then(res=>{
          const copia = res.clone();
          caches.open(VERSIONE).then(c=> c.put("./index.html", copia));
          return res;
        })
        .catch(()=> caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit=> hit || fetch(req).then(res=>{
      if(res.ok){ const copia = res.clone(); caches.open(VERSIONE).then(c=> c.put(req, copia)); }
      return res;
    }))
  );
});
