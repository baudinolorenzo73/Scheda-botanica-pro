'use strict';
// Scheda Botanica PRO — Codici QR, scansione delle etichette e stampa A4 delle schede.
// Caricato da index.html prima di app.js: le funzioni condividono lo stesso ambito globale.

/* =====================================================================
   9. QR CODE (SVG vettoriale, nitido in stampa)
   Usa l'uid permanente; lo scanner accetta anche il vecchio formato.
   ===================================================================== */
function testoQR(r) {
  const pos = r.gps ? `${r.gps.lat.toFixed(6)},${r.gps.lng.toFixed(6)}` : 'no-gps';
  // uid è stabile e non viene riutilizzato quando si apre un nuovo elenco.
  return `SCHEDA_UID:${r.uid}|${r.prog}|${r.nome || 'esemplare'}|${pos}`;
}

function qrSVG(testo) {
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  const q = qrcode(0, 'M');
  q.addData(testo, 'Byte');
  q.make();
  const n = q.getModuleCount();
  const m = 2; // margine bianco in moduli
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 2 * m} ${n + 2 * m}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#000');
  svg.append(bg, p);
  return svg;
}

function disegnaQR() {
  $('#qr-anteprima').replaceChildren(qrSVG(testoQR(S.aperta)));
}

function scaricaQR(r) {
  const xml = new XMLSerializer().serializeToString(qrSVG(testoQR(r)));
  const url = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
  const img = new Image();
  img.onload = () => {
    const lato = 600;
    const c = document.createElement('canvas');
    c.width = lato; c.height = lato;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lato, lato);
    ctx.drawImage(img, 0, 0, lato, lato);
    c.toBlob((b) => scarica(b, `QR-${r.prog}-${nomeFile(r.nome)}.png`), 'image/png');
  };
  img.src = url;
}

