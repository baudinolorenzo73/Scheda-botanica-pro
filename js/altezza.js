'use strict';
/* =====================================================================
   MISURA ALTEZZA
   Finestra aperta dal pulsante «📐 Misura» sotto il campo Altezza.
   Tre metodi, tutti offline:
     - Clinometro: fotocamera con mirino + sensore di orientamento
       H = D × (tan α_cima − tan α_base)   (vale anche in pendenza)
       H = D × tan α_cima + h_occhi        (senza angolo base, terreno piano)
     - Da foto: oggetto di altezza nota accanto al tronco
       H = H_rif × pixel_albero / pixel_riferimento
     - Ombra: H = ombra_albero × h_bastone / ombra_bastone
   La finestra non modifica la scheda finché non si preme «Usa nella scheda».
   ===================================================================== */

const ALT_PREF_TARA = 'sb-altezza-tara';
const ALT_PREF_OCCHI = 'sb-altezza-occhi';
const ALT_PREF_PASSO = 'sb-altezza-passo';
const ALT_MAX = 150;   // come il campo Altezza in config.js

const altRad = (d) => d * Math.PI / 180;
const altDeg = (r) => r * 180 / Math.PI;
const altFmt = (x, d = 2) => x.toFixed(d).replace('.', ',');
// Accetta sia 12,5 sia 12.5: la tastiera italiana propone spesso la virgola.
const altNum = (input) => {
  const v = parseFloat(String(input.value).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

function apriMisuraAltezza() {
  const r = S.aperta;
  if (!r) return;
  const st = {
    modo: 'clino',
    flusso: null,           // MediaStream della fotocamera
    ascolto: false,         // deviceorientation attivo
    campioni: [],
    angolo: null,           // { grezzo, val } in gradi
    tara: Number(leggiPref(ALT_PREF_TARA)) || 0,
    risultato: null,        // { h, metodo, formula }
    img: null, punti: [null, null, null, null], sel: 0, urlFile: '',
  };

  // ---------- costruzione interfaccia ----------
  const inp = (attr) => el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'campo-base', ...attr });
  const riga = (...figli) => el('div', { class: 'alt-riga' }, ...figli);
  const campo = (etichetta, input) => el('label', { class: 'campo' }, etichetta, input);

  const cDist = inp({ placeholder: 'es. 15' });
  const cOcchi = inp({ value: leggiPref(ALT_PREF_OCCHI) || '1,60' });
  const pN = inp({ inputmode: 'numeric' });
  const pL = inp({ value: leggiPref(ALT_PREF_PASSO) || '0,75' });
  const aCima = inp({ inputmode: 'text' });
  const aBase = inp({ inputmode: 'text' });
  const video = el('video', { playsinline: true, muted: true, autoplay: true });
  const angSovra = el('div', { class: 'alt-angolo' }, '--,-°');
  const mirino = el('div', { class: 'alt-mirino nascosto' }, video, el('div', { class: 'alt-croce', 'aria-hidden': 'true' }), angSovra);
  const angGrande = el('div', { class: 'alt-angolo-grande', role: 'status', 'aria-live': 'off' }, '--,-°');
  const msgSens = el('p', { class: 'campo-aiuto' });
  const btnAvvia = el('button', { type: 'button', class: 'btn primario' }, '▶ Avvia fotocamera e sensori');

  const fFile = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'nascosto' });
  const fGalleria = el('input', { type: 'file', accept: 'image/*', class: 'nascosto' });
  const fMiniature = el('div', { class: 'alt-miniature' });
  const fChips = el('div', { class: 'alt-chips' });
  const fZoom = el('input', { type: 'range', min: 100, max: 400, value: 100, 'aria-label': 'Zoom della foto' });
  const canvas = el('canvas', { class: 'alt-canvas' });
  const fBox = el('div', { class: 'alt-canvas-box nascosto' }, canvas);
  const fRif = inp({ value: '1,70' });

  const oAlbero = inp({});
  const oBastone = inp({ value: '1,00' });
  const oOmbraB = inp({});

  const esito = el('div', { class: 'alt-esito' }, '—');
  const formula = el('p', { class: 'alt-formula' });
  const btnUsa = el('button', { type: 'button', class: 'btn primario', disabled: true }, 'Usa nella scheda');

  const pannelli = {
    clino: el('div', { class: 'alt-pannello' },
      el('h3', {}, '1. Distanza orizzontale dal tronco'),
      riga(campo('Distanza (m)', cDist), campo('Altezza occhi (m)', cOcchi)),
      el('details', { class: 'alt-passi' },
        el('summary', {}, 'Calcola la distanza a passi'),
        riga(campo('N° passi', pN), campo('Lunghezza passo (m)', pL)),
        el('button', { type: 'button', class: 'btn', onclick: () => {
          const n = altNum(pN), l = altNum(pL);
          if (n && l) { cDist.value = altFmt(n * l, 1); scriviPref(ALT_PREF_PASSO, pL.value); calcolaClino(); }
        } }, 'Usa come distanza')),
      el('h3', {}, '2. Mira con il telefono'),
      el('p', { class: 'campo-aiuto' }, 'Tieni il telefono dritto con la fotocamera verso l’albero. Allinea la croce rossa alla cima e premi «Fissa cima», poi alla base del tronco e premi «Fissa base».'),
      mirino, angGrande, msgSens,
      el('div', { class: 'alt-bottoni' },
        btnAvvia,
        el('button', { type: 'button', class: 'btn', onclick: tara }, 'Tara 0°')),
      el('div', { class: 'alt-bottoni' },
        el('button', { type: 'button', class: 'btn', onclick: () => fissa(aCima) }, '⬆ Fissa cima'),
        el('button', { type: 'button', class: 'btn', onclick: () => fissa(aBase) }, '⬇ Fissa base')),
      el('h3', {}, '3. Angoli (anche a mano)'),
      riga(campo('Angolo cima (°)', aCima), campo('Angolo base (°)', aBase)),
      el('p', { class: 'campo-aiuto' }, 'Angolo base vuoto: l’app usa l’altezza degli occhi (solo su terreno piano). Guardando in basso l’angolo è negativo.')),
    foto: el('div', { class: 'alt-pannello nascosto' },
      el('p', { class: 'campo-aiuto' }, 'Serve una foto con un oggetto di altezza nota accanto al tronco (una persona, un bastone, una stadia), scattata da lontano tenendo il telefono verticale.'),
      el('div', { class: 'alt-bottoni' },
        el('button', { type: 'button', class: 'btn', onclick: () => fFile.click() }, '📷 Scatta'),
        el('button', { type: 'button', class: 'btn', onclick: () => fGalleria.click() }, 'Dalla galleria')),
      fFile, fGalleria, fMiniature,
      el('p', { class: 'campo-aiuto' }, 'Tocca la foto per posare i 4 punti nell’ordine. Per correggerne uno: selezionalo (tocca il punto o il suo pulsante), poi tocca la nuova posizione o usa le frecce.'),
      fChips,
      el('label', { class: 'campo' }, 'Zoom', fZoom),
      fBox,
      el('div', { class: 'alt-frecce' },
        el('span'), el('button', { type: 'button', 'aria-label': 'Su', onclick: () => sposta(0, -1) }, '▲'), el('span'),
        el('button', { type: 'button', 'aria-label': 'Sinistra', onclick: () => sposta(-1, 0) }, '◀'),
        el('button', { type: 'button', 'aria-label': 'Cancella punto', onclick: () => { st.punti[st.sel] = null; disegnaFoto(); } }, '✕'),
        el('button', { type: 'button', 'aria-label': 'Destra', onclick: () => sposta(1, 0) }, '▶'),
        el('span'), el('button', { type: 'button', 'aria-label': 'Giù', onclick: () => sposta(0, 1) }, '▼'), el('span')),
      campo('Altezza del riferimento (m)', fRif),
      el('div', { class: 'alt-bottoni' },
        ...[['1,00', 'Bastone 1 m'], ['1,50', 'Bastone 1,5 m'], ['1,70', 'Persona 1,70 m'], ['2,00', 'Stadia 2 m']]
          .map(([v, t]) => el('button', { type: 'button', class: 'btn', onclick: () => { fRif.value = v; calcolaFoto(); } }, t)))),
    ombra: el('div', { class: 'alt-pannello nascosto' },
      el('p', { class: 'campo-aiuto' }, 'Con il sole, misura nello stesso momento l’ombra dell’albero e quella di un bastone verticale, su terreno piano.'),
      campo('Ombra dell’albero (m)', oAlbero),
      riga(campo('Altezza bastone (m)', oBastone), campo('Ombra bastone (m)', oOmbraB))),
  };

  const schede = [['clino', '📐 Clinometro'], ['foto', '📷 Da foto'], ['ombra', '☀️ Ombra']]
    .map(([m, t]) => el('button', { type: 'button', class: 'btn', role: 'tab', 'aria-selected': String(m === st.modo), onclick: () => cambiaModo(m) }, t));

  const dlg = el('dialog', { class: 'dlg-altezza', 'aria-labelledby': 'alt-titolo' },
    el('h2', { id: 'alt-titolo' }, 'Misura altezza'),
    el('div', { class: 'gs-modo', role: 'tablist' }, ...schede),
    pannelli.clino, pannelli.foto, pannelli.ombra,
    el('div', { class: 'alt-risultato' }, esito, formula),
    el('div', { class: 'azioni' },
      el('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Chiudi'),
      btnUsa));
  document.body.append(dlg);

  // ---------- comportamento generale ----------
  function cambiaModo(m) {
    st.modo = m;
    schede.forEach((b, i) => b.setAttribute('aria-selected', String(['clino', 'foto', 'ombra'][i] === m)));
    for (const [k, p] of Object.entries(pannelli)) p.classList.toggle('nascosto', k !== m);
    if (m !== 'clino') fermaFotocamera();
    ricalcola();
  }
  function mostra(h, metodo, testoFormula, avviso = '') {
    if (h == null) {
      st.risultato = null;
      esito.textContent = '—';
      formula.textContent = testoFormula || '';
      btnUsa.disabled = true;
      return;
    }
    st.risultato = { h, metodo };
    esito.textContent = altFmt(h) + ' m';
    formula.textContent = testoFormula + (avviso ? ' · ' + avviso : '');
    btnUsa.disabled = !(h > 0 && h <= ALT_MAX);
    if (h > ALT_MAX) formula.textContent += ` · oltre ${ALT_MAX} m: controlla i dati`;
  }
  function ricalcola() {
    if (st.modo === 'clino') calcolaClino();
    else if (st.modo === 'foto') calcolaFoto();
    else calcolaOmbra();
  }

  // ---------- clinometro ----------
  function suOrientamento(e) {
    if (e.beta == null || e.gamma == null) return;
    // Elevazione dell'asse della fotocamera posteriore sull'orizzonte.
    // La componente verticale dello schermo è cos(β)·cos(γ): la formula non
    // dipende da quanto il telefono è ruotato di lato (rollio).
    const suZ = Math.cos(altRad(e.beta)) * Math.cos(altRad(e.gamma));
    const grezzo = altDeg(Math.asin(Math.max(-1, Math.min(1, -suZ))));
    st.campioni.push(grezzo);
    if (st.campioni.length > 12) st.campioni.shift();
    const media = st.campioni.reduce((s, x) => s + x, 0) / st.campioni.length;
    st.angolo = { grezzo: media, val: media - st.tara };
    const t = (st.angolo.val >= 0 ? '+' : '') + altFmt(st.angolo.val, 1) + '°';
    angSovra.textContent = t;
    angGrande.textContent = t;
  }
  async function avvia() {
    msgSens.textContent = '';
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('permesso negato');
      }
      if (!st.ascolto) { window.addEventListener('deviceorientation', suOrientamento); st.ascolto = true; }
      setTimeout(() => {
        if (!st.angolo && dlg.open) msgSens.textContent = 'Nessun dato dal sensore di orientamento: scrivi gli angoli a mano (per esempio da un clinometro).';
      }, 2000);
    } catch (err) {
      msgSens.textContent = 'Sensori non disponibili (' + err.message + '): scrivi gli angoli a mano.';
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      msgSens.textContent += ' Fotocamera non disponibile: mira lungo il bordo superiore del telefono.';
      return;
    }
    try {
      st.flusso = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!dlg.open) { fermaFotocamera(); return; }
      video.srcObject = st.flusso;
      mirino.classList.remove('nascosto');
      btnAvvia.classList.add('nascosto');
    } catch {
      msgSens.textContent += ' Fotocamera non disponibile: mira lungo il bordo superiore del telefono.';
    }
  }
  function fermaFotocamera() {
    if (st.flusso) st.flusso.getTracks().forEach((t) => t.stop());
    st.flusso = null;
    video.srcObject = null;
    mirino.classList.add('nascosto');
    btnAvvia.classList.remove('nascosto');
  }
  function tara() {
    if (!st.angolo) { msgSens.textContent = 'Avvia prima i sensori.'; return; }
    if (!confirm('Il dorso del telefono è appoggiato a una superficie verticale (stipite, muro)? Questa posizione diventa 0°.')) return;
    st.tara = st.angolo.grezzo;
    scriviPref(ALT_PREF_TARA, String(st.tara));
    st.campioni = [];
    msgSens.textContent = 'Taratura salvata su questo dispositivo.';
  }
  function fissa(input) {
    if (!st.angolo) { msgSens.textContent = 'Sensore non attivo: avvialo o scrivi l’angolo a mano.'; return; }
    input.value = altFmt(st.angolo.val, 1);
    calcolaClino();
  }
  function calcolaClino() {
    const D = altNum(cDist), at = altNum(aCima), ab = altNum(aBase), occhi = altNum(cOcchi);
    if (!D || D <= 0) return mostra(null, '', 'Inserisci la distanza orizzontale.');
    if (at == null) return mostra(null, '', 'Manca l’angolo della cima.');
    if (Math.abs(at) >= 89 || (ab != null && Math.abs(ab) >= 89)) return mostra(null, '', 'Angolo troppo vicino a 90°: allontanati.');
    const avviso = (at < 25 || at > 60) ? 'per più precisione allontanati o avvicinati fino a un angolo cima tra 30° e 50°' : '';
    if (ab != null) {
      if (at <= ab) return mostra(null, '', 'L’angolo della cima deve essere maggiore di quello della base.');
      const h = D * (Math.tan(altRad(at)) - Math.tan(altRad(ab)));
      return mostra(h, 'clinometro', `H = ${altFmt(D, 1)} × (tan ${altFmt(at, 1)}° − tan ${altFmt(ab, 1)}°)`, avviso);
    }
    if (occhi == null) return mostra(null, '', 'Serve l’altezza degli occhi oppure l’angolo della base.');
    const h = D * Math.tan(altRad(at)) + occhi;
    return mostra(h, 'clinometro', `H = ${altFmt(D, 1)} × tan ${altFmt(at, 1)}° + ${altFmt(occhi)}`, avviso);
  }
  for (const i of [cDist, cOcchi, aCima, aBase]) i.addEventListener('input', calcolaClino);
  cOcchi.addEventListener('change', () => { if (altNum(cOcchi) != null) scriviPref(ALT_PREF_OCCHI, cOcchi.value); });
  btnAvvia.addEventListener('click', avvia);

  // ---------- da foto ----------
  const ETICHETTE = ['Base albero', 'Cima albero', 'Base riferimento', 'Cima riferimento'];
  const ctx = canvas.getContext('2d');
  function disegnaChips() {
    fChips.replaceChildren(...ETICHETTE.map((t, i) => el('button', {
      type: 'button',
      class: 'alt-chip' + (i < 2 ? ' albero' : ' rif') + (i === st.sel ? ' sel' : ''),
      'aria-pressed': String(i === st.sel),
      onclick: () => { st.sel = i; disegnaFoto(); },
    }, `${i + 1}. ${t}${st.punti[i] ? ' ✓' : ''}`)));
  }
  function disegnaFoto() {
    disegnaChips();
    if (!st.img) { calcolaFoto(); return; }
    ctx.drawImage(st.img, 0, 0, canvas.width, canvas.height);
    const s = canvas.width / 800;
    const linea = (a, b, col) => {
      if (!a || !b) return;
      ctx.strokeStyle = col; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    linea(st.punti[0], st.punti[1], '#3fcf6a');
    linea(st.punti[2], st.punti[3], '#f08a24');
    st.punti.forEach((p, i) => {
      if (!p) return;
      const col = i < 2 ? '#3fcf6a' : '#f08a24';
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = i === st.sel ? '#ff2d2d' : '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 9 * s, 0, 2 * Math.PI); ctx.stroke();
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(p.x - 16 * s, p.y); ctx.lineTo(p.x + 16 * s, p.y);
      ctx.moveTo(p.x, p.y - 16 * s); ctx.lineTo(p.x, p.y + 16 * s);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${16 * s}px sans-serif`;
      ctx.fillText(String(i + 1), p.x + 12 * s, p.y - 10 * s);
    });
    calcolaFoto();
  }
  function caricaImmagine(src) {
    const im = new Image();
    im.onload = () => {
      // La foto originale non viene toccata: si lavora su una copia ridotta.
      const k = Math.min(1, 2000 / Math.max(im.naturalWidth, im.naturalHeight));
      canvas.width = Math.round(im.naturalWidth * k);
      canvas.height = Math.round(im.naturalHeight * k);
      st.img = im; st.punti = [null, null, null, null]; st.sel = 0;
      fBox.classList.remove('nascosto');
      canvas.style.width = fZoom.value + '%';
      disegnaFoto();
    };
    im.onerror = () => stato('Foto non leggibile', true);
    im.src = src;
  }
  const daFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Le foto scelte qui non vengono salvate: l'URL temporaneo si libera alla chiusura.
    if (st.urlFile) URL.revokeObjectURL(st.urlFile);
    st.urlFile = URL.createObjectURL(f);
    caricaImmagine(st.urlFile);
    e.target.value = '';
  };
  fFile.addEventListener('change', daFile);
  fGalleria.addEventListener('change', daFile);
  fZoom.addEventListener('input', () => { canvas.style.width = fZoom.value + '%'; });
  canvas.addEventListener('click', (e) => {
    if (!st.img) return;
    const box = canvas.getBoundingClientRect();
    const k = canvas.width / box.width;
    const p = { x: (e.clientX - box.left) * k, y: (e.clientY - box.top) * k };
    // Un tocco vicino a un punto esistente lo seleziona; altrimenti sposta quello selezionato.
    let vicino = -1, migliore = 28 * k;
    st.punti.forEach((q, i) => {
      if (!q) return;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < migliore) { migliore = d; vicino = i; }
    });
    if (vicino >= 0 && vicino !== st.sel) st.sel = vicino;
    else {
      st.punti[st.sel] = p;
      const prossimo = st.punti.findIndex((q) => !q);
      if (prossimo >= 0) st.sel = prossimo;
    }
    disegnaFoto();
  });
  function sposta(dx, dy) {
    const p = st.punti[st.sel];
    if (!p) return;
    const passo = Math.max(1, canvas.width / 1000);
    p.x += dx * passo; p.y += dy * passo;
    disegnaFoto();
  }
  function calcolaFoto() {
    const rif = altNum(fRif);
    if (!st.img) return mostra(null, '', 'Scatta o scegli una foto.');
    if (st.punti.some((p) => !p)) return mostra(null, '', 'Segna tutti e 4 i punti.');
    if (!rif || rif <= 0) return mostra(null, '', 'Inserisci l’altezza del riferimento.');
    const [a, b, c, d] = st.punti;
    const pxAlbero = Math.hypot(b.x - a.x, b.y - a.y);
    const pxRif = Math.hypot(d.x - c.x, d.y - c.y);
    if (pxRif < 5) return mostra(null, '', 'Il riferimento è troppo piccolo nella foto.');
    const avviso = pxAlbero / pxRif > 15 ? 'riferimento piccolo rispetto all’albero: precisione ridotta' : '';
    return mostra(rif * pxAlbero / pxRif, 'foto', `H = ${altFmt(rif)} × ${Math.round(pxAlbero)} px / ${Math.round(pxRif)} px`, avviso);
  }
  fRif.addEventListener('input', calcolaFoto);
  // Le foto già salvate nella scheda si possono usare senza scattarne un'altra.
  (async () => {
    const foto = (r.foto || []).slice(0, 12);
    if (!foto.length) return;
    const bottoni = [];
    for (const p of foto) {
      const src = await urlFoto(p.id);
      if (src) bottoni.push(el('button', { type: 'button', class: 'alt-miniatura', 'aria-label': 'Usa questa foto della scheda', onclick: () => caricaImmagine(src) },
        el('img', { src, alt: '' })));
    }
    if (bottoni.length) fMiniature.replaceChildren(el('p', { class: 'campo-aiuto' }, 'Oppure usa una foto della scheda:'), ...bottoni);
  })().catch(() => {});

  // ---------- ombra ----------
  function calcolaOmbra() {
    const t = altNum(oAlbero), hb = altNum(oBastone), ob = altNum(oOmbraB);
    if (!t || !hb || !ob || t <= 0 || hb <= 0 || ob <= 0) return mostra(null, '', 'Compila le tre misure.');
    return mostra(t * hb / ob, 'ombra', `H = ${altFmt(t, 1)} × ${altFmt(hb)} / ${altFmt(ob)}`);
  }
  for (const i of [oAlbero, oBastone, oOmbraB]) i.addEventListener('input', calcolaOmbra);

  // ---------- applica alla scheda ----------
  btnUsa.addEventListener('click', () => {
    if (!st.risultato || S.aperta !== r) return;
    const nuovo = String(Math.round(st.risultato.h * 10) / 10);
    const attuale = String(r.altezza ?? '').trim();
    if (attuale && attuale !== nuovo &&
      !confirm(`La scheda ha già un’altezza di ${attuale.replace('.', ',')} m. Sostituirla con ${nuovo.replace('.', ',')} m?`)) return;
    r.altezza = nuovo;
    const campoAltezza = $('#f-altezza');
    if (campoAltezza) {
      campoAltezza.value = nuovo;
      campoAltezza.setCustomValidity('');
      campoAltezza.removeAttribute('aria-invalid');
    }
    if (typeof disegnaStima === 'function') disegnaStima();
    salvaPresto(r);
    stato(`Altezza ${nuovo.replace('.', ',')} m inserita (metodo: ${st.risultato.metodo})`);
    dlg.close();
  });

  dlg.addEventListener('close', () => {
    fermaFotocamera();
    if (st.ascolto) window.removeEventListener('deviceorientation', suOrientamento);
    if (st.urlFile) URL.revokeObjectURL(st.urlFile);
    dlg.remove();
  });

  disegnaChips();
  calcolaClino();
  dlg.showModal();
}
