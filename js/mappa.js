'use strict';
// Scheda Botanica PRO — Mappa, cache offline delle tile e traccia GPS del percorso.
// Caricato da index.html prima di app.js: le funzioni condividono lo stesso ambito globale.

/* =====================================================================
   9b2. CACHE OFFLINE DELLE TILE DELLA MAPPA
   Le tile (le "piastrelle" quadrate di sfondo OpenStreetMap) NON possono
   essere lette e salvate come Blob via fetch() dalla pagina: il server di
   OpenStreetMap non manda l'header CORS necessario, quindi un fetch()
   normale fallisce sempre (verificato). La cache vera vive quindi nel
   service worker (service-worker.js), che intercetta le richieste verso i
   domini delle tile e le salva nella Cache Storage API — una risposta
   "opaca" (bytes non leggibili da JS) può comunque essere salvata e
   ri-mostrata come immagine, anche se non può essere letta come Blob qui.
   Qui in pagina usiamo la STESSA Cache Storage (stesso nome di cache) per:
   1) contare/mostrare quante tile sono già salvate; 2) scaricarne in
   anticipo un intero blocco (un'area × qualche livello di zoom) prima di
   partire per una zona senza campo; 3) svuotare la cache. Funziona solo se
   il service worker è attivo (quindi non aprendo il file in locale come
   file:// ): senza, la mappa funziona comunque, solo senza cache offline.
   ===================================================================== */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_SUBDOMINI = ['a', 'b', 'c'];
// Deve restare identico al nome usato in service-worker.js: sono la stessa cache.
const CACHE_TILE = 'scheda-botanica-tile-v1';
const urlTile = (z, x, y) => TILE_URL
  .replace('{s}', TILE_SUBDOMINI[Math.abs(x + y) % TILE_SUBDOMINI.length])
  .replace('{z}', z).replace('{x}', x).replace('{y}', y);

const cacheMappaDisponibile = () => 'caches' in window;

async function contaTileCache() {
  if (!cacheMappaDisponibile()) return 0;
  try { return (await (await caches.open(CACHE_TILE)).keys()).length; } catch { return 0; }
}

async function aggiornaInfoCacheMappa() {
  const el = $('#mappa-cache-info');
  if (!el) return;
  if (!cacheMappaDisponibile()) { el.textContent = 'Cache offline non disponibile su questo browser/contesto.'; return; }
  const n = await contaTileCache();
  // stima: le tile OSM pesano in media 15-20 KB l'una
  const mb = (n * 17 / 1024).toFixed(1);
  el.textContent = n ? `${n} tile salvate offline (~${mb} MB stimati)` : 'Nessuna tile salvata offline ancora.';
}

async function svuotaCacheMappa() {
  const n = await contaTileCache();
  if (!n) return alert('La cache della mappa è già vuota.');
  if (!confirm(`Cancellare le ${n} tile salvate offline? Le zone già viste andranno riscaricate dalla rete.`)) return;
  await caches.delete(CACHE_TILE);
  aggiornaInfoCacheMappa();
  toast('Cache della mappa svuotata');
}

// Elenco delle tile (z,x,y) che coprono i confini "bounds" al livello di
// zoom "z" — lo stesso calcolo che fa Leaflet internamente per decidere
// quali tile mostrare, qui usato per sapere quali scaricare in anticipo.
function tilePerZoomEArea(mappaRif, bounds, z) {
  const nw = mappaRif.project(bounds.getNorthWest(), z).divideBy(256).floor();
  const se = mappaRif.project(bounds.getSouthEast(), z).divideBy(256).floor();
  const tiles = [];
  for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) tiles.push({ z, x, y });
  return tiles;
}

function elencoTileArea(mappaRif, bounds, zMin, zMax) {
  let tiles = [];
  for (let z = zMin; z <= zMax; z++) tiles = tiles.concat(tilePerZoomEArea(mappaRif, bounds, z));
  return tiles;
}

const SCARICAMENTO_MAPPA = { annulla: false };

