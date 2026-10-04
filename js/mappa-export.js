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
  const stilePagina = el('style', { id: 'stile-pagina-mappa' }, `@page{size:A4 ${orizzontale ? 'landscape' : 'portrait'};margin:12mm}`);
  document.head.append(stilePagina);

  const area = $('#stampa');
  const box = el('div', { class: 'p-mappa-box', style: `width:${orizzontale ? 273 : 186}mm;height:${orizzontale ? 148 : 232}mm` });
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
// Riduce una foto per la pagina esportata (lato lungo "lato" px, JPEG).
async function fotoRidotta(blob, lato) {
  const img = await createImageBitmap(blob);
  const k = Math.min(1, lato / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return c.toDataURL('image/jpeg', 0.72);
}

async function datiPaginaMappa(lista, modoFoto) {
  const schede = [];
  for (const r of lista) {
    const campi = [];
    for (const c of CAMPI) {
      // Numerazione del giorno e «1 esemplare» (il valore di partenza) non dicono nulla a chi legge.
      if (['prog', 'nome', 'data', 'numeroZona'].includes(c.k) || !campoPertinente(r, c.k)) continue;
      if (c.k === 'numero' && String(r.numero ?? '') === '1') continue;
      const v = valoreLeggibile(c, r[c.k]);
      if (v) campi.push([c.etichettaStampa || c.label, c.tipo === 'numero' ? v.replace('.', ',') : v]);
    }
    const foto = [];
    const daIncludere = modoFoto === 'tutte' ? r.foto : modoFoto === 'una' ? r.foto.slice(0, 1) : [];
    for (const p of daIncludere) {
      try {
        const b = await DB.leggi('foto', p.id);
        if (b) foto.push({ src: await fotoRidotta(b, 1000), didascalia: p.didascalia || '' });
      } catch { /* foto illeggibile: la scheda esce senza */ }
    }
    schede.push({
      id: r.uid, prog: String(r.prog ?? ''), nome: r.nome || '', data: dataBreveIT(r.data),
      problemi: !!r.problemi,
      gps: r.gps ? { lat: r.gps.lat, lng: r.gps.lng, acc: r.gps.acc ?? null } : null,
      gbif: r.gbifId || '', campi, foto,
    });
  }
  return schede;
}

async function esportaMappaHTML() {
  const visibili = schedeVisibili();
  const scelta = await chiediOpzioniMappa('Pagina HTML con mappa e schede',
    'Crea un unico file .html da aprire su qualsiasi telefono o computer, anche da inviare. Contiene la mappa con i numeri e le schede delle piante. Lo sfondo della mappa si vede con Internet; schede e foto anche senza.',
    [
      sceltaRadio('quali', 'Quali schede', [['visibili', `Quelle visibili con il filtro attuale (${visibili.length})`], ['tutte', `Tutte (${S.schede.length})`]], 'visibili'),
      sceltaRadio('foto', 'Foto', [['una', 'Una foto per scheda (consigliato)'], ['tutte', 'Tutte le foto (file più pesante)'], ['nessuna', 'Nessuna foto']], 'una'),
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
    const dati = { titolo: scelta.titolo || 'Censimento alberi', creato: dataIT(oraISO()), schede: await datiPaginaMappa(lista, scelta.foto) };
    const html = paginaMappaHTML(dati, leafletJs, leafletCss);
    const nome = `mappa-schede-${oggi()}.html`;
    const dove = await scarica(new Blob([html], { type: 'text/html' }), nome);
    const mb = (html.length / 1048576).toFixed(1).replace('.', ',');
    stato(`Pagina creata: ${nome} (${lista.length} schede, ${mb} MB)${dove === 'cartella' ? ' in Download/Botanica' : ''}`);
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
#mappa{height:60vh;min-height:320px;border-radius:14px;border:1px solid var(--linea)}
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
dt{color:var(--tenue);overflow-wrap:anywhere} dd{margin:0;min-width:0;text-align:justify;text-align-last:left;hyphens:auto;overflow-wrap:anywhere}
.azioni{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.azioni button,.azioni a{border:1px solid var(--linea);background:var(--carta);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;font-size:14px;text-decoration:none;cursor:pointer}
.vuoto{color:var(--tenue);text-align:center;padding:20px}
#zoom{position:fixed;inset:0;background:rgba(0,0,0,.9);display:none;align-items:center;justify-content:center;z-index:2000}
#zoom img{max-width:96vw;max-height:92vh}
#zoom.aperto{display:flex}
footer{text-align:center;color:var(--tenue);font-size:12px;padding:16px}
@page{size:A4;margin:12mm}
@media print{#cerca,.azioni,#zoom{display:none!important}#mappa{height:150mm}.scheda{break-inside:auto;box-shadow:none}dl>*{break-inside:avoid}.galleria{grid-template-columns:repeat(3,1fr)}.galleria figure{break-inside:avoid}.galleria img{max-height:60mm;object-fit:contain}body{background:#fff}main{max-width:none;padding:6px 0}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header><h1></h1><p id="sotto"></p></header>
<main>
  <div id="mappa" role="region" aria-label="Mappa delle schede"></div>
  <p class="nota">Tocca un numero sulla mappa per aprire la scheda. Verde: scheda · rosso: problemi segnalati. Lo sfondo della mappa (© OpenStreetMap) richiede Internet.</p>
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

  var mappa = L.map('mappa').setView([45.5, 10], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mappa);
  L.control.scale({ imperial: false }).addTo(mappa);
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
    if (s.campi.length) {
      var dl = el('dl');
      s.campi.forEach(function (c) { dl.appendChild(el('dt', null, c[0])); dl.appendChild(el('dd', null, c[1])); });
      art.appendChild(dl);
    }
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
    schede[s.id] = { s: s, art: art, testo: [s.prog, s.nome, s.data].concat(s.campi.map(function (c) { return c[1]; })).join(' ').toLowerCase() };

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
