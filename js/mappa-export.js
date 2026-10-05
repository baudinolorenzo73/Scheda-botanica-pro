'use strict';
/* =====================================================================
   MAPPA: STAMPA E PAGINA HTML
   Dalla vista «Mappa»:
   - «🖨 Stampa mappa»: la mappa (area visibile o tutte le schede) con i
     numeri delle schede, scala e legenda, pronta per stampa o PDF.
   - «⭳ Pagina HTML»: un unico file .html da aprire su qualsiasi telefono o
     PC, con la mappa interattiva e le schede delle piante censite (foto
     facoltative). Leaflet è incluso nel file; lo sfondo della mappa
     richiede Internet quando si apre la pagina.
   ===================================================================== */

// Valore di un campo come lo legge una persona (le «scelte» hanno un'etichetta).
function valoreLeggibile(c, v) {
  if (c.tipo === 'scelta') return v ? (c.valori.find(([x]) => x === v) || [, v])[1] : '';
  return String(v ?? '').trim();
}

function iconaNumero(r) {
  const colore = r.problemi ? '#b4452f' : '#2f5d3a';
  return L.divIcon({
    className: '', iconSize: [26, 26], iconAnchor: [13, 13],
    html: `<div style="background:${colore};color:#fff;border:2px solid #fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4);-webkit-print-color-adjust:exact;print-color-adjust:exact">${escHtml(r.prog)}</div>`,
  });
}

// Finestra di scelta costruita al volo; restituisce i valori o null se annullata.
async function chiediOpzioniMappa(titolo, spiegazione, campi, testoOk) {
  const dlg = el('dialog', { class: 'dlg-mappa-opzioni' },
    el('h2', {}, titolo),
    el('p', { class: 'campo-aiuto' }, spiegazione),
    ...campi.map((c) => c.nodo),
    el('div', { class: 'azioni' },
      el('button', { type: 'button', class: 'btn', value: 'annulla' }, 'Annulla'),
      el('button', { type: 'button', class: 'btn primario', value: 'ok' }, testoOk)));
  document.body.append(dlg);
  const esito = await chiedi(dlg);
  const valori = Object.fromEntries(campi.map((c) => [c.nome, c.leggi()]));
  dlg.remove();
  return esito === 'ok' ? valori : null;
}

function sceltaRadio(nome, etichetta, opzioni, predefinita) {
  const gruppo = el('fieldset', { class: 'mo-gruppo' }, el('legend', {}, etichetta),
    ...opzioni.map(([v, t]) => el('label', { class: 'mo-opzione' },
      el('input', { type: 'radio', name: 'mo-' + nome, value: v, checked: v === predefinita }), ' ', t)));
  return { nome, nodo: gruppo, leggi: () => gruppo.querySelector('input:checked')?.value };
}
function sceltaSpunta(nome, etichetta, predefinita) {
  const input = el('input', { type: 'checkbox', checked: predefinita });
  return { nome, nodo: el('label', { class: 'mo-opzione' }, input, ' ', etichetta), leggi: () => input.checked };
}
function sceltaTesto(nome, etichetta, valore) {
  const input = el('input', { type: 'text', class: 'campo-base', value: valore, maxlength: 120 });
  return { nome, nodo: el('label', { class: 'campo' }, etichetta, input), leggi: () => input.value.trim() };
}