// Scarica in sequenza (poca concorrenza, per non intasare i server OSM) le
// tile della lista, saltando quelle già in cache, aggiornando lo stato ad
// ogni tile e potendo essere interrotto a metà dal pulsante "Annulla".
// mode:'no-cors' è quello che permette di ottenere comunque una risposta
// (anche se "opaca") da un server senza CORS come quello di OpenStreetMap;
// cache.put() la salva lo stesso, a differenza di un fetch() normale che
// fallirebbe e basta.
async function scaricaTileArea(tiles, progresso) {
  SCARICAMENTO_MAPPA.annulla = false;
  const cache = await caches.open(CACHE_TILE);
  const CONCORRENZA = 4;
  let fatte = 0, nuove = 0, errori = 0;
  let i = 0;
  async function lavora() {
    while (i < tiles.length) {
      if (SCARICAMENTO_MAPPA.annulla) return;
      const t = tiles[i++];
      const url = urlTile(t.z, t.x, t.y);
      try {
        const gia = await cache.match(url);
        if (!gia) {
          const risp = await fetch(url, { mode: 'no-cors' });
          await cache.put(url, risp);
          nuove++;
        }
      } catch { errori++; }
      fatte++;
      progresso(fatte, tiles.length, nuove, errori);
    }
  }
  await Promise.all(Array.from({ length: CONCORRENZA }, lavora));
  return { nuove, errori, interrotto: SCARICAMENTO_MAPPA.annulla };
}

async function apriScaricaAreaMappa() {
  if (!mappa) return;
  if (!cacheMappaDisponibile()) return alert('La cache offline non è disponibile in questo contesto (serve il service worker attivo, quindi l\'app aperta da un vero indirizzo https:// o installata).');
  const dlg = $('#dlg-mappa-offline');
  const zBase = mappa.getZoom();
  $('#mo-zoom-base').textContent = zBase;
  $('#mo-margine').value = '1';
  $('#mo-progresso').classList.add('nascosto');
  $('#mo-stima').textContent = '';
  aggiornaStimaAreaMappa();
  dlg.showModal();
}

function aggiornaStimaAreaMappa() {
  if (!mappa) return;
  const margine = Number($('#mo-margine').value);
  const zBase = mappa.getZoom();
  const zMin = Math.max(0, zBase - 1);
  const zMax = Math.min(19, zBase + margine);
  const tiles = elencoTileArea(mappa, mappa.getBounds(), zMin, zMax);
  const mb = (tiles.length * 17 / 1024).toFixed(1);
  $('#mo-stima').textContent = `${tiles.length} tile stimate (~${mb} MB), livelli di zoom ${zMin}–${zMax}.`;
}

async function avviaScaricamentoAreaMappa() {
  const margine = Number($('#mo-margine').value);
  const zBase = mappa.getZoom();
  const zMin = Math.max(0, zBase - 1);
  const zMax = Math.min(19, zBase + margine);
  const tiles = elencoTileArea(mappa, mappa.getBounds(), zMin, zMax);
  if (tiles.length > 3000 && !confirm(`Sono ${tiles.length} tile, potrebbe volerci un po' e consumare parecchi dati. Continuare?`)) return;

  $('#mo-progresso').classList.remove('nascosto');
  $('#mo-progresso-barra').max = tiles.length;
  $('#mo-progresso-testo').textContent = `0 / ${tiles.length}`;
  $('#btn-mo-scarica').disabled = true;
  $('#btn-mo-annulla-scaricamento').classList.remove('nascosto');

  const esito = await scaricaTileArea(tiles, (fatte, tot, nuove) => {
    $('#mo-progresso-barra').value = fatte;
    $('#mo-progresso-testo').textContent = `${fatte} / ${tot} (${nuove} nuove)`;
  });

  $('#btn-mo-scarica').disabled = false;
  $('#btn-mo-annulla-scaricamento').classList.add('nascosto');
  aggiornaInfoCacheMappa();
  if (esito.interrotto) {
    toast(`Scaricamento interrotto: ${esito.nuove} tile nuove salvate`);
  } else {
    toast(esito.errori ? `Area scaricata: ${esito.nuove} tile nuove, ${esito.errori} non riuscite` : `Area scaricata: ${esito.nuove} tile nuove salvate`);
  }
}