/* ---------- report standalone per un singolo esemplare (foto incorporate: si apre e si invia da solo) ---------- */
async function scaricaReportSingolo(r) {
  const scelta = await chiediOpzioniMappa('Report della scheda',
    'Crea un file .html con la scheda e le foto, da aprire o inviare da solo.',
    [sceltaSpunta('stima', 'Includi la stima ambientale (volume chioma, ombra, CO₂)', leggiPref('sb-stampa-stima') !== '0')],
    '⭳ Crea report');
  if (!scelta) return;
  scriviPref('sb-stampa-stima', scelta.stima ? '1' : '0');
  const conStima = scelta.stima;
  await salvaOra(r);
  stato('Preparo il report…');
  try {
    const s = stimaAlbero(r);
    const fotoInline = [];
    for (const p of r.foto) {
      const b = await DB.leggi('foto', p.id);
      if (b) fotoInline.push({ ...p, dataUrl: await blobInDataURL(b) });
    }
    const qrTxt = new XMLSerializer().serializeToString(qrSVG(testoQR(r)));
    const righeDati = CAMPI.filter((c) => !['prog', 'nome', 'data'].includes(c.k) && campoPertinente(r, c.k)).map((c) => {
      let v = r[c.k];
      if (c.tipo === 'scelta') v = v ? (c.valori.find(([x]) => x === v) || [, v])[1] : '';
      return `<tr><th>${escHtml(c.label)}</th><td>${escHtml(v || '—')}</td></tr>`;
    }).join('');
    const righeStimaTxt = righeStima(s).map(([l, v]) => `<p><b>${escHtml(l)}:</b> ${escHtml(v)}</p>`).join('');
    const fotoHtml = fotoInline.map((f, i) => `<figure><img src="${f.dataUrl}" alt="Foto ${i + 1} di ${fotoInline.length} — ${escHtml(r.nome || 'esemplare')}, ${escHtml(r.prog)}"><figcaption>${escHtml([f.didascalia, dataIT(f.quando)].filter(Boolean).join(' – '))}</figcaption></figure>`).join('');
    const mappaLink = r.gps ? `https://www.openstreetmap.org/?mlat=${r.gps.lat}&mlon=${r.gps.lng}#map=18/${r.gps.lat}/${r.gps.lng}` : '';
    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scheda ${escHtml(r.prog)} – ${escHtml(r.nome || 'esemplare')}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;max-width:820px;margin:24px auto;padding:0 18px;color:#1d2a22;line-height:1.5}
header{background:#2f5d3a;color:#fff;padding:20px;border-radius:14px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header .num{background:#6b4f3a;padding:8px 16px;border-radius:6px 16px 16px 6px;font-size:24px;font-weight:700}
header h1{margin:0;font-style:italic;font-size:22px} header p{margin:4px 0 0;opacity:.9;font-family:system-ui,sans-serif;font-size:13px}
.qr{background:#fff;padding:6px;border-radius:8px;width:110px;height:110px;margin-left:auto}
table{width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;font-family:system-ui,sans-serif}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd} th{width:44%;color:#5d6b61;font-weight:600}
.stima{background:#f6fbf2;border:1px solid #cfe3c4;border-radius:12px;padding:14px 16px;font-family:system-ui,sans-serif;font-size:13.5px}
.stima p{margin:4px 0}
.stima small{display:block;margin-top:8px;color:#5d6b61}
.foto-griglia{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:20px}
figure{margin:0} figure img{width:100%;border-radius:8px;display:block} figcaption{font-size:12px;color:#5d6b61;margin-top:4px;font-family:system-ui,sans-serif}
footer{font-size:11px;color:#889;margin-top:26px;font-family:system-ui,sans-serif}
a{color:#2f5d3a}
@page{size:A4;margin:12mm}
td{text-align:justify;hyphens:auto;overflow-wrap:anywhere}
figure,tr{break-inside:avoid}
figure img{max-height:120mm;object-fit:contain}
@media print{body{margin:0;max-width:none;padding:0}header,.stima{break-inside:avoid}}
</style></head><body>
<header><div class="num">${escHtml(r.prog)}</div><div><h1>${escHtml(r.nome || 'Esemplare senza nome')}</h1><p>${escHtml(dataBreveIT(r.data))}</p></div><div class="qr">${qrTxt}</div></header>
<table>${righeDati}</table>
${conStima ? `<div class="stima"><b>Stima ambientale (indicativa)</b>${righeStimaTxt}<small>Stima divulgativa con metodo dichiarato: non sostituisce un rilievo agronomico né vale per crediti di carbonio certificati.</small></div>` : ""}
${r.gps ? `<p style="font-family:system-ui,sans-serif;font-size:13px">📍 <a href="${mappaLink}" target="_blank" rel="noopener">${r.gps.lat.toFixed(6)}, ${r.gps.lng.toFixed(6)} — apri su OpenStreetMap</a></p>` : ''}
${r.gbifId ? `<p style="font-family:system-ui,sans-serif;font-size:13px">🔗 <a href="https://www.gbif.org/species/${r.gbifId}" target="_blank" rel="noopener">Apri la specie su GBIF</a></p>` : ''}
${fotoInline.length ? `<div class="foto-griglia">${fotoHtml}</div>` : ''}
<footer>Scheda Botanica — report generato il ${dataIT(oraISO())} · by Lollo ®2026</footer>
</body></html>`;
    scarica(new Blob([html], { type: 'text/html' }), `report-${r.prog}-${nomeFile(r.nome)}.html`);
    stato('Report scaricato');
  } catch (e) {
    alert('Report non riuscito: ' + e.message);
    stato('');
  }
}

/* =====================================================================
   9b. SCANSIONE QR — ritrova rapidamente una scheda inquadrando l'etichetta
   ===================================================================== */
const SCAN = { attiva: false, stream: null, sessione: 0 };

async function apriScanner() {
  if (!('BarcodeDetector' in window)) {
    const testo = prompt('La lettura automatica del QR non è supportata da questo browser.\nPuoi incollare qui il testo del codice oppure scrivere solo il N° progressivo:');
    if (testo) cercaDaTestoQR(testo);
    return;
  }
  const dlg = $('#dlg-scanner');
  const sessione = ++SCAN.sessione;
  dlg.showModal();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    if (sessione !== SCAN.sessione || !dlg.open) { stream.getTracks().forEach((t) => t.stop()); return; }
    SCAN.stream = stream;
    const video = $('#scanner-video');
    video.srcObject = stream;
    await video.play();
    const rilevatore = new BarcodeDetector({ formats: ['qr_code'] });
    SCAN.attiva = true;
    const ciclo = async () => {
      if (!SCAN.attiva) return;
      try {
        const trovati = await rilevatore.detect(video);
        if (trovati[0]?.rawValue) { const v = trovati[0].rawValue; chiudiScanner(); cercaDaTestoQR(v); return; }
      } catch { /* fotogramma non valido, si riprova */ }
      requestAnimationFrame(ciclo);
    };
    ciclo();
  } catch (e) {
    alert('Fotocamera non disponibile: ' + e.message);
    chiudiScanner();
  }
}

function chiudiScanner() {
  SCAN.sessione++;
  SCAN.attiva = false;
  SCAN.stream?.getTracks().forEach((t) => t.stop());
  SCAN.stream = null;
  if ($('#dlg-scanner').open) $('#dlg-scanner').close();
}

function cercaDaTestoQR(testo) {
  const nuovo = testo.match(/SCHEDA_UID:([^|]+)/i);
  let r = nuovo ? S.schede.find((s) => s.uid === nuovo[1].trim()) : null;
  // Compatibilità con le etichette create dalle versioni precedenti.
  if (!r) {
    const vecchio = testo.match(/SCHEDA:([^|]+)/i);
    const prog = vecchio ? vecchio[1].trim() : (testo.trim() ? testo.trim() : null);
    if (!prog) return alert('Codice non riconosciuto:\n' + testo);
    const trovate = S.schede.filter((s) => s.prog === prog);
    if (trovate.length > 1) return alert(`Il vecchio QR usa il N° ${prog}, presente in più schede. Cerca la scheda dall’elenco e ristampa la nuova etichetta QR.`);
    r = trovate[0];
    if (!r) return alert(`Nessuna scheda con N° ${prog}.`);
  }
  cambiaVista('schede');
  apriEditor(r.uid);
}

/* =====================================================================
   10. STAMPA (schede A4 ed etichette QR 5×5 cm)
   ===================================================================== */
async function apriStampa(soloQuesta = null) {
  const dlg = $('#dlg-stampa');
  const vis = schedeVisibili();
  $('#st-n-sel').textContent = `Schede selezionate (${S.selezionate.size})`;
  $('#st-n-vis').textContent = `Schede visibili con il filtro attuale (${vis.length})`;
  $('#st-n-tut').textContent = `Tutte le schede (${S.schede.length})`;
  $('#st-cosa').classList.toggle('nascosto', !!soloQuesta);
  if (!soloQuesta && S.selezionate.size) dlg.querySelector('input[value=selezionate]').checked = true;
  popolaCampiStampa();
  $('#st-stima').checked = leggiPref('sb-stampa-stima') !== '0';

  if ((await chiedi(dlg)) !== 'stampa') return;

  let lista;
  if (soloQuesta) lista = [soloQuesta];
  else {
    const cosa = dlg.querySelector('input[name=st-cosa]:checked').value;
    lista = cosa === 'selezionate' ? S.schede.filter((r) => S.selezionate.has(r.uid))
      : cosa === 'tutte' ? [...S.schede] : vis;
    lista.sort(perProg);
  }
  if (!lista.length) return alert('Nessuna scheda da stampare.');

  const tipo = dlg.querySelector('input[name=st-tipo]:checked').value;
  const campiScelti = [...document.querySelectorAll('input[name=st-campo]:checked')].map((i) => i.value);
  scriviPref('sb-stampa-campi', JSON.stringify(campiScelti));
  scriviPref('sb-stampa-stima', $('#st-stima').checked ? '1' : '0');

  if (tipo === 'excel') {
    stato('Preparo il registro Excel…');
    await esportaRegistroExcel(lista, new Set(campiScelti));
    stato(`Registro Excel scaricato: ${lista.length} schede`);
    return;
  }

  const area = $('#stampa');
  stato('Preparo la stampa…');
  if (tipo === 'etichette') {
    area.replaceChildren(el('div', { class: 'p-etichette' }, lista.map((r) =>
      el('div', { class: 'p-etichetta' }, qrSVG(testoQR(r)), el('b', { testo: `N° ${r.prog}` }), el('i', { testo: r.nome || '' })))));
  } else {
    const opz = { qr: $('#st-qr').checked, stima: $('#st-stima').checked, foto: $('#st-foto').checked, colonne: Number($('#st-colonne').value), fotoMax: Number($('#st-foto-max').value) || 0, campi: new Set(campiScelti) };
    area.replaceChildren(...await Promise.all(lista.map((r) => paginaScheda(r, opz))));
  }
  // aspetta che le immagini siano pronte, altrimenti escono riquadri vuoti
  await Promise.all([...area.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  stato(`Stampa pronta: ${lista.length} ${tipo === 'etichette' ? 'etichette' : 'schede'}`);
  window.print();
}

// Registro Excel: una riga per scheda, con intestazioni raggruppate per
// sezione (Osservazioni / Vegetazione / Pedologia / Fitopatologia / Note),
// nello spirito del modello di registro cartaceo/Excel già in uso.
async function esportaRegistroExcel(lista, campiScelti) {
  const XlsxPopulate = await caricaLibreriaExcel();
  const campi = CAMPI.filter((c) => !CAMPI_TESTATA.includes(c.k) && (!campiScelti.size || campiScelti.has(c.k)));
  const colonneTestata = ['N° progressivo', 'Nome esemplare', 'Data'];
  const gruppi = [];
  for (const sez of SEZIONI) {
    const delGruppo = campi.filter((c) => c.sez === sez.id);
    if (delGruppo.length) gruppi.push({ titolo: sez.titolo, campi: delGruppo });
  }
  const nCol = colonneTestata.length + campi.length;

  const wb = await XlsxPopulate.fromBlankAsync();
  const ws = wb.sheet(0).name('Registro rilevazioni');

  const BORDO = { style: 'thin', color: 'CFD6C9' };
  const bordoTutto = { top: BORDO, bottom: BORDO, left: BORDO, right: BORDO };

  // Riga 1-2: titolo e sottotitolo
  ws.range(1, 1, 1, nCol).merged(true).value('SCHEDA DI RILEVAZIONE BOTANICA')
    .style({ bold: true, fontSize: 14, fontColor: 'FFFFFF', fill: '2F5D3A', horizontalAlignment: 'center', verticalAlignment: 'center' });
  ws.range(2, 1, 2, nCol).merged(true).value(`Registro esportato da Scheda Botanica PRO il ${dataIT(oraISO())} — ${lista.length} schede`)
    .style({ italic: true, fontColor: '6B6B6B', horizontalAlignment: 'center' });
  ws.row(1).height(24);

  // Riga 4: intestazioni di gruppo (Osservazioni / Vegetazione / ...)
  const rigaGruppi = 4;
  ws.range(rigaGruppi, 1, rigaGruppi, colonneTestata.length).merged(true).value('')
    .style({ fill: 'E8EDE6', border: bordoTutto });
  let colOff = colonneTestata.length + 1;
  for (const g of gruppi) {
    const fine = colOff + g.campi.length - 1;
    const cella = g.campi.length > 1 ? ws.range(rigaGruppi, colOff, rigaGruppi, fine).merged(true) : ws.cell(rigaGruppi, colOff);
    cella.value(g.titolo).style({ bold: true, fontColor: 'FFFFFF', fill: '5C9A69', horizontalAlignment: 'center', verticalAlignment: 'center', border: bordoTutto });
    colOff = fine + 1;
  }

  // Riga 5: intestazioni di colonna
  const rigaTestata = 5;
  const etichette = [...colonneTestata, ...campi.map((c) => (c.etichettaStampa || c.label).replace(/\n/g, ' '))];
  etichette.forEach((testo, i) => {
    ws.cell(rigaTestata, i + 1).value(testo)
      .style({ bold: true, fill: 'CFD6C9', horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, border: bordoTutto });
  });
  ws.row(rigaTestata).height(32);

  // Righe dati
  lista.forEach((r, indice) => {
    const riga = rigaTestata + 1 + indice;
    const valori = [r.prog ?? '', r.nome || '', dataBreveIT(r.data) || ''];
    for (const c of campi) {
      let v = r[c.k];
      if (c.tipo === 'scelta') v = v ? (c.valori.find(([x]) => x === v) || [, v])[1] : '';
      valori.push(v ?? '');
    }
    const fondoAlternato = indice % 2 ? 'F5F7F3' : 'FFFFFF';
    valori.forEach((v, i) => {
      ws.cell(riga, i + 1).value(v)
        .style({ fill: fondoAlternato, verticalAlignment: 'top', wrapText: true, border: bordoTutto,
          horizontalAlignment: i === 0 ? 'center' : 'justify' });
    });
  });

  ws.column(1).width(9);
  ws.column(2).width(22);
  ws.column(3).width(11);
  for (let i = 0; i < campi.length; i++) ws.column(colonneTestata.length + 1 + i).width(15);
  ws.freezePanes(colonneTestata.length + 1, rigaTestata + 1);

  const blob = await wb.outputAsync();
  scarica(blob, `registro-botanico-${oggi()}.xlsx`);
}

const CAMPI_TESTATA = ['prog', 'nome', 'data'];

function campiStampabili() {
  return CAMPI.filter((c) => !CAMPI_TESTATA.includes(c.k));
}

// Ricorda l'ultima scelta di campi da stampare; se non ne è mai stata salvata
// una, di default sono tutti inclusi (comportamento di sempre).
function campiStampaSalvati() {
  try {
    const v = JSON.parse(leggiPref('sb-stampa-campi') || 'null');
    return Array.isArray(v) ? new Set(v) : null;
  } catch { return null; }
}

function popolaCampiStampa() {
  const salvati = campiStampaSalvati();
  const cont = $('#st-campi');
  cont.replaceChildren(...SEZIONI.map((sez) => {
    const campi = campiStampabili().filter((c) => c.sez === sez.id);
    if (!campi.length) return null;
    return el('div', { style: 'margin-bottom:6px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:var(--tenue);margin-bottom:2px', testo: sez.titolo }),
      ...campi.map((c) => el('label', { style: 'display:block;font-size:13.5px' },
        el('input', { type: 'checkbox', name: 'st-campo', value: c.k, checked: !salvati || salvati.has(c.k) }),
        ' ' + c.label)));
  }).filter(Boolean));
}

async function paginaScheda(r, opz) {
  const g = r.gps;
  const riga = g
    ? `GPS ${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}${g.acc != null ? ` (±${Math.round(g.acc)} m)` : ''}${g.alt != null ? ` – ${Math.round(g.alt)} m s.l.m.` : ''}`
    : 'GPS non rilevato';

  const pagina = el('article', { class: 'p-scheda' },
    el('div', { class: 'p-testa' },
      el('div', { class: 'p-num', testo: r.prog || '?' }),
      el('div', { class: 'p-nomi' },
        el('h2', { testo: r.nome || 'Esemplare senza nome' }),
        el('p', { testo: dataBreveIT(r.data) || '' }),
        el('p', { testo: riga })),
      opz.qr ? el('div', { class: 'p-qr' }, qrSVG(testoQR(r))) : null));

  for (const sez of SEZIONI) {
    const campi = CAMPI.filter((c) => c.sez === sez.id && !CAMPI_TESTATA.includes(c.k) && (!opz.campi || opz.campi.has(c.k)) && campoPertinente(r, c.k));
    if (!campi.length) continue;
    pagina.append(el('section', { class: 'p-sez' },
      el('h3', { testo: sez.titolo }),
      el('dl', { class: 'p-dati' }, campi.map((c) => {
        let v = r[c.k];
        if (c.tipo === 'scelta') v = v ? (c.valori.find(([x]) => x === v) || [, v])[1] : '';
        return el('div', { class: c.largo ? 'largo' : '' }, el('dt', { testo: c.etichettaStampa || c.label }), el('dd', { testo: v || '—' }));
      }))));
  }

  const stima = stimaAlbero(r);
  if (opz.stima !== false && (stima.volumeChioma != null || stima.co2Kg != null)) {
    pagina.append(el('section', { class: 'p-sez' },
      el('h3', { testo: 'Stima ambientale (indicativa)' }),
      el('dl', { class: 'p-dati' }, righeStima(stima).map(([l, v]) =>
        el('div', { class: 'largo' }, el('dt', { testo: l }), el('dd', { testo: v }))))));
  }

  const fotoStampaTutte = r.foto.filter((p) => p.stampa);
  const fotoStampa = opz.fotoMax > 0 ? fotoStampaTutte.slice(0, opz.fotoMax) : fotoStampaTutte;
  if (opz.foto && fotoStampa.length) {
    const altezza = { 1: '120mm', 2: '70mm', 3: '48mm' }[opz.colonne];
    const figure = await Promise.all(fotoStampa.map(async (p) =>
      el('figure', {},
        el('div', { class: 'p-foto-cornice', style: `height:${altezza}` }, el('img', { src: await urlFoto(p.id), alt: '' })),
        el('figcaption', { testo: [p.didascalia, dataIT(p.quando)].filter(Boolean).join(' – ') }))));
    pagina.append(el('section', {},
      el('h3', { class: 'p-titolo-foto', testo: `Foto (${fotoStampa.length}${fotoStampa.length < fotoStampaTutte.length ? ` di ${fotoStampaTutte.length}` : ''})` }),
      el('div', { class: 'p-foto' }, Array.from({ length: Math.ceil(figure.length / opz.colonne) }, (_, i) =>
        el('div', { class: 'p-foto-riga', style: `grid-template-columns:repeat(${opz.colonne},1fr)` }, figure.slice(i * opz.colonne, (i + 1) * opz.colonne))))));
  }
  pagina.append(el('p', { class: 'p-piede', testo: `Creata il ${dataIT(r.creato)} – ultima modifica ${dataIT(r.modificato)} – stampata il ${dataIT(oraISO())} · by Lollo ®2026` }));
  return pagina;
}