/* ---------------------------- STAMPA ---------------------------- */
async function stampaMappa() {
  assicuraMappa();
  const conGps = schedeVisibili().filter((r) => r.gps).sort(perProg);
  const haTraccia = S.traccia.length > 1;
  const opzioni = [
    sceltaRadio('area', 'Cosa stampare', [['vista', 'L’area che vedi adesso sullo schermo'], ['tutte', `Tutte le schede con GPS (${conGps.length})`]], 'vista'),
    sceltaRadio('verso', 'Foglio A4', [['orizzontale', 'Orizzontale'], ['verticale', 'Verticale']], 'orizzontale'),
    sceltaSpunta('legenda', 'Aggiungi l’elenco delle schede (numero, nome, data, altezza)', true),
  ];
  if (haTraccia) opzioni.push(sceltaSpunta('traccia', 'Disegna anche la traccia del percorso', true));
  opzioni.push(sceltaTesto('titolo', 'Titolo', `Mappa dei rilievi – ${dataBreveIT(oggi())}`));
  const scelta = await chiediOpzioniMappa('Stampa mappa',
    'Si apre la finestra di stampa del telefono: puoi stampare o scegliere «Salva come PDF». Lo sfondo usa le zone della mappa già scaricate o la rete.',
    opzioni, '🖨 Stampa');
  if (!scelta) return;
  if (scelta.area === 'tutte' && !conGps.length) return alert('Nessuna scheda visibile ha le coordinate GPS.');

  pulisciStampaMappa();
  const orizzontale = scelta.verso === 'orizzontale';
  const stilePagina = el('style', { id: 'stile-pagina-mappa' }, `@page{size:A4 ${orizzontale ? 'landscape' : 'portrait'};margin:15mm}`);
  document.head.append(stilePagina);

  const area = $('#stampa');
  const box = el('div', { class: 'p-mappa-box', style: `width:${orizzontale ? 267 : 180}mm;height:${orizzontale ? 142 : 226}mm` });
  const pagina = el('article', { class: 'p-mappa' },
    el('h2', {}, scelta.titolo || 'Mappa dei rilievi'),
    el('p', { class: 'p-mappa-sotto' }, `${conGps.length} schede con GPS · stampata il ${dataIT(oraISO())} · by Lollo ®2026`),
    box,
    el('p', { class: 'p-mappa-nota' }, 'Cerchio verde: scheda · cerchio rosso: problemi segnalati · il numero è il N° progressivo. Sfondo © OpenStreetMap.'));
  const parti = [pagina];
  if (scelta.legenda && conGps.length) {
    parti.push(el('section', { class: 'p-mappa-legenda' },
      el('h3', {}, 'Elenco delle schede'),
      el('table', {},
        el('thead', {}, el('tr', {}, ...['N°', 'Nome', 'Data', 'Altezza', 'Coordinate'].map((t) => el('th', {}, t)))),
        el('tbody', {}, ...conGps.map((r) => el('tr', {},
          el('td', {}, String(r.prog ?? '')),
          el('td', { class: 'specie' }, r.nome || '—'),
          el('td', {}, dataBreveIT(r.data)),
          el('td', {}, r.altezza ? String(r.altezza).replace('.', ',') + ' m' : '—'),
          el('td', {}, `${r.gps.lat.toFixed(5)}, ${r.gps.lng.toFixed(5)}`)))))));
  }
  area.replaceChildren(...parti);
  // Leaflet ha bisogno di un riquadro con dimensioni reali: lo si prepara fuori schermo.
  area.classList.add('prepara-mappa');

  const m2 = L.map(box, { zoomControl: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false, zoomSnap: 0.25 });
  const sfondo = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m2);
  L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(m2);
  for (const r of conGps) L.marker([r.gps.lat, r.gps.lng], { icon: iconaNumero(r) }).addTo(m2);
  if (scelta.traccia) {
    for (const g of segmentiTraccia()) {
      if (g.punti.length > 1) L.polyline(g.punti.map((p) => [p.lat, p.lng]), { color: '#d0402b', weight: 3, opacity: 0.85 }).addTo(m2);
    }
  }
  if (scelta.area === 'tutte') m2.fitBounds(conGps.map((r) => [r.gps.lat, r.gps.lng]), { padding: [30, 30], maxZoom: 18 });
  else m2.fitBounds(mappa.getBounds());
  m2.getContainer().append(el('div', { class: 'p-mappa-nord', 'aria-hidden': 'true' }, 'N', el('br'), '▲'));

  stato('Preparo la mappa da stampare…');
  // Si aspetta lo sfondo, al massimo 12 secondi (offline le zone mancanti restano grigie).
  await new Promise((ok) => {
    const t = setTimeout(ok, 12000);
    sfondo.once('load', () => { clearTimeout(t); ok(); });
  });
  await new Promise((ok) => setTimeout(ok, 300));
  stato('Mappa pronta per la stampa');
  window.addEventListener('afterprint', () => { m2.remove(); pulisciStampaMappa(); }, { once: true });
  window.print();
}

function pulisciStampaMappa() {
  $('#stile-pagina-mappa')?.remove();
  const area = $('#stampa');
  if (area.classList.contains('prepara-mappa')) {
    area.classList.remove('prepara-mappa');
    area.replaceChildren();
  }
}

/* ------------------------- PAGINA HTML ------------------------- */
// WebP pesa circa un terzo meno del JPEG a parità di aspetto; se il browser
// non lo sa scrivere (restituisce PNG), si ripiega sul JPEG.
function canvasInDataURL(c, qualita) {
  const w = c.toDataURL('image/webp', qualita);
  return w.startsWith('data:image/webp') ? w : c.toDataURL('image/jpeg', qualita);
}
// Misure delle foto nella pagina esportata: lato lungo in pixel e qualità.
const FOTO_PAGINA = { piccole: [720, 0.6], medie: [1080, 0.68], grandi: [1600, 0.78] };
// Riduce una foto per la pagina esportata.
async function fotoRidotta(blob, misura = 'piccole') {
  const [lato, qualita] = FOTO_PAGINA[misura] || FOTO_PAGINA.piccole;
  const img = await createImageBitmap(blob);
  const k = Math.min(1, lato / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return canvasInDataURL(c, qualita);
}
// Ricomprime una tile dello sfondo (WebP): tiene la versione più leggera.
async function tileCompatta(blob) {
  const orig = await blobInDataURL(blob);
  try {
    const img = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0); img.close?.();
    const nuova = canvasInDataURL(c, 0.7);
    return nuova.length < orig.length ? nuova : orig;
  } catch { return orig; }
}