/* =====================================================================
   9c. MAPPA — segna sulla mappa le schede con coordinate GPS
   ===================================================================== */
let mappa = null;
let marcatoriMappa = [];

function assicuraMappa() {
  if (mappa) return;
  mappa = L.map('mappa', { zoomControl: true }).setView([45.5, 10], 6);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mappa);
  mappa.on('moveend zoomend', () => aggiornaInfoCacheMappa());
  $('#mappa').addEventListener('click', (e) => {
    const a = e.target.closest('.mappa-vai');
    if (!a) return;
    e.preventDefault();
    cambiaVista('schede');
    apriEditor(a.dataset.uid);
  });
}

function disegnaMappa() {
  if (!mappa) return;
  marcatoriMappa.forEach((m) => mappa.removeLayer(m));
  marcatoriMappa = [];
  const lista = schedeVisibili().filter((r) => r.gps);
  const confini = [];
  for (const r of lista) {
    const colore = r.problemi ? '#b4452f' : '#2f5d3a';
    const icona = L.divIcon({
      className: '', iconSize: [26, 26], iconAnchor: [13, 13],
      html: `<div style="background:${colore};color:#fff;border:2px solid #fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4)">${escHtml(r.prog)}</div>`,
    });
    const m = L.marker([r.gps.lat, r.gps.lng], { icon: icona }).addTo(mappa);
    m.bindPopup(`<b>${escHtml(r.nome || 'Esemplare ' + r.prog)}</b><br>${escHtml(dataBreveIT(r.data))}<br>` +
      `<a href="#" class="mappa-vai" data-uid="${escHtml(r.uid)}">Vai alla scheda →</a>`);
    marcatoriMappa.push(m);
    confini.push([r.gps.lat, r.gps.lng]);
  }
  if (confini.length) mappa.fitBounds(confini, { padding: [30, 30], maxZoom: 17 });
  setTimeout(() => mappa.invalidateSize(), 200);
}

function cambiaVista(tab) {
  S.vista = tab;
  for (const nome of ['schede', 'mappa', 'timeline']) $('#tab-' + nome).setAttribute('aria-pressed', String(tab === nome));
  $('#tab-schede').classList.toggle('attiva', tab === 'schede');
  $('#tab-mappa').classList.toggle('attiva', tab === 'mappa');
  $('#tab-timeline').classList.toggle('attiva', tab === 'timeline');
  $('#vista-schede').classList.toggle('nascosto', tab !== 'schede');
  $('#vista-mappa').classList.toggle('nascosto', tab !== 'mappa');
  $('#vista-timeline').classList.toggle('nascosto', tab !== 'timeline');
  // La creazione rimane sempre raggiungibile dalla navigazione principale.
  if (tab === 'mappa') { assicuraMappa(); disegnaMappa(); disegnaLineaTraccia(); aggiornaInfoTraccia(); aggiornaInfoCacheMappa(); }
  if (tab === 'timeline') disegnaTimeline();
}

/* =====================================================================
   9d. TRACCIA — registra il percorso fatto a piedi (breadcrumb GPS),
   indipendente dai punti delle singole schede. Resta salvata offline
   nello store IndexedDB "traccia" finché non la cancelli.
   ===================================================================== */
const TRK = { watch: null, segmentoCorrente: null, scartati: 0,
  pausa: leggiPref('sb-traccia-pausa') === '1', sessione: 0,
  coda: Promise.resolve(), inizio: 0, ultimoSegnale: 0, ultimoPunto: 0, nascostaDa: 0,
  avviso: '', ticker: null };
let lineaTraccia = null;

function segmentiTraccia() {
  const gruppi = [];
  for (const p of S.traccia) {
    const id = Number(p.segmento) || 1;
    let gruppo = gruppi.find((g) => g.id === id);
    if (!gruppo) { gruppo = { id, punti: [] }; gruppi.push(gruppo); }
    gruppo.punti.push(p);
  }
  return gruppi;
}

