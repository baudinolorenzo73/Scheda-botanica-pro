'use strict';
/* =====================================================================
   MISURA ALTEZZA — procedura guidata, un passo per schermata.
   Si apre dal pulsante «📐 Misura altezza» sotto il campo Altezza.

   Metodi (tutti offline):
   - Con il telefono (consigliato): distanza dal tronco + due mire
       H = D × (tan α_cima − tan α_base)    vale anche in pendenza
       H = D × tan α_cima + h_occhi         se si salta la base (terreno piano)
   - Da una foto: un oggetto di altezza nota accanto al tronco
       H = H_rif × pixel_albero / pixel_riferimento
   - Con l'ombra: H = ombra_albero × h_bastone / ombra_bastone

   La scheda cambia solo con «Usa nella scheda».
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

// Disegno del metodo con il telefono: persona, albero, due linee di mira.
const ALT_SVG_TELEFONO = `<svg viewBox="0 0 240 132" class="alt-disegno" aria-hidden="true">
  <line x1="6" y1="108" x2="234" y2="108" stroke="currentColor" stroke-width="1.5" opacity=".5"/>
  <circle cx="30" cy="70" r="7" fill="none" stroke="currentColor" stroke-width="2"/>
  <line x1="30" y1="77" x2="30" y2="96" stroke="currentColor" stroke-width="2"/>
  <line x1="30" y1="96" x2="24" y2="108" stroke="currentColor" stroke-width="2"/><line x1="30" y1="96" x2="36" y2="108" stroke="currentColor" stroke-width="2"/>
  <line x1="30" y1="82" x2="38" y2="72" stroke="currentColor" stroke-width="2"/>
  <rect x="190" y="70" width="8" height="38" fill="#7a5a3c"/>
  <ellipse cx="194" cy="46" rx="26" ry="36" fill="#3f8a4f" opacity=".85"/>
  <line x1="40" y1="70" x2="194" y2="11" stroke="#d33" stroke-width="2" stroke-dasharray="5 4"/>
  <line x1="40" y1="70" x2="194" y2="108" stroke="#e08a1e" stroke-width="2" stroke-dasharray="5 4"/>
  <text x="96" y="34" font-size="11" fill="#d33" font-family="system-ui">1. cima</text>
  <text x="104" y="102" font-size="11" fill="#c27414" font-family="system-ui">2. base</text>
  <line x1="30" y1="116" x2="194" y2="116" stroke="currentColor" stroke-width="1.2"/>
  <text x="112" y="129" font-size="10" fill="currentColor" font-family="system-ui" text-anchor="middle">distanza</text>
</svg>`;

function apriMisuraAltezza() {
  const r = S.aperta;
  if (!r || avvisaBloccata(r)) return;
  const st = {
    D: null, cima: null, base: null, senzaBase: false,
    flusso: null, ascolto: false, campioni: [], angolo: null,
    tara: Number(leggiPref(ALT_PREF_TARA)) || 0,
    occhi: leggiPref(ALT_PREF_OCCHI) || '1,60',
    sensoreOk: false,
    img: null, punti: [], rif: null, urlFile: '', zoom: 100,
    risultato: null,
  };

  const titolo = el('h2', { id: 'alt-titolo' }, 'Misura altezza');
  const passoTxt = el('p', { class: 'alt-passo' });
  const corpo = el('div', { class: 'alt-corpo' });
  const azioni = el('div', { class: 'azioni alt-azioni' });
  const dlg = el('dialog', { class: 'dlg-altezza', 'aria-labelledby': 'alt-titolo' }, titolo, passoTxt, corpo, azioni);
  document.body.append(dlg);

  // Il video resta lo stesso tra «cima» e «base»: la fotocamera non si riavvia.
  const video = el('video', { playsinline: true, muted: true, autoplay: true });
  const angSovra = el('div', { class: 'alt-angolo' }, '--,-°');

  const bottone = (testo, fn, classe = 'btn') => el('button', { type: 'button', class: classe, onclick: fn }, testo);
  const inp = (attr) => el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'campo-base alt-input', ...attr });

  // Mostra una schermata: passo, contenuto e pulsanti in basso.
  function schermata({ passo = '', contenuto, sinistra, destra }) {
    passoTxt.textContent = passo;
    corpo.replaceChildren(...[contenuto].flat().filter(Boolean));
    azioni.replaceChildren(...[sinistra, destra].flat().filter(Boolean));
    corpo.scrollTop = 0;
    dlg.scrollTop = 0;
  }
  const chiudi = () => bottone('Chiudi', () => dlg.close());

  /* ---------------- scelta del metodo ---------------- */
  function sceltaMetodo() {
    fermaFotocamera();
    const carta = (icona, nome, frase, fn, consigliato) => el('button', { type: 'button', class: 'alt-metodo' + (consigliato ? ' consigliato' : ''), onclick: fn },
      el('span', { class: 'alt-metodo-icona', 'aria-hidden': 'true' }, icona),
      el('span', {}, el('b', {}, nome), consigliato ? el('em', {}, ' consigliato') : null, el('br'), el('span', { class: 'alt-metodo-frase' }, frase)));
    schermata({
      passo: 'Come vuoi misurare?',
      contenuto: el('div', { class: 'alt-metodi' },
        carta('📐', 'Con il telefono', 'Ti allontani dall’albero e inquadri la cima e la base.', telDistanza, true),
        carta('📷', 'Da una foto', 'Serve una persona o un bastone accanto al tronco.', fotoScegli),
        carta('☀️', 'Con l’ombra', 'Serve il sole e un metro.', ombraDati)),
      sinistra: chiudi(),
    });
  }

  /* ---------------- con il telefono ---------------- */
  function telDistanza() {
    const dist = inp({ placeholder: 'es. 15', value: st.D != null ? altFmt(st.D, 1) : '', 'aria-label': 'Distanza in metri' });
    const passi = inp({ inputmode: 'numeric', placeholder: 'es. 20', 'aria-label': 'Numero di passi' });
    const passo = inp({ value: leggiPref(ALT_PREF_PASSO) || '0,75', 'aria-label': 'Lunghezza del passo in metri' });
    const daPassi = () => {
      const n = altNum(passi), l = altNum(passo);
      if (n > 0 && l > 0) { dist.value = altFmt(n * l, 1); scriviPref(ALT_PREF_PASSO, passo.value); }
      aggiorna();
    };
    passi.addEventListener('input', daPassi);
    passo.addEventListener('input', daPassi);
    const avanti = bottone('Avanti →', () => {
      st.D = altNum(dist);
      avviaSensori();   // dentro il tocco: iPhone chiede il permesso solo così
      telMira('cima');
    }, 'btn primario');
    const aggiorna = () => { avanti.disabled = !(altNum(dist) > 0); };
    dist.addEventListener('input', aggiorna);
    aggiorna();
    schermata({
      passo: 'Passo 1 di 3 · Distanza',
      contenuto: [
        el('div', { class: 'alt-disegno-box' }),
        el('p', { class: 'alt-istruzione' }, 'Mettiti in un punto da cui vedi bene la cima e la base dell’albero. Va bene una distanza simile all’altezza dell’albero.'),
        el('label', { class: 'campo' }, 'Quanti metri sei lontano dal tronco?', dist),
        el('details', { class: 'alt-passi' },
          el('summary', {}, 'Non hai il metro? Conta i passi'),
          el('div', { class: 'alt-riga' },
            el('label', { class: 'campo' }, 'Passi', passi),
            el('label', { class: 'campo' }, 'Un passo (m)', passo))),
      ],
      sinistra: bottone('← Indietro', sceltaMetodo),
      destra: avanti,
    });
    corpo.querySelector('.alt-disegno-box').innerHTML = ALT_SVG_TELEFONO;   // SVG fisso definito qui sopra
    setTimeout(() => dist.focus(), 50);
  }

  function telMira(cosa) {
    const isCima = cosa === 'cima';
    const avviso = el('p', { class: 'alt-avviso', role: 'status' });
    const manuale = inp({ inputmode: 'text', placeholder: isCima ? 'es. 35' : 'es. -5', 'aria-label': 'Angolo in gradi' });
    const boxManuale = el('label', { class: 'campo nascosto' }, 'Il sensore non risponde: scrivi l’angolo in gradi (letto da un clinometro)', manuale);
    const occhi = inp({ value: st.occhi, 'aria-label': 'Altezza degli occhi in metri' });
    occhi.addEventListener('change', () => { if (altNum(occhi) > 0) { st.occhi = occhi.value; scriviPref(ALT_PREF_OCCHI, occhi.value); } });

    const mirino = el('div', { class: 'alt-mirino' + (st.flusso ? '' : ' senza-video'), role: 'button', 'aria-label': 'Tocca per fissare' },
      video, el('div', { class: 'alt-croce', 'aria-hidden': 'true' }), angSovra,
      st.flusso ? null : el('p', { class: 'alt-mirino-nota' }, 'Fotocamera non attiva: guarda lungo il bordo superiore del telefono verso il punto.'));

    function fissa() {
      let a;
      if (!boxManuale.classList.contains('nascosto') && manuale.value.trim()) a = altNum(manuale);
      else if (st.angolo) a = st.angolo.val;
      if (a == null) { avviso.textContent = 'Nessun angolo: aspetta che compaia il numero o scrivilo a mano.'; return; }
      if (Math.abs(a) >= 89) { avviso.textContent = 'Angolo troppo vicino a 90°: allontanati dall’albero.'; return; }
      if (isCima && a <= 0) { avviso.textContent = 'La cima deve stare sopra l’orizzonte: inclina il telefono verso l’alto.'; return; }
      if (!isCima && a >= st.cima) { avviso.textContent = 'La base deve stare più in basso della cima.'; return; }
      navigator.vibrate?.(60);
      if (isCima) { st.cima = a; telMira('base'); }
      else { st.base = a; st.senzaBase = false; telRisultato(); }
    }
    mirino.addEventListener('click', fissa);

    const contenuto = [
      el('p', { class: 'alt-istruzione' }, isCima
        ? 'Metti la croce rossa sulla PUNTA PIÙ ALTA dell’albero, poi tocca il riquadro o il pulsante verde.'
        : 'Ora abbassa il telefono: metti la croce rossa alla BASE del tronco, dove entra nel terreno, poi tocca.'),
      mirino, avviso, boxManuale,
      isCima ? null : el('p', { class: 'campo-aiuto' }, 'Base nascosta da cespugli e terreno piano? Puoi saltarla: l’app usa l’altezza dei tuoi occhi.'),
      el('details', { class: 'alt-impostazioni' },
        el('summary', {}, '⚙ Altezza occhi e taratura'),
        el('label', { class: 'campo' }, 'Altezza dei tuoi occhi (m), usata se salti la base', occhi),
        el('p', { class: 'campo-aiuto' }, 'Taratura: appoggia il dorso del telefono a uno stipite o a un muro (fotocamera orizzontale) e premi «Tara». Serve solo se gli angoli sembrano sbagliati.'),
        bottone('Tara 0°', tara)),
    ];
    schermata({
      passo: isCima ? 'Passo 2 di 3 · Cima' : 'Passo 3 di 3 · Base',
      contenuto,
      sinistra: [bottone('← Indietro', isCima ? telDistanza : () => telMira('cima')),
        isCima ? null : bottone('Salta (terreno piano)', () => {
          if (!(altNum(occhi) > 0)) { avviso.textContent = 'Inserisci l’altezza degli occhi.'; return; }
          st.occhi = occhi.value; st.senzaBase = true; st.base = null; telRisultato();
        })],
      destra: bottone(isCima ? '✓ Fissa la cima' : '✓ Fissa la base', fissa, 'btn primario'),
    });
    // Un video tolto dalla pagina va in pausa: lo si riavvia nella nuova schermata.
    if (st.flusso) video.play().catch(() => {});
    // Se dopo 2,5 s il sensore tace, si passa all'inserimento a mano.
    setTimeout(() => { if (!st.sensoreOk && dlg.open) boxManuale.classList.remove('nascosto'); }, 2500);
    function tara() {
      if (!st.angolo) { avviso.textContent = 'Il sensore non risponde: la taratura non è possibile.'; return; }
      st.tara = st.angolo.grezzo;
      scriviPref(ALT_PREF_TARA, String(st.tara));
      st.campioni = [];
      avviso.textContent = 'Taratura salvata su questo telefono.';
    }
  }

  function telRisultato() {
    const D = st.D;
    let h, dettagli;
    if (st.senzaBase) {
      const occhi = altNum({ value: st.occhi }) || 1.6;
      h = D * Math.tan(altRad(st.cima)) + occhi;
      dettagli = `Distanza ${altFmt(D, 1)} m · cima ${altFmt(st.cima, 1)}° · occhi ${altFmt(occhi)} m`;
    } else {
      h = D * (Math.tan(altRad(st.cima)) - Math.tan(altRad(st.base)));
      dettagli = `Distanza ${altFmt(D, 1)} m · cima ${altFmt(st.cima, 1)}° · base ${altFmt(st.base, 1)}°`;
    }
    let consiglio = '';
    if (st.cima < 25) consiglio = 'Sei piuttosto lontano: avvicinati un po’ e ripeti per una misura più precisa.';
    else if (st.cima > 60) consiglio = 'Sei molto vicino: allontanati un po’ e ripeti per una misura più precisa.';
    const formula = st.senzaBase ? 'H = distanza × tan(angolo cima) + altezza occhi' : 'H = distanza × (tan(angolo cima) − tan(angolo base))';
    fermaFotocamera();
    risultato(h, dettagli, consiglio, formula, 'telefono', () => { st.cima = st.base = null; telMira('cima'); avviaSensori(); });
  }

  /* ---------------- sensore e fotocamera ---------------- */
  function suOrientamento(e) {
    if (e.beta == null || e.gamma == null) return;
    // Elevazione dell'asse della fotocamera posteriore sull'orizzonte. La parte
    // verticale dello schermo è cos(β)·cos(γ): vale in verticale e in orizzontale.
    const suZ = Math.cos(altRad(e.beta)) * Math.cos(altRad(e.gamma));
    const grezzo = altDeg(Math.asin(Math.max(-1, Math.min(1, -suZ))));
    st.sensoreOk = true;
    st.campioni.push(grezzo);
    if (st.campioni.length > 12) st.campioni.shift();
    const media = st.campioni.reduce((s, x) => s + x, 0) / st.campioni.length;
    st.angolo = { grezzo: media, val: media - st.tara };
    angSovra.textContent = (st.angolo.val >= 0 ? '+' : '') + altFmt(st.angolo.val, 1) + '°';
  }
  async function avviaSensori() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('permesso negato');
      }
      if (!st.ascolto) { window.addEventListener('deviceorientation', suOrientamento); st.ascolto = true; }
    } catch { /* si passa all'inserimento a mano */ }
    if (st.flusso || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const flusso = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (!dlg.open) { flusso.getTracks().forEach((t) => t.stop()); return; }
      st.flusso = flusso;
      video.srcObject = flusso;
      const m = corpo.querySelector('.alt-mirino');
      if (m) { m.classList.remove('senza-video'); m.querySelector('.alt-mirino-nota')?.remove(); }
    } catch { /* senza fotocamera si mira lungo il bordo del telefono */ }
  }
  function fermaFotocamera() {
    if (st.flusso) st.flusso.getTracks().forEach((t) => t.stop());
    st.flusso = null;
    video.srcObject = null;
  }

  /* ---------------- da una foto ---------------- */
  function fotoScegli() {
    const fFile = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'nascosto' });
    const fGalleria = el('input', { type: 'file', accept: 'image/*', class: 'nascosto' });
    const daFile = (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      // La foto scelta qui non viene salvata: l'URL temporaneo si libera alla chiusura.
      if (st.urlFile) URL.revokeObjectURL(st.urlFile);
      st.urlFile = URL.createObjectURL(f);
      caricaFoto(st.urlFile);
    };
    fFile.addEventListener('change', daFile);
    fGalleria.addEventListener('change', daFile);
    const miniature = el('div', { class: 'alt-miniature' });
    schermata({
      passo: 'Passo 1 di 3 · Foto',
      contenuto: [
        el('p', { class: 'alt-istruzione' }, 'Metti una persona o un bastone di altezza nota accanto al tronco. Allontanati finché nella foto entra tutto l’albero e scatta tenendo il telefono dritto.'),
        el('div', { class: 'alt-bottoni' },
          bottone('📷 Scatta una foto', () => fFile.click(), 'btn primario'),
          bottone('🖼 Dalla galleria', () => fGalleria.click())),
        fFile, fGalleria, miniature,
      ],
      sinistra: bottone('← Indietro', sceltaMetodo),
    });
    // Le foto già salvate nella scheda si possono usare senza scattarne un'altra.
    (async () => {
      const bottoni = [];
      for (const p of (r.foto || []).slice(0, 12)) {
        const src = await urlFoto(p.id);
        if (src) bottoni.push(el('button', { type: 'button', class: 'alt-miniatura', 'aria-label': 'Usa questa foto della scheda', onclick: () => caricaFoto(src) }, el('img', { src, alt: '' })));
      }
      if (bottoni.length && miniature.isConnected) miniature.replaceChildren(el('p', { class: 'campo-aiuto' }, 'Oppure tocca una foto già salvata nella scheda:'), ...bottoni);
    })().catch(() => {});
  }
  function caricaFoto(src) {
    const im = new Image();
    im.onload = () => { st.img = im; st.punti = []; fotoRiferimento(); };
    im.onerror = () => stato('Foto non leggibile', true);
    im.src = src;
  }
  function fotoRiferimento() {
    const altro = inp({ placeholder: 'es. 1,85', 'aria-label': 'Altezza del riferimento in metri' });
    const scegli = (v) => { st.rif = v; fotoPunti(); };
    schermata({
      passo: 'Passo 2 di 3 · Riferimento',
      contenuto: [
        el('p', { class: 'alt-istruzione' }, 'Cosa c’è accanto al tronco nella foto?'),
        el('div', { class: 'alt-bottoni colonna' },
          bottone('🧍 Una persona alta 1,70 m', () => scegli(1.7)),
          bottone('🦯 Un bastone da 1 m', () => scegli(1)),
          bottone('📏 Una stadia da 2 m', () => scegli(2))),
        el('label', { class: 'campo' }, 'Altra altezza (m)', altro),
      ],
      sinistra: bottone('← Indietro', fotoScegli),
      destra: bottone('Avanti →', () => { const v = altNum(altro); if (v > 0) scegli(v); else altro.focus(); }, 'btn primario'),
    });
  }
  function fotoPunti() {
    const ISTRUZIONI = [
      'Tocca la BASE del tronco (dove entra nel terreno)',
      'Tocca la PUNTA PIÙ ALTA dell’albero',
      'Tocca i PIEDI della persona o la base del bastone',
      'Tocca la TESTA della persona o la cima del bastone',
    ];
    const canvas = el('canvas', { class: 'alt-canvas' });
    const box = el('div', { class: 'alt-canvas-box' }, canvas);
    const banner = el('p', { class: 'alt-banner', role: 'status' });
    const ctx = canvas.getContext('2d');
    const k0 = Math.min(1, 2000 / Math.max(st.img.naturalWidth, st.img.naturalHeight));
    canvas.width = Math.round(st.img.naturalWidth * k0);
    canvas.height = Math.round(st.img.naturalHeight * k0);
    canvas.style.width = st.zoom + '%';
    const avanti = bottone('Calcola →', fotoRisultato, 'btn primario');

    function disegna() {
      ctx.drawImage(st.img, 0, 0, canvas.width, canvas.height);
      const s = canvas.width / 800;
      const linea = (a, b, col) => {
        if (!a || !b) return;
        ctx.strokeStyle = col; ctx.lineWidth = 4 * s;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      };
      linea(st.punti[0], st.punti[1], '#3fcf6a');
      linea(st.punti[2], st.punti[3], '#f08a24');
      st.punti.forEach((p, i) => {
        const col = i < 2 ? '#3fcf6a' : '#f08a24';
        ctx.lineWidth = 3 * s; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, 10 * s, 0, 2 * Math.PI); ctx.stroke();
        ctx.strokeStyle = col;
        ctx.beginPath();
        ctx.moveTo(p.x - 18 * s, p.y); ctx.lineTo(p.x + 18 * s, p.y);
        ctx.moveTo(p.x, p.y - 18 * s); ctx.lineTo(p.x, p.y + 18 * s);
        ctx.stroke();
      });
      const n = st.punti.length;
      banner.textContent = n < 4 ? `${n + 1} di 4 · ${ISTRUZIONI[n]}` : 'Fatto! Premi «Calcola».';
      banner.classList.toggle('rif', n >= 2 && n < 4);
      avanti.disabled = n < 4;
    }
    canvas.addEventListener('click', (e) => {
      if (st.punti.length >= 4) return;
      const b = canvas.getBoundingClientRect();
      const k = canvas.width / b.width;
      st.punti.push({ x: (e.clientX - b.left) * k, y: (e.clientY - b.top) * k });
      disegna();
    });
    const zoom = (d) => { st.zoom = Math.max(100, Math.min(400, st.zoom + d)); canvas.style.width = st.zoom + '%'; };
    schermata({
      passo: 'Passo 3 di 3 · Punti sulla foto',
      contenuto: [
        banner,
        el('div', { class: 'alt-bottoni tre' },
          bottone('↶ Annulla punto', () => { st.punti.pop(); disegna(); }),
          bottone('🔍 −', () => zoom(-50)), bottone('🔍 +', () => zoom(50))),
        box,
        el('p', { class: 'campo-aiuto' }, 'Ingrandisci con 🔍 + per toccare i punti con precisione; scorri la foto con il dito.'),
      ],
      sinistra: bottone('← Indietro', fotoRiferimento),
      destra: avanti,
    });
    disegna();
  }
  function fotoRisultato() {
    const [a, b, c, d] = st.punti;
    const pxAlbero = Math.hypot(b.x - a.x, b.y - a.y);
    const pxRif = Math.hypot(d.x - c.x, d.y - c.y);
    if (pxRif < 5) { stato('Il riferimento è troppo piccolo nella foto', true); return; }
    const h = st.rif * pxAlbero / pxRif;
    const consiglio = pxAlbero / pxRif > 15 ? 'Il riferimento è molto piccolo rispetto all’albero: la misura è poco precisa. Prova con una persona o una stadia.' : '';
    risultato(h, `Riferimento ${altFmt(st.rif)} m · albero ${Math.round(pxAlbero)} px · riferimento ${Math.round(pxRif)} px`,
      consiglio, 'H = altezza riferimento × pixel albero ÷ pixel riferimento', 'foto', () => { st.punti = []; fotoPunti(); });
  }

  /* ---------------- con l'ombra ---------------- */
  function ombraDati() {
    const oAlbero = inp({ placeholder: 'es. 18', 'aria-label': 'Ombra albero' });
    const oBastone = inp({ value: '1,00', 'aria-label': 'Altezza bastone' });
    const oOmbraB = inp({ placeholder: 'es. 1,20', 'aria-label': 'Ombra bastone' });
    const avanti = bottone('Calcola →', () => {
      const t = altNum(oAlbero), hb = altNum(oBastone), ob = altNum(oOmbraB);
      risultato(t * hb / ob, `Ombra albero ${altFmt(t, 1)} m · bastone ${altFmt(hb)} m · ombra bastone ${altFmt(ob)} m`, '',
        'H = ombra albero × altezza bastone ÷ ombra bastone', 'ombra', ombraDati);
    }, 'btn primario');
    const aggiorna = () => { avanti.disabled = ![oAlbero, oBastone, oOmbraB].every((i) => altNum(i) > 0); };
    for (const i of [oAlbero, oBastone, oOmbraB]) i.addEventListener('input', aggiorna);
    aggiorna();
    schermata({
      passo: 'Con l’ombra',
      contenuto: [
        el('p', { class: 'alt-istruzione' }, 'Pianta un bastone dritto nel terreno. Nello stesso momento misura con il metro le due ombre, su terreno piano.'),
        el('label', { class: 'campo' }, '1. Lunghezza dell’ombra dell’albero (m)', oAlbero),
        el('label', { class: 'campo' }, '2. Altezza del bastone (m)', oBastone),
        el('label', { class: 'campo' }, '3. Lunghezza dell’ombra del bastone (m)', oOmbraB),
      ],
      sinistra: bottone('← Indietro', sceltaMetodo),
      destra: avanti,
    });
  }

  /* ---------------- risultato e scheda ---------------- */
  function risultato(h, dettagli, consiglio, formula, metodo, ripeti) {
    const valido = Number.isFinite(h) && h > 0 && h <= ALT_MAX;
    st.risultato = valido ? { h, metodo } : null;
    const attuale = String(r.altezza ?? '').trim();
    schermata({
      passo: 'Risultato',
      contenuto: [
        el('div', { class: 'alt-esito' }, valido ? altFmt(h, 1) + ' m' : 'Misura non valida'),
        el('p', { class: 'alt-dettagli' }, dettagli),
        valido ? null : el('p', { class: 'alt-avviso' }, `Il valore deve stare tra 0 e ${ALT_MAX} m: controlla i dati e ripeti.`),
        consiglio ? el('p', { class: 'alt-consiglio' }, '💡 ' + consiglio)
          : valido ? el('p', { class: 'alt-ok' }, '✓ Misura nelle condizioni consigliate') : null,
        attuale ? el('p', { class: 'campo-aiuto' }, `Nella scheda c’è già ${attuale.replace('.', ',')} m: «Usa nella scheda» lo sostituisce.`) : null,
        valido ? bottone('✓ Usa nella scheda', usa, 'btn primario alt-usa') : null,
        el('details', { class: 'alt-impostazioni' }, el('summary', {}, 'Come è calcolato'), el('p', { class: 'alt-formula' }, formula)),
      ],
      sinistra: [bottone('↻ Ripeti', ripeti), bottone('Altro metodo', sceltaMetodo)],
    });
  }
  function usa() {
    if (!st.risultato || S.aperta !== r) return;
    const nuovo = String(Math.round(st.risultato.h * 10) / 10);
    r.altezza = nuovo;
    r.modificato = oraISO();
    const campo = $('#f-altezza');
    if (campo) {
      campo.value = nuovo;
      campo.setCustomValidity('');
      campo.removeAttribute('aria-invalid');
    }
    if (typeof disegnaStima === 'function') disegnaStima();
    salvaPresto(r);
    stato(`Altezza ${nuovo.replace('.', ',')} m inserita`);
    dlg.close();
  }

  dlg.addEventListener('close', () => {
    fermaFotocamera();
    if (st.ascolto) window.removeEventListener('deviceorientation', suOrientamento);
    if (st.urlFile) URL.revokeObjectURL(st.urlFile);
    dlg.remove();
  });

  sceltaMetodo();
  dlg.showModal();
}