// Contenuto di una scheda per la pagina: per sezioni, come nella stampa.
// «completa» = tutti i campi pertinenti (vuoti con «—»);
// «compilati» = solo i campi con un valore. La stima ambientale è a parte (conStima).
function sezioniScheda(r, contenuto, conStima = true) {
  const completa = contenuto !== 'compilati';
  const sezioni = [];
  for (const sez of SEZIONI) {
    const campi = [];
    for (const c of CAMPI) {
      if (c.sez !== sez.id || ['prog', 'nome', 'data'].includes(c.k) || !campoPertinente(r, c.k)) continue;
      // nella versione ridotta la numerazione del giorno e «1 esemplare» (il valore di partenza) non dicono nulla
      if (!completa && (c.k === 'numeroZona' || (c.k === 'numero' && String(r.numero ?? '') === '1'))) continue;
      const v = valoreLeggibile(c, r[c.k]);
      if (v || completa) campi.push([c.etichettaStampa || c.label, v ? (c.tipo === 'numero' ? v.replace('.', ',') : v) : '—']);
    }
    if (campi.length) sezioni.push({ titolo: sez.titolo, campi });
  }
  if (conStima) {
    const stima = righeStima(stimaAlbero(r));
    if (stima.length) sezioni.push({ titolo: 'Stima ambientale (indicativa)', campi: stima });
  }
  return sezioni;
}

async function datiPaginaMappa(lista, modoFoto, misuraFoto, contenuto = 'completa', conStima = true) {
  const schede = [];
  for (const r of lista) {
    const sezioni = sezioniScheda(r, contenuto, conStima);
    const foto = [];
    const daIncludere = modoFoto === 'tutte' ? r.foto : modoFoto === 'una' ? r.foto.slice(0, 1) : [];
    for (const p of daIncludere) {
      try {
        const b = await DB.leggi('foto', p.id);
        if (b) foto.push({ src: await fotoRidotta(b, misuraFoto), didascalia: p.didascalia || '' });
      } catch { /* foto illeggibile: la scheda esce senza */ }
    }
    schede.push({
      id: r.uid, prog: String(r.prog ?? ''), nome: r.nome || '', data: dataBreveIT(r.data),
      problemi: !!r.problemi,
      gps: r.gps ? { lat: r.gps.lat, lng: r.gps.lng, acc: r.gps.acc ?? null } : null,
      gbif: r.gbifId || '', sezioni, foto,
      modifica: contenuto === 'compilati' ? '' : `Creata il ${dataIT(r.creato)} – ultima modifica ${dataIT(r.modificato)}`,
    });
  }
  return schede;
}

/* ---------------- SFONDO DELLA PAGINA (online e offline) ----------------
   La pagina esportata si apre di solito dal telefono come file (content:// o
   file://): il browser non invia il «Referer» e i server di OpenStreetMap
   rispondono 403 «Access blocked». Si usano quindi due servizi che accettano
   queste richieste e permettono di copiare le tile (CORS): così, mentre si
   crea la pagina, le tile della zona delle schede vengono salvate DENTRO il
   file e la mappa si vede anche senza Internet. */