// distanza in metri tra due coordinate (formula dell'emisenoverso)
function distanzaMetri(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function distanzaTotaleTraccia() {
  let tot = 0;
  for (const gruppo of segmentiTraccia()) {
    for (let i = 1; i < gruppo.punti.length; i++) tot += distanzaMetri(gruppo.punti[i - 1], gruppo.punti[i]);
  }
  return tot;
}
const formattaDistanza = (m) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`;

function aggiornaInfoTraccia() {
  const n = S.traccia.length;
  const info = $('#traccia-info');
  if (!n) { info.textContent = TRK.watch !== null ? 'Registrazione avviata… in attesa del primo punto' : ''; }
  else {
    const durataMin = Math.round((Date.parse(S.traccia[n - 1].quando) - Date.parse(S.traccia[0].quando)) / 60000);
    const segmenti = segmentiTraccia().length;
    info.textContent = `${n} punti · ${segmenti} ${segmenti === 1 ? 'tratto' : 'tratti'} · ${formattaDistanza(distanzaTotaleTraccia())} · ${durataMin} min` +
      (TRK.scartati ? ` · ${TRK.scartati} GPS imprecisi ignorati` : '');
  }
  const attiva = TRK.watch !== null;
  let dettaglio = '';
  if (attiva) {
    const senzaSegnale = TRK.ultimoSegnale ? Date.now() - TRK.ultimoSegnale : Infinity;
    if (document.hidden) dettaglio = 'Pagina in background: il browser può sospendere il GPS';
    else if (senzaSegnale > 45000 && TRK.ultimoSegnale) dettaglio = 'Nessun segnale GPS recente: riapri l’app o fai Pausa e Riprendi';
    else if (TRK.avviso) dettaglio = TRK.avviso;
    else if (!TRK.ultimoSegnale && Date.now() - TRK.inizio > 45000) dettaglio = 'Nessun punto GPS acquisito: controlla i permessi e prova all’aperto';
    else if (!TRK.ultimoSegnale) dettaglio = 'In attesa del primo segnale GPS';
    else if (TRK.ultimoPunto) dettaglio = `Ultimo punto salvato alle ${new Date(TRK.ultimoPunto).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
    else dettaglio = 'Segnale ricevuto: in attesa di un punto preciso';
  } else if (TRK.avviso) dettaglio = TRK.avviso;
  $('#btn-traccia-gpx').classList.toggle('nascosto', n === 0);
  $('#btn-traccia-cancella').classList.toggle('nascosto', n === 0);
  $('#home-traccia-avvia').disabled = attiva;
  $('#home-traccia-avvia').textContent = TRK.pausa ? 'Riprendi' : 'Avvia traccia';
  $('#home-traccia-pausa').disabled = !attiva;
  $('#home-traccia-ferma').disabled = !attiva && !TRK.pausa;
  const statoTraccia = `${attiva ? 'GPS in ascolto' : TRK.pausa ? 'In pausa' : 'Traccia ferma'} · ${n} ${n === 1 ? 'punto' : 'punti'} salvati${n ? ' · ' + formattaDistanza(distanzaTotaleTraccia()) : ''}`;
  $('#home-traccia-stato').textContent = statoTraccia + (dettaglio ? ' · ' + dettaglio : '');
  $('#home-traccia-stato').classList.toggle('traccia-allerta', !!dettaglio && /impreciso|Nessun|negato|non riuscito|background|riattivato|scaduto|non disponibile/i.test(dettaglio));
  $('#traccia-diagnosi').textContent = dettaglio;
}

function disegnaLineaTraccia() {
  if (!mappa) return;
  if (lineaTraccia) { mappa.removeLayer(lineaTraccia); lineaTraccia = null; }
  if (S.traccia.length < 2) return;
  const linee = segmentiTraccia().map((g) => g.punti.map((p) => [p.lat, p.lng])).filter((x) => x.length > 1);
  if (!linee.length) return;
  lineaTraccia = L.polyline(linee, { color: '#2f5d3a', weight: 4, opacity: .8 }).addTo(mappa);
}