const SFONDI_PAGINA = {
  // CARTO (usato nella 3.32.0) ora chiede una chiave e risponde con tile «API KEY REQUIRED».
  stradale: { nome: 'Stradale', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', sub: '', max: 19, attr: 'Mappa © Esri, HERE, Garmin, OpenStreetMap contributors' },
  satellite: { nome: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', sub: '', max: 19, attr: 'Immagini © Esri, Maxar, Earthstar Geographics' },
  topografica: { nome: 'Topografica', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', sub: '', max: 19, attr: 'Mappa © Esri, HERE, Garmin, USGS, OpenStreetMap contributors' },
};
const urlSfondo = (sf, z, x, y) => sf.url.replace('{s}', sf.sub ? sf.sub[(x + y) % sf.sub.length] : '')
  .replace('{z}', z).replace('{x}', x).replace('{y}', y);
const tileX = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const tileY = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };

// Tile che coprono le schede con un margine (≈ 90 m o 20 %), dallo zoom più
// largo in su, finché si resta nel budget: area piccola = si arriva vicinissimi.
function tileZonaSchede(punti, budget = 260, zMin = 10, zMax = 19) {
  let s = Math.min(...punti.map((p) => p.lat)), n = Math.max(...punti.map((p) => p.lat));
  let w = Math.min(...punti.map((p) => p.lng)), e = Math.max(...punti.map((p) => p.lng));
  const mLat = Math.max((n - s) * 0.2, 0.0008), mLng = Math.max((e - w) * 0.2, 0.0011);
  s = Math.max(s - mLat, -85); n = Math.min(n + mLat, 85); w -= mLng; e += mLng;
  const elenco = []; let ultimo = zMin - 1;
  for (let z = zMin; z <= zMax; z++) {
    const x0 = tileX(w, z), x1 = tileX(e, z), y0 = tileY(n, z), y1 = tileY(s, z);
    if (elenco.length + (x1 - x0 + 1) * (y1 - y0 + 1) > budget) break;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) elenco.push({ z, x, y });
    ultimo = z;
  }
  return { elenco, zMin, zMax: ultimo };
}

// Scarica le tile come immagini leggibili (CORS) e le trasforma in data URL.
// Dopo 8 errori di fila si ferma: servizio irraggiungibile o connessione persa.
async function scaricaSfondo(sf, elenco, avanza) {
  const tile = {}; let i = 0, ok = 0, err = 0, difila = 0;
  const lavora = async () => {
    while (i < elenco.length && difila < 8) {
      const t = elenco[i++];
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(urlSfondo(sf, t.z, t.x, t.y), { mode: 'cors', credentials: 'omit', signal: ctl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const b = await r.blob();
        if (!/^image\//.test(b.type)) throw new Error('non è un\'immagine');
        tile[`${t.z}/${t.x}/${t.y}`] = await tileCompatta(b); ok++; difila = 0;
      } catch { err++; difila++; } finally { clearTimeout(timer); avanza(); }
    }
  };
  await Promise.all(Array.from({ length: 6 }, lavora));
  return { tile, ok, err: err + (elenco.length - ok - err) };
}

async function esportaMappaHTML() {
  const visibili = schedeVisibili();
  const scelta = await chiediOpzioniMappa('Pagina HTML con mappa e schede',
    'Crea un unico file .html da aprire su qualsiasi telefono o computer, anche da inviare. Contiene la mappa con i numeri e le schede delle piante. Schede e foto si vedono sempre; lo sfondo della mappa della zona può essere salvato nel file per vederlo anche senza Internet (serve la rete adesso, mentre crei la pagina).',
    [
      sceltaRadio('quali', 'Quali schede', [['visibili', `Quelle visibili con il filtro attuale (${visibili.length})`], ['tutte', `Tutte (${S.schede.length})`]], 'visibili'),
      sceltaRadio('contenuto', 'Schede', [['completa', 'Scheda completa: tutte le sezioni e i campi, come nella stampa (consigliato)'], ['compilati', 'Solo i campi compilati (più breve)']], 'completa'),
      sceltaSpunta('stima', 'Includi la stima ambientale (volume chioma, ombra, CO₂)', leggiPref('sb-stampa-stima') !== '0'),
      sceltaRadio('foto', 'Foto', [['una', 'Una foto per scheda (consigliato)'], ['tutte', 'Tutte le foto (file più pesante)'], ['nessuna', 'Nessuna foto']], 'una'),
      sceltaRadio('misura', 'Dimensione delle foto', [['piccole', 'Piccole: bastano sul telefono (file leggero, consigliato)'], ['medie', 'Medie: buone anche sul computer'], ['grandi', 'Grandi: per ingrandire i dettagli (file pesante)']], 'piccole'),
      sceltaRadio('offline', 'Mappa senza Internet', [['stradale', 'Salva nel file lo sfondo stradale (consigliato)'], ['entrambe', 'Salva stradale e satellite (file più pesante)'], ['satellite', 'Salva solo il satellite'], ['topografica', 'Salva solo la topografica'], ['tutte', 'Salva stradale, satellite e topografica (il più pesante)'], ['nessuna', 'Non salvare: lo sfondo si vedrà solo con Internet']], 'stradale'),
      sceltaTesto('titolo', 'Titolo della pagina', `Censimento alberi – ${dataBreveIT(oggi())}`),
    ], '⭳ Crea pagina');
  if (!scelta) return;
  const lista = (scelta.quali === 'tutte' ? [...S.schede] : visibili).sort(perProg);
  if (!lista.length) return alert('Nessuna scheda da esportare.');

  stato('Preparo la pagina HTML…');
  try {
    const [leafletJs, leafletCss] = await Promise.all(['./lib/leaflet.js', './lib/leaflet.css'].map(async (u) => {
      const risposta = await fetch(u);
      if (!risposta.ok) throw new Error('libreria della mappa non disponibile');
      return risposta.text();
    }));
    const dati = { titolo: scelta.titolo || 'Censimento alberi', creato: dataIT(oraISO()), schede: await datiPaginaMappa(lista, scelta.foto, scelta.misura, scelta.contenuto, scelta.stima) };
    scriviPref('sb-stampa-stima', scelta.stima ? '1' : '0');
    const punti = lista.filter((r) => r.gps).map((r) => r.gps);
    const daSalvare = { stradale: ['stradale'], satellite: ['satellite'], topografica: ['topografica'], entrambe: ['stradale', 'satellite'], tutte: ['stradale', 'satellite', 'topografica'] }[scelta.offline] || [];
    const avvisi = [];
    dati.sfondi = {};
    for (const [k, sf] of Object.entries(SFONDI_PAGINA)) dati.sfondi[k] = { ...sf, tile: {}, zMin: null, zMax: null };
    if (daSalvare.length && punti.length) {
      if (navigator.onLine === false) avvisi.push('Sei offline: lo sfondo della mappa non è stato salvato nel file (si vedrà solo con Internet).');
      else {
        const zona = tileZonaSchede(punti);
        for (const k of daSalvare) {
          const sf = SFONDI_PAGINA[k]; let fatte = 0;
          const esito = await scaricaSfondo(sf, zona.elenco, () => stato(`Salvo lo sfondo ${sf.nome.toLowerCase()} per l'uso offline… ${++fatte}/${zona.elenco.length}`));
          if (esito.ok) Object.assign(dati.sfondi[k], { tile: esito.tile, zMin: zona.zMin, zMax: zona.zMax });
          if (!esito.ok) avvisi.push(`Sfondo ${sf.nome.toLowerCase()} non salvato: servizio non raggiungibile adesso (si vedrà solo con Internet).`);
          else if (esito.err) avvisi.push(`Sfondo ${sf.nome.toLowerCase()}: ${esito.err} tile su ${zona.elenco.length} non scaricate; quelle zone senza Internet restano grigie.`);
        }
      }
    }
    const html = paginaMappaHTML(dati, leafletJs, leafletCss);
    const nome = `mappa-schede-${oggi()}.html`;
    const dove = await scarica(new Blob([html], { type: 'text/html' }), nome);
    const mbDi = (n) => (n / 1048576).toFixed(1).replace('.', ',');
    const pesoFoto = dati.schede.reduce((t, x) => t + x.foto.reduce((u, f) => u + f.src.length, 0), 0);
    const pesoMappa = Object.values(dati.sfondi).reduce((t, x) => t + Object.values(x.tile).reduce((u, v) => u + v.length, 0), 0);
    stato(`Pagina creata: ${nome} (${lista.length} schede, ${mbDi(html.length)} MB: foto ${mbDi(pesoFoto)} MB, mappa offline ${mbDi(pesoMappa)} MB)${dove === 'cartella' ? ' in Download/Botanica' : ''}`);
    if (avvisi.length) alert('Pagina creata, con un avviso:\n\n' + avvisi.join('\n'));
  } catch (e) {
    alert('Pagina non creata: ' + e.message);
    stato('');
  }
}

// Il testo dentro <script> e <style> non deve poterli chiudere in anticipo.
const sicuroInScript = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const sicuroInStile = (s) => s.replace(/<\/style/gi, '<\\/style');

function paginaMappaHTML(dati, leafletJs, leafletCss) {
  const json = JSON.stringify(dati).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(dati.titolo)}</title>
<style>${sicuroInStile(leafletCss)}</style>
<style>
:root{--carta:#eef2eb;--foglio:#fff;--ink:#1d2a22;--tenue:#5b6a60;--bosco:#2f5d3a;--linea:#d3dccf;--rosso:#b4452f}
@media (prefers-color-scheme:dark){:root{--carta:#121a15;--foglio:#1b251f;--ink:#e5ece4;--tenue:#a3b3a6;--bosco:#6fb07e;--linea:#2f3b33;--rosso:#e07a62}}
*{box-sizing:border-box}
body{margin:0;background:var(--carta);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{background:#2f5d3a;color:#fff;padding:18px 16px}
header h1{margin:0;font:600 22px Georgia,serif}
header p{margin:4px 0 0;opacity:.85;font-size:13px}
main{max-width:1000px;margin:0 auto;padding:12px 16px 40px}
#mappa{height:60vh;min-height:320px;border-radius:14px;border:1px solid var(--linea);background:#dfe4dc}
.stato-rete{background:#fff;color:#1d2a22;border-radius:8px;padding:4px 9px;font:600 12px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)}
.stato-rete.off{color:#8a5a00}
.leaflet-control-layers{font:14px system-ui,sans-serif}
.leaflet-control-layers-toggle{background-image:none!important;display:flex!important;align-items:center;justify-content:center;font-size:21px;text-decoration:none}
.leaflet-control-layers-toggle::before{content:"🗺️"}
.leaflet-control-layers label{padding:4px 2px}
.nota{color:var(--tenue);font-size:12.5px;margin:6px 2px 14px}
#cerca{width:100%;padding:12px;border:1px solid var(--linea);border-radius:10px;background:var(--foglio);color:var(--ink);font-size:16px;margin-bottom:12px}
.scheda{background:var(--foglio);border:1px solid var(--linea);border-radius:14px;padding:14px;margin-bottom:12px;scroll-margin-top:12px}
.scheda.evidenza{outline:3px solid #9bb35a}
.testa{display:flex;gap:12px;align-items:center}
.num{background:var(--bosco);color:#fff;font-weight:700;min-width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0 6px}
.num.problemi{background:var(--rosso)}
.testa h2{margin:0;font:italic 600 18px Georgia,serif}
.testa p{margin:0;color:var(--tenue);font-size:13px}
.galleria{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:12px}
.galleria img{width:100%;border-radius:8px;display:block;cursor:zoom-in}
.galleria figure{margin:0}
.galleria figcaption{font-size:12px;color:var(--tenue)}
dl{display:grid;grid-template-columns:minmax(120px,40%) 1fr;gap:4px 12px;margin:12px 0 0;font-size:14px}
h3.sez{margin:16px 0 0;padding-bottom:3px;border-bottom:1.5px solid var(--bosco);font:600 15px Georgia,serif;color:var(--bosco)}
.sez + dl{margin-top:6px}
.modifica{color:var(--tenue);font-size:12px;margin:10px 0 0}
dt{color:var(--tenue);overflow-wrap:anywhere} dd{margin:0;min-width:0;text-align:justify;text-align-last:left;hyphens:auto;overflow-wrap:anywhere}
.azioni{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.azioni button,.azioni a{border:1px solid var(--linea);background:var(--carta);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;font-size:14px;text-decoration:none;cursor:pointer}
.vuoto{color:var(--tenue);text-align:center;padding:20px}
#zoom{position:fixed;inset:0;background:rgba(0,0,0,.9);display:none;align-items:center;justify-content:center;z-index:2000}
#zoom img{max-width:96vw;max-height:92vh}
#zoom.aperto{display:flex}
footer{text-align:center;color:var(--tenue);font-size:12px;padding:16px}
@page{size:A4;margin:15mm}
@media print{#cerca,.azioni,#zoom{display:none!important}#mappa{height:150mm}.scheda{break-inside:auto;box-shadow:none}dl>*{break-inside:avoid}h3.sez{break-after:avoid}.galleria{grid-template-columns:repeat(3,1fr)}.galleria figure{break-inside:avoid}.galleria img{max-height:60mm;object-fit:contain}body{background:#fff}main{max-width:none;padding:6px 0}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header><h1></h1><p id="sotto"></p></header>
<main>
  <div id="mappa" role="region" aria-label="Mappa delle schede"></div>
  <p class="nota" id="nota-mappa">Tocca un numero sulla mappa per aprire la scheda. Verde: scheda · rosso: problemi segnalati.</p>
  <input id="cerca" type="search" placeholder="Cerca per nome, numero o caratteristica…" aria-label="Cerca nelle schede">
  <div id="elenco"></div>
</main>
<div id="zoom" role="dialog" aria-label="Foto ingrandita"><img alt=""></div>
<footer>Scheda Botanica PRO · by Lollo ®2026</footer>
<script type="application/json" id="dati">${json}</script>
<script>${sicuroInScript(leafletJs)}</script>
<script>
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('dati').textContent);
  function el(tag, cls, testo) { var n = document.createElement(tag); if (cls) n.className = cls; if (testo != null) n.textContent = testo; return n; }
  document.querySelector('header h1').textContent = D.titolo;
  document.getElementById('sotto').textContent = D.schede.length + ' schede · creata il ' + D.creato;

  var mappa = L.map('mappa', { maxZoom: 20 }).setView([45.5, 10], 6);

  /* Sfondo: prima le tile salvate nel file (funzionano senza Internet), poi la rete;
     se manca tutto, si ingrandisce una tile salvata di livello inferiore; se no, grigio. */
  var SF = D.sfondi || {};
  function urlT(sf, c) { return sf.url.replace('{s}', sf.sub ? sf.sub.charAt((c.x + c.y) % sf.sub.length) : '').replace('{z}', c.z).replace('{x}', c.x).replace('{y}', c.y); }
  var Sfondo = L.GridLayer.extend({
    createTile: function (c, done) {
      var sf = this.options.sf, cv = document.createElement('canvas'), g;
      cv.width = cv.height = 256; g = cv.getContext('2d');
      function disegna(src, sx, sy, lato, altrimenti) {
        var im = new Image();
        im.onload = function () { g.drawImage(im, sx, sy, lato, lato, 0, 0, 256, 256); done(null, cv); };
        im.onerror = altrimenti; im.src = src;
      }
      function vuota() {
        g.fillStyle = '#dfe4dc'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(0,0,0,.07)';
        for (var i = -256; i < 256; i += 16) { g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); }
        done(null, cv);
      }
      function antenato() {
        for (var d = 1; d <= 8 && c.z - d >= 0; d++) {
          var px = c.x >> d, py = c.y >> d, a = sf.tile[(c.z - d) + '/' + px + '/' + py];
          if (a) { var lato = 256 / (1 << d); return disegna(a, (c.x - (px << d)) * lato, (c.y - (py << d)) * lato, lato, vuota); }
        }
        vuota();
      }
      var k = c.z + '/' + c.x + '/' + c.y;
      if (sf.tile[k]) disegna(sf.tile[k], 0, 0, 256, antenato);
      else if (navigator.onLine !== false) disegna(urlT(sf, c), 0, 0, 256, antenato);
      else antenato();
      return cv;
    }
  });
  var strati = {}, corrente = null, salvato = null;
  ['stradale', 'satellite', 'topografica'].forEach(function (k) {
    var sf = SF[k]; if (!sf) return;
    var n = Object.keys(sf.tile || {}).length; sf.tile = sf.tile || {};
    var l = new Sfondo({ sf: sf, maxZoom: 20, maxNativeZoom: sf.max, attribution: sf.attr });
    l._salvate = n;
    strati[sf.nome + (n ? ' · salvato nel file' : ' · solo online')] = l;
    if (n && !salvato) salvato = { l: l, sf: sf };
  });
  var nomi = Object.keys(strati);
  // senza rete parte dallo sfondo salvato; con la rete dallo stradale
  corrente = (navigator.onLine === false && salvato) ? salvato.l : strati[nomi[0]];
  if (corrente) corrente.addTo(mappa);
  if (nomi.length > 1) L.control.layers(strati, null, { collapsed: true }).addTo(mappa);
  L.control.scale({ imperial: false }).addTo(mappa);
  var StatoRete = L.Control.extend({ options: { position: 'topright' }, onAdd: function () { this._d = L.DomUtil.create('div', 'stato-rete'); aggiornaStato(this._d); return this._d; } });
  var statoRete = new StatoRete();
  function aggiornaStato(d) {
    d = d || statoRete._d; if (!d) return;
    var off = navigator.onLine === false, n = corrente ? corrente._salvate : 0;
    d.className = 'stato-rete' + (off ? ' off' : '');
    d.textContent = off ? (n ? '● Offline · sfondo salvato nel file' : '● Offline · sfondo non salvato') : '● Online';
  }
  statoRete.addTo(mappa);
  mappa.on('baselayerchange', function (e) { corrente = e.layer; aggiornaStato(); });
  window.addEventListener('online', function () { aggiornaStato(); if (corrente) corrente.redraw(); });
  window.addEventListener('offline', function () { aggiornaStato(); });
  if (salvato) {
    document.getElementById('nota-mappa').textContent += ' Lo sfondo della zona delle schede è salvato nel file (zoom ' + salvato.sf.zMin + '–' + salvato.sf.zMax +
      '): si vede anche senza Internet. Più da vicino o fuori zona serve Internet. Con il pulsante 🗺️ in alto a destra scegli stradale, satellite o topografica.';
  } else {
    document.getElementById('nota-mappa').textContent += ' Lo sfondo della mappa si vede con Internet. Con il pulsante 🗺️ in alto a destra scegli stradale, satellite o topografica.';
  }
  var marcatori = {}, punti = [];
  var schede = {};

  D.schede.forEach(function (s) {
    var art = el('article', 'scheda'); art.id = 's-' + s.id;
    var testa = el('div', 'testa');
    testa.appendChild(el('div', 'num' + (s.problemi ? ' problemi' : ''), s.prog || '?'));
    var nomi = el('div');
    nomi.appendChild(el('h2', null, s.nome || 'Esemplare senza nome'));
    nomi.appendChild(el('p', null, [s.data, s.gps ? '' : 'senza coordinate GPS'].filter(Boolean).join(' · ')));
    testa.appendChild(nomi); art.appendChild(testa);
    if (s.foto.length) {
      var gal = el('div', 'galleria');
      s.foto.forEach(function (f, i) {
        var fig = el('figure'), img = el('img');
        img.src = f.src; img.alt = 'Foto ' + (i + 1) + ' – ' + (s.nome || 'esemplare'); img.loading = 'lazy';
        img.onclick = function () { var z = document.getElementById('zoom'); z.querySelector('img').src = f.src; z.classList.add('aperto'); };
        fig.appendChild(img);
        if (f.didascalia) fig.appendChild(el('figcaption', null, f.didascalia));
        gal.appendChild(fig);
      });
      art.appendChild(gal);
    }
    s.sezioni.forEach(function (z) {
      art.appendChild(el('h3', 'sez', z.titolo));
      var dl = el('dl');
      z.campi.forEach(function (c) { dl.appendChild(el('dt', null, c[0])); dl.appendChild(el('dd', null, c[1])); });
      art.appendChild(dl);
    });
    if (s.modifica) art.appendChild(el('p', 'modifica', s.modifica));
    var az = el('div', 'azioni');
    if (s.gps) {
      var vai = el('button', null, '📍 Mostra sulla mappa');
      vai.type = 'button';
      vai.onclick = function () {
        mappa.setView([s.gps.lat, s.gps.lng], 18);
        marcatori[s.id].openPopup();
        document.getElementById('mappa').scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      az.appendChild(vai);
      var osm = el('a', null, 'Apri su OpenStreetMap ↗');
      osm.href = 'https://www.openstreetmap.org/?mlat=' + s.gps.lat + '&mlon=' + s.gps.lng + '#map=18/' + s.gps.lat + '/' + s.gps.lng;
      osm.target = '_blank'; osm.rel = 'noopener';
      az.appendChild(osm);
      az.appendChild(el('span', 'nota', s.gps.lat.toFixed(6) + ', ' + s.gps.lng.toFixed(6) + (s.gps.acc != null ? ' (±' + Math.round(s.gps.acc) + ' m)' : '')));
    }
    if (s.gbif) {
      var g = el('a', null, 'Specie su GBIF ↗');
      g.href = 'https://www.gbif.org/species/' + encodeURIComponent(s.gbif); g.target = '_blank'; g.rel = 'noopener';
      az.appendChild(g);
    }
    if (az.childNodes.length) art.appendChild(az);
    document.getElementById('elenco').appendChild(art);
    schede[s.id] = { s: s, art: art, testo: [s.prog, s.nome, s.data].concat([].concat.apply([], s.sezioni.map(function (z) { return z.campi.map(function (c) { return c[1]; }); }))).join(' ').toLowerCase() };

    if (s.gps) {
      var icona = L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14],
        html: '<div style="background:' + (s.problemi ? '#b4452f' : '#2f5d3a') + ';color:#fff;border:2px solid #fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>' });
      var m = L.marker([s.gps.lat, s.gps.lng], { icon: icona, title: (s.prog ? 'N° ' + s.prog + ' ' : '') + (s.nome || '') }).addTo(mappa);
      m.on('add', function () { var d = m.getElement() && m.getElement().firstChild; if (d) d.textContent = s.prog || '?'; });
      var d0 = m.getElement() && m.getElement().firstChild; if (d0) d0.textContent = s.prog || '?';
      var pop = el('div');
      pop.appendChild(el('b', null, (s.prog ? s.prog + ' · ' : '') + (s.nome || 'Esemplare senza nome')));
      if (s.data) { pop.appendChild(el('br')); pop.appendChild(document.createTextNode(s.data)); }
      pop.appendChild(el('br'));
      var link = el('a', null, 'Vai alla scheda ↓'); link.href = '#s-' + s.id;
      link.onclick = function (e) {
        e.preventDefault();
        art.scrollIntoView({ behavior: 'smooth' });
        art.classList.add('evidenza'); setTimeout(function () { art.classList.remove('evidenza'); }, 2000);
      };
      pop.appendChild(link);
      m.bindPopup(pop);
      marcatori[s.id] = m; punti.push([s.gps.lat, s.gps.lng]);
    }
  });
  if (punti.length) mappa.fitBounds(punti, { padding: [30, 30], maxZoom: 17 });
  else document.getElementById('mappa').style.display = 'none';
  if (!D.schede.length) document.getElementById('elenco').appendChild(el('p', 'vuoto', 'Nessuna scheda.'));

  document.getElementById('cerca').addEventListener('input', function (e) {
    var q = e.target.value.trim().toLowerCase();
    Object.keys(schede).forEach(function (id) {
      var x = schede[id], vede = !q || x.testo.indexOf(q) >= 0;
      x.art.style.display = vede ? '' : 'none';
      if (marcatori[id]) { if (vede) marcatori[id].addTo(mappa); else mappa.removeLayer(marcatori[id]); }
    });
  });
  document.getElementById('zoom').onclick = function () { this.classList.remove('aperto'); };
})();
</script>
</body></html>`;
}