function ascoltaTraccia() {
  if (TRK.watch !== null) navigator.geolocation.clearWatch(TRK.watch);
  const sessione = ++TRK.sessione;
  const tratto = { numero: TRK.segmentoCorrente };
  TRK.watch = navigator.geolocation.watchPosition((p) => {
    if (sessione !== TRK.sessione) return;
    const c = p.coords;
    TRK.ultimoSegnale = Date.now();
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) || !Number.isFinite(c.accuracy) || c.accuracy > 50) {
      TRK.scartati++;
      TRK.avviso = Number.isFinite(c.accuracy) ? `Segnale impreciso (±${Math.round(c.accuracy)} m): punto ignorato, occorre precisione entro 50 m` : 'Coordinate GPS non valide: punto ignorato';
      aggiornaInfoTraccia();
      return;
    }
    TRK.avviso = '';
    // Le chiamate al database devono restare nell'ordine dei fix ricevuti.
    const ts = Number.isFinite(p.timestamp) && p.timestamp <= Date.now() + 60000 && p.timestamp > Date.now() - 120000 ? p.timestamp : Date.now();
    // I punti già ricevuti vanno salvati anche se subito dopo si preme Stop.
    TRK.coda = TRK.coda.then(async () => {
      const adesso = new Date(ts).toISOString();
      const precedente = S.traccia[S.traccia.length - 1];
      const ultimo = precedente?.segmento === tratto.numero ? precedente : null;
      const dist = ultimo ? distanzaMetri(ultimo, { lat: c.latitude, lng: c.longitude }) : Infinity;
      const secondi = ultimo ? Math.max(1, (ts - Date.parse(ultimo.quando)) / 1000) : Infinity;
      if (ultimo && dist < 3 && secondi < 30) { aggiornaInfoTraccia(); return; }
      if (ultimo && dist / secondi > 12 && c.accuracy > 15) {
        TRK.scartati++; TRK.avviso = 'Salto GPS anomalo ignorato'; aggiornaInfoTraccia(); return;
      }
      if (ultimo && secondi > 120) tratto.numero++;
      if (sessione === TRK.sessione) TRK.segmentoCorrente = tratto.numero;
      const punto = { lat: c.latitude, lng: c.longitude, alt: c.altitude, acc: c.accuracy, quando: adesso, segmento: tratto.numero };
      await DB.scrivi('traccia', punto);
      S.traccia.push(punto);
      TRK.ultimoPunto = Date.now();
      disegnaLineaTraccia();
      aggiornaInfoTraccia();
    }).catch((e) => {
      if (sessione === TRK.sessione) fermaTraccia();
      TRK.avviso = 'Salvataggio della traccia non riuscito: ' + e.message;
      aggiornaInfoTraccia();
      stato(TRK.avviso, true);
    });
    aggiornaInfoTraccia();
  }, (err) => {
    if (sessione !== TRK.sessione) return;
    const motivi = { 1: 'Permesso GPS negato: abilita la posizione per il browser', 2: 'Posizione non disponibile: riprova all’aperto', 3: 'Tempo GPS scaduto: fai Pausa e Riprendi' };
    TRK.avviso = motivi[err.code] || err.message;
    if (err.code === 1) { fermaTraccia(); TRK.avviso = motivi[1]; }
    aggiornaInfoTraccia();
    stato('Traccia: ' + TRK.avviso, true);
  }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
}

function avviaTraccia() {
  if (!navigator.geolocation) return alert('Geolocalizzazione non disponibile su questo dispositivo.');
  if (TRK.watch !== null) return;
  TRK.segmentoCorrente = Math.max(TRK.segmentoCorrente, S.traccia.reduce((max, p) => Math.max(max, Number(p.segmento) || 1), 0)) + 1;
  TRK.scartati = 0;
  TRK.inizio = Date.now();
  TRK.ultimoSegnale = 0;
  TRK.ultimoPunto = 0;
  TRK.avviso = '';
  const ripresa = TRK.pausa;
  TRK.pausa = false;
  cancellaPref('sb-traccia-pausa');
  scriviPref('sb-traccia-attiva', '1');
  try { ascoltaTraccia(); }
  catch (e) { cancellaPref('sb-traccia-attiva'); TRK.avviso = 'GPS non avviato: ' + e.message; aggiornaInfoTraccia(); return; }
  clearInterval(TRK.ticker);
  TRK.ticker = setInterval(aggiornaInfoTraccia, 15000);
  aggiornaInfoTraccia();
  stato(ripresa ? 'Traccia ripresa: nuovo tratto' : 'Traccia avviata');
}

function pausaTraccia() {
  if (TRK.watch === null) return;
  navigator.geolocation.clearWatch(TRK.watch);
  TRK.sessione++;
  TRK.watch = null;
  clearInterval(TRK.ticker); TRK.ticker = null;
  TRK.pausa = true;
  TRK.avviso = '';
  cancellaPref('sb-traccia-attiva');
  scriviPref('sb-traccia-pausa', '1');
  aggiornaInfoTraccia();
  stato('Traccia in pausa. I punti già registrati restano salvati.');
}

function fermaTraccia() {
  if (TRK.watch !== null) navigator.geolocation.clearWatch(TRK.watch);
  TRK.sessione++;
  TRK.watch = null;
  clearInterval(TRK.ticker); TRK.ticker = null;
  TRK.pausa = false;
  TRK.avviso = '';
  cancellaPref('sb-traccia-attiva');
  cancellaPref('sb-traccia-pausa');
  aggiornaInfoTraccia();
  stato('Traccia fermata. I punti restano salvati e puoi esportarli dalla Mappa.');
}

document.addEventListener('visibilitychange', () => {
  if (TRK.watch === null) return;
  if (document.hidden) { TRK.nascostaDa = Date.now(); aggiornaInfoTraccia(); return; }
  const durata = Date.now() - TRK.nascostaDa;
  TRK.nascostaDa = 0;
  if (durata > 10000) {
    const ultimo = S.traccia[S.traccia.length - 1];
    if (!ultimo || Date.now() - Date.parse(ultimo.quando) > 30000)
      TRK.segmentoCorrente = Math.max(TRK.segmentoCorrente, S.traccia.reduce((max, p) => Math.max(max, Number(p.segmento) || 1), 0)) + 1;
    TRK.avviso = 'App riaperta: GPS riattivato; controlla se manca un tratto';
    TRK.ultimoSegnale = 0;
    try { ascoltaTraccia(); }
    catch (e) { fermaTraccia(); TRK.avviso = 'Riattivazione GPS non riuscita: ' + e.message; }
  }
  aggiornaInfoTraccia();
});

async function cancellaTraccia() {
  if (!confirm(`Cancellare la traccia registrata (${S.traccia.length} punti)? Non si può annullare.`)) return;
  fermaTraccia();
  await TRK.coda;
  await DB.svuota('traccia');
  S.traccia = [];
  disegnaLineaTraccia();
  aggiornaInfoTraccia();
}

function testoTracciaGPX() {
  if (S.traccia.length < 2) return null;
  const segmenti = segmentiTraccia().map((g) => {
    const pt = g.punti.map((p) => `      <trkpt lat="${p.lat}" lon="${p.lng}">` +
      (p.alt != null ? `<ele>${p.alt}</ele>` : '') + `<time>${escHtml(p.quando)}</time></trkpt>`).join('\n');
    return `    <trkseg>\n${pt}\n    </trkseg>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Scheda Botanica" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <trk><name>Percorso ${oggi()}</name>\n${segmenti}\n  </trk>\n</gpx>\n`;
}
async function esportaTracciaGPX() {
  await TRK.coda;
  const gpx = testoTracciaGPX();
  if (!gpx) return alert('Servono almeno due punti per esportare un percorso.');
  scarica(new Blob([gpx], { type: 'application/gpx+xml' }), `scheda-botanica-percorso-${oggi()}.gpx`);
}
