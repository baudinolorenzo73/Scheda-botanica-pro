'use strict';
/* =====================================================================
   4. STATO
   ===================================================================== */
const S = {
  schede: [],               // tutti i record
  aperta: null,             // record in modifica
  selezionate: new Set(),   // uid spuntati per la stampa
  urlFoto: new Map(),       // id foto -> objectURL (cache)
  urlAudio: new Map(),      // id audio -> objectURL (cache)
  vista: 'schede',          // 'schede' | 'mappa'
  traccia: [],              // punti del percorso registrato: {lat,lng,alt,acc,quando}
  cestino: [],              // schede spostate nel cestino (cancellata valorizzato)
  specie: [],               // catalogo specie identificate con PlantNet: {nomeSci,nomeComune,volte,primaVolta,ultimaVolta,confidenzaMax}
  guida: [],                // integrazioni manuali delle 144 pagine, separate dai rilievi
};

function schedaVuota() {
  const r = { uid: nuovoId('s'), creato: oraISO(), modificato: oraISO(), gps: null, foto: [], audio: [], gbifId: '' };
  for (const c of CAMPI) r[c.k] = '';
  r.prog = String(S.schede.reduce((m, s) => Math.max(m, Number(s.prog) || 0), 0) + 1);
  r.data = oggi();
  r.bozzaVuota = true;
  r.numeroZona = calcolaNumeroZona(r.data, r.uid);
  // "N° medesimo esemplare" conta quanti alberi uguali ci sono vicino: di default 1
  // (nessun altro uguale intorno, esemplare isolato). L'utente lo cambia solo se serve.
  r.numero = 1;
  return r;
}

// Rende compatibile un record di qualsiasi versione (vecchia app inclusa).
// Restituisce { record, fotoDaSalvare: [{id, dataUrl}], audioDaSalvare: [{id, dataUrl}] }
function normalizza(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Scheda non valida');
  for (const k of ['foto', 'photos', 'audio', 'audioNotes']) {
    if (v[k] != null && (!Array.isArray(v[k]) || v[k].some((m) => !m || typeof m !== 'object'))) throw new Error('Elenco media non valido');
  }
  if (v.uid != null && (typeof v.uid !== 'string' || !v.uid.trim())) throw new Error('Identificativo scheda non valido');
  const r = { uid: v.uid || nuovoId('s'), creato: v.creato || oraISO(), modificato: v.modificato || oraISO() };
  r.cancellata = v.cancellata || null;   // null = attiva; altrimenti data ISO di spostamento nel cestino
  r.gbifId = /^\d+$/.test(String(v.gbifId ?? '')) ? String(v.gbifId) : '';             // ID GBIF della specie, se identificata con PlantNet
  r.plantnetNome = typeof v.plantnetNome === 'string' ? v.plantnetNome.slice(0, 180) : '';
  r.bozzaVuota = v.bozzaVuota === true;
  for (const c of CAMPI) {
    let val = v[c.k] === undefined || v[c.k] === null ? '' : String(v[c.k]).trim();
    if (c.tipo === 'numero') {
      val = val.replace(',', '.');
      const n = Number(val);
      if (val !== '' && (!Number.isFinite(n) ||
          (c.min != null && n < c.min) ||
          (c.max != null && n > c.max) ||
          (c.intero && !Number.isInteger(n)))) val = '';
    }
    if (c.tipo === 'data') val = normalizzaData(val);
    if (c.tipo === 'scelta' && val) {
      const opzione = c.valori.find(([codice, testo]) => val === codice || val === testo);
      if (opzione) val = opzione[0];
    }
    r[c.k] = val;
  }
  r.gps = null;
  if (v.gps && numeroFinito(v.gps.lat) && numeroFinito(v.gps.lng) &&
      Math.abs(v.gps.lat) <= 90 && Math.abs(v.gps.lng) <= 180) {
    r.gps = {
      lat: Number(v.gps.lat), lng: Number(v.gps.lng),
      acc: numeroFinito(v.gps.acc ?? v.gps.accuracy) && Number(v.gps.acc ?? v.gps.accuracy) >= 0 ? Number(v.gps.acc ?? v.gps.accuracy) : null,
      alt: numeroFinito(v.gps.alt ?? v.gps.altitude) ? Number(v.gps.alt ?? v.gps.altitude) : null,
      quando: v.gps.quando || oraISO(),
      manuale: v.gps.manuale === true,
      ...(typeof v.gps.online === 'boolean' ? { online: v.gps.online } : {}),
    };
  }
  const fotoDaSalvare = [];
  r.foto = (v.foto || v.photos || []).map((p) => {
    const id = p.id || nuovoId('f');
    if (p.dataUrl) fotoDaSalvare.push({ id, dataUrl: p.dataUrl });
    return {
      id,
      didascalia: p.didascalia ?? p.caption ?? '',
      quando: p.quando || (p.dateMs ? new Date(p.dateMs).toISOString() : oraISO()),
      stampa: p.stampa !== false,
      identificata: p.identificata ?? p.aiIdentified ?? false,
    };
  });
  const audioDaSalvare = [];
  r.audio = (v.audio || v.audioNotes || []).map((a) => {
    const id = a.id || nuovoId('a');
    if (a.dataUrl) audioDaSalvare.push({ id, dataUrl: a.dataUrl });
    return {
      id,
      didascalia: a.didascalia ?? a.caption ?? '',
      quando: a.quando || oraISO(),
      durata: Number(a.durata ?? a.duration ?? 0) || 0,
    };
  });
  return { record: r, fotoDaSalvare, audioDaSalvare };
}

/* =====================================================================
   5. SALVATAGGIO (debounce per record + scrittura immediata in uscita)
   ===================================================================== */
const timerSalva = new Map();
const scrittureInCorso = new Map();
const nonSalvate = new Map();

// Questi valori vengono compilati dall'app e, da soli, non trasformano una
// nuova scheda in un rilievo reale. Anche il numero di esemplari parte da 1.
const CAMPI_AUTOMATICI_SCHEDA = new Set(['prog', 'data', 'numeroZona', 'numero']);

function schedaSenzaContenuto(r) {
  if (!r) return true;
  const haCampoInserito = CAMPI.some((c) => {
    const valore = String(r[c.k] ?? '').trim();
    if (!CAMPI_AUTOMATICI_SCHEDA.has(c.k)) return !!valore;
    // Il valore 1 di "N° medesimo esemplare" e automatico; un valore
    // diverso, invece, e una vera informazione inserita dall'utente.
    return c.k === 'numero' && valore !== '' && valore !== '1';
  });
  return !haCampoInserito && !r.gps && !(r.foto || []).length && !(r.audio || []).length &&
    !String(r.gbifId || '').trim() && !String(r.plantnetNome || '').trim();
}

function salvaPresto(r) {
  r.modificato = oraISO();
  nonSalvate.set(r.uid, r);
  stato('Salvataggio in corso…');
  clearTimeout(timerSalva.get(r.uid));
  timerSalva.set(r.uid, setTimeout(() => salvaOra(r), 400));
}

async function salvaOra(r) {
  if (!r) return false;
  clearTimeout(timerSalva.get(r.uid));
  timerSalva.delete(r.uid);
  r.bozzaVuota = schedaSenzaContenuto(r);
  const operazione = DB.scrivi('schede', r);
  scrittureInCorso.set(r.uid, operazione);
  nonSalvate.set(r.uid, r);
  try {
    await operazione;
    if (scrittureInCorso.get(r.uid) === operazione && !timerSalva.has(r.uid)) nonSalvate.delete(r.uid);
    stato(`Salvato alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    return true;
  } catch (e) {
    stato('ERRORE: salvataggio non riuscito — ' + e.message, true);
    alert('Salvataggio non riuscito: ' + e.message + '\nEsporta subito un backup dal menu ⋮.');
    return false;
  } finally {
    if (scrittureInCorso.get(r.uid) === operazione) scrittureInCorso.delete(r.uid);
  }
}

async function eliminaBozzaVuota(r) {
  if (!r || !schedaSenzaContenuto(r)) return false;
  clearTimeout(timerSalva.get(r.uid));
  timerSalva.delete(r.uid);
  nonSalvate.delete(r.uid);
  const scrittura = scrittureInCorso.get(r.uid);
  if (scrittura) await scrittura.catch(() => {});
  await DB.cancella('schede', r.uid);
  S.schede = S.schede.filter((s) => s.uid !== r.uid);
  S.selezionate.delete(r.uid);
  return true;
}

async function salvaTuttiInSospeso() {
  await Promise.allSettled([...scrittureInCorso.values()]);
  const lista = [...new Set([...timerSalva.keys(), ...nonSalvate.keys()])]
    .map((uid) => S.schede.find((s) => s.uid === uid) || S.cestino.find((s) => s.uid === uid)).filter(Boolean);
  return (await Promise.all(lista.map(salvaOra))).every(Boolean);
}
// App in background o chiusa: scrive subito quello che è in attesa
document.addEventListener('visibilitychange', () => { if (document.hidden) salvaTuttiInSospeso(); });

/* =====================================================================
   6. FOTO (compressione 1600 px JPEG, salvate come Blob)
   ===================================================================== */
async function comprimiFoto(file) {
  let sorgente;
  try {
    sorgente = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    sorgente = await new Promise((ok, ko) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error(`formato non leggibile (${file.type || file.name})`)); };
      img.src = url;
    });
  }
  const w = sorgente.width, h = sorgente.height;
  const scala = Math.min(1, FOTO_LATO_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scala);
  c.height = Math.round(h * scala);
  c.getContext('2d').drawImage(sorgente, 0, 0, c.width, c.height);
  if (sorgente.close) sorgente.close();
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('compressione fallita'))), 'image/jpeg', FOTO_QUALITA));
}

async function urlFoto(id) {
  if (S.urlFoto.has(id)) return S.urlFoto.get(id);
  const blob = await DB.leggi('foto', id);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  S.urlFoto.set(id, url);
  return url;
}

function liberaUrlFoto(id) {
  const u = S.urlFoto.get(id);
  if (u) URL.revokeObjectURL(u);
  S.urlFoto.delete(id);
}

async function aggiungiFoto(r, files) {
  const avanz = $('#foto-avanz');
  let fatte = 0;
  for (const f of files) {
    avanz.textContent = `Elaboro foto ${fatte + 1} di ${files.length}…`;
    try {
      const blob = await comprimiFoto(f);
      const id = nuovoId('f');
      await DB.scrivi('foto', blob, id);
      r.foto.push({ id, didascalia: '', quando: oraISO(), stampa: true });
      r.modificato = oraISO();
      await salvaOra(r);
      fatte++;
    } catch (e) {
      alert(`Foto "${f.name}" non aggiunta: ${e.message}`);
    }
  }
  avanz.textContent = fatte ? `${fatte} foto aggiunte` : '';
  if (S.aperta === r) disegnaFoto();
  disegnaElenco();
}

async function eliminaFoto(r, id) {
  if (!confirm('Eliminare questa foto?')) return;
  const foto = r.foto;
  r.foto = r.foto.filter((p) => p.id !== id);
  r.modificato = oraISO();
  if (!(await salvaOra(r))) { r.foto = foto; return; }   // salvataggio fallito: non tocco il file
  await DB.cancella('foto', id);
  liberaUrlFoto(id);
  disegnaFoto();
  disegnaElenco();
}

/* =====================================================================
   6b. AUDIO — note vocali registrate sul posto
   ===================================================================== */
const REG = { attiva: false, annullata: false, recorder: null, stream: null, chunks: [], inizio: 0, timer: null, riga: null, fine: Promise.resolve() };

async function urlAudio(id) {
  if (S.urlAudio.has(id)) return S.urlAudio.get(id);
  const blob = await DB.leggi('audio', id);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  S.urlAudio.set(id, url);
  return url;
}

function liberaUrlAudio(id) {
  const u = S.urlAudio.get(id);
  if (u) URL.revokeObjectURL(u);
  S.urlAudio.delete(id);
}

function estensioneAudio(mime) {
  return mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
}

async function avviaRegistrazione(r) {
  if (REG.attiva) return alert('C’è già una registrazione in corso.');
  if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) return alert('Registrazione audio non disponibile su questo dispositivo/browser.');
  if (!r || REG.inAttesa) return;
  REG.inAttesa = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (S.aperta !== r || r.cancellata) { stream.getTracks().forEach((t) => t.stop()); return; }
    const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    REG.stream = stream; REG.recorder = rec; REG.chunks = []; REG.riga = r; REG.annullata = false; REG.attiva = true; REG.inizio = Date.now();
    rec.ondataavailable = (e) => { if (e.data.size > 0) REG.chunks.push(e.data); };
    let completaRegistrazione;
    REG.fine = new Promise((risolvi) => { completaRegistrazione = risolvi; });
    rec.onstop = async () => {
      try {
        REG.stream.getTracks().forEach((t) => t.stop());
        clearInterval(REG.timer);
        // catturo tutto in locale prima di toccare REG: mette al riparo da una seconda
        // registrazione avviata mentre questa e ancora in fase di salvataggio
        const chunks = REG.chunks;
        const durata = Math.round((Date.now() - REG.inizio) / 1000);
        const annullata = REG.annullata;
        REG.attiva = false; REG.stream = null; REG.recorder = null;
        aggiornaUIRegistrazione();
        if (annullata || !chunks.length) return;
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const id = nuovoId('a');
        try {
          await DB.scrivi('audio', blob, id);
          r.audio.push({ id, didascalia: '', quando: oraISO(), durata });
          r.modificato = oraISO();
          await salvaOra(r);
        } catch (e2) {
          alert('Nota vocale non salvata: ' + e2.message);
        }
        if (S.aperta === r) disegnaAudio();
        disegnaElenco();
      } finally { completaRegistrazione(); }
    };
    rec.start();
    aggiornaUIRegistrazione();
    REG.timer = setInterval(aggiornaUIRegistrazione, 500);
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    alert('Microfono non accessibile: ' + e.message);
  } finally { REG.inAttesa = false; }
}

function fermaRegistrazione() { if (REG.attiva) REG.recorder.stop(); }

function aggiornaBarraRapida() {
  const gpsAttivo = GPSR.watch !== null && S.aperta === GPSR.riga;
  $('#ar-gps').classList.toggle('attivo', gpsAttivo);
  $('#ar-gps-testo').textContent = gpsAttivo ? 'Ferma GPS' : (S.aperta?.gps ? `GPS ±${Math.round(S.aperta.gps.acc ?? 0)} m` : 'GPS');
  const recAttiva = REG.attiva && S.aperta === REG.riga;
  $('#ar-audio').classList.toggle('attivo', recAttiva);
  $('#ar-audio-testo').textContent = recAttiva ? `Stop ${mmss((Date.now() - REG.inizio) / 1000)}` : 'Nota vocale';
}

function scorriA(sel) { document.querySelector(sel)?.closest('fieldset')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function annullaRegistrazione() { if (REG.attiva) { REG.annullata = true; REG.recorder.stop(); } }

function aggiornaUIRegistrazione() {
  const inCorso = REG.attiva && S.aperta === REG.riga;
  $('#btn-audio-rec').classList.toggle('nascosto', inCorso);
  $('#btn-audio-stop').classList.toggle('nascosto', !inCorso);
  $('#btn-audio-annulla').classList.toggle('nascosto', !inCorso);
  $('#audio-stato').textContent = inCorso ? `🔴 Registrazione… ${mmss((Date.now() - REG.inizio) / 1000)}` : '';
  aggiornaBarraRapida();
}

async function disegnaAudio() {
  const r = S.aperta;
  const lista = $('#audio-lista');
  if (!r.audio.length) {
    lista.replaceChildren(el('p', { style: 'color:var(--tenue);margin:0' }, 'Nessuna nota vocale.'));
    return;
  }
  const blocchi = await Promise.all(r.audio.map(async (a) => {
    const src = await urlAudio(a.id);
    return el('div', { class: 'nota-audio' },
      el('audio', { controls: true, src, preload: 'none' }),
      el('input', { type: 'text', value: a.didascalia, placeholder: 'Titolo…', 'aria-label': 'Titolo nota vocale',
        oninput: (e) => { a.didascalia = e.target.value; salvaPresto(r); } }),
      el('span', { style: 'color:var(--tenue);font-size:12px;white-space:nowrap', testo: `${mmss(a.durata)} · ${dataIT(a.quando)}` }),
      el('button', { type: 'button', class: 'btn pericolo', onclick: () => eliminaAudio(r, a.id) }, 'Elimina'));
  }));
  if (S.aperta === r) lista.replaceChildren(...blocchi);
}

async function eliminaAudio(r, id) {
  if (!confirm('Eliminare questa nota vocale?')) return;
  const audio = r.audio;
  r.audio = r.audio.filter((a) => a.id !== id);
  r.modificato = oraISO();
  if (!(await salvaOra(r))) { r.audio = audio; return; }  // salvataggio fallito: non tocco il file
  await DB.cancella('audio', id);
  liberaUrlAudio(id);
  disegnaAudio();
  disegnaElenco();
}

/* =====================================================================
   7. ELENCO
   ===================================================================== */
function etichettaScheda(r) {
  // Le vecchie etichette automatiche nomeScheda sono ignorate, senza cambiare il nome botanico.
  return r?.nome?.trim() || 'Senza nome';
}

function schedeVisibili() {
  const q = $('#cerca').value.trim().toLowerCase();
  const data = $('#filtro-data').value;
  const specie = $('#filtro-specie')?.value || '';
  const dal = $('#filtro-dal')?.value || '';
  const al = $('#filtro-al')?.value || '';
  const soloProblemi = $('#filtro-problemi')?.checked || false;
  const senzaFoto = $('#filtro-senza-foto')?.checked || false;
  const senzaGps = $('#filtro-senza-gps')?.checked || false;
  return S.schede
    .filter((r) => (!data || r.data === data) &&
      (!specie || r.nome === specie) &&
      (!dal || !r.data || r.data >= dal) &&
      (!al || !r.data || r.data <= al) &&
      (!soloProblemi || (r.problemi || '').trim()) &&
      (!senzaFoto || !r.foto.length) &&
      (!senzaGps || !r.gps) &&
      (!q || [r.prog, r.nome, dataBreveIT(r.data), r.problemi, r.note, r.terreno].join(' ').toLowerCase().includes(q)))
    .sort(perProg);
}

// Nomi esemplare già usati nell'archivio, per il filtro "Specie" (elenco a tendina).
function specieUsate() {
  return [...new Set(S.schede.map((r) => (r.nome || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it'));
}

function aggiornaFiltroSpecie() {
  const sel = $('#filtro-specie');
  const attuale = sel.value;
  const specie = specieUsate();
  sel.replaceChildren(el('option', { value: '' }, 'Tutte le specie'), ...specie.map((s) => el('option', { value: s }, s)));
  sel.value = specie.includes(attuale) ? attuale : '';
}

// Quanti filtri avanzati sono attivi in questo momento: usato per il pallino
// sul pulsante "Filtri avanzati" e per sapere se mostrare il pannello aperto.
function contaFiltriAvanzati() {
  let n = 0;
  if ($('#filtro-specie')?.value) n++;
  if ($('#filtro-dal')?.value) n++;
  if ($('#filtro-al')?.value) n++;
  if ($('#filtro-problemi')?.checked) n++;
  if ($('#filtro-senza-foto')?.checked) n++;
  if ($('#filtro-senza-gps')?.checked) n++;
  return n;
}

function aggiornaBottoneFiltriAvanzati() {
  const n = contaFiltriAvanzati();
  const btn = $('#btn-filtri-avanzati');
  btn.classList.toggle('attivo', n > 0);
  $('#filtri-avanzati-conteggio').textContent = n ? ` (${n})` : '';
}

function azzeraFiltriAvanzati() {
  $('#filtro-specie').value = '';
  $('#filtro-dal').value = '';
  $('#filtro-al').value = '';
  $('#filtro-problemi').checked = false;
  $('#filtro-senza-foto').checked = false;
  $('#filtro-senza-gps').checked = false;
  aggiornaBottoneFiltriAvanzati();
  disegnaElenco();
}

function progDuplicati() {
  const conta = new Map();
  for (const r of S.schede) conta.set(r.prog, (conta.get(r.prog) || 0) + 1);
  return new Set([...conta].filter(([p, n]) => p !== '' && n > 1).map(([p]) => p));
}

// Duplicati di "N° nel giorno": normale che si ripeta TRA date diverse,
// ma non dentro la stessa data (es. due persone che creano "#4" nello stesso giorno in parallelo).
function numeroZonaDuplicati() {
  const conta = new Map();
  for (const r of S.schede) {
    if (!r.data || r.numeroZona === '') continue;
    const chiave = r.data + '|' + r.numeroZona;
    conta.set(chiave, (conta.get(chiave) || 0) + 1);
  }
  return new Set([...conta].filter(([, n]) => n > 1).map(([chiave]) => chiave));
}

// Calcola il prossimo "N° nel giorno" per una data (riparte da 1 a ogni nuova data).
function calcolaNumeroZona(data, escludiUid) {
  if (!data) return '';
  const max = S.schede.reduce((m, s) => {
    if (s.uid === escludiUid || s.data !== data) return m;
    return Math.max(m, Number(s.numeroZona) || 0);
  }, 0);
  return String(max + 1);
}

function dateUsate() {
  return [...new Set(S.schede.map((r) => r.data).filter(Boolean))].sort().reverse();
}

function aggiornaFiltroData() {
  const sel = $('#filtro-data');
  const attuale = sel.value;
  const date = dateUsate();
  sel.replaceChildren(el('option', { value: '' }, 'Tutte le date'), ...date.map((d) => el('option', { value: d }, dataBreveIT(d))));
  sel.value = date.includes(attuale) ? attuale : '';
}

function aggiornaApriSchedaSalvata() {
  const sel = $('#apri-scheda-salvata');
  if (!sel) return;
  const ordinate = [...S.schede].sort(perProg);
  sel.replaceChildren(el('option', { value: '' }, ordinate.length ? 'Apri scheda salvata…' : 'Nessuna scheda salvata'),
    ...ordinate.map(r => el('option', { value: r.uid }, `N° ${r.prog || '?'} — ${etichettaScheda(r)}${r.data ? ` — ${dataBreveIT(r.data)}` : ''}`)));
  sel.value = '';
  sel.disabled = !ordinate.length;
}

function etichettaValore(c, v) {
  if (!v) return '';
  if (c.tipo === 'scelta') return (c.valori.find(([x]) => x === v) || [, v])[1];
  return v;
}

const CAMPI_RIASSUNTO = ['grandezza', 'persistenza', 'formaChioma'].map((k) => CAMPI.find((c) => c.k === k));

// Seleziona/deseleziona in blocco le schede attualmente visibili (con i
// filtri in vigore) per la stampa — non tocca eventuali schede selezionate
// che il filtro attuale nasconde.
function tutteVisibiliSelezionate(vis) {
  return vis.length > 0 && vis.every((r) => S.selezionate.has(r.uid));
}

function aggiornaBottoneSelezionaTutte(vis) {
  const btn = $('#btn-seleziona-tutte');
  if (!vis.length) { btn.classList.add('nascosto'); return; }
  btn.classList.remove('nascosto');
  const tutte = tutteVisibiliSelezionate(vis);
  btn.textContent = tutte ? `☑ Deseleziona tutte (${vis.length})` : `☐ Seleziona tutte (${vis.length})`;
}

function toggleSelezionaTutte() {
  const vis = schedeVisibili();
  if (tutteVisibiliSelezionate(vis)) { for (const r of vis) S.selezionate.delete(r.uid); }
  else { for (const r of vis) S.selezionate.add(r.uid); }
  disegnaElenco();
}

let revisioneElenco = 0;
async function disegnaElenco() {
  const revisione = ++revisioneElenco;
  aggiornaFiltroData();
  aggiornaFiltroSpecie();
  aggiornaApriSchedaSalvata();
  aggiornaBottoneFiltriAvanzati();
  const vis = schedeVisibili();
  const dup = progDuplicati();
  const dupZona = numeroZonaDuplicati();

  const elenco = $('#elenco');
  aggiornaBottoneSelezionaTutte(vis);
  if (!vis.length) {
    elenco.replaceChildren(el('div', { class: 'vuoto' },
      S.schede.length ? 'Nessuna scheda corrisponde alla ricerca.' : 'Nessuna scheda. Tocca “+ Nuova scheda” per iniziare il rilievo.'));
    if (S.vista === 'mappa') disegnaMappa();
    if (S.vista === 'timeline') disegnaTimeline();
    return;
  }
  const righe = await Promise.all(vis.map(async (r) => {
    const segni = [];
    if (r.foto.length) segni.push(`Foto ${r.foto.length}`);
    if (r.audio.length) segni.push(`Audio ${r.audio.length}`);
    if (r.gps) segni.push('GPS');
    if (r.altezza) segni.push(`↕ ${String(r.altezza).replace('.', ',')} m`);
    const dati = CAMPI_RIASSUNTO.map((c) => etichettaValore(c, r[c.k])).filter(Boolean).join(' · ');
    const foto = r.foto.length
      ? el('img', { class: 'miniatura', src: await urlFoto(r.foto[0].id), alt: '' })
      : el('div', { class: 'miniatura vuota' }, iconaSvg('tree'));
    return el('div', {
      class: 'voce', role: 'button', tabindex: '0', id: 'voce-' + r.uid,
      onclick: () => apriEditor(r.uid),
      onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); apriEditor(r.uid); } },
    },
      el('div', { class: 'voce-foto' }, foto, el('span', { class: 'voce-num', testo: r.prog || '?' })),
      el('div', { style: 'min-width:0' },
        el('div', { class: 'titolo specie', testo: etichettaScheda(r) }),
        el('div', { class: 'sotto', testo: r.data ? dataBreveIT(r.data) : 'Data non indicata' }),
        dati ? el('div', { class: 'dati-riassunto', testo: dati }) : null,
        el('div', { class: 'segni' },
          segni.join('   '),
          r.problemi ? el('span', { class: 'allerta' }, (segni.length ? '   ' : '') + '⚠ problemi') : null,
          dup.has(r.prog) ? el('span', { class: 'allerta' }, '   N° duplicato') : null,
          dupZona.has(r.data + '|' + r.numeroZona) ? el('span', { class: 'allerta' }, '   N° duplicato nel giorno') : null)),
      el('div', { class: 'voce-azioni' },
        el('label', { class: 'sel-stampa', onclick: (e) => e.stopPropagation() },
          el('input', {
            type: 'checkbox', 'aria-label': `Seleziona scheda ${r.prog} per la stampa`,
            checked: S.selezionate.has(r.uid),
            onchange: (e) => { e.target.checked ? S.selezionate.add(r.uid) : S.selezionate.delete(r.uid); aggiornaBottoneSelezionaTutte(schedeVisibili()); },
          }), 'Seleziona'),
        el('button', {
          type: 'button', class: 'btn-elimina-riga', 'aria-label': `Elimina scheda ${r.prog}`,
          onclick: (e) => { e.stopPropagation(); eliminaSchedaDaElenco(r.uid); },
        }, iconaSvg('trash'))));
  }));
  if (revisione !== revisioneElenco) return;
  elenco.replaceChildren(...righe);
  if (S.vista === 'mappa') disegnaMappa();
  if (S.vista === 'timeline') disegnaTimeline();
}

/* =====================================================================
   7b. DIARIO FITOPATOLOGICO — suggerimenti quando "Problemi" contiene
   parole chiave note. Solo indicazioni orientative, non una diagnosi:
   niente foto reali di confronto (richiederebbero materiale con diritti
   che non possiamo includere, e rischierebbero di sembrare più
   autorevoli di quanto siano).
   ===================================================================== */
const PATOLOGIE = [
  { chiavi: ['secco', 'secchi', 'secca', 'seccume', 'disseccat'], titolo: 'Rami o chioma secchi',
    cause: 'Stress idrico o da caldo, competizione per la luce con piante vicine, oppure un problema alle radici.',
    foto: 'Fotografa i rami secchi da vicino e la chioma intera, includendo per confronto il lato più verde.',
    azione: 'Annota da quanto tempo li noti, se riguardano un solo lato della chioma, e lo stato del terreno intorno.' },
  { chiavi: ['buco', 'buchi', 'foro', 'fori', 'tarlo', 'tarli'], titolo: 'Fori nel tronco',
    cause: 'Insetti xilofagi, un picchio in cerca di insetti, oppure una vecchia ferita da potatura o da urto.',
    foto: 'Fotografa il foro con qualcosa per la scala (una moneta, il metro) e l’intera zona del tronco intorno.',
    azione: 'Annota l’altezza da terra, la dimensione approssimativa, e se c’è rosura di legno o resina intorno.' },
  { chiavi: ['carie', 'fungo', 'funghi', 'carpoforo', 'carpofori', 'marciume'], titolo: 'Carie o funghi del legno',
    cause: 'Un fungo cariogeno che degrada il legno, spesso a partire da una vecchia ferita; può indicare una perdita di stabilità.',
    foto: 'Fotografa il carpoforo (il "fungo" visibile) e la zona di legno alterato, con qualcosa per la scala.',
    azione: 'Se l’albero è vicino a un’area frequentata, segnalalo: può servire una valutazione di stabilità da un tecnico.' },
  { chiavi: ['macchia', 'macchie', 'ingiallit', 'clorosi', 'gialle'], titolo: 'Macchie o ingiallimento delle foglie',
    cause: 'Un fungo fogliare, una carenza nutritiva (es. ferro su terreno molto calcareo), oppure stress idrico.',
    foto: 'Fotografa una foglia colpita sia dal fronte che dal retro, insieme a una foglia sana per confronto.',
    azione: 'Annota se colpisce tutta la chioma o solo un lato, e com’è il terreno intorno (compatto, allagato, arido).' },
  { chiavi: ['radice', 'radici', 'affiorant'], titolo: 'Radici affioranti o danneggiate',
    cause: 'Crescita naturale in un terreno compatto o poco profondo, oppure danni da scavi o mezzi pesanti.',
    foto: 'Fotografa l’area della base del tronco e le radici visibili, includendo eventuali lavori vicini.',
    azione: 'Segnala se nell’area ci sono stati scavi, asfaltature o passaggio di mezzi pesanti di recente.' },
  { chiavi: ['inclinat', 'pendenz', 'piegat'], titolo: 'Tronco inclinato',
    cause: 'Crescita naturale verso la luce, oppure un cedimento recente dell’apparato radicale.',
    foto: 'Fotografa l’albero intero da due lati diversi, e la base del tronco a terra.',
    azione: 'Annota se l’inclinazione sembra recente (terreno sollevato da un lato) o storica (tronco curvo fin da giovane).' },
];

function trovaPatologie(testo) {
  const t = (testo || '').toLowerCase();
  if (!t.trim()) return [];
  return PATOLOGIE.filter((p) => p.chiavi.some((k) => t.includes(k)));
}

function aggiornaSuggerimentiFito(testo) {
  const cont = $('#fito-suggerimenti');
  if (!cont) return;
  const trovate = trovaPatologie(testo);
  if (!trovate.length) { cont.replaceChildren(); return; }
  cont.replaceChildren(
    el('p', { class: 'fito-titolo' }, '💡 Note utili per quello che hai scritto:'),
    ...trovate.map((p) => el('div', { class: 'fito-carta' },
      el('b', {}, p.titolo),
      el('p', {}, el('i', {}, 'Possibile causa: '), p.cause),
      el('p', {}, el('i', {}, 'Cosa fotografare: '), p.foto),
      el('p', {}, el('i', {}, 'Cosa annotare: '), p.azione))),
    el('p', { class: 'fito-avviso' }, '⚠️ Indicazioni orientative per aiutarti sul campo, non una diagnosi: per casi seri rivolgiti a un agronomo o a un tecnico abilitato.'));
}

/* =====================================================================
   7c. STIMA AMBIENTALE — volume chioma, ombra proiettata, CO2 stoccata.
   Sono stime divulgative con metodo dichiarato, non un rilievo agronomico:
   - il volume della chioma usa formule geometriche semplici in base alla
     forma dichiarata e al diametro tipico della classe di grandezza;
   - la CO2 si calcola SOLO se è nota la circonferenza a 1,30 m, con
     un'equazione allometrica generica (biomassa da diametro del tronco),
     +26% per le radici e 50% di carbonio sul secco: senza circonferenza
     non mostriamo un numero per non dare un falso senso di precisione.
   ===================================================================== */
const DIAMETRO_CHIOMA_PER_CLASSE = { 1: 15, 2: 10, 3: 5, 4: 2 };

function stimaAlbero(r) {
  const h = parseFloat(r.altezza) || 0;
  const d = DIAMETRO_CHIOMA_PER_CLASSE[Number(r.grandezza)] || null;
  const s = { volumeChioma: null, formulaVolume: '', ombraM2: null, co2Kg: null, metodoCo2: '' };
  if (d && h > 0) {
    const raggio = d / 2;
    const forma = (r.formaChioma || '').toLowerCase();
    let v, formula;
    if (forma.includes('piramid') || forma.includes('cono')) { v = (1 / 3) * Math.PI * raggio * raggio * h; formula = 'V = ⅓·π·r²·h (cono)'; }
    else if (forma.includes('globosa')) { v = (4 / 3) * Math.PI * raggio ** 3; formula = 'V = 4⁄3·π·r³ (sfera)'; }
    else if (forma.includes('colonnare')) { v = Math.PI * raggio * raggio * h; formula = 'V = π·r²·h (cilindro)'; }
    else if (forma.includes('ombrello')) { v = (2 / 3) * Math.PI * raggio ** 3; formula = 'V = 2⁄3·π·r³ (calotta)'; }
    else { v = 0.6 * Math.PI * raggio * raggio * h; formula = 'V ≈ 0,6·π·r²·h (stima media tra le forme)'; }
    s.volumeChioma = v; s.formulaVolume = formula;
    s.ombraM2 = Math.PI * raggio * raggio;
  }
  const circ = parseFloat(r.circonferenza);
  if (circ > 0) {
    const dbh = circ / Math.PI; // diametro del tronco a 1,30 m, in cm
    const conifera = ['aghiforme', 'squamiforme'].includes((r.tipoFoglia || '').toLowerCase());
    // Jenkins et al. 2003 (USDA), gruppi "pine" e "mixed hardwood": biomassa secca fuori terra in kg, Ø in cm
    const biomassaFuoriTerra = conifera ? Math.exp(-2.5356 + 2.4349 * Math.log(dbh)) : Math.exp(-2.4800 + 2.4835 * Math.log(dbh));
    const biomassaTotale = biomassaFuoriTerra * 1.26; // + apparato radicale (rapporto tipico radici/fusto)
    s.co2Kg = biomassaTotale * 0.5 * (44 / 12); // 50% carbonio sul secco, C→CO2
    s.metodoCo2 = `da circonferenza (Ø tronco ${dbh.toFixed(0)} cm), equazione generica per ${conifera ? 'conifere' : 'latifoglie'} + 26% radici, 50% carbonio`;
  }
  return s;
}

const numIT = (v, dec) => v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function righeStima(s) {
  const righe = [];
  if (s.volumeChioma != null) righe.push(['Volume chioma (stima)', `${numIT(s.volumeChioma, 1)} m³ — ${s.formulaVolume}`]);
  if (s.ombraM2 != null) righe.push(['Ombra proiettata (chioma vista dall’alto)', `≈ ${numIT(s.ombraM2, 0)} m²`]);
  if (s.co2Kg != null) righe.push(['CO₂ stoccata (stima)', `≈ ${numIT(s.co2Kg / 1000, 2)} t — ${s.metodoCo2}`]);
  else righe.push(['CO₂ stoccata', 'aggiungi la circonferenza a 1,30 m per stimarla']);
  return righe;
}

function disegnaStima() {
  const r = S.aperta;
  const box = $('#stima-box');
  if (!box) return;
  const s = stimaAlbero(r);
  if (s.volumeChioma == null && s.co2Kg == null) {
    box.replaceChildren(el('p', { style: 'color:var(--tenue);margin:0' }, 'Inserisci Altezza e Classe di grandezza per una stima; aggiungi anche la Circonferenza per la CO₂.'));
    return;
  }
  box.replaceChildren(...righeStima(s).map(([l, v]) => el('p', { style: 'margin:3px 0' }, el('b', {}, l + ': '), v)));
}

/* =====================================================================
   8. EDITOR
   Il modulo si costruisce UNA volta sola e non viene ridisegnato mentre
   si scrive: il cursore non esce più dal campo a ogni lettera.
   ===================================================================== */
function costruisciModulo() {
  const cont = $('#sezioni');
  for (const sez of SEZIONI) {
    const griglia = el('div', { class: 'griglia' });
    for (const c of CAMPI.filter((x) => x.sez === sez.id)) {
      const id = 'f-' + c.k;
      let input;
      if (c.tipo === 'area') input = el('textarea', { id, name: c.k, rows: 3 });
      else if (c.tipo === 'scelta') input = el('select', { id, name: c.k }, c.valori.map(([v, t]) => el('option', { value: v }, t)));
      else if (c.tipo === 'numero') input = el('input', {
        id, name: c.k, type: 'number', inputmode: c.intero ? 'numeric' : 'decimal',
        step: c.intero ? 1 : 'any', min: c.min ?? 0, max: c.max ?? null,
      });
      else if (c.tipo === 'data') input = el('input', { id, name: c.k, type: 'date' });
      else if (c.tipo === 'illustrata') input = el('button', { type: 'button', id, class: 'illustr-bottone', onclick: () => apriPicker(c.k) },
        el('span', { class: 'illustr-icona', id: id + '-icona' }),
        el('span', { class: 'illustr-testo', id: id + '-testo' }, 'Tocca per scegliere…'),
        el('span', { class: 'illustr-freccia', 'aria-hidden': 'true' }, '▾'));
      else input = el('input', {
        id, name: c.k, type: 'text',
        list: c.tipo === 'lista' && c.k !== 'nome' ? 'dl-' + c.k : null,
        autocapitalize: 'off', autocomplete: 'off',
        ...(c.k === 'nome' ? { role: 'combobox', 'aria-autocomplete': 'list',
          'aria-controls': 'nome-risultati', 'aria-expanded': 'false' } : {}),
      });

      // I comandi di identificazione hanno un'etichetta visibile e sono
      // separati dalla digitazione, per essere leggibili anche su telefono.
      const campoInput = c.k === 'nome'
        ? el('div', { class: 'campo-nome-riga' }, input)
        : input;

      if (c.k === 'nome') {
        griglia.append(el('div', { class: 'campo campo-nome largo' },
          el('label', { for: id, testo: c.label }),
          campoInput,
          el('div', { id: 'nome-risultati', class: 'nome-risultati nascosto', role: 'listbox', 'aria-label': 'Nomi trovati nell’archivio e nella guida' }),
          el('div', { class: 'nome-azioni' },
            el('details', { id: 'nome-ricerca', class: 'nome-ricerca' },
              el('summary', { class: 'btn' }, 'Cerca'),
              el('div', { class: 'nome-ricerca-opzioni' },
                el('button', { type: 'button', class: 'btn', id: 'nome-cerca-nome', onclick: cercaNomeDaScheda }, 'Wikipedia / Wikidata'),
                el('button', { id: 'nome-cerca-plantnet', type: 'button', class: 'btn', onclick: cercaPlantNetDaScheda }, 'Cerca su PlantNet'),
                el('a', { id: 'plantnet-link', class: 'btn nascosto', target: '_blank', rel: 'noopener' }, '↗ Scheda PlantNet'),
                el('div', { id: 'gbif-link', class: 'nome-fonte-gbif' }),
                el('button', { type: 'button', class: 'btn', id: 'nome-cerca-foto', onclick: apriGuidaSpecieFoto }, 'Cerca da foto'),
                el('button', { type: 'button', class: 'btn', id: 'nome-cerca-caratteristiche', onclick: cercaCaratteristicheDaScheda }, 'Caratteristiche · guida locale'),
                el('button', { type: 'button', class: 'btn', id: 'nome-cerca-zona', onclick: apriRicercaZonaHabitat }, 'Zona d’origine'),
                el('button', { type: 'button', class: 'btn nome-cerca-ai', id: 'nome-cerca-ai', onclick: cercaAIDaScheda }, '✨ Cerca con AI'))),
            el('button', { type: 'button', class: 'btn primario', id: 'nome-cerca-auto', onclick: cercaAutoDaScheda }, '✨ Cerca intelligente')),
          el('p', { class: 'nome-auto-nota' }, 'La ricerca intelligente confronta guida, Wikipedia, GBIF, foto PlantNet e, se hai caricato una chiave, anche l’AI. Le proposte non modificano la scheda finché non le confermi.'),
          el('p', { id: 'nome-conflitti', class: 'nome-conflitti nascosto', role: 'status' })));
      } else {
        griglia.append(el('label', { class: 'campo' + (c.largo ? ' largo' : ''), for: id },
          c.label, campoInput, c.k === 'prog' ? el('span', { class: 'avviso-campo', id: 'avviso-prog' }) : null,
          c.tipo === 'illustrata' ? el('span', { class: 'avviso-campo', id: 'avviso-' + c.k }) : null,
          c.aiuto ? el('span', { class: 'campo-aiuto', testo: c.aiuto }) : null));
      }
      if (c.tipo === 'lista' && c.k !== 'nome') griglia.append(el('datalist', { id: 'dl-' + c.k }, (c.valori || []).map((v) => el('option', { value: v }))));
    }
    cont.append(el('fieldset', { class: sez.id, id: 'sez-' + sez.id }, el('legend', { testo: sez.titolo }), griglia,
      sez.id === 'fit' ? el('div', { id: 'fito-suggerimenti' }) : null));
  }

  // Un solo ascoltatore per tutti i campi
  $('#modulo').addEventListener('input', (e) => {
    const r = S.aperta;
    const k = e.target.name;
    const campo = CAMPI.find((c) => c.k === k);
    if (!r || !k || !campo) return;
    let valore = e.target.value;
    if (campo.tipo === 'numero' && (valore !== '' || e.target.validity.badInput)) {
      const n = Number(valore);
      const nonValido = e.target.validity.badInput || !Number.isFinite(n) ||
        (campo.min != null && n < campo.min) ||
        (campo.max != null && n > campo.max) ||
        (campo.intero && !Number.isInteger(n));
      e.target.setCustomValidity(nonValido ? `Inserisci un valore valido tra ${campo.min ?? 0}${campo.max != null ? ' e ' + campo.max : ''}.` : '');
      e.target.toggleAttribute('aria-invalid', nonValido);
      if (nonValido) {
        stato(`${campo.label}: valore non valido`, true);
        return;
      }
    } else {
      e.target.setCustomValidity('');
      e.target.removeAttribute('aria-invalid');
    }
    if (k === 'nome' && valore && /^[a-zà-ù]/.test(valore)) {
      const pos = e.target.selectionStart;
      valore = valore.charAt(0).toUpperCase() + valore.slice(1);
      e.target.value = valore;
      e.target.setSelectionRange(pos, pos);
    }
    r[k] = valore;
    if (k === 'prog') {
      controllaProg();
    }
    if (k === 'prog' || k === 'nome') aggiornaTitoloEditor();
    if (k === 'nome') confrontaConCatalogo();
    if (k === 'nome') {
      r.gbifId = ''; // nome cambiato a mano: un eventuale ID GBIF salvato non è più valido
      r.plantnetNome = '';
      mostraConflittiNome([]);
      mostraRisultatiNome();
      clearTimeout(timerGbifDigitando);
      timerGbifDigitando = setTimeout(() => { if (S.aperta === r) disegnaLinkGbif(); }, 900);
    }
    if (k === 'problemi') aggiornaSuggerimentiFito(e.target.value);
    if (k === 'altezza' || k === 'grandezza' || k === 'circonferenza') disegnaStima();
    salvaPresto(r);
  });

  // "N° nel giorno" si ricalcola da solo quando si sceglie la Data.
  $('#modulo').addEventListener('change', (e) => {
    const r = S.aperta;
    if (e.target.matches('input[type="number"]') && !e.target.checkValidity()) {
      e.target.reportValidity();
      return;
    }
    if (!r || e.target.name !== 'data') return;
    r.numeroZona = calcolaNumeroZona(e.target.value, r.uid);
    $('#f-numeroZona').value = r.numeroZona;
    r.modificato = oraISO();
    salvaPresto(r);
  });
}

// ---------- campi illustrati (select con icona + spiegazione) ----------
function svgIcona(contenutoInterno) {
  // contenutoInterno arriva SOLO dal dizionario ICONE definito in questo file: mai da input dell'utente
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 60 60');
  s.innerHTML = contenutoInterno;
  return s;
}

function aggiornaBottoneIllustrato(k) {
  const v = S.aperta[k] || '';
  const icone = ICONE[k] || {};
  $('#f-' + k + '-testo').textContent = v || 'Tocca per scegliere…';
  const cont = $('#f-' + k + '-icona');
  cont.replaceChildren(...(icone[v] ? [svgIcona(icone[v])] : []));
}

let campoIllustratoCorrente = null;

function apriPicker(k) {
  const c = CAMPI.find((x) => x.k === k);
  const defs = DEFINIZIONI[k] || {};
  const icone = ICONE[k] || {};
  const valoreAttuale = S.aperta[k] || '';
  campoIllustratoCorrente = k;
  $('#pk-titolo').textContent = c.label;
  $('#pk-griglia').replaceChildren(...c.valori.map((v) => el('button', {
    type: 'button', class: 'pk-carta' + (v === valoreAttuale ? ' sel' : ''), onclick: () => sceglIllustrata(k, v),
  },
    icone[v] ? svgIcona(icone[v]) : null,
    el('b', { testo: v }),
    defs[v] ? el('p', { testo: defs[v] }) : null)));
  $('#pk-altro').value = valoreAttuale && !c.valori.includes(valoreAttuale) ? valoreAttuale : '';
  $('#dlg-illustrata').showModal();
}

function sceglIllustrata(k, v) {
  const r = S.aperta;
  r[k] = v;
  r.modificato = oraISO();
  aggiornaBottoneIllustrato(k);
  svuotaCampiNonPertinenti(k, v);
  applicaDipendenze();
  if (k === 'formaChioma' || k === 'tipoFoglia') disegnaStima();
  confrontaConCatalogo();
  salvaPresto(r);
  $('#dlg-illustrata').close();
}

// ---------- dipendenze tra campi (form dinamico) ----------
function applicaDipendenze() {
  const r = S.aperta;
  if (!r) return;
  // prima mostra tutti i campi coinvolti in una regola
  for (const dip of DIPENDENZE_CAMPI) {
    for (const k of dip.nascondi) {
      const etichetta = document.querySelector(`label[for="f-${k}"]`);
      if (etichetta) etichetta.classList.remove('nascosto');
    }
  }
  // poi nasconde quelli non pertinenti in base al valore attuale
  for (const dip of DIPENDENZE_CAMPI) {
    if ((r[dip.se] || '') === dip.valore) {
      for (const k of dip.nascondi) {
        const etichetta = document.querySelector(`label[for="f-${k}"]`);
        if (etichetta) etichetta.classList.add('nascosto');
      }
    }
  }
}

// svuota i campi diventati non pertinenti quando cambia il valore che li governa
function svuotaCampiNonPertinenti(kCambiato, vNuovo) {
  const r = S.aperta;
  for (const dip of DIPENDENZE_CAMPI) {
    if (dip.se !== kCambiato || vNuovo !== dip.valore) continue;
    for (const k of dip.nascondi) {
      if (!r[k]) continue;
      r[k] = '';
      const cDef = CAMPI.find((x) => x.k === k);
      if (cDef && cDef.tipo === 'illustrata') aggiornaBottoneIllustrato(k);
      else if ($('#f-' + k)) $('#f-' + k).value = '';
    }
  }
}

function controllaProg() {
  const r = S.aperta;
  const doppio = r.prog !== '' && S.schede.some((s) => s !== r && s.prog === r.prog);
  $('#avviso-prog').textContent = doppio ? 'Numero già usato da un’altra scheda' : '';
}

function aggiornaTitoloEditor() {
  const r = S.aperta;
  $('#ed-titolo').firstChild.textContent = `N° ${r.prog || '?'} – ${etichettaScheda(r)} `;
}

function apriEditor(uid, sostituisciCronologia = false) {
  const r = S.schede.find((s) => s.uid === uid);
  if (!r) return;
  S.aperta = r;
  // il datalist del nome propone le specie già viste (nelle schede e nel catalogo
  // identificato con PlantNet), utile anche offline
  aggiornaDatalistNome();
  for (const c of CAMPI) {
    if (c.tipo === 'illustrata') aggiornaBottoneIllustrato(c.k);
    else {
      const input = $('#f-' + c.k);
      input.value = r[c.k] ?? '';
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    }
  }
  chiudiRisultatiNome();
  applicaDipendenze();
  controllaProg();
  confrontaConCatalogo();
  aggiornaTitoloEditor();
  $('#ed-stato').textContent = `Modificata il ${dataIT(r.modificato)}`;
  $('#foto-avanz').textContent = '';
  disegnaGPS();
  disegnaFoto();
  disegnaAudio();
  disegnaQR();
  disegnaLinkGbif();
  disegnaStima();
  aggiornaSuggerimentiFito(r.problemi);
  aggiornaUIRegistrazione();
  aggiornaBarraRapida();
  const ed = $('#editor');
  ed.classList.remove('nascosto');
  ed.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  if (sostituisciCronologia) history.replaceState({ editor: true }, '');
  else history.pushState({ editor: true }, '');
}

function nascondiEditor() {
  chiudiRisultatiNome();
  S.aperta = null;
  $('#editor').classList.add('nascosto');
  document.body.style.overflow = '';
  disegnaElenco();
}

async function chiudiEditor(daIndietro = false) {
  if (!S.aperta) return;
  const nonValido = $('#modulo').querySelector(':invalid');
  if (nonValido) {
    stato('Correggi il valore non valido prima di chiudere', true);
    nonValido.reportValidity();
    nonValido.focus();
    if (daIndietro) history.pushState({ editor: true }, '');
    return;
  }
  if (REG.attiva && REG.riga === S.aperta) {
    fermaRegistrazione();
    await REG.fine;
  }
  if (GPSR.watch !== null && GPSR.riga === S.aperta) fermaGPS(true);
  const uid = S.aperta.uid;
  const eliminata = await eliminaBozzaVuota(S.aperta);
  if (!eliminata && !(await salvaOra(S.aperta))) {
    if (daIndietro) history.pushState({ editor: true }, '');
    return;
  }
  nascondiEditor();
  if (eliminata) stato('Scheda vuota non memorizzata');
  document.getElementById('voce-' + uid)?.scrollIntoView({ block: 'center' });
  if (!daIndietro && history.state?.editor) history.back();
}
// Il tasto "indietro" di Android chiude l'editor invece di uscire
window.addEventListener('popstate', () => { if (S.aperta) chiudiEditor(true); });

async function nuovaScheda() {
  const r = schedaVuota();
  S.schede.push(r);
  if (!(await salvaOra(r))) { S.schede = S.schede.filter((s) => s.uid !== r.uid); return; }
  apriEditor(r.uid);
  $('#f-nome').focus();
}

async function nuovaSchedaDaEditor() {
  const corrente = S.aperta;
  if (!corrente) return;
  const nonValido = $('#modulo').querySelector(':invalid');
  if (nonValido) { nonValido.reportValidity(); nonValido.focus(); return; }
  const bottone = $('#ar-nuova');
  bottone.disabled = true;
  try {
    if (REG.attiva && REG.riga === corrente) {
      fermaRegistrazione();
      await REG.fine;
    }
    if (GPSR.watch !== null && GPSR.riga === corrente) fermaGPS(true);
    if (!(await eliminaBozzaVuota(corrente)) && !(await salvaOra(corrente))) return;
    const nuova = schedaVuota();
    if (!(await salvaOra(nuova))) return;
    S.schede.push(nuova);
    apriEditor(nuova.uid, true);
    $('#f-nome').focus();
  } finally { bottone.disabled = false; }
}

async function salvaSchedaVisibile() {
  if (!S.aperta) return;
  const nonValido = $('#modulo').querySelector(':invalid');
  if (nonValido) { nonValido.reportValidity(); nonValido.focus(); return; }
  await salvaOra(S.aperta);
}

function apriMeteo3B(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function cercaMeteo3B(e) {
  e.preventDefault();
  const nome = $('#meteo-luogo').value.trim();
  if (!nome) { $('#meteo-luogo').focus(); return; }
  const segmento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it').replace(/[^a-z0-9\s-]/g, ' ').trim().replace(/\s+/g, '+');
  if (!segmento) { $('#meteo-luogo').focus(); return; }
  apriMeteo3B(`https://www.3bmeteo.com/meteo/${segmento}`);
}

/* =====================================================================
   6b. CESTINO — le schede eliminate non spariscono subito: restano
   recuperabili per un numero di giorni configurabile, poi vengono
   tolte per sempre (o subito, con "Svuota cestino").
   ===================================================================== */
function giorniConservazioneCestino() {
  return Number(localStorage.getItem('sb-cestino-giorni')) || 30;
}

// Sposta nel cestino (cancellazione reversibile). Riusata dall'editor e dall'elenco.
async function spostaNelCestino(r) {
  if (REG.attiva && REG.riga === r) annullaRegistrazione();
  if (GPSR.watch !== null && GPSR.riga === r) fermaGPS(false);
  clearTimeout(timerSalva.get(r.uid));
  timerSalva.delete(r.uid);
  const modifiche = { cancellata: oraISO(), modificato: oraISO() };
  await DB.scrivi('schede', { ...r, ...modifiche });
  Object.assign(r, modifiche);
  S.schede = S.schede.filter((s) => s.uid !== r.uid);
  S.selezionate.delete(r.uid);
  S.cestino.push(r);
  disegnaElenco();
  aggiornaBadgeCestino();
  toast(`Scheda N° ${r.prog} spostata nel cestino`, 'Annulla', () => ripristinaDalCestino(r));
}

async function ripristinaDalCestino(r) {
  const modifiche = { cancellata: null, modificato: oraISO() };
  await DB.scrivi('schede', { ...r, ...modifiche });
  Object.assign(r, modifiche);
  S.cestino = S.cestino.filter((s) => s.uid !== r.uid);
  S.schede.push(r);
  disegnaElenco();
  disegnaCestino();
  aggiornaBadgeCestino();
  stato(`Scheda N° ${r.prog} ripristinata`);
}

// Elimina per sempre: qui spariscono anche foto e audio. Niente più "Annulla".
async function eliminaDefinitivo(r) {
  clearTimeout(timerSalva.get(r.uid));
  timerSalva.delete(r.uid);
  await DB.cancella('schede', r.uid);
  for (const p of r.foto) { await DB.cancella('foto', p.id); liberaUrlFoto(p.id); }
  for (const a of r.audio) { await DB.cancella('audio', a.id); liberaUrlAudio(a.id); }
  S.cestino = S.cestino.filter((s) => s.uid !== r.uid);
  S.schede = S.schede.filter((s) => s.uid !== r.uid); // per sicurezza
}

async function svuotaCestino() {
  if (!S.cestino.length) return;
  if (!confirm(`Eliminare per sempre ${S.cestino.length} schede dal cestino? Non si può annullare.`)) return;
  for (const r of [...S.cestino]) await eliminaDefinitivo(r);
  disegnaCestino();
  aggiornaBadgeCestino();
  stato('Cestino svuotato');
}

// "Nuovo elenco": salva le schede attuali in un backup con data e ora, poi le
// sposta nel cestino (recuperabili, non perse) e riparte da zero — il N°
// progressivo torna da solo a 1, perché si calcola sempre come "il più alto
// trovato + 1" e l'elenco attivo, dopo, è vuoto.
async function nuovoElenco() {
  const bottone = $('#btn-nuovo-elenco');
  if (bottone.disabled) return;
  const n = S.schede.length;
  if (!n) { alert('Non ci sono schede da archiviare: l\'elenco è già vuoto.'); return; }
  if (!confirm(`Salvo un backup delle ${n} schede attuali e apro un elenco nuovo.\n\nLe schede di adesso andranno nel cestino (recuperabili per ${giorniConservazioneCestino()} giorni); il N° progressivo del nuovo elenco ripartirà da 1.\n\nContinuare?`)) return;
  bottone.disabled = true;
  try {
    if (!(await salvaTuttiInSospeso())) throw new Error('Ci sono schede non salvate. Riprova dopo aver liberato spazio.');
    const adesso = new Date();
    const bolla = `${oggi()}_${String(adesso.getHours()).padStart(2, '0')}-${String(adesso.getMinutes()).padStart(2, '0')}`;
    const backupRiuscito = await esportaZIP('scarica', { nomeFile: `scheda-botanica-elenco-${bolla}.zip`, soloAttive: true });
    if (!backupRiuscito) {
      stato('Nuovo elenco annullato: il backup non è riuscito', true);
      return;
    }
    const quando = oraISO();
    const archiviate = S.schede.map((r) => ({ ...r, cancellata: quando, modificato: quando }));
    await DB.sostituisciArchivio({ schede: archiviate, foto: [], audio: [], specie: [], traccia: [] }, false);
    S.cestino.push(...archiviate);
    S.schede = [];
    S.selezionate.clear();
    disegnaElenco();
    aggiornaBadgeCestino();
    stato(`Nuovo elenco iniziato: ${n} schede archiviate nel cestino, backup scaricato`);
  } catch (e) {
    stato(`Nuovo elenco non completato: ${e.message}`, true);
    alert(`Nuovo elenco non completato: ${e.message}`);
  } finally {
    bottone.disabled = false;
  }
}

// Alla partenza dell'app: elimina per sempre chi ha superato i giorni impostati.
async function purgaCestinoScaduto() {
  const soglia = Date.now() - giorniConservazioneCestino() * 864e5;
  const scaduti = S.cestino.filter((r) => Date.parse(r.cancellata) < soglia);
  for (const r of scaduti) await eliminaDefinitivo(r);
  if (scaduti.length) aggiornaBadgeCestino();
}

function aggiornaBadgeCestino() {
  const n = S.cestino.length;
  const b = $('#btn-cestino');
  const badge = $('#cestino-badge');
  badge.textContent = String(n);
  badge.classList.toggle('nascosto', n === 0);
  b.title = n ? `Cestino (${n})` : 'Cestino';
  b.setAttribute('aria-label', b.title);
}

function disegnaCestino() {
  const cont = $('#cestino-lista');
  if (!S.cestino.length) {
    cont.replaceChildren(el('div', { class: 'vuoto' }, 'Il cestino è vuoto.'));
    return;
  }
  const righe = S.cestino.slice().sort((a, b) => (b.cancellata || '').localeCompare(a.cancellata || '')).map((r) =>
    el('div', { class: 'voce' },
      el('div', { style: 'min-width:0' },
        el('div', { class: 'titolo', testo: `N° ${r.prog} — ${r.nome || 'senza nome'}` }),
        el('div', { class: 'sotto', testo: `Cancellata il ${dataIT(r.cancellata)}` })),
      el('div', { class: 'voce-azioni', style: 'display:flex;gap:6px' },
        el('button', { type: 'button', class: 'btn', onclick: () => ripristinaDalCestino(r) }, '↺ Ripristina'),
        el('button', {
          type: 'button', class: 'btn pericolo',
          onclick: async () => {
            if (!confirm(`Eliminare per sempre la scheda N° ${r.prog}? Non si può annullare.`)) return;
            await eliminaDefinitivo(r);
            disegnaCestino();
            aggiornaBadgeCestino();
          },
        }, 'Elimina per sempre'))));
  cont.replaceChildren(...righe);
}


async function eliminaScheda() {
  const r = S.aperta;
  if (!r) return;
  await spostaNelCestino(r);
  nascondiEditor();
  if (history.state?.editor) history.back();
}

async function eliminaSchedaDaElenco(uid) {
  const r = S.schede.find((s) => s.uid === uid);
  if (!r) return;
  await spostaNelCestino(r);
}

/* ---------- GPS ---------- */
function qualitaSegnaleGPS(acc) {
  if (acc == null) return null;
  if (acc <= 5) return { testo: 'ottimo', colore: 'var(--bosco)' };
  if (acc <= 15) return { testo: 'buono', colore: 'var(--bosco)' };
  if (acc <= 30) return { testo: 'scarso', colore: 'var(--ruggine)' };
  return { testo: 'molto scarso', colore: 'var(--ruggine)' };
}

function disegnaGPS() {
  const r = S.aperta;
  const box = $('#gps-box');
  if (!r.gps) {
    box.replaceChildren(
      el('span', { style: 'color:var(--tenue)' }, 'Nessuna coordinata'),
      el('button', { type: 'button', class: 'btn primario', onclick: rilevaGPS }, '📍 Rileva posizione'),
      el('button', { type: 'button', class: 'btn', onclick: () => sceglierePosizioneDaMappa(r) }, '🗺 Scegli dalla mappa'));
    return;
  }
  const g = r.gps;
  const qualita = qualitaSegnaleGPS(g.acc);
  box.replaceChildren(...[
    el('strong', { testo: `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}` }),
    g.manuale ? el('span', { style: 'color:var(--tenue)' }, 'posizione scelta a mano') : (g.acc != null ? el('span', { testo: `±${Math.round(g.acc)} m` }) : null),
    qualita ? el('span', { style: `color:${qualita.colore};font-weight:600`, testo: `segnale ${qualita.testo}` }) : null,
    g.alt != null ? el('span', { testo: `${Math.round(g.alt)} m s.l.m.` }) : null,
    el('span', { style: 'color:var(--tenue);font-size:13px', testo: dataIT(g.quando) }),
    g.online !== undefined ? el('span', { style: 'font-size:13px;color:var(--tenue)', testo: g.online ? '🌐 online' : '📴 offline' }) : null,
    el('a', { href: `https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lng}#map=19/${g.lat}/${g.lng}`, target: '_blank', rel: 'noopener' }, 'Apri mappa'),
    el('button', { type: 'button', class: 'btn', onclick: rilevaGPS }, '↻ Rileva di nuovo'),
    el('button', { type: 'button', class: 'btn', onclick: () => sceglierePosizioneDaMappa(r) }, '🗺 Scegli dalla mappa'),
    el('button', {
      type: 'button', class: 'btn pericolo', onclick: () => {
        if (!confirm('Rimuovere le coordinate?')) return;
        r.gps = null; r.modificato = oraISO(); salvaOra(r); disegnaGPS();
      },
    }, 'Rimuovi'),
  ].filter(Boolean)); // replaceChildren scriverebbe "null" come testo
}

const GPSR = { watch: null, timer: null, migliore: null, riga: null };

function rilevaGPS() {
  if (GPSR.watch !== null) return fermaGPS(true);   // secondo tocco: ferma e usa il punto migliore
  const r = S.aperta;
  if (!navigator.geolocation) return alert('Geolocalizzazione non disponibile su questo dispositivo.');
  GPSR.riga = r; GPSR.migliore = null;
  mostraRicercaGPS('⏳ Cerco i satelliti… all’aperto è più preciso');
  GPSR.watch = navigator.geolocation.watchPosition(
    (p) => {
      const c = p.coords;
      if (!GPSR.migliore || c.accuracy < GPSR.migliore.acc) {
        GPSR.migliore = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, alt: c.altitude, quando: oraISO(), online: navigator.onLine };
      }
      mostraRicercaGPS(`📡 Precisione attuale ±${Math.round(c.accuracy)} m (migliore ±${Math.round(GPSR.migliore.acc)} m)`);
      if (GPSR.migliore.acc <= 5) fermaGPS(true);    // già ottimo: inutile aspettare
    },
    (err) => {
      if (GPSR.migliore) return;                     // un errore dopo un fix valido non annulla il fix
      const motivi = { 1: 'permesso negato (abilita la posizione per il browser)', 2: 'posizione non disponibile', 3: 'tempo scaduto' };
      fermaGPS(false);
      alert('GPS non riuscito: ' + (motivi[err.code] || err.message));
    },
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  GPSR.timer = setTimeout(() => fermaGPS(true), 20000);
  aggiornaBarraRapida();
}

function mostraRicercaGPS(msg) {
  if (S.aperta !== GPSR.riga) return;
  $('#gps-box').replaceChildren(
    el('span', { testo: msg }),
    el('button', { type: 'button', class: 'btn primario', onclick: () => fermaGPS(true) }, GPSR.migliore ? 'Usa questa posizione' : 'Annulla'));
}

function fermaGPS(salva) {
  if (GPSR.watch !== null) navigator.geolocation.clearWatch(GPSR.watch);
  clearTimeout(GPSR.timer);
  GPSR.watch = null;
  const r = GPSR.riga;
  if (salva && r && GPSR.migliore) {
    r.gps = GPSR.migliore;
    r.modificato = oraISO();
    salvaOra(r);
    stato(`Posizione salvata (±${Math.round(r.gps.acc)} m)`);
  } else if (salva && !GPSR.migliore) {
    stato('Nessuna posizione ricevuta: riprova all’aperto', true);
  }
  if (r && S.aperta === r) disegnaGPS();
  aggiornaBarraRapida();
}

/* ---------- scegliere un punto GPS toccando la mappa ---------- */
let mappaScegli = null;
let markerScegliPos = null;
let sceltaGPSPer = null; // scheda a cui assegnare il punto scelto

function posizionaMarkerScelta(lat, lng) {
  if (!markerScegliPos) {
    markerScegliPos = L.marker([lat, lng], { draggable: true, icon: L.divIcon({ className: 'marker-scelta', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 14] }) }).addTo(mappaScegli);
    markerScegliPos.on('dragend', () => {
      const p = markerScegliPos.getLatLng();
      mostraCoordScelta(p.lat, p.lng);
    });
  } else {
    markerScegliPos.setLatLng([lat, lng]);
  }
  mostraCoordScelta(lat, lng);
}
function mostraCoordScelta(lat, lng) {
  $('#mappa-scegli-coord').textContent = `Punto scelto: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function sceglierePosizioneDaMappa(r) {
  sceltaGPSPer = r;
  const dlg = $('#dlg-mappa-scegli');
  dlg.showModal();
  setTimeout(() => {
    if (!mappaScegli) {
      mappaScegli = L.map('mappa-scegli', { zoomControl: true });
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mappaScegli);
      mappaScegli.on('click', (e) => posizionaMarkerScelta(e.latlng.lat, e.latlng.lng));
    }
    // centra sul punto già presente sulla scheda, sull'ultimo punto della traccia, o sull'Italia
    const centro = r.gps ? [r.gps.lat, r.gps.lng]
      : (S.traccia.length ? [S.traccia[S.traccia.length - 1].lat, S.traccia[S.traccia.length - 1].lng] : [45.5, 10]);
    mappaScegli.setView(centro, r.gps || S.traccia.length ? 18 : 6);
    if (markerScegliPos) { mappaScegli.removeLayer(markerScegliPos); markerScegliPos = null; }
    $('#mappa-scegli-coord').textContent = r.gps ? '' : 'Tocca la mappa per scegliere un punto.';
    if (r.gps) posizionaMarkerScelta(r.gps.lat, r.gps.lng);
    mappaScegli.invalidateSize();
  }, 80);
}

function confermaPosizioneScelta() {
  if (!markerScegliPos || !sceltaGPSPer) { $('#dlg-mappa-scegli').close(); return; }
  const p = markerScegliPos.getLatLng();
  const r = sceltaGPSPer;
  r.gps = { lat: p.lat, lng: p.lng, acc: null, alt: null, quando: oraISO(), manuale: true, online: navigator.onLine };
  r.modificato = oraISO();
  salvaOra(r);
  $('#dlg-mappa-scegli').close();
  if (S.aperta === r) disegnaGPS();
  stato('Posizione impostata dalla mappa');
}

/* ---------- foto nell'editor ---------- */
async function disegnaFoto() {
  const r = S.aperta;
  const griglia = $('#foto-griglia');
  if (!r.foto.length) {
    griglia.replaceChildren(el('p', { style: 'color:var(--tenue);grid-column:1/-1;margin:0' }, 'Nessuna foto.'));
    return;
  }
  const blocchi = await Promise.all(r.foto.map(async (p) => {
    const src = await urlFoto(p.id);
    return el('div', { class: 'foto' },
      el('div', { class: 'foto-img-wrap' },
        el('img', { src, alt: p.didascalia || 'Foto esemplare', loading: 'lazy',
          onclick: () => { $('#vista-img').src = src; $('#vista-foto').showModal(); } }),
        p.identificata ? el('span', { class: 'badge-ident', title: 'Identificata con PlantNet' }, '🔎') : null),
      el('div', { class: 'dida' },
        el('input', { type: 'text', value: p.didascalia, placeholder: 'Didascalia…', 'aria-label': 'Didascalia',
          oninput: (e) => { p.didascalia = e.target.value; salvaPresto(r); } }),
        el('div', { class: 'riga' },
          el('label', {}, el('input', { type: 'checkbox', checked: p.stampa,
            onchange: (e) => { p.stampa = e.target.checked; salvaPresto(r); } }), ' stampa'),
          el('button', { type: 'button', class: 'link-identifica', onclick: () => apriIdentificazione(r, p) }, '🔎 Identifica'),
          el('button', { type: 'button', onclick: () => eliminaFoto(r, p.id) }, 'Elimina')),
        el('span', { style: 'color:var(--tenue)', testo: dataIT(p.quando) })));
  }));
  if (S.aperta === r) griglia.replaceChildren(...blocchi);
}

/* =====================================================================
   7d. IDENTIFICAZIONE SPECIE (PlantNet) — solo su richiesta esplicita:
   la foto lascia il telefono SOLO quando l'utente tocca "Identifica".
   Nessuna chiave = nessuna chiamata di rete, mai automatica.
   ===================================================================== */
const IDENT = { riga: null, foto: null, serie: 0 };

function chiavePlantNet() { return (localStorage.getItem('sb-plantnet-key') || '').trim(); }

function apriImpostazioniPlantNet() {
  $('#pn-chiave').value = chiavePlantNet();
  $('#pn-stato').textContent = '';
  $('#dlg-plantnet').showModal();
}

async function verificaChiavePlantNet() {
  const chiave = $('#pn-chiave').value.trim();
  if (!chiave) { $('#pn-stato').textContent = 'Incolla prima una chiave.'; return; }
  $('#pn-stato').textContent = '⏳ Verifica in corso…';
  try {
    await ServiziRicerca.plantnetNome('Abies alba', chiave);
    $('#pn-stato').textContent = '✅ Accesso al catalogo PlantNet verificato. Nessuna foto inviata; la disponibilità delle identificazioni dipende dalla quota del tuo account.';
  } catch (e) {
    $('#pn-stato').textContent = '⚠️ Verifica non riuscita: ' + e.message;
  }
}

async function apriIdentificazione(r, p) {
  if (!chiavePlantNet()) {
    if (confirm('Per identificare le foto serve una chiave PlantNet gratuita, non ancora configurata.\nVuoi inserirla ora?')) apriImpostazioniPlantNet();
    return;
  }
  IDENT.riga = r; IDENT.foto = p;
  IDENT.serie++;
  $('#ident-anteprima').src = await urlFoto(p.id);
  $('#ident-stato').textContent = '';
  $('#ident-risultati').replaceChildren();
  $('#dlg-identifica').showModal();
}

async function eseguiIdentificazione() {
  const chiave = chiavePlantNet();
  if (!chiave) { $('#ident-stato').textContent = 'Manca la chiave PlantNet.'; return; }
  const organo = $('#ident-organo').value;
  const riga = IDENT.riga, foto = IDENT.foto;
  const serie = ++IDENT.serie;
  const attuale = () => serie === IDENT.serie && IDENT.riga === riga && IDENT.foto === foto && $('#dlg-identifica').open;
  $('#ident-stato').textContent = '⏳ Invio della foto a PlantNet…';
  $('#ident-risultati').replaceChildren();
  try {
    const blob = await DB.leggi('foto', foto.id);
    if (!blob) throw new Error('foto non trovata sul dispositivo');
    const form = new FormData();
    form.append('images', blob, 'foto.jpg');
    form.append('organs', organo);
    const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(chiave)}&lang=it&include-related-images=false`;
    const dati = await richiestaFotoPlantNet(url, form);
    if (!attuale()) return;
    const risultati = (dati?.results || []).slice(0, 5)
      .map((ris) => {
        const nomeSci = ris.species?.scientificNameWithoutAuthor || ris.species?.scientificName || 'Sconosciuto';
        return {
          nomeSci, nomeComune: ris.species?.commonNames?.[0] || '',
          conf: Math.round((ris.score || 0) * 100), gbifId: ris.gbif?.id || '',
          nomePlantNet: ris.species?.scientificName || '',
          specieCatalogo: trovaSpecieGuida(nomeSci),
        };
      });
    if (!risultati.length) {
      $('#ident-stato').textContent = 'PlantNet non ha riconosciuto una specie: prova un’altra foto o indica l’organo fotografato.';
      return;
    }
    const rimaste = dati?.remainingIdentificationRequests;
    $('#ident-stato').textContent = rimaste != null ? `Richieste rimaste oggi: ${rimaste}` : '';
    $('#ident-risultati').replaceChildren(...risultati.map((ris) => {
      return el('div', { class: 'ident-carta' },
        el('div', {}, el('b', { class: 'specie' }, ris.nomeSci), ris.nomeComune ? ` — ${ris.nomeComune}` : '', ris.specieCatalogo ? ' · anche nella guida locale' : ''),
        el('div', { class: 'ident-conf' }, `${ris.conf}% di confidenza`),
        el('button', { type: 'button', class: 'btn primario', onclick: () => { if (attuale()) usaIdentificazione(ris.nomeSci, ris.nomeComune, ris.conf, ris.gbifId, ris.nomePlantNet); } }, 'Usa come nome esemplare'));
    }));
  } catch (e) {
    if (!attuale()) return;
    const rete = e instanceof TypeError; // fetch fallita: niente rete o richiesta bloccata
    $('#ident-stato').textContent = '❌ ' + (rete ? 'impossibile contattare PlantNet: controlla di essere online (serve internet solo per l’identificazione).' : e.message);
  }
}

function usaIdentificazione(nomeSci, nomeComune, conf, gbifId, nomePlantNet = '') {
  const r = IDENT.riga;
  const sostituire = !r.nome.trim() || r.nome === nomeSci || confirm(`Il nome attuale è "${r.nome}". Sostituirlo con "${nomeSci}"?`);
  if (sostituire) {
    r.nome = nomeSci;
    r.gbifId = /^\d+$/.test(String(gbifId)) ? String(gbifId) : '';
    r.plantnetNome = nomePlantNet;
    if (S.aperta === r) { $('#f-nome').value = nomeSci; aggiornaTitoloEditor(); }
    // Se questa specie è anche tra le 144 del catalogo del corso, compila
    // pure i campi illustrati ancora vuoti, come fa la guida specie.
    const specieCatalogo = trovaSpecieGuida(nomeSci);
    if (specieCatalogo) {
      const conflitti = conflittiConGuida(r, specieCatalogo);
      compilaCampiDaGuidaSpecie(r, specieCatalogo);
      mostraConflittiNome(conflitti);
    }
  }
  const linkGbif = gbifId ? ` — GBIF: https://www.gbif.org/species/${gbifId}` : '';
  const nota = `Identificato con PlantNet: ${nomeSci}${nomeComune ? ' (' + nomeComune + ')' : ''} — ${conf}%, ${dataIT(oraISO())}${linkGbif}`;
  r.note = r.note ? r.note + '\n' + nota : nota;
  if (S.aperta === r) $('#f-note').value = r.note;
  IDENT.foto.identificata = true;
  r.modificato = oraISO();
  salvaOra(r);
  registraSpecieIdentificata(nomeSci, nomeComune, conf, gbifId);
  if (S.aperta === r) { disegnaFoto(); disegnaLinkGbif(); confrontaConCatalogo(); }
  disegnaElenco();
  $('#dlg-identifica').close();
  stato('Identificazione applicata');
}

/* ---------- catalogo specie: si arricchisce da solo a ogni identificazione
   confermata, e serve a suggerire i nomi anche offline (senza PlantNet) ---------- */
async function registraSpecieIdentificata(nomeSci, nomeComune, conf, gbifId) {
  if (!nomeSci) return;
  // il GBIF ID è più affidabile del solo testo del nome (evita doppioni per piccole
  // differenze di scrittura o sinonimi): se lo conosciamo già, controlliamo prima quello.
  let voce = (gbifId && S.specie.find((s) => s.gbifId === gbifId)) || S.specie.find((s) => s.nomeSci === nomeSci);
  if (voce) {
    voce.volte = (voce.volte || 1) + 1;
    voce.ultimaVolta = oraISO();
    if (nomeComune && !voce.nomeComune) voce.nomeComune = nomeComune;
    if (conf > (voce.confidenzaMax || 0)) voce.confidenzaMax = conf;
    if (gbifId && !voce.gbifId) voce.gbifId = gbifId;
  } else {
    voce = { nomeSci, nomeComune: nomeComune || '', volte: 1, primaVolta: oraISO(), ultimaVolta: oraISO(), confidenzaMax: conf, gbifId: gbifId || '' };
    S.specie.push(voce);
  }
  await DB.scrivi('specie', voce);
  aggiornaDatalistNome();
}

// Bottone verso la scheda della specie su GBIF. Se la scheda ha già un ID
// GBIF salvato (da un'identificazione PlantNet) lo usa subito; altrimenti
// lo cerca da sola a partire dal nome scientifico scritto — così il
// pulsante compare anche per un nome preso dalla Guida alle specie, da
// Wikipedia o scritto a mano, non solo da PlantNet. Il risultato si salva
// nella scheda, così la ricerca si fa una volta sola.
const CACHE_GBIF_MATCH = new Map();
let timerGbifDigitando = null;

async function trovaGbifId(nomeSci) {
  const chiave = (nomeSci || '').trim().toLowerCase();
  if (!chiave) return '';
  if (CACHE_GBIF_MATCH.has(chiave)) return CACHE_GBIF_MATCH.get(chiave);
  let id = '';
  try {
    const dati = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(nomeSci)}&kingdom=Plantae`);
    // Una corrispondenza solo al genere non identifica la specie cercata.
    if (ServiziRicerca.gbifBotanico(dati)) id = String(dati.usageKey);
  } catch { /* offline o GBIF irraggiungibile: il pulsante resta assente per ora */ }
  if (id) CACHE_GBIF_MATCH.set(chiave, id);
  return id;
}

async function disegnaLinkGbif() {
  const cont = $('#gbif-link');
  const r = S.aperta;
  if (!cont || !r) return;
  aggiornaLinkPlantNet(r);
  const bottone = (id) => el('a', {
    href: `https://www.gbif.org/species/${id}`, target: '_blank', rel: 'noopener',
    class: 'btn',
  }, '🔗 Apri la specie su GBIF');

  if (r.gbifId) { cont.replaceChildren(bottone(r.gbifId)); return; }
  if (!r.nome?.trim()) {
    cont.replaceChildren(el('span', { class: 'btn fonte-disabilitata' }, '↗ GBIF'));
    return;
  }

  const nomeCercato = r.nome;
  cont.replaceChildren(el('span', { style: 'font-size:12px;color:var(--tenue)' }, 'Cerco il riferimento GBIF…'));
  const id = await trovaGbifId(nomeCercato);
  if (S.aperta !== r || r.nome !== nomeCercato) return;
  if (id) { r.gbifId = id; salvaPresto(r); cont.replaceChildren(bottone(id)); }
  else cont.replaceChildren(el('button', {
    type: 'button', class: 'btn', onclick: cercaGbifDaScheda,
  }, 'Cerca su GBIF'));
}

function aggiornaLinkPlantNet(r) {
  const link = $('#plantnet-link');
  if (!link) return;
  // Non spacciare la pagina iniziale per una ricerca. Il link esterno è distinto.
  link.classList.toggle('nascosto', !(r.plantnetNome && r.nome));
  if (r.plantnetNome && r.nome) {
    link.href = `https://identify.plantnet.org/it/k-world-flora/species/${encodeURIComponent(r.plantnetNome)}/data`;
    link.textContent = '↗ Scheda PlantNet';
  } else {
    link.removeAttribute('href');
  }
}

// Suggerimenti per "Nome esemplare": nomi già usati nelle schede + catalogo specie
// (così propone anche specie identificate in passato ma non più presenti in nessuna scheda attiva)
// + la guida delle 144 specie del corso, così propone anche quelle mai rilevate finora.
function nomiUsati() {
  const daSchede = S.schede.map((r) => r.nome).filter(Boolean);
  const daSpecie = [...S.specie].sort((a, b) => (b.volte || 0) - (a.volte || 0)).map((s) => s.nomeSci);
  const daGuida = GUIDA_SPECIE.map((v) => v.nomeSci);
  return [...new Set([...daSpecie, ...daSchede, ...daGuida])];
}
function aggiornaDatalistNome() {
  const dl = $('#dl-nome');
  if (dl) dl.replaceChildren(...nomiUsati().map((v) => el('option', { value: v })));
}

// Ricerca istantanea solo nei dati locali: guida, catalogo personale e nomi
// già usati. Il nome rimane comunque un campo libero.
const NOME_SUGGERIMENTI_MAX = 8;
let nomeSuggerimentoAttivo = -1;
let nomeSuggerimenti = [];

const nomeCatalogo = (v) => v.nomeSci + (v.varieta ? ` '${v.varieta}'` : '');
const normalizzaRicercaNome = (v) => String(v || '').trim().toLocaleLowerCase('it');

function cercaNomiLocali(testo) {
  const query = normalizzaRicercaNome(testo);
  const trovati = new Map();
  for (const v of GUIDA_SPECIE) {
    const nome = nomeCatalogo(v);
    trovati.set(normalizzaRicercaNome(nome), { nome, guida: v, origine: 'Guida specie', dettagli: v.famiglia || '' });
  }
  for (const s of S.specie) {
    const nome = (s.nomeSci || '').trim();
    if (!nome) continue;
    const chiave = normalizzaRicercaNome(nome);
    const voce = trovati.get(chiave) || { nome, guida: null, origine: '', dettagli: '' };
    voce.origine = 'Specie identificate';
    voce.dettagli = s.nomeComune || voce.dettagli;
    voce.ricercaAlt = s.nomeComune || '';
    trovati.set(chiave, voce);
  }
  for (const r of S.schede) {
    if (r.uid === S.aperta?.uid) continue;
    const nome = (r.nome || '').trim();
    if (!nome) continue;
    const chiave = normalizzaRicercaNome(nome);
    const voce = trovati.get(chiave) || { nome, guida: null, origine: '', dettagli: '' };
    voce.origine = 'Già rilevata';
    trovati.set(chiave, voce);
  }
  const priorita = { 'Già rilevata': 0, 'Specie identificate': 1, 'Guida specie': 2 };
  return [...trovati.values()]
    .filter((v) => query && normalizzaRicercaNome([v.nome, v.dettagli, v.ricercaAlt].join(' ')).includes(query))
    .sort((a, b) => {
      const inizioA = normalizzaRicercaNome(a.nome).startsWith(query) ? 0 : 1;
      const inizioB = normalizzaRicercaNome(b.nome).startsWith(query) ? 0 : 1;
      return inizioA - inizioB || priorita[a.origine] - priorita[b.origine] || a.nome.localeCompare(b.nome, 'it');
    }).slice(0, NOME_SUGGERIMENTI_MAX);
}

function chiudiRisultatiNome() {
  $('#nome-risultati').classList.add('nascosto');
  $('#f-nome').setAttribute('aria-expanded', 'false');
  $('#f-nome').removeAttribute('aria-activedescendant');
  nomeSuggerimentoAttivo = -1;
}

function posizionaRisultatiNome() {
  const lista = $('#nome-risultati');
  if (lista.classList.contains('nascosto')) return;
  const box = $('#f-nome').getBoundingClientRect();
  const vista = window.visualViewport;
  const alto = vista?.offsetTop || 0;
  const basso = alto + (vista?.height || window.innerHeight);
  const sopra = basso - box.bottom < 185 && box.top - alto > basso - box.bottom;
  const spazio = sopra ? box.top - alto : basso - box.bottom;
  lista.style.left = `${Math.max(8, box.left)}px`;
  lista.style.width = `${Math.min(box.width, window.innerWidth - Math.max(8, box.left) - 8)}px`;
  lista.style.maxHeight = `${Math.max(90, Math.min(330, spazio - 12))}px`;
  lista.style.top = sopra ? 'auto' : `${box.bottom + 4}px`;
  lista.style.bottom = sopra ? `${window.innerHeight - box.top + 4}px` : 'auto';
}

function aggiornaAttivoNome() {
  const options = [...$('#nome-risultati').querySelectorAll('[role=option]')];
  options.forEach((opzione, i) => opzione.setAttribute('aria-selected', String(i === nomeSuggerimentoAttivo)));
  const selezionata = options[nomeSuggerimentoAttivo];
  if (selezionata) {
    $('#f-nome').setAttribute('aria-activedescendant', selezionata.id);
    selezionata.scrollIntoView({ block: 'nearest' });
  } else $('#f-nome').removeAttribute('aria-activedescendant');
}

function selezionaRisultatoNome(voce) {
  const r = S.aperta;
  if (!r) return;
  r.nome = voce.nome;
  r.gbifId = '';
  r.plantnetNome = '';
  $('#f-nome').value = voce.nome;
  mostraConflittiNome(voce.guida ? conflittiConGuida(r, voce.guida) : []);
  if (voce.guida) compilaCampiDaGuidaSpecie(r, voce.guida);
  applicaDipendenze();
  aggiornaTitoloEditor();
  confrontaConCatalogo();
  disegnaStima();
  salvaPresto(r);
  clearTimeout(timerGbifDigitando);
  timerGbifDigitando = setTimeout(() => { if (S.aperta === r) disegnaLinkGbif(); }, 900);
  chiudiRisultatiNome();
  $('#f-nome').blur();
}

function mostraRisultatiNome() {
  const input = $('#f-nome');
  const lista = $('#nome-risultati');
  const query = input.value.trim();
  if (!S.aperta || !query || document.activeElement !== input) { chiudiRisultatiNome(); return; }
  nomeSuggerimenti = cercaNomiLocali(query);
  nomeSuggerimentoAttivo = -1;
  lista.replaceChildren(...(nomeSuggerimenti.length ? nomeSuggerimenti.map((voce, i) =>
    el('button', {
      type: 'button', class: 'nome-opzione', role: 'option', id: `nome-opzione-${i}`, 'aria-selected': 'false',
      onpointerdown: (e) => e.preventDefault(), onclick: () => selezionaRisultatoNome(voce),
    }, el('strong', { class: 'specie', testo: voce.nome }),
      el('span', { testo: [voce.origine, voce.dettagli].filter(Boolean).join(' · ') }))) :
    [el('p', { class: 'nome-nessun-risultato', testo: 'Nessun nome nel catalogo locale. Puoi comunque scriverlo liberamente.' })]));
  lista.classList.remove('nascosto');
  input.setAttribute('aria-expanded', 'true');
  posizionaRisultatiNome();
}

// Unisce il catalogo specie ricevuto da un backup di un collega: per ogni specie
// tiene il conteggio più alto e la confidenza migliore vista dai due dispositivi.
async function unisciCatalogoSpecie(specieArrivate) {
  if (!specieArrivate?.length) return;
  for (const voce of specieArrivate) {
    const esistente = (voce.gbifId && S.specie.find((s) => s.gbifId === voce.gbifId)) || S.specie.find((s) => s.nomeSci === voce.nomeSci);
    if (!esistente) {
      S.specie.push(voce);
      await DB.scrivi('specie', voce);
    } else {
      esistente.volte = Math.max(esistente.volte || 0, voce.volte || 0);
      esistente.confidenzaMax = Math.max(esistente.confidenzaMax || 0, voce.confidenzaMax || 0);
      esistente.nomeComune = esistente.nomeComune || voce.nomeComune || '';
      esistente.gbifId = esistente.gbifId || voce.gbifId || '';
      if (Date.parse(voce.ultimaVolta) > Date.parse(esistente.ultimaVolta || 0)) esistente.ultimaVolta = voce.ultimaVolta;
      if (Date.parse(voce.primaVolta) < Date.parse(esistente.primaVolta || voce.primaVolta)) esistente.primaVolta = voce.primaVolta;
      await DB.scrivi('specie', esistente);
    }
  }
  aggiornaDatalistNome();
}

/* =====================================================================
   7e. GUIDA SPECIE — catalogo di riferimento (144 specie/varietà) tratto
   dal materiale del corso ("GLI ALBERI — Riconoscimento vegetale", M.
   Fontana). Il file distribuito resta intatto; le integrazioni manuali
   vengono salvate a parte nel dispositivo e nei backup. Un dato della
   guida può riempire solo un campo ancora vuoto nella scheda di rilievo.
   ===================================================================== */


const GS_TIPOLOGIA_ETICHETTA = { caducifoglia: 'caducifoglia', sempreverde: 'sempreverde', 'ex palme': 'palma (sempreverde)' };
const GS_CHIP_ETICHETTA = {
  chiomaForma: 'Chioma', ramiForma: 'Rami', ramiInserzione: 'Rami',
  fogliaTipo: 'Foglia', fogliaComposta: 'Foglia composta', fogliaLamina: 'Lamina',
  fogliaMargine: 'Margine', fogliaBase: 'Base', fogliaApice: 'Apice',
  gemmeForma: 'Gemme', gemmePosizione: 'Gemme (posizione)', gemmeOrientamento: 'Gemme (orientamento)', gemmeTipologia: 'Gemme (tipo)',
  crescita: 'Crescita', estensione: 'Estensione', corteccia: 'Corteccia', fiore: 'Fiore', frutto: 'Frutto', habitat: 'Habitat',
};

// Corrispondenza tra i campi illustrati della scheda e i campi strutturati
// del catalogo (che usano nomi diversi in alcuni casi).
const GS_CAMPO_GUIDA = { formaChioma: 'chiomaForma', rami: 'ramiInserzione', tipoFoglia: 'fogliaTipo', lamina: 'fogliaLamina', margine: 'fogliaMargine', crescita: 'crescita', estensione: 'estensione' };

// La guida inclusa resta la fonte originale. Le integrazioni per dispositivo
// hanno uno store e un backup propri; non alterano il file distribuito.
const GUIDA_ORIGINALE = new Map(GUIDA_SPECIE.map(v => [v.id, structuredClone(v)]));
// Solo su richiesta dell'utente le chiavi sono ricordate nello storage locale
// di questo browser. Non entrano nel database botanico o nei suoi backup.
let chiaviAI = {};
let cgAiRichiesta = 0;
const CHIAVI_AI_STORAGE = 'sb-ai-keys';
const CHIAVI_AI_AMMESSE = new Set(['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY',
  'CEREBRAS_API_KEY', 'TOGETHER_API_KEY', 'OPENCODE_API_KEY']);

function leggiChiaviEnv(testo) {
  const chiavi = {};
  for (const riga of testo.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = riga.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || !CHIAVI_AI_AMMESSE.has(match[1])) continue;
    let valore = match[2];
    if (valore.startsWith('"') || valore.startsWith("'")) {
      const citato = valore.match(/^(["'])(.*?)\1(?:\s*#.*)?$/);
      if (!citato) continue;
      valore = citato[2];
    } else valore = valore.replace(/\s+#.*$/, '').trim();
    if (valore && valore.length <= 4096) chiavi[match[1]] = valore;
  }
  return chiavi;
}

function statoChiaviAI() {
  const nomi = Object.keys(chiaviAI);
  $('#ai-env-stato').textContent = !nomi.length ? 'Nessuna chiave caricata.' :
    `${nomi.length} ${nomi.length === 1 ? 'chiave caricata' : 'chiavi caricate'}${$('#ai-ricorda-env').checked ? ' e ricordate su questo browser' : ' per questa pagina'}. ` +
    'Gemini, Groq o OpenRouter sono utilizzabili nella ricerca e nelle slide. Le altre chiavi riconosciute non sono ancora utilizzate.';
  aggiornaFornitoreSlide(true);
}

function aggiornaFornitoreSlide(automatico = false) {
  const selettore = $('#cg-ai-fornitore');
  if (!selettore) return;
  const disponibili = { gemini: Boolean(chiaviAI.GEMINI_API_KEY || chiaviAI.GOOGLE_API_KEY),
    groq: Boolean(chiaviAI.GROQ_API_KEY), openrouter: Boolean(chiaviAI.OPENROUTER_API_KEY) };
  if (automatico && !disponibili[selettore.value])
    selettore.value = Object.keys(disponibili).find(k => disponibili[k]) || 'gemini';
  const router = selettore.value === 'openrouter';
  $('#cg-ai-modello').classList.toggle('nascosto', !router);
  $('#cg-ai-modello-label').classList.toggle('nascosto', !router);
}

function ricordaChiaviAI() {
  try {
    if ($('#ai-ricorda-env').checked && Object.keys(chiaviAI).length)
      localStorage.setItem(CHIAVI_AI_STORAGE, JSON.stringify(chiaviAI));
    else localStorage.removeItem(CHIAVI_AI_STORAGE);
    statoChiaviAI();
  } catch {
    $('#ai-ricorda-env').checked = false;
    $('#ai-env-stato').textContent = 'Chiavi disponibili solo fino alla chiusura della pagina: archiviazione locale non disponibile.';
  }
}

function ripristinaChiaviAI() {
  try {
    const salvate = JSON.parse(localStorage.getItem(CHIAVI_AI_STORAGE) || 'null');
    if (salvate && typeof salvate === 'object' && !Array.isArray(salvate)) {
      chiaviAI = Object.fromEntries(Object.entries(salvate).filter(([nome, valore]) =>
        CHIAVI_AI_AMMESSE.has(nome) && typeof valore === 'string' && valore.length > 0 && valore.length <= 4096));
      $('#ai-ricorda-env').checked = Object.keys(chiaviAI).length > 0;
    }
  } catch { /* La scheda resta utilizzabile senza storage. */ }
  statoChiaviAI();
}

async function caricaChiaviAI(file) {
  if (!file || file.size > 32768) { $('#ai-env-stato').textContent = 'Seleziona un piccolo file open.env di testo (massimo 32 KB).'; return; }
  try {
    const nuove = leggiChiaviEnv(await file.text());
    if (!Object.keys(nuove).length) throw new Error('Nessuna chiave riconosciuta nel file.');
    chiaviAI = nuove;
    ricordaChiaviAI();
  } catch { $('#ai-env-stato').textContent = 'Impossibile leggere open.env: controlla che sia un file di testo con righe NOME_CHIAVE="valore".'; }
}

function codificaBase64(bytes) {
  let testo = '';
  for (let i = 0; i < bytes.length; i += 8192)
    testo += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(testo);
}

async function richiediProposteSlideAI(fornitore, istruzioni, base64) {
  return ServiziRicerca.ai(configurazioneFornitoreAI(fornitore, true), istruzioni, base64);
}

function configurazioneFornitoreAI(nome, immagine = false) {
  const chiave = nome === 'gemini' ? (chiaviAI.GEMINI_API_KEY || chiaviAI.GOOGLE_API_KEY) :
    nome === 'groq' ? chiaviAI.GROQ_API_KEY : chiaviAI.OPENROUTER_API_KEY;
  const modello = nome === 'openrouter' ? ($('#cg-ai-modello')?.value?.trim() || $('#ai-modello-openrouter')?.value?.trim() || '') :
    $(`#ai-modello-${nome === 'groq' && immagine ? 'groq-vision' : nome}`)?.value?.trim() || '';
  return ServiziRicerca.impostazione(nome, chiave, modello, immagine);
}

function normalizzaProposteAI(dato, specie) {
  if (!Array.isArray(dato?.proposte)) return [];
  const base = GUIDA_ORIGINALE.get(specie.id);
  const viste = new Set();
  return dato.proposte.slice(0, 25).filter(p => {
    if (!p || !CG_CHIAVI.has(p.campo) || p.campo === 'noteExtra' || base[p.campo] || viste.has(p.campo) ||
        typeof p.valore !== 'string' || !p.valore.trim() || p.valore.length > 180 ||
        typeof p.evidenza !== 'string' || !p.evidenza.trim() || p.evidenza.length > 220) return false;
    const def = CG_SEZIONI.flatMap(s => s.campi).find(c => c[0] === p.campo);
    const scelta = def?.[2] && CAMPI.find(c => c.k === def[2]);
    if (scelta && !scelta.valori.includes(p.valore.trim())) return false;
    viste.add(p.campo);
    return true;
  }).map(p => ({ campo: p.campo, valore: p.valore.trim(), evidenza: p.evidenza.trim() }));
}

function mostraProposteAI(proposte, id) {
  const contenitore = $('#cg-ai-risultati');
  contenitore.replaceChildren(...proposte.map(p => {
    const nome = CG_SEZIONI.flatMap(s => s.campi).find(c => c[0] === p.campo)?.[1] || p.campo;
    const attuale = $('#cg-form').elements.namedItem(p.campo)?.value.trim() || '';
    return el('div', { class: 'cg-ai-proposta' },
      el('strong', { testo: nome }),
      el('p', { testo: `Proposta: ${p.valore}` }),
      el('small', { testo: `Indicazione riportata dall’AI: «${p.evidenza}». Controlla la slide.` }),
      attuale ? el('p', { class: 'cg-ai-conflitto', testo: `Già compilato: ${attuale}. Correggi il campo manualmente se necessario.` }) :
        el('button', { type: 'button', class: 'btn', onclick: () => {
          if (cgSpecie !== id) return;
          const campo = $('#cg-form').elements.namedItem(p.campo);
          if (!campo || campo.readOnly || campo.disabled || campo.value.trim()) return;
          campo.value = p.valore;
          $('#cg-fonte').value = 'pagina';
          aggiornaModificheCatalogo();
          $('#cg-ai-stato').textContent = 'Proposta inserita nel modulo. Verifica e premi «Salva integrazioni».';
          mostraProposteAI(proposte, id);
        } }, 'Usa proposta'));
  }));
}

async function proponiCaratteriSlideAI() {
  const id = cgSpecie;
  if (!id) return;
  if (!navigator.onLine) { $('#cg-ai-stato').textContent = 'Sei offline: l’editor manuale resta disponibile.'; return; }
  const specie = GUIDA_ORIGINALE.get(id);
  const richiesta = ++cgAiRichiesta;
  const bottone = $('#cg-ai-proponi');
  bottone.disabled = true;
  $('#cg-ai-stato').textContent = 'Leggo la slide e preparo proposte da verificare…';
  $('#cg-ai-risultati').replaceChildren();
  try {
    const immagine = await fetch(`./slides/${specie.pagina}.webp`);
    if (!immagine.ok) throw new Error('Slide non disponibile.');
    const base64 = codificaBase64(new Uint8Array(await immagine.arrayBuffer()));
    const campi = CG_SEZIONI.flatMap(s => s.campi).filter(([k]) => !specie[k]).map(([k, label, scheda]) => {
      const scelta = scheda && CAMPI.find(c => c.k === scheda);
      return `${k} (${label}${scelta ? `; valori ammessi: ${scelta.valori.join(', ')}` : ''})`;
    }).join('; ');
    const istruzioni = `Analizza la slide del corso relativa a ${nomeCatalogo(specie)}. Usa solo caratteristiche ESPLICITAMENTE scritte nella slide o nella nota trascritta qui sotto; non dedurre tratti botanici dalle foto né inventare fonti. Restituisci soltanto JSON {"proposte":[{"campo":"...","valore":"...","evidenza":"breve frase presente nella slide"}]}. Campi ammessi: ${campi}. Non inventare valori se mancano. Nota trascritta: ${specie.note || ''}`;
    const proposte = normalizzaProposteAI(await richiediProposteSlideAI($('#cg-ai-fornitore').value, istruzioni, base64), specie);
    if (richiesta !== cgAiRichiesta || cgSpecie !== id) return;
    mostraProposteAI(proposte, id);
    $('#cg-ai-stato').textContent = proposte.length ?
      `${proposte.length} proposte da confrontare con la slide. Nessun dato è stato salvato automaticamente.` :
      'Nessuna nuova caratteristica utilizzabile trovata. Puoi continuare a compilare manualmente.';
  } catch (e) {
    if (richiesta === cgAiRichiesta && cgSpecie === id)
      $('#cg-ai-stato').textContent = 'Analisi non riuscita: ' + (e.name === 'TimeoutError' ? 'tempo scaduto.' :
        e instanceof SyntaxError ? 'risposta AI non valida.' : e instanceof TypeError ? 'connessione o accesso al servizio non disponibile.' : e.message);
  } finally { if (richiesta === cgAiRichiesta) bottone.disabled = false; }
}
const CG_SEZIONI = [
  { titolo: 'Chioma e rami', campi: [['chiomaForma', 'Forma chioma', 'formaChioma'], ['ramiForma', 'Forma rami'], ['ramiInserzione', 'Inserzione rami', 'rami'], ['crescita', 'Tipo di crescita', 'crescita'], ['estensione', 'Estensione delle gemme', 'estensione']] },
  { titolo: 'Foglie', campi: [['fogliaTipo', 'Tipo di foglia', 'tipoFoglia'], ['fogliaComposta', 'Foglia composta'], ['fogliaLamina', 'Forma lamina', 'lamina'], ['fogliaMargine', 'Margine fogliare', 'margine'], ['fogliaBase', 'Base della foglia'], ['fogliaApice', 'Apice della foglia']] },
  { titolo: 'Gemme', campi: [['gemmeForma', 'Forma'], ['gemmePosizione', 'Posizione'], ['gemmeOrientamento', 'Orientamento'], ['gemmeTipologia', 'Tipologia']] },
  { titolo: 'Altri caratteri', campi: [['corteccia', 'Corteccia'], ['fiore', 'Fiore'], ['frutto', 'Frutto'], ['habitat', 'Habitat']] },
];
const CG_CHIAVI = new Set([...CG_SEZIONI.flatMap(s => s.campi.map(c => c[0])), 'noteExtra']);
let cgSpecie = null;
let cgSporco = false;
let cgIstantanea = '';
let cgSalvando = false;

function validaIntegrazioniGuida(elenco) {
  if (!Array.isArray(elenco)) throw new Error('Integrazioni catalogo non valide');
  const ids = new Set();
  return elenco.map(v => {
    if (!v || typeof v !== 'object' || !GUIDA_ORIGINALE.has(v.id) || ids.has(v.id) ||
        !v.campi || typeof v.campi !== 'object' || Array.isArray(v.campi) ||
        !['pagina', 'osservazione', 'altro'].includes(v.fonte)) throw new Error('Integrazione catalogo non valida');
    ids.add(v.id);
    const base = GUIDA_ORIGINALE.get(v.id);
    const campi = {};
    for (const [k, valore] of Object.entries(v.campi)) {
      if (!CG_CHIAVI.has(k) || typeof valore !== 'string' || !valore.trim() || valore.length > 1000 || base[k])
        throw new Error('Campo del catalogo non valido');
      const def = CG_SEZIONI.flatMap(s => s.campi).find(c => c[0] === k);
      const scelta = def?.[2] && CAMPI.find(c => c.k === def[2]);
      if (scelta && !scelta.valori.includes(valore)) throw new Error('Scelta del catalogo non valida');
      campi[k] = valore.trim();
    }
    if (v.fontiCampi !== undefined && (!v.fontiCampi || typeof v.fontiCampi !== 'object' || Array.isArray(v.fontiCampi) ||
        Object.keys(v.fontiCampi).some(k => !campi[k] || !['pagina', 'osservazione', 'altro'].includes(v.fontiCampi[k]))))
      throw new Error('Fonti dei campi del catalogo non valide');
    return { id: v.id, campi, fonte: v.fonte, modificato: v.modificato || '',
      ...(v.fontiCampi ? { fontiCampi: { ...v.fontiCampi } } : {}) };
  });
}

function applicaIntegrazioniGuida() {
  const integrazioni = new Map(S.guida.map(v => [v.id, v]));
  for (const v of GUIDA_SPECIE) {
    const base = GUIDA_ORIGINALE.get(v.id);
    for (const k of CG_CHIAVI) if (!base[k]) delete v[k];
    Object.assign(v, base);
    for (const [k, valore] of Object.entries(integrazioni.get(v.id)?.campi || {})) {
      if (!base[k] && CG_CHIAVI.has(k)) v[k] = valore;
    }
  }
}

function listaCompletaGuida() {
  const q = $('#cg-cerca').value.trim().toLocaleLowerCase('it');
  const filtro = $('#cg-filtro').value;
  $('#cg-contatore').textContent = `${S.guida.length} di ${GUIDA_SPECIE.length} piante integrate · le modifiche sono incluse nel backup completo`;
  const risultanti = GUIDA_SPECIE.filter(v =>
    (!q || `${nomeCatalogo(v)} ${v.famiglia}`.toLocaleLowerCase('it').includes(q)) &&
    (filtro === 'tutte' || (filtro === 'integrate') === S.guida.some(g => g.id === v.id)));
  $('#cg-lista').replaceChildren(...risultanti.map(v => el('button', {
    type: 'button', class: 'cg-riga', onclick: () => apriPiantaCatalogo(v.id),
  }, el('strong', { class: 'specie', testo: nomeCatalogo(v) }),
     el('span', { testo: `${v.famiglia} · pagina ${v.pagina} · ${S.guida.some(g => g.id === v.id) ? 'integrata' : 'da integrare'}` }))));
  if (!risultanti.length) $('#cg-lista').append(el('p', { class: 'vuoto', testo: 'Nessuna pianta corrisponde ai filtri.' }));
}

function apriCompletaGuida() {
  cgSpecie = null; cgSporco = false; cgIstantanea = '';
  $('#cg-editor').classList.add('nascosto');
  $('#cg-lista').classList.remove('nascosto');
  $('#cg-cerca').value = '';
  $('#cg-filtro').value = 'tutte';
  $('#cg-messaggio').textContent = '';
  listaCompletaGuida();
  $('#dlg-completa-guida').showModal();
}

function confermaUscitaCatalogo() {
  if (cgSalvando) return false;
  aggiornaModificheCatalogo(false);
  return !cgSporco || confirm('Ci sono integrazioni non salvate. Vuoi abbandonarle?');
}

function campiInModificaCatalogo() {
  if (!cgSpecie) return { campi: {}, fonte: '' };
  const base = GUIDA_ORIGINALE.get(cgSpecie);
  const campi = {};
  for (const k of CG_CHIAVI) {
    if (base[k]) continue;
    const valore = $('#cg-form').elements.namedItem(k)?.value.trim();
    if (valore) campi[k] = valore;
  }
  return { campi, fonte: $('#cg-fonte').value };
}

function aggiornaModificheCatalogo(mostraStato = true) {
  cgSporco = !!cgSpecie && JSON.stringify(campiInModificaCatalogo()) !== cgIstantanea;
  if (mostraStato) $('#cg-stato').textContent = cgSporco ? 'Modifiche da salvare' : 'Nessuna modifica da salvare';
  return cgSporco;
}

function apriPiantaCatalogo(id, dopoSalvataggio = false) {
  if (!dopoSalvataggio && !confermaUscitaCatalogo()) return;
  const specie = GUIDA_SPECIE.find(v => v.id === id);
  if (!specie) return;
  cgSpecie = id; cgSporco = false;
  cgAiRichiesta++;
  $('#cg-ai-proponi').disabled = false;
  $('#cg-ai-risultati').replaceChildren();
  $('#cg-ai-stato').textContent = 'Le proposte AI vanno controllate sulla slide prima di salvarle.';
  const salvata = S.guida.find(v => v.id === id);
  $('#cg-lista').classList.add('nascosto');
  $('#cg-editor').classList.remove('nascosto');
  $('#cg-nome').textContent = nomeCatalogo(specie);
  $('#cg-info').textContent = `${specie.famiglia} · ${specie.divisione} · ${specie.tipologia} · grandezza ${specie.grandezza || '—'} · ${specie.provenienza || 'provenienza non indicata'}`;
  const pagina = $('#cg-slide');
  pagina.src = `./slides/${specie.pagina}.webp`;
  pagina.alt = `Pagina ${specie.pagina} della guida: ${nomeCatalogo(specie)}`;
  pagina.onclick = () => { $('#vista-img').src = pagina.src; $('#vista-foto').showModal(); };
  $('#cg-posizione').textContent = `${GUIDA_SPECIE.indexOf(specie) + 1} / ${GUIDA_SPECIE.length}`;
  $('#cg-fonte').value = salvata?.fonte || '';
  $('#cg-stato').textContent = salvata ? 'Integrazioni salvate su questo dispositivo.' : '';
  const base = GUIDA_ORIGINALE.get(id);
  $('#cg-form').replaceChildren(...CG_SEZIONI.map(sezione =>
    el('fieldset', { class: 'cg-gruppo' }, el('legend', { testo: sezione.titolo }),
      ...sezione.campi.map(([k, etichetta, scheda]) => {
        const originale = base[k];
        const valori = scheda && CAMPI.find(c => c.k === scheda)?.valori;
        const controllo = valori ? el('select', { class: 'campo-base', name: k, disabled: !!originale },
          el('option', { value: '' }, '— Da verificare —'), ...valori.map(v => el('option', { value: v, selected: v === (specie[k] || '') }, v))) :
          el('input', { type: 'text', class: 'campo-base', name: k, value: specie[k] || '', readOnly: !!originale,
            maxlength: 180, placeholder: 'Non indicato nella guida' });
        return el('label', { class: 'cg-campo ' + (originale ? 'cg-originale' : salvata?.campi[k] ? 'cg-integrato' : '') },
          el('span', { testo: etichetta }), controllo,
          el('small', { testo: originale ? 'Dal materiale originale · non modificabile' : salvata?.campi[k] ?
            `Integrazione modificabile · fonte: ${{ pagina: 'slide del corso', osservazione: 'osservazione', altro: 'altra fonte' }[salvata.fontiCampi?.[k] || salvata.fonte] || 'da verificare'}` : 'Da verificare sulla pagina' }));
      }))));
  $('#cg-form').append(el('label', { class: 'cg-campo cg-note' },
    el('span', { testo: 'Nota originale (solo lettura)' }),
    el('textarea', { readOnly: true, rows: 3 }, base.note || 'Nessuna nota'),
    el('span', { testo: 'Ulteriori note sulla specie' }),
    el('textarea', { name: 'noteExtra', rows: 3, maxlength: 1000, placeholder: 'Solo informazioni verificabili, con la fonte indicata sotto' }, salvata?.campi.noteExtra || '')));
  cgIstantanea = JSON.stringify(campiInModificaCatalogo());
  $('#cg-editor').scrollIntoView({ block: 'start' });
}

async function salvaIntegrazioneGuida() {
  if (!cgSpecie || cgSalvando) return;
  const { campi, fonte } = campiInModificaCatalogo();
  if (Object.keys(campi).length && !fonte) {
    $('#cg-stato').textContent = 'Salvataggio non eseguito: seleziona la fonte dei dati.';
    $('#cg-stato').classList.add('cg-errore');
    $('#cg-fonte').focus(); return;
  }
  if (!aggiornaModificheCatalogo(false)) { $('#cg-stato').textContent = 'Nessuna nuova modifica da salvare.'; return; }
  cgSalvando = true;
  $('#cg-salva').disabled = true;
  $('#cg-stato').classList.remove('cg-errore');
  $('#cg-stato').textContent = 'Salvataggio in corso…';
  try {
    const precedente = S.guida.find(v => v.id === cgSpecie);
    const fontiCampi = {};
    for (const [k, valore] of Object.entries(campi))
      fontiCampi[k] = precedente?.campi[k] === valore ? (precedente.fontiCampi?.[k] || precedente.fonte) : fonte;
    const voce = { id: cgSpecie, campi, fonte: fonte || 'pagina', fontiCampi, modificato: oraISO() };
    validaIntegrazioniGuida([voce]);
    if (Object.keys(campi).length) await DB.scrivi('guida', voce);
    else await DB.cancella('guida', cgSpecie);
    S.guida = S.guida.filter(v => v.id !== cgSpecie);
    if (Object.keys(campi).length) S.guida.push(voce);
    applicaIntegrazioniGuida();
    cgSporco = false;
    listaCompletaGuida();
    if (S.aperta) confrontaConCatalogo();
    apriPiantaCatalogo(cgSpecie, true);
    $('#cg-stato').textContent = Object.keys(campi).length ? `Salvataggio completato: ${Object.keys(campi).length} campi. Puoi uscire.` : 'Integrazioni rimosse e salvataggio completato. Puoi uscire.';
  } catch (e) {
    $('#cg-stato').textContent = 'Salvataggio non riuscito: ' + e.message;
    $('#cg-stato').classList.add('cg-errore');
  } finally { cgSalvando = false; $('#cg-salva').disabled = false; }
}

function esportaIntegrazioniGuida() {
  if (!S.guida.length) { $('#cg-messaggio').textContent = 'Nessuna integrazione salvata da esportare. Le 144 pagine originali sono già incluse nel progetto.'; return; }
  const json = { tipo: 'scheda-botanica-guida', versione: 1, esportato: oraISO(), voci: S.guida };
  scarica(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `scheda-botanica-catalogo-${oggi()}.json`);
  $('#cg-messaggio').textContent = `${S.guida.length} piante integrate esportate. Incluse tutte le integrazioni salvate anche nelle sessioni precedenti.`;
}

function esportaCatalogoCompleto() {
  const json = {
    tipo: 'scheda-botanica-catalogo-completo', versione: 1, esportato: oraISO(),
    piante: GUIDA_SPECIE, integrazioni: S.guida,
  };
  scarica(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), `scheda-botanica-144-piante-${oggi()}.json`);
  $('#cg-messaggio').textContent = `Esportate ${GUIDA_SPECIE.length} piante e ${S.guida.length} integrazioni salvate. Le immagini delle pagine sono già nell’app.`;
}

function validaCatalogoCompleto(dato) {
  if (dato?.tipo !== 'scheda-botanica-catalogo-completo' || dato.versione !== 1 ||
      !Array.isArray(dato.piante) || dato.piante.length !== GUIDA_ORIGINALE.size)
    throw new Error('File non valido: servono tutte le 144 piante del catalogo esportato dall’app');
  const integrazioni = validaIntegrazioniGuida(dato.integrazioni);
  const perId = new Map(integrazioni.map(v => [v.id, v.campi]));
  const visti = new Set();
  for (const pianta of dato.piante) {
    if (!pianta || typeof pianta !== 'object' || Array.isArray(pianta) ||
        !GUIDA_ORIGINALE.has(pianta.id) || visti.has(pianta.id))
      throw new Error('Catalogo incompleto o con piante duplicate');
    visti.add(pianta.id);
    const attesa = { ...GUIDA_ORIGINALE.get(pianta.id), ...perId.get(pianta.id) };
    const chiavi = Object.keys(attesa);
    if (Object.keys(pianta).length !== chiavi.length || chiavi.some(k => pianta[k] !== attesa[k]))
      throw new Error(`I dati di ${attesa.nomeSci} non corrispondono alla guida installata o alle integrazioni: importazione annullata`);
  }
  return integrazioni;
}

async function importaCatalogoCompleto(file) {
  if (!file || !confermaUscitaCatalogo()) return;
  if (file.size > 5_000_000) { $('#cg-messaggio').textContent = 'File troppo grande per il catalogo delle 144 piante.'; return; }
  try {
    const integrazioni = validaCatalogoCompleto(JSON.parse(await file.text()));
    if (!confirm(`Il catalogo importato contiene 144 piante e ${integrazioni.length} integrazioni. Sostituire le ${S.guida.length} integrazioni attuali? Le schede di rilievo resteranno intatte.`)) return;
    await DB.sostituisciGuida(integrazioni);
    S.guida = integrazioni;
    applicaIntegrazioniGuida();
    cgSpecie = null; cgSporco = false; cgIstantanea = '';
    $('#cg-editor').classList.add('nascosto');
    $('#cg-lista').classList.remove('nascosto');
    listaCompletaGuida();
    if (S.aperta) confrontaConCatalogo();
    $('#cg-messaggio').textContent = `Catalogo importato: 144 piante e ${integrazioni.length} integrazioni salvate. Schede di rilievo inalterate.`;
  } catch (e) { $('#cg-messaggio').textContent = 'Importazione non riuscita: ' + e.message; }
}

async function importaIntegrazioniGuida(file) {
  if (!file) return;
  if (!confermaUscitaCatalogo()) return;
  if (file.size > 2_000_000) { $('#cg-messaggio').textContent = 'File troppo grande per il catalogo.'; return; }
  try {
    const dato = JSON.parse(await file.text());
    if (dato?.tipo !== 'scheda-botanica-guida' || dato.versione !== 1) throw new Error('Seleziona un file di integrazioni del catalogo esportato dall’app');
    const voci = validaIntegrazioniGuida(dato.voci);
    const esistenti = new Map(S.guida.map(v => [v.id, v]));
    const modificate = [];
    let nuove = 0, aggiunti = 0, conservati = 0;
    for (const voce of voci) {
      const precedente = esistenti.get(voce.id);
      if (!precedente) { modificate.push(voce); nuove++; aggiunti += Object.keys(voce.campi).length; continue; }
      const campi = { ...precedente.campi };
      const fontiCampi = { ...(precedente.fontiCampi || {}) };
      let cambiati = 0;
      for (const [k, valore] of Object.entries(voce.campi)) {
        if (campi[k]) { conservati++; continue; }
        campi[k] = valore;
        fontiCampi[k] = voce.fontiCampi?.[k] || voce.fonte;
        cambiati++; aggiunti++;
      }
      if (cambiati) modificate.push({ ...precedente, campi, fontiCampi, modificato: oraISO() });
    }
    if (modificate.length) {
      const unite = new Map(S.guida.map(v => [v.id, v]));
      for (const voce of modificate) unite.set(voce.id, voce);
      const verificate = validaIntegrazioniGuida([...unite.values()]);
      await DB.sostituisciGuida(verificate);
      S.guida = verificate;
    }
    applicaIntegrazioniGuida();
    cgSpecie = null; cgSporco = false; cgIstantanea = '';
    $('#cg-editor').classList.add('nascosto');
    $('#cg-lista').classList.remove('nascosto');
    listaCompletaGuida();
    $('#cg-messaggio').textContent = `Importazione completata: ${nuove} nuove piante, ${aggiunti} campi aggiunti. ${conservati} campi già compilati conservati.`;
  } catch (e) { $('#cg-messaggio').textContent = 'Importazione non riuscita: ' + e.message; }
}

function cambiaPiantaCatalogo(passo) {
  if (!cgSpecie) return;
  const indice = GUIDA_SPECIE.findIndex(v => v.id === cgSpecie) + passo;
  if (indice >= 0 && indice < GUIDA_SPECIE.length) apriPiantaCatalogo(GUIDA_SPECIE[indice].id);
}

// I campi strutturati del catalogo sono pieni solo per una minoranza delle
// 144 specie (il materiale del corso li cita solo quando sono utili per
// quella specie). Per non perdere le altre, quando manca il dato
// strutturato si cerca comunque la parola corrispondente nel testo
// descrittivo — un indizio più debole, ma molto più spesso presente.
const GS_PAROLE_CHIAVE = {
  persistenza: { sempreverde: ['sempreverde'], caduca: ['caducifogli', 'caduc'], semisempreverde: ['sempreverde'], semicaduca: ['caduc'] },
  formaChioma: {
    piramidale: ['piramidal'], 'a cono': ['piramidal', 'conic'], espansa: ['espans'], globosa: ['globos'],
    colonnare: ['colonnar', 'fastigiat'], 'a ombrello': ['ombrell'], piangente: ['piangent'],
  },
  rami: { opposti: ['oppost'], alterni: ['altern'], verticillati: ['verticill'] },
  tipoFoglia: { aghiforme: ['aghiform', 'aghi'], semplice: ['semplice'], composta: ['compost'], squamiforme: ['squam'] },
  lamina: { ovata: ['ovat'], lanceolata: ['lanceolat'], ellittica: ['ellittic'], aghiforme: ['aghiform'], squamiforme: ['squam'], palmata: ['palmat'] },
  margine: { intero: ['margine inter'], seghettato: ['seghettat'], dentato: ['dentat'], lobato: ['lobat'], ondulato: ['ondulat'] },
};

// Restituisce 'dato' (corrisponde un campo strutturato del catalogo),
// 'testo' (trovata solo nel testo descrittivo) o null (nessuna corrispondenza).
function corrispondeCaratteristica(v, campo, valore) {
  if (campo === 'persistenza') {
    const t = v.tipologia;
    if ((valore === 'sempreverde' || valore === 'semisempreverde') && (t === 'sempreverde' || t === 'ex palme')) return 'dato';
    if ((valore === 'caduca' || valore === 'semicaduca') && t === 'caducifoglia') return 'dato';
  } else {
    const campoGuida = GS_CAMPO_GUIDA[campo];
    if (campoGuida && v[campoGuida] && v[campoGuida].toLowerCase() === valore.toLowerCase()) return 'dato';
  }
  const parole = (GS_PAROLE_CHIAVE[campo] && GS_PAROLE_CHIAVE[campo][valore]) || [];
  const nota = `${v.note || ''} ${v.noteExtra || ''}`.toLowerCase();
  return parole.some((p) => nota.includes(p)) ? 'testo' : null;
}

function punteggioCaratteristiche(v, filtri) {
  let punti = 0, totale = 0;
  for (const [campo, valore] of Object.entries(filtri.campi)) {
    if (!valore) continue;
    totale++;
    if (corrispondeCaratteristica(v, campo, valore)) punti++;
  }
  if (filtri.grandezza) { totale++; if (v.grandezza === filtri.grandezza) punti++; }
  if (filtri.altro) { totale++; if (`${v.note || ''} ${v.noteExtra || ''} ${v.corteccia || ''} ${v.fiore || ''} ${v.frutto || ''} ${v.habitat || ''}`.toLowerCase().includes(filtri.altro)) punti++; }
  return { punti, totale };
}

function leggiFiltriCaratteristiche() {
  return {
    campi: {
      persistenza: $('#gs-c-persistenza').value, formaChioma: $('#gs-c-formaChioma').value, rami: $('#gs-c-rami').value,
      tipoFoglia: $('#gs-c-tipoFoglia').value, lamina: $('#gs-c-lamina').value, margine: $('#gs-c-margine').value,
    },
    grandezza: $('#gs-c-grandezza').value,
    altro: $('#gs-c-altro').value.trim().toLowerCase(),
  };
}

// null = nessun criterio impostato (non ha senso mostrare un punteggio).
function risultatiPerCaratteristiche() {
  const filtri = leggiFiltriCaratteristiche();
  if (Object.values(filtri.campi).every((v) => !v) && !filtri.grandezza && !filtri.altro) return null;
  return GUIDA_SPECIE
    .map((v) => ({ v, ...punteggioCaratteristiche(v, filtri) }))
    .filter((r) => r.punti > 0)
    .sort((a, b) => b.punti - a.punti || a.v.nomeSci.localeCompare(b.v.nomeSci, 'it'))
    .slice(0, 30);
}

function popolaSelectCaratteristica(id, valori) {
  $(id).replaceChildren(el('option', { value: '' }, '—'),
    ...valori.map((v) => el('option', { value: v }, v.charAt(0).toUpperCase() + v.slice(1))));
}

function inizializzaSelectCaratteristiche() {
  const campo = (k) => CAMPI.find((c) => c.k === k).valori;
  popolaSelectCaratteristica('#gs-c-persistenza', campo('persistenza'));
  popolaSelectCaratteristica('#gs-c-formaChioma', campo('formaChioma'));
  popolaSelectCaratteristica('#gs-c-rami', campo('rami'));
  popolaSelectCaratteristica('#gs-c-tipoFoglia', campo('tipoFoglia'));
  popolaSelectCaratteristica('#gs-c-lamina', campo('lamina'));
  popolaSelectCaratteristica('#gs-c-margine', campo('margine'));
  $('#gs-c-grandezza').replaceChildren(
    el('option', { value: '' }, '—'), el('option', { value: '1' }, '1ª grandezza (maggiore)'),
    el('option', { value: '2' }, '2ª grandezza'), el('option', { value: '3' }, '3ª grandezza'));
  // (il catalogo del corso non arriva a citare una 4ª classe)
}

let guidaSpecieModo = 'nome'; // 'nome' | 'carat' | 'foto'

function cambiaModoGuidaSpecie(modo) {
  WEB_RICERCA.serie++;
  guidaSpecieModo = modo;
  $('#gs-modo-nome').setAttribute('aria-selected', String(modo === 'nome'));
  $('#gs-modo-carat').setAttribute('aria-selected', String(modo === 'carat'));
  $('#gs-modo-foto').setAttribute('aria-selected', String(modo === 'foto'));
  $('#gs-cerca').classList.toggle('nascosto', modo !== 'nome');
  $('#gs-carat-pannello').classList.toggle('nascosto', modo !== 'carat');
  $('#gs-foto-pannello').classList.toggle('nascosto', modo !== 'foto');
  $('#gs-lista').classList.toggle('nascosto', modo === 'foto');
  $('#gs-dettaglio').classList.add('nascosto');
  if (modo === 'foto') disegnaFotoEsistentiGuida();
}

// Nella modalità "Per foto", propone anche le foto già scattate per questa
// scheda (non solo scattarne/sceglierne di nuove): comodo se la foto buona
// per l'identificazione ce l'hai già.
async function disegnaFotoEsistentiGuida() {
  const blocco = $('#gs-foto-esistenti-blocco');
  const cont = $('#gs-foto-esistenti');
  const scheda = S.aperta;
  const foto = scheda?.foto || [];
  blocco.classList.toggle('nascosto', !foto.length);
  if (!foto.length) return;
  const pulsanti = await Promise.all(foto.map(async (p) =>
    el('button', { type: 'button', class: 'gs-foto-esistente', 'aria-label': 'Usa questa foto per l\u2019identificazione', onclick: () => {
      if (S.aperta !== scheda) return;
      $('#dlg-guida-specie').close(); apriIdentificazione(scheda, p);
    } }, el('img', { src: await urlFoto(p.id), alt: '' }))));
  if (S.aperta === scheda) cont.replaceChildren(...pulsanti);
}

function risultatiGuidaSpecie(q) {
  q = (q || '').trim().toLowerCase();
  const lista = q ? GUIDA_SPECIE.filter((v) => (v.nomeSci + ' ' + v.famiglia + ' ' + (v.varieta || '')).toLowerCase().includes(q)) : GUIDA_SPECIE;
  return lista.slice().sort((a, b) => a.nomeSci.localeCompare(b.nomeSci, 'it'));
}

// Nomi già presenti nell'archivio (per il segno "✓ già rilevata" nell'elenco della guida).
function nomiGiaRilevati() {
  return new Set(S.schede.map((r) => (r.nome || '').trim().toLowerCase()).filter(Boolean));
}

function disegnaListaGuidaSpecie() {
  WEB_RICERCA.serie++;
  $('#gs-dettaglio').classList.add('nascosto');
  if (guidaSpecieModo === 'foto') { $('#gs-lista').classList.add('nascosto'); return; }
  $('#gs-lista').classList.remove('nascosto');
  const gia = nomiGiaRilevati();

  if (guidaSpecieModo === 'carat') {
    const risultati = risultatiPerCaratteristiche();
    if (risultati === null) { $('#gs-lista').replaceChildren(el('p', { class: 'vuoto' }, 'Imposta almeno una caratteristica qui sopra.')); return; }
    if (!risultati.length) { $('#gs-lista').replaceChildren(el('p', { class: 'vuoto' }, 'Nessuna specie corrisponde a queste caratteristiche.')); return; }
    $('#gs-lista').replaceChildren(...risultati.map(({ v, punti, totale }) => {
      const trovata = gia.has(v.nomeSci.toLowerCase());
      return el('button', { type: 'button', class: 'gs-riga', onclick: () => mostraDettaglioGuidaSpecie(v) },
        el('b', { class: 'specie', testo: v.nomeSci + (v.varieta ? ` '${v.varieta}'` : '') }),
        el('span', { class: 'gs-punteggio', testo: `${v.famiglia} · ${punti}/${totale} caratteristiche` + (trovata ? ' · ✓ già rilevata' : '') }));
    }));
    return;
  }

  const q = $('#gs-cerca').value.trim();
  const ris = risultatiGuidaSpecie(q);
  if (!ris.length) {
    $('#gs-lista').replaceChildren(
      el('p', { class: 'vuoto' }, 'Nessuna specie trovata nel catalogo del corso.' + (S.aperta ? ' Prova "📷 Per foto" qui sopra, o cerca il nome sotto.' : '')),
      q ? el('button', { type: 'button', class: 'btn', style: 'margin-top:8px;width:100%', onclick: () => cercaSulWeb(q) }, `🌐 Cerca "${q}" su Wikipedia (solo per il nome)`) : null);
    return;
  }
  $('#gs-lista').replaceChildren(...ris.map((v) => {
    const trovata = gia.has(v.nomeSci.toLowerCase());
    return el('button', { type: 'button', class: 'gs-riga', onclick: () => mostraDettaglioGuidaSpecie(v) },
      el('b', { class: 'specie', testo: v.nomeSci + (v.varieta ? ` '${v.varieta}'` : '') }),
      el('span', { style: 'font-size:12px;color:var(--tenue)' }, v.famiglia, trovata ? ' · ✓ già rilevata' : null));
  }));
}

function schedaGuidaSpecie(v) {
  const integrazione = S.guida.find(g => g.id === v.id);
  const righe = [
    v.famiglia && `Famiglia: ${v.famiglia}`,
    v.tipologia && `Tipologia: ${GS_TIPOLOGIA_ETICHETTA[v.tipologia] || v.tipologia}`,
    v.grandezza && `Classe di grandezza: ${v.grandezza}ª`,
    v.provenienza && `Provenienza: ${v.provenienza}`,
  ].filter(Boolean);
  const chip = Object.keys(GS_CHIP_ETICHETTA).filter((k) => v[k]).map((k) =>
    `${GS_CHIP_ETICHETTA[k]}: ${v[k]}${integrazione?.campi[k] ? ' (integrato)' : ''}`);
  const srcSlide = v.pagina ? `./slides/${v.pagina}.webp` : null;
  return el('div', {},
    srcSlide ? el('img', {
      src: srcSlide, alt: `Slide ${v.pagina} del PDF del corso`, loading: 'lazy',
      style: 'width:100%;border-radius:var(--r-piccolo);border:1.5px solid var(--linea);cursor:zoom-in;margin-bottom:10px',
      onclick: () => { $('#vista-img').src = srcSlide; $('#vista-foto').showModal(); },
      onerror: (e) => e.target.remove(),   // slide non disponibile (es. cartella slides/ non caricata): sparisce invece di mostrare un'icona rotta
    }) : null,
    el('h3', { class: 'specie', style: 'margin:0 0 2px' }, v.nomeSci + (v.varieta ? ` '${v.varieta}'` : '')),
    integrazione ? el('p', { style: 'font-size:12px;color:var(--tenue);margin:2px 0 8px',
      testo: `Integrazioni salvate: ${integrazione.fonte === 'pagina' ? 'pagina del corso' : integrazione.fonte === 'osservazione' ? 'osservazione personale' : 'altra fonte verificata'}.` }) : null,
    el('p', { style: 'font-size:13px;color:var(--tenue);margin:0 0 8px', testo: righe.join(' · ') }),
    chip.length ? el('p', { style: 'font-size:12.5px;margin:0 0 8px', testo: chip.join(' · ') }) : null,
    v.note ? el('p', { style: 'font-size:13.5px;line-height:1.5;margin:0', testo: v.note }) : null,
    v.noteExtra ? el('p', { style: 'font-size:13px;line-height:1.5;margin:8px 0 0', testo: `Integrazione: ${v.noteExtra}` }) : null,
    v.pagina ? el('p', { style: 'font-size:11.5px;color:var(--tenue);margin:8px 0 0', testo: `Slide ${v.pagina} del PDF del corso` }) : null,
    S.aperta ? el('button', { type: 'button', class: 'btn primario', style: 'margin-top:12px', onclick: () => usaNomeDaGuidaSpecie(v) }, '✓ Usa questo nome nella scheda') : null);
}

function mostraDettaglioGuidaSpecie(v) {
  $('#gs-lista').classList.add('nascosto');
  const dett = $('#gs-dettaglio');
  dett.classList.remove('nascosto');
  dett.replaceChildren(
    el('button', { type: 'button', class: 'btn', style: 'margin-bottom:12px', onclick: disegnaListaGuidaSpecie }, '← Elenco'),
    schedaGuidaSpecie(v));
}

const GS_CAMPI_SCHEDA = ['persistenza', 'formaChioma', 'rami', 'tipoFoglia', 'lamina', 'margine'];

// Copia nei filtri "Per caratteristiche" quello che è già scritto nella
// scheda aperta — così non tocchi due volte le stesse informazioni.
function precompilaCaratteristicheDaScheda() {
  if (!S.aperta) return;
  for (const k of GS_CAMPI_SCHEDA) $('#gs-c-' + k).value = S.aperta[k] || '';
  $('#gs-c-grandezza').value = S.aperta.grandezza || '';
  $('#gs-c-altro').value = '';
}

function apriGuidaSpecie(filtroIniziale) {
  $('#gs-modo-foto').classList.toggle('nascosto', !S.aperta);
  const schedaHaCaratteristiche = S.aperta && GS_CAMPI_SCHEDA.some((k) => S.aperta[k]);
  if (!filtroIniziale && schedaHaCaratteristiche) {
    // Aperta dal pulsante nel campo nome, nome ancora vuoto ma altri campi già
    // compilati: precompiliamo la ricerca per caratteristiche con quelli.
    cambiaModoGuidaSpecie('carat');
    precompilaCaratteristicheDaScheda();
    $('#gs-c-altro').value = '';
  } else {
    cambiaModoGuidaSpecie('nome');
    $('#gs-cerca').value = filtroIniziale || '';
  }
  disegnaListaGuidaSpecie();
  $('#dlg-guida-specie').showModal();
}

function cercaNomeDaScheda() {
  const nome = $('#f-nome').value.trim();
  apriGuidaSpecie(nome);
  if (nome) cercaSulWeb(nome);
}

function cercaCaratteristicheDaScheda() {
  apriGuidaSpecie('');
  cambiaModoGuidaSpecie('carat');
  precompilaCaratteristicheDaScheda();
  disegnaListaGuidaSpecie();
}

const AUTO_RICERCA = { serie: 0 };

// Il nome guida la ricerca; pochi caratteri generici non devono escluderlo.
function nomeRicercaNormalizzato(nome) {
  return String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

function distanzaNomeRicerca(a, b) {
  let riga = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nuova = [i];
    for (let j = 1; j <= b.length; j++) nuova[j] = Math.min(nuova[j - 1] + 1, riga[j] + 1, riga[j - 1] + Number(a[i - 1] !== b[j - 1]));
    riga = nuova;
  }
  return riga[b.length];
}

function attinenzaNomeRicerca(nome, nomeSci, catalogo = nomeSci) {
  const q = nomeRicercaNormalizzato(nome), s = nomeRicercaNormalizzato(nomeSci), c = nomeRicercaNormalizzato(catalogo);
  if (!q) return 0;
  if (q === c) return 4;
  if (q === s) return 3;
  if (c.startsWith(q + ' ') || (q.length >= 3 && !q.includes(' ') && s.startsWith(q))) return 2;
  const parti = q.split(' '), scientifico = s.split(' ');
  // Suggerimento conservativo: un solo carattere errato in un binomio completo.
  if (parti.length !== 2 || scientifico.length !== 2 || parti.some(p => p.length < 4)) return 0;
  const distanza = parti.reduce((somma, p, i) => somma + distanzaNomeRicerca(p, scientifico[i]), 0);
  return distanza === 1 ? 1 : 0;
}

function descriviRicerca(titolo, descrizione) {
  $('#auto-titolo').textContent = titolo;
  $('#auto-spiega').textContent = descrizione + ' I dati non cambiano finché non confermi un risultato.';
}

async function cercaPlantNetDaScheda() {
  const r = S.aperta;
  if (!r) return;
  descriviRicerca('Ricerca nel catalogo PlantNet', 'Ricerca per nome, non identificazione dell’esemplare. Nessuna foto viene inviata. Puoi aprire la scheda esterna della specie senza cambiare il rilievo.');
  const serie = ++AUTO_RICERCA.serie;
  const attuale = () => serie === AUTO_RICERCA.serie && S.aperta === r && $('#dlg-cerca-auto').open;
  const nome = $('#f-nome').value.trim();
  $('#auto-risultati').replaceChildren();
  $('#auto-stato').textContent = 'Cerco il nome nel catalogo botanico PlantNet…';
  $('#dlg-cerca-auto').showModal();
  try {
    if (!navigator.onLine) throw new Error('Sei offline: PlantNet richiede Internet; la guida locale resta disponibile.');
    if (!nome) throw new Error('Inserisci un nome prima della ricerca PlantNet, oppure usa «Cerca da foto».');
    if (!chiavePlantNet()) throw new Error('Manca la chiave PlantNet: inseriscila da «+ Opzioni → Backup e configurazione → Chiave PlantNet». Non è una chiave AI di open.env.');
    const base = trovaSpecieGuida(nome)?.nomeSci || nome.replace(/\s+[\x27\u2018].*$/, '').trim();
    let lista = await ServiziRicerca.plantnetNome(base, chiavePlantNet());
    if (!attuale()) return;
    if (!lista.length) {
      $('#auto-stato').textContent = 'Nome non trovato direttamente: verifico su Wikipedia il corrispondente nome botanico…';
      const scientifico = await nomeWikipediaAuto(nome);
      if (!attuale()) return;
      if (scientifico && scientifico.toLowerCase() !== base.toLowerCase()) lista = await ServiziRicerca.plantnetNome(scientifico, chiavePlantNet());
    }
    if (!attuale()) return;
    const candidati = new Map(lista.map(v => [v.nome.toLowerCase(), { ...v, plantnet: true, guida: trovaSpecieGuida(v.nome) }]));
    disegnaRisultatiAuto(candidati);
    $('#auto-stato').textContent = lista.length ? `${lista.length} risultati nel catalogo PlantNet (al massimo 20). Apri la pagina della specie o conferma il nome. Le varietà coltivate non sono determinate dalla sola corrispondenza del nome.` :
      'Nessuna specie trovata per questo nome. Prova il genere o il nome scientifico, oppure «Cerca da foto». Nessun dato modificato.';
  } catch (e) { if (attuale()) $('#auto-stato').textContent = e.message; }
}

async function cercaGbifDaScheda() {
  const r = S.aperta;
  if (!r) return;
  descriviRicerca('Verifica del nome su GBIF', 'Il nome viene confrontato con taxa del regno Plantae. Il punteggio riguarda la corrispondenza del nome, non la certezza che la pianta osservata sia quella specie.');
  const serie = ++AUTO_RICERCA.serie;
  const attuale = () => serie === AUTO_RICERCA.serie && S.aperta === r && $('#dlg-cerca-auto').open;
  $('#auto-risultati').replaceChildren();
  $('#auto-stato').textContent = 'Verifico il nome nel catalogo GBIF, regno Plantae…';
  $('#dlg-cerca-auto').showModal();
  try {
    if (!navigator.onLine) throw new Error('Sei offline: GBIF richiede Internet.');
    const nome = $('#f-nome').value.trim();
    if (!nome) throw new Error('Inserisci il nome della pianta prima di cercare su GBIF.');
    let q = trovaSpecieGuida(nome)?.nomeSci || nome;
    let dati = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(q)}&kingdom=Plantae`);
    if (!attuale()) return;
    if (!ServiziRicerca.gbifBotanico(dati)) {
      q = await nomeWikipediaAuto(nome);
      if (!attuale()) return;
      if (q) dati = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(q)}&kingdom=Plantae`);
    }
    if (!attuale()) return;
    if (!ServiziRicerca.gbifBotanico(dati)) throw new Error('GBIF non conferma una specie vegetale precisa. Un genere, una corrispondenza incerta o un taxon non botanico non vengono applicati.');
    const nomeSci = dati.canonicalName || q;
    disegnaRisultatiAuto(new Map([[nomeSci, { nome: nomeSci, gbifId: dati.usageKey, gbif: dati.confidence, guida: trovaSpecieGuida(nomeSci) }]]));
    $('#auto-risultati').prepend(el('a', { class: 'btn', target: '_blank', rel: 'noopener', href: `https://www.gbif.org/species/${dati.usageKey}` }, 'Apri scheda GBIF ↗'));
    $('#auto-stato').textContent = 'Nome verificato nel regno vegetale. GBIF verifica il taxon, non identifica l’albero che stai osservando.';
  } catch (e) { if (attuale()) $('#auto-stato').textContent = e.message; }
}

async function jsonAuto(url, opzioni = {}) {
  return ServiziRicerca.json(url, opzioni);
}

// P225 identifica un taxon, ma può riferirsi anche ad animali o funghi.
// Il controllo esplicito del regno evita di proporre risultati fuori botanica.
async function primoRisultatoWikipediaBotanico(q) {
  const risultati = await jsonAuto(`https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`);
  let serviziFalliti = false;
  for (const voce of (risultati?.query?.search || []).slice(0, 5)) {
    try {
      const titolo = voce.title;
      if (!titolo) continue;
      const pagine = await jsonAuto(`https://it.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titolo)}&prop=pageprops&format=json&origin=*`);
      const qid = Object.values(pagine?.query?.pages || {})[0]?.pageprops?.wikibase_item;
      if (!/^Q\d+$/.test(qid || '')) continue;
      const dati = await jsonAuto(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
      const nome = dati?.entities?.[qid]?.claims?.P225?.[0]?.mainsnak?.datavalue?.value;
      if (typeof nome !== 'string' || !nome.trim()) continue;
      const gbif = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(nome.trim())}&kingdom=Plantae`);
      if (ServiziRicerca.gbifBotanico(gbif, true)) {
        return { titolo, nomeSci: nome.trim() };
      }
    } catch { serviziFalliti = true; }
  }
  if (serviziFalliti) throw new Error('classificazione botanica non disponibile');
  return null;
}

async function nomeWikipediaAuto(q) {
  return (await primoRisultatoWikipediaBotanico(q))?.nomeSci || null;
}

async function fotoPlantNetAuto(foto) {
  const blob = await DB.leggi('foto', foto.id);
  if (!blob) throw new Error('foto non disponibile nel dispositivo');
  const form = new FormData();
  form.append('images', blob, 'foto.jpg');
  form.append('organs', 'auto');
  const dati = await richiestaFotoPlantNet(`https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(chiavePlantNet())}&lang=it&include-related-images=false`, form);
  return (dati?.results || []).slice(0, 5).map(r => ({
    nome: r.species?.scientificNameWithoutAuthor || r.species?.scientificName,
    nomeCompleto: r.species?.scientificName || '',
    percentuale: Math.round(Math.max(0, Math.min(1, Number(r.score) || 0)) * 100),
    gbifId: r.gbif?.id || '',
  })).filter(r => r.nome);
}

async function richiestaFotoPlantNet(url, form) {
  try { return await ServiziRicerca.json(url, { method: 'POST', body: form }, 60000, 'PlantNet · foto'); }
  catch (e) {
    if (e.status === 404) throw new Error('PlantNet: nessuna pianta riconosciuta con questa foto (404). Prova una sola foglia o un fiore ben a fuoco e scegli l’organo.');
    throw e;
  }
}

function fornitoreRicercaAI() {
  const disponibili = {
    gemini: Boolean(chiaviAI.GEMINI_API_KEY || chiaviAI.GOOGLE_API_KEY),
    groq: Boolean(chiaviAI.GROQ_API_KEY),
    openrouter: Boolean(chiaviAI.OPENROUTER_API_KEY),
  };
  const impostato = $('#ai-ricerca-servizio')?.value;
  const preferito = impostato && impostato !== 'auto' ? impostato : $('#cg-ai-fornitore')?.value;
  if (impostato && impostato !== 'auto' && !disponibili[preferito]) return null;
  const nome = disponibili[preferito] ? preferito : Object.keys(disponibili).find(k => disponibili[k]);
  if (!nome) return null;
  return { nome, etichetta: { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' }[nome] };
}

function datiRicercaAI(r) {
  const caratteristiche = {};
  for (const k of [...GS_CAMPI_SCHEDA, 'crescita', 'estensione', 'grandezza', 'altezza', 'circonferenza', 'terreno']) {
    if (!r[k]) continue;
    caratteristiche[CAMPI.find(c => c.k === k)?.label || k] = String(r[k]).slice(0, 160);
  }
  return { nomeInserito: String($('#f-nome')?.value || r.nome || '').trim().slice(0, 160), caratteristiche };
}

async function richiediRicercaSpecieAI(r) {
  const serie = AUTO_RICERCA.serie;
  const attiva = () => serie === AUTO_RICERCA.serie && S.aperta === r && $('#dlg-cerca-auto').open;
  const fornitore = fornitoreRicercaAI();
  if (!fornitore) throw new Error('Carica open.env da «+ Opzioni → Backup e configurazione» e scegli Gemini, Groq o OpenRouter.');
  const osservazioni = datiRicercaAI(r);
  if (!osservazioni.nomeInserito && !Object.keys(osservazioni.caratteristiche).length)
    throw new Error('Inserisci un nome o almeno una caratteristica botanica prima della ricerca AI.');
  const istruzioni = `Sei un assistente di identificazione botanica prudente. Proponi al massimo 4 taxa vegetali compatibili con questi dati: ${JSON.stringify(osservazioni)}. Usa soltanto nomi scientifici binomiali (genere e specie); non inventare taxa e non proporre animali, funghi o nomi soltanto di genere. La percentuale è una stima orientativa basata esclusivamente sui dati forniti, non una certezza. Rispondi esclusivamente con JSON nel formato {"candidati":[{"nomeScientifico":"Genere specie","percentuale":0,"motivazione":"massimo 180 caratteri"}]}.`;
  const json = await ServiziRicerca.ai(configurazioneFornitoreAI(fornitore.nome), istruzioni, '', {
    attiva, onRetry: testo => { if (attiva()) $('#auto-stato').textContent = testo; }
  });
  if (!attiva()) throw new Error('Ricerca annullata.');
  const grezzi = Array.isArray(json?.candidati) ? json.candidati.slice(0, 4) : [];
  const validi = grezzi.filter(c => c && typeof c.nomeScientifico === 'string' &&
    /^[A-ZÀ-ÖØ-Þ][\p{L}-]+\s+[a-zà-öø-ÿ][\p{L}.-]+(?:\s+(?:subsp\.|var\.|f\.)\s+[a-zà-öø-ÿ][\p{L}.-]+)?$/u.test(c.nomeScientifico.trim()) &&
    Number.isFinite(Number(c.percentuale)) && typeof c.motivazione === 'string' && c.motivazione.trim())
    .map(c => ({ nome: c.nomeScientifico.trim().slice(0, 160), percentuale: Math.round(Math.max(0, Math.min(100, Number(c.percentuale)))),
      motivazione: c.motivazione.trim().slice(0, 180) }));
  const verificati = await Promise.allSettled(validi.map(async c => {
    const gbif = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(c.nome)}&kingdom=Plantae`);
    if (!ServiziRicerca.gbifBotanico(gbif)) return null;
    return { nome: gbif.canonicalName || gbif.scientificName || c.nome, ai: { percentuale: c.percentuale, motivazione: c.motivazione, fornitore: fornitore.etichetta },
      gbif: gbif.confidence, gbifId: gbif.usageKey };
  }));
  const risultati = verificati.filter(e => e.status === 'fulfilled' && e.value).map(e => e.value);
  if (!risultati.length && verificati.some(e => e.status === 'rejected'))
    throw new Error('L’AI ha risposto, ma GBIF non è raggiungibile per verificare i nomi. Nessun dato applicato; riprova più tardi.');
  return risultati;
}

function disegnaRisultatiAuto(candidati, messaggioVuoto = 'Nessuna proposta verificabile. Inserisci qualche caratteristica, un nome o una foto e riprova.') {
  const destinazione = S.aperta;
  const serie = AUTO_RICERCA.serie;
  const ordinati = [...candidati.values()].sort((a, b) =>
    (b.attinenzaNome ?? 0) - (a.attinenzaNome ?? 0) ||
    (b.foto ?? -1) - (a.foto ?? -1) || (b.ai?.percentuale ?? -1) - (a.ai?.percentuale ?? -1) ||
    (b.locale?.punti ?? -1) - (a.locale?.punti ?? -1) || a.nome.localeCompare(b.nome, 'it')).slice(0, 8);
  $('#auto-risultati').replaceChildren(...(ordinati.length ? ordinati.map(c => {
    const indizi = [];
    if (c.attinenzaNome >= 3) indizi.push('Corrisponde al nome cercato; l’esemplare resta da verificare.');
    else if (c.attinenzaNome === 2) indizi.push('Nome compatibile con il testo cercato.');
    else if (c.attinenzaNome === 1) indizi.push(`Possibile correzione di «${c.nomeCercato}». Il nome cambia solo se confermi.`);
    if (c.foto != null) indizi.push(`Foto PlantNet: ${c.foto}% di confidenza del modello`);
    if (c.locale?.totale >= 2) indizi.push(`Guida locale: ${c.locale.punti}/${c.locale.totale} caratteri concordanti. ${c.locale.totale < 3 ? 'Pochi indizi: non bastano per identificare la pianta.' : 'La somiglianza dei caratteri non conferma l’identificazione.'}`);
    else if (c.locale?.totale === 1) indizi.push(`Guida locale: ${c.locale.punti}/1 carattere concordante; troppo poco per stimare una compatibilità.`);
    else if (c.guida) indizi.push('Presente nella guida delle 144 piante');
    if (c.wikipedia) indizi.push('Nome del taxon su Wikidata, trovato tramite Wikipedia');
    if (c.plantnet) indizi.push(`Catalogo PlantNet${c.nomiComuni?.length ? ': ' + c.nomiComuni.join(', ') : ''}. La presenza nel catalogo non identifica l’esemplare.`);
    if (c.ai) indizi.push(`AI ${c.ai.fornitore}: ${c.ai.percentuale}% (stima orientativa) · ${c.ai.motivazione}`);
    if (c.gbif != null) indizi.push(`GBIF: corrispondenza del nome ${c.gbif}% (non identificazione della pianta)`);
    if (c.scritto && !c.guida && !c.wikipedia && c.gbif == null && c.foto == null) indizi.push('Nome inserito nella scheda: ancora da verificare.');
    return el('div', { class: 'auto-carta' },
      el('h3', { class: 'specie', testo: c.nome }),
      ...indizi.map(s => el('p', {}, s)),
      c.nomeCompleto ? el('a', { class: 'btn', target: '_blank', rel: 'noopener', href: `https://identify.plantnet.org/it/k-world-flora/species/${encodeURIComponent(c.nomeCompleto)}/data` }, 'Apri scheda PlantNet ↗') : null,
      el('button', { type: 'button', class: 'btn primario', onclick: () => {
        if (S.aperta === destinazione && serie === AUTO_RICERCA.serie && $('#dlg-cerca-auto').open) usaRisultatoAuto(c);
      } }, 'Usa questo nome'));
  }) : [el('p', { class: 'vuoto' }, messaggioVuoto)]));
}

async function cercaAIDaScheda() {
  const r = S.aperta;
  if (!r) return;
  descriviRicerca('Risultati della ricerca AI', 'Invia nome e caratteri botanici al servizio AI configurato, senza foto, GPS o note personali. I nomi proposti vengono verificati su GBIF; le percentuali AI sono stime orientative. Per l’identificazione fotografica usa «Cerca da foto».');
  const serie = ++AUTO_RICERCA.serie;
  const candidati = new Map();
  $('#auto-risultati').replaceChildren();
  $('#auto-stato').textContent = 'L’AI confronta nome e caratteristiche; ogni taxon sarà verificato su GBIF…';
  $('#dlg-cerca-auto').showModal();
  if (!navigator.onLine) { $('#auto-stato').textContent = 'Sei offline: la ricerca AI richiede Internet. La scheda resta utilizzabile.'; return; }
  try {
    const risultati = await richiediRicercaSpecieAI(r);
    if (serie !== AUTO_RICERCA.serie || S.aperta !== r || !$('#dlg-cerca-auto').open) return;
    for (const v of risultati) candidati.set(v.nome.toLocaleLowerCase('it'), { nome: v.nome, ai: v.ai, gbif: v.gbif, gbifId: v.gbifId, guida: trovaSpecieGuida(v.nome) });
    disegnaRisultatiAuto(candidati);
    $('#auto-stato').textContent = risultati.length ? `${risultati.length} proposte AI confermate come taxa vegetali da GBIF. Controlla la motivazione prima di scegliere.` :
      'L’AI non ha prodotto nomi botanici verificabili su GBIF. Aggiungi caratteristiche o un nome più preciso e riprova. Per le foto usa «Cerca da foto».';
  } catch (errore) {
    if (serie !== AUTO_RICERCA.serie || S.aperta !== r || !$('#dlg-cerca-auto').open) return;
    disegnaRisultatiAuto(candidati, 'Ricerca AI non completata. Non è un risultato negativo sull’identificazione: la scheda non è stata modificata.');
    $('#auto-stato').textContent = errore?.message || 'Ricerca AI non disponibile.';
    $('#auto-risultati').prepend(el('button', { type: 'button', class: 'btn primario', onclick: () => {
      if (serie === AUTO_RICERCA.serie && S.aperta === r && $('#dlg-cerca-auto').open) cercaAIDaScheda();
    } }, 'Riprova AI'));
  }
}

function usaRisultatoAuto(c) {
  const r = S.aperta;
  if (!r) return;
  if (r.nome.trim() && r.nome.trim().toLowerCase() !== c.nome.toLowerCase() &&
      !confirm(`Sostituire «${r.nome}» con «${c.nome}»? I dati già inseriti negli altri campi saranno conservati.`)) return;
  if (c.guida) usaNomeDaGuidaSpecie(c.guida);
  else usaRisultatoWeb(c.nome);
  if (c.gbifId) r.gbifId = String(c.gbifId);
  if (c.nomeCompleto) r.plantnetNome = c.nomeCompleto;
  salvaPresto(r);
  $('#dlg-cerca-auto').close();
}

async function cercaAutoDaScheda() {
  const r = S.aperta;
  if (!r) return;
  descriviRicerca('Risultati della ricerca intelligente', 'Se inserisci un nome, la guida cerca quel nome e possibili refusi; senza nome confronta i caratteri. Wikipedia/Wikidata e GBIF verificano il nome; se configurata consulta l’AI. Una foto salvata e la chiave PlantNet permettono la prova fotografica. Le percentuali delle fonti non sono confrontabili né vengono mediate.');
  const serie = ++AUTO_RICERCA.serie;
  const nome = $('#f-nome').value.trim();
  const foto = r.foto?.[0];
  const campi = Object.fromEntries(GS_CAMPI_SCHEDA.map(k => [k, r[k] || '']));
  const filtri = { campi, grandezza: r.grandezza || '', altro: '' };
  const haCaratteri = Object.values(campi).some(Boolean) || !!filtri.grandezza;
  const candidati = new Map();
  const aggiungi = (nomeSci, nuovi) => {
    const chiave = (nomeSci || '').trim().toLocaleLowerCase('it');
    if (!chiave) return;
    const precedente = candidati.get(chiave) || { nome: nomeSci.trim(), guida: trovaSpecieGuida(nomeSci) };
    candidati.set(chiave, { ...precedente, ...nuovi,
      attinenzaNome: attinenzaNomeRicerca(nome, precedente.guida?.nomeSci || nomeSci, nomeSci), nomeCercato: nome });
  };
  const locali = GUIDA_SPECIE.map(v => ({ v, attinenza: attinenzaNomeRicerca(nome, v.nomeSci, nomeCatalogo(v)), ...punteggioCaratteristiche(v, filtri) }))
    .filter(x => nome ? x.attinenza > 0 : haCaratteri && x.punti >= Math.max(1, Math.ceil(x.totale / 2)))
    .sort((a, b) => b.attinenza - a.attinenza || b.punti - a.punti).slice(0, 8);
  for (const x of locali) aggiungi(nomeCatalogo(x.v), { guida: x.v, locale: haCaratteri ? { punti: x.punti, totale: x.totale } : null });
  if (/^\S+\s+\S+/.test(nome)) aggiungi(nome, { scritto: true });
  $('#auto-stato').textContent = 'Confronto locale completato. Verifico le fonti disponibili…';
  disegnaRisultatiAuto(candidati);
  $('#dlg-cerca-auto').showModal();

  const prove = [];
  if (nome && navigator.onLine) prove.push(nomeWikipediaAuto(nome).then(v => v && aggiungi(v, { wikipedia: true })));
  if (foto && chiavePlantNet() && navigator.onLine) prove.push(fotoPlantNetAuto(foto).then(lista => {
    for (const v of lista) aggiungi(v.nome, { foto: v.percentuale, nomeCompleto: v.nomeCompleto, gbifId: v.gbifId });
  }));
  const aiDisponibile = Boolean(fornitoreRicercaAI());
  if (navigator.onLine && aiDisponibile && (nome || haCaratteri)) prove.push(richiediRicercaSpecieAI(r).then(lista => {
    for (const v of lista) aggiungi(v.nome, { ai: v.ai, gbif: v.gbif, gbifId: v.gbifId });
  }));
  const esiti = await Promise.allSettled(prove);
  if (serie !== AUTO_RICERCA.serie || S.aperta !== r || !$('#dlg-cerca-auto').open) return;
  const nomiGbif = [...candidati.values()].filter(c => /^\S+\s+\S+/.test(c.nome))
    .sort((a, b) => (b.attinenzaNome ?? 0) - (a.attinenzaNome ?? 0) || Number(!!b.wikipedia) - Number(!!a.wikipedia) ||
      Number(b.nome.toLowerCase() === nome.toLowerCase()) - Number(a.nome.toLowerCase() === nome.toLowerCase()) ||
      (b.foto ?? -1) - (a.foto ?? -1) || (b.locale?.punti ?? -1) - (a.locale?.punti ?? -1))
    .slice(0, 2);
  const esitiGbif = navigator.onLine ? await Promise.allSettled(nomiGbif.map(async c => {
    const dati = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(c.nome)}&kingdom=Plantae`);
    if (ServiziRicerca.gbifBotanico(dati)) {
      c.gbif = dati.confidence;
      c.gbifId = dati.usageKey;
    }
  })) : [];
  if (serie !== AUTO_RICERCA.serie || S.aperta !== r || !$('#dlg-cerca-auto').open) return;
  for (const [chiave, c] of candidati) {
    if (c.scritto && !c.guida && !c.wikipedia && c.gbif == null && c.foto == null) candidati.delete(chiave);
  }
  disegnaRisultatiAuto(candidati);
  const errori = [...esiti, ...esitiGbif].filter(e => e.status === 'rejected').map(e => e.reason?.message || 'Servizio non disponibile.');
  const avvisoFoto = !foto ? 'Nessuna foto salvata: prova fotografica saltata. · '
    : !chiavePlantNet() ? 'Foto non analizzata: manca la chiave PlantNet. · ' : '';
  const avvisoAI = !aiDisponibile ? 'AI saltata: nessuna chiave compatibile caricata. · ' : '';
  const conteggio = candidati.size > 8 ? `Prime 8 di ${candidati.size} proposte` : `${candidati.size} proposte`;
  $('#auto-stato').textContent = `${conteggio} · ${avvisoFoto}${avvisoAI}${!navigator.onLine ? 'Offline: solo guida locale.' : errori.length ? `${[...new Set(errori)].join(' ')} Gli altri risultati restano utilizzabili.` : 'Verifica completata.'}`;
}

// Scorciatoia dal campo "Nome esemplare" (pulsante 🔎): apre la stessa guida
// ma già sulla modalità "Per foto", per arrivare all'identificazione
// PlantNet in un tocco invece di passare prima dalla ricerca per nome.
function apriGuidaSpecieFoto() {
  if (!S.aperta) return;
  $('#gs-modo-foto').classList.remove('nascosto');
  cambiaModoGuidaSpecie('foto');
  $('#dlg-guida-specie').showModal();
}

// Tipologia del catalogo -> valore del campo "persistenza" della scheda
// (il catalogo usa un vocabolario leggermente diverso da quello dell'app).
const GS_MAPPA_TIPOLOGIA = { caducifoglia: 'caduca', sempreverde: 'sempreverde', 'ex palme': 'sempreverde' };

// Cerca nel catalogo la specie con questo nome scientifico esatto (per il
// confronto sotto). Un nome parziale o diverso semplicemente non trova nulla.
function trovaSpecieGuida(nomeSci) {
  const q = (nomeSci || '').trim().toLowerCase();
  if (!q) return null;
  return GUIDA_SPECIE.find((v) => nomeCatalogo(v).toLowerCase() === q) ||
    GUIDA_SPECIE.find((v) => v.nomeSci.toLowerCase() === q) || null;
}

function conflittiConGuida(r, specie) {
  const attesi = { persistenza: GS_MAPPA_TIPOLOGIA[specie.tipologia], grandezza: specie.grandezza };
  for (const [scheda, guida] of Object.entries(GS_CAMPO_GUIDA)) attesi[scheda] = specie[guida];
  const conflitti = Object.entries(attesi).filter(([k, valore]) => valore && r[k] && r[k] !== valore)
    .map(([k, valore]) => `${CAMPI.find(c => c.k === k)?.label || k}: ${r[k]} / guida ${valore}`);
  for (const dip of DIPENDENZE_CAMPI) {
    if (r[dip.se] || attesi[dip.se] !== dip.valore) continue;
    const compilati = dip.nascondi.filter(k => r[k]);
    if (compilati.length) conflitti.push(`${CAMPI.find(c => c.k === dip.se)?.label || dip.se}: guida ${dip.valore} non applicato, per conservare ${compilati.map(k => CAMPI.find(c => c.k === k)?.label || k).join(', ')} già osservati`);
  }
  return conflitti;
}

function mostraConflittiNome(conflitti) {
  const avviso = $('#nome-conflitti');
  if (!avviso) return;
  avviso.classList.toggle('nascosto', !conflitti.length);
  avviso.textContent = conflitti.length ? `⚠ Verifica i campi già compilati; nessun dato è stato sovrascritto. ${conflitti.join('; ')}` : '';
}

// Confronta i campi illustrati della scheda aperta con quello che dice il
// catalogo per quella specie (solo se il nome combacia esattamente con una
// delle 144), e colora/avvisa quelli che non corrispondono. È un controllo
// dal vivo, ricalcolato ad ogni modifica: non serve salvare nulla in più.
const GS_CAMPI_CONFRONTABILI = ['persistenza', ...Object.keys(GS_CAMPO_GUIDA)];

function confrontaConCatalogo() {
  const r = S.aperta;
  if (!r) return;
  for (const k of GS_CAMPI_CONFRONTABILI) {
    $('#f-' + k)?.classList.remove('illustr-concorda', 'illustr-discorda');
    const avviso = $('#avviso-' + k);
    if (avviso) avviso.textContent = '';
  }
  const specie = trovaSpecieGuida(r.nome);
  if (!specie) return;

  const controlla = (k, valoreCatalogo) => {
    const bottone = $('#f-' + k);
    if (!bottone || !r[k] || !valoreCatalogo) return;
    if (r[k] === valoreCatalogo) {
      bottone.classList.add('illustr-concorda');
    } else {
      bottone.classList.add('illustr-discorda');
      const avviso = $('#avviso-' + k);
      if (avviso) avviso.textContent = `⚠ il catalogo per questa specie indica "${valoreCatalogo}"`;
    }
  };
  controlla('persistenza', GS_MAPPA_TIPOLOGIA[specie.tipologia]);
  for (const [campoScheda, campoGuida] of Object.entries(GS_CAMPO_GUIDA)) controlla(campoScheda, specie[campoGuida]);
}

// Compila i campi illustrati di "r" con i dati del catalogo per "specie" —
// ma SOLO quelli ancora vuoti (non sovrascrive mai un'osservazione già
// fatta) e solo dove il catalogo ha davvero un dato valido per quel campo
// (i campi strutturati sono pieni solo per una parte delle 144 specie).
// Restituisce l'elenco dei campi effettivamente compilati, e aggiorna da
// sola la parte di interfaccia corrispondente.
function compilaCampiDaGuidaSpecie(r, specie) {
  const compilati = [];
  if (!r.persistenza && GS_MAPPA_TIPOLOGIA[specie.tipologia]) {
    r.persistenza = GS_MAPPA_TIPOLOGIA[specie.tipologia];
    compilati.push('persistenza');
  }
  for (const [campoScheda, campoGuida] of Object.entries(GS_CAMPO_GUIDA)) {
    if (r[campoScheda] || !specie[campoGuida]) continue;
    // La ricerca non deve cancellare o nascondere osservazioni già inserite.
    if (DIPENDENZE_CAMPI.some(dip => (dip.se === campoScheda && dip.valore === specie[campoGuida] && dip.nascondi.some(k => r[k])) ||
        (dip.nascondi.includes(campoScheda) && r[dip.se] === dip.valore))) continue;
    const valori = CAMPI.find((c) => c.k === campoScheda)?.valori || [];
    if (valori.includes(specie[campoGuida])) {
      r[campoScheda] = specie[campoGuida];
      compilati.push(campoScheda);
    }
  }
  if (!r.grandezza && specie.grandezza) { r.grandezza = specie.grandezza; compilati.push('grandezza'); }

  for (const k of compilati) {
    const cDef = CAMPI.find((c) => c.k === k);
    if (cDef?.tipo === 'illustrata') aggiornaBottoneIllustrato(k);
    else if ($('#f-' + k)) $('#f-' + k).value = r[k];
  }
  return compilati;
}

/* =====================================================================
   7f. RICERCA SUL WEB (Wikipedia/Wikidata) — solo per trovare il nome
   scientifico quando il catalogo delle 144 specie del corso non trova
   nulla (es. nome comune non riconosciuto). Il nome scientifico viene da
   Wikidata (proprietà "nome del taxon"), un dato strutturato, non da testo
   interpretato. Il RESTO dei campi (persistenza, forma chioma, ecc.) non
   viene mai preso da Wikipedia: solo se questo nome risulta anche tra le
   144 specie verificate del catalogo del corso, in quel caso si prendono
   da lì — mai da un'estrazione di testo libero non verificata.
   ===================================================================== */
const WEB_RICERCA = { serie: 0 };
async function cercaSulWeb(q) {
  q = (q || '').trim();
  if (!q) return;
  const serie = ++WEB_RICERCA.serie;
  const scheda = S.aperta;
  const attuale = () => serie === WEB_RICERCA.serie && S.aperta === scheda && $('#dlg-guida-specie').open && guidaSpecieModo === 'nome';
  $('#gs-lista').replaceChildren(el('p', { class: 'vuoto' }, '⏳ Cerco su Wikipedia…'));
  try {
    const botanico = await primoRisultatoWikipediaBotanico(q);
    if (!attuale()) return;
    if (!botanico) { mostraRicercaLocaleDopoWeb(`Nessuna pianta verificata per «${q}» nei primi risultati di Wikipedia. Prova un nome più preciso o consulta la guida locale.`); return; }
    const datiPag = await jsonAuto(`https://it.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(botanico.titolo)}&prop=extracts|pageimages|pageprops&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=500&format=json&origin=*`);
    if (!attuale()) return;
    const pagina = Object.values(datiPag?.query?.pages || {})[0];
    if (!pagina || pagina.missing !== undefined) { mostraRicercaLocaleDopoWeb(`Pagina Wikipedia non disponibile per «${q}».`); return; }
    const nomeSci = botanico.nomeSci;

    let estratto = (pagina.extract || '').trim();
    if (estratto.length > 700) estratto = estratto.slice(0, 700) + '…';

    disegnaRisultatoWeb({
      nomeSci, titoloPagina: pagina.title, estratto,
      immagine: pagina.thumbnail?.source || null,
      urlPagina: `https://it.wikipedia.org/wiki/${encodeURIComponent(pagina.title.replace(/ /g, '_'))}`,
      specieCatalogo: trovaSpecieGuida(nomeSci),
    });
  } catch {
    if (!attuale()) return;
    mostraRicercaLocaleDopoWeb('Impossibile contattare Wikipedia: controlla la connessione.');
  }
}

function mostraRicercaLocaleDopoWeb(messaggio) {
  $('#gs-lista').replaceChildren(
    el('p', { class: 'vuoto', testo: messaggio }),
    el('button', { type: 'button', class: 'btn', onclick: disegnaListaGuidaSpecie }, 'Consulta la guida locale'));
}

function disegnaRisultatoWeb(dati) {
  const destinazione = S.aperta;
  $('#gs-lista').replaceChildren(el('div', {},
    dati.immagine ? el('img', { src: dati.immagine, alt: dati.titoloPagina, style: 'width:100%;border-radius:var(--r-piccolo);border:1.5px solid var(--linea);margin-bottom:8px' }) : null,
    el('p', { style: 'font-size:11px;color:var(--tenue);margin:0 0 8px', testo: dati.nomeSci ? '🌐 Nome scientifico da Wikidata — verifica sempre la specie' : '🌐 Wikipedia non fornisce un nome scientifico strutturato per questa pagina' }),
    el('h3', { class: 'specie', style: 'margin:0 0 4px', testo: dati.nomeSci || dati.titoloPagina }),
    !dati.nomeSci ? null : dati.specieCatalogo
      ? el('p', { style: 'font-size:12.5px;color:var(--bosco);font-weight:600;margin:0 0 8px', testo: '✓ È anche tra le 144 specie verificate del corso: gli altri campi si compileranno da lì' })
      : el('p', { style: 'font-size:12.5px;color:var(--tenue);margin:0 0 8px', testo: 'Non è tra le 144 del corso: verranno compilati solo il nome e la nota, gli altri campi restano a te' }),
    dati.nomeSci !== dati.titoloPagina ? el('p', { style: 'font-size:12.5px;color:var(--tenue);margin:0 0 8px', testo: `Pagina Wikipedia: ${dati.titoloPagina}` }) : null,
    dati.estratto ? el('p', { style: 'font-size:13.5px;line-height:1.5;margin:0 0 8px', testo: dati.estratto }) : null,
    el('a', { href: dati.urlPagina, target: '_blank', rel: 'noopener', style: 'font-size:12.5px' }, 'Apri su Wikipedia ↗'),
    S.aperta && dati.nomeSci ? el('button', { type: 'button', class: 'btn primario', style: 'margin-top:10px', onclick: () => {
      if (S.aperta !== destinazione) return;
      if (S.aperta.nome?.trim() && S.aperta.nome.toLowerCase() !== dati.nomeSci.toLowerCase() && !confirm(`Sostituire «${S.aperta.nome}» con «${dati.nomeSci}»? I dati già inseriti restano conservati.`)) return;
      usaRisultatoWeb(dati.nomeSci);
    } }, '✓ Usa questo nome nella scheda') : null,
    el('button', { type: 'button', class: 'btn', style: 'margin-top:10px', onclick: disegnaListaGuidaSpecie }, 'Consulta la guida locale')));
}

function usaRisultatoWeb(nomeSci) {
  if (!S.aperta) { $('#dlg-guida-specie').close(); return; }
  const r = S.aperta;
  r.nome = nomeSci;
  r.gbifId = ''; // nome cambiato: un eventuale ID GBIF salvato in precedenza non è più valido
  r.plantnetNome = '';
  // Il RESTO dei campi si compila solo se questo nome è anche tra le 144
  // verificate del catalogo del corso — mai da testo Wikipedia interpretato.
  const specieCatalogo = trovaSpecieGuida(nomeSci);
  mostraConflittiNome(specieCatalogo ? conflittiConGuida(r, specieCatalogo) : []);
  const compilati = specieCatalogo ? compilaCampiDaGuidaSpecie(r, specieCatalogo) : [];
  r.modificato = oraISO();
  $('#f-nome').value = r.nome;
  aggiornaTitoloEditor();
  applicaDipendenze();
  disegnaStima();
  confrontaConCatalogo();
  disegnaLinkGbif();
  salvaPresto(r);
  if ($('#dlg-guida-specie').open) $('#dlg-guida-specie').close();
  toast(compilati.length ? `Nome (da Wikipedia) e altri ${compilati.length} campi dal catalogo verificato` : 'Nome aggiornato da Wikipedia (non è tra le 144 del corso)');
}

function usaNomeDaGuidaSpecie(v) {
  const chiudiRicerca = () => {
    for (const id of ['#dlg-guida-specie', '#dlg-zona-habitat']) {
      const dialogo = $(id);
      if (dialogo.open) dialogo.close();
    }
  };
  if (!S.aperta) { chiudiRicerca(); return; }
  const r = S.aperta;
  r.nome = nomeCatalogo(v);
  r.gbifId = ''; // nome cambiato: un eventuale ID GBIF salvato in precedenza non è più valido
  r.plantnetNome = '';
  mostraConflittiNome(conflittiConGuida(r, v));
  const compilati = compilaCampiDaGuidaSpecie(r, v);

  r.modificato = oraISO();
  $('#f-nome').value = r.nome;
  aggiornaTitoloEditor();
  applicaDipendenze();
  disegnaStima();
  confrontaConCatalogo();
  disegnaLinkGbif();
  salvaPresto(r);
  chiudiRicerca();
  toast(compilati.length ? `Nome e altri ${compilati.length} campi compilati dalla guida` : 'Nome aggiornato dalla guida specie');
}

// La guida registra la provenienza storica: non indica dove cresce oggi.
function popolaDatalistZonaHabitat() {
  const valori = [...new Set(GUIDA_SPECIE.map(v => v.provenienza).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'it'));
  $('#dl-zh-zona').replaceChildren(...valori.map(v => el('option', { value: v })));
}

function risultatiPerZona(q) {
  const cerca = (q || '').trim().toLocaleLowerCase('it');
  return GUIDA_SPECIE.filter(v => !cerca || (v.provenienza || '').toLocaleLowerCase('it').includes(cerca))
    .sort((a, b) => a.nomeSci.localeCompare(b.nomeSci, 'it'));
}

function disegnaListaZonaHabitat() {
  $('#zh-dettaglio').classList.add('nascosto');
  const lista = $('#zh-lista');
  lista.classList.remove('nascosto');
  const q = $('#zh-cerca').value;
  const risultati = risultatiPerZona(q);
  const gia = nomiGiaRilevati();
  lista.replaceChildren(...(risultati.length ? risultati.map(v =>
    el('button', { type: 'button', class: 'gs-riga', onclick: () => mostraDettaglioZonaHabitat(v) },
      el('b', { class: 'specie', testo: nomeCatalogo(v) }),
      el('span', { style: 'font-size:12px;color:var(--tenue)' },
        v.provenienza || 'Provenienza non indicata', gia.has(v.nomeSci.toLowerCase()) ? ' · ✓ già rilevata' : null)))
    : [el('p', { class: 'vuoto' }, `Nessuna specie della guida ha una provenienza che contiene «${q}».`)]));
}

function mostraDettaglioZonaHabitat(v) {
  $('#zh-lista').classList.add('nascosto');
  const dettaglio = $('#zh-dettaglio');
  dettaglio.classList.remove('nascosto');
  dettaglio.replaceChildren(
    el('button', { type: 'button', class: 'btn', style: 'margin-bottom:12px', onclick: disegnaListaZonaHabitat }, '← Elenco'),
    schedaGuidaSpecie(v),
    el('a', { class: 'btn', style: 'margin-top:10px;width:100%;display:inline-flex;justify-content:center',
      href: `https://www.gbif.org/species/search?q=${encodeURIComponent(v.nomeSci)}`,
      target: '_blank', rel: 'noopener noreferrer' }, '↗ Consulta la specie su GBIF'));
}

function apriRicercaZonaHabitat() {
  $('#zh-cerca').value = '';
  disegnaListaZonaHabitat();
  $('#dlg-zona-habitat').showModal();
}

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
    const righeDati = CAMPI.filter((c) => !['prog', 'nome', 'data'].includes(c.k)).map((c) => {
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
@media print{body{margin:0}}
</style></head><body>
<header><div class="num">${escHtml(r.prog)}</div><div><h1>${escHtml(r.nome || 'Esemplare senza nome')}</h1><p>${escHtml(dataBreveIT(r.data))}</p></div><div class="qr">${qrTxt}</div></header>
<table>${righeDati}</table>
<div class="stima"><b>Stima ambientale (indicativa)</b>${righeStimaTxt}<small>Stima divulgativa con metodo dichiarato: non sostituisce un rilievo agronomico né vale per crediti di carbonio certificati.</small></div>
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
  pausa: localStorage.getItem('sb-traccia-pausa') === '1', sessione: 0,
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
  localStorage.removeItem('sb-traccia-pausa');
  localStorage.setItem('sb-traccia-attiva', '1');
  try { ascoltaTraccia(); }
  catch (e) { localStorage.removeItem('sb-traccia-attiva'); TRK.avviso = 'GPS non avviato: ' + e.message; aggiornaInfoTraccia(); return; }
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
  localStorage.removeItem('sb-traccia-attiva');
  localStorage.setItem('sb-traccia-pausa', '1');
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
  localStorage.removeItem('sb-traccia-attiva');
  localStorage.removeItem('sb-traccia-pausa');
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

/* =====================================================================
   9e. TIMELINE — raggruppa le schede per "N° medesimo esemplare" per
   vedere l'evoluzione dello stesso albero su più visite
   ===================================================================== */
const dataITbreve = (iso) => iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';

function gruppiTimeline() {
  const mappa = new Map();
  for (const r of S.schede) {
    // numero + nome: evita di unire alberi diversi importati dalla vecchia app, dove il numero era sempre 1
    const chiave = String(r.numero || '').trim() && `${String(r.numero).trim()}|${(r.nome || '').trim().toLowerCase()}`;
    if (!chiave) continue;
    if (!mappa.has(chiave)) mappa.set(chiave, []);
    mappa.get(chiave).push(r);
  }
  return [...mappa.entries()]
    .map(([chiave, righe]) => ({ chiave, righe: righe.slice().sort((a, b) => a.creato.localeCompare(b.creato)) }))
    .filter((g) => g.righe.length > 1 || g.righe.some((r) => r.foto.length))
    .sort((a, b) => (parseFloat(a.chiave) || 0) - (parseFloat(b.chiave) || 0) || a.chiave.localeCompare(b.chiave));
}

async function disegnaTimeline() {
  const cont = $('#timeline-lista');
  const gruppi = gruppiTimeline();
  if (!gruppi.length) {
    cont.replaceChildren(el('div', { class: 'vuoto' },
      'Nessun gruppo da mostrare. Per collegare più visite allo stesso albero, dai loro lo stesso "N° medesimo esemplare" nella scheda.'));
    return;
  }
  const blocchi = await Promise.all(gruppi.map(async (g) => {
    const prima = g.righe[0];
    g.chiave = String(prima.numero).trim();
    const fotoConData = [];
    for (const r of g.righe) for (const p of r.foto) fotoConData.push({ p, r });
    fotoConData.sort((a, b) => a.p.quando.localeCompare(b.p.quando));
    const filmstrip = await Promise.all(fotoConData.map(async ({ p, r }) => {
      const src = await urlFoto(p.id);
      return el('button', { type: 'button', class: 'tl-foto', onclick: () => { $('#vista-img').src = src; $('#vista-foto').showModal(); } },
        el('img', { src, alt: p.didascalia || '' }),
        el('span', { testo: dataITbreve(p.quando) }));
    }));
    return el('div', { class: 'tl-gruppo' },
      el('div', { class: 'tl-intestazione' },
        el('b', { class: 'specie', testo: prima.nome || `Esemplare N° ${g.chiave}` }),
        el('span', { style: 'color:var(--tenue);font-size:12px', testo: dataBreveIT(prima.data) || '' }),
        el('span', { class: 'tl-conteggio', testo: `${g.righe.length} visite · ${fotoConData.length} foto` })),
      fotoConData.length ? el('div', { class: 'tl-filmstrip' }, filmstrip) : null,
      el('ul', { class: 'tl-note' }, g.righe.map((r) => el('li', { role: 'button', tabindex: '0',
        onclick: () => apriEditor(r.uid), onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); apriEditor(r.uid); } } },
        el('b', {}, dataIT(r.creato) + ': '), r.problemi || r.note || '— nessuna nota —'))));
  }));
  cont.replaceChildren(...blocchi);
}

/* =====================================================================
   9d. DISPOSITIVO — adatta le colonne a smartphone / tablet / PC
   ===================================================================== */
function rilevaDispositivo() {
  const ua = navigator.userAgent || '';
  const touch = (navigator.maxTouchPoints || 0) > 0;
  const w = Math.min(window.innerWidth, screen.width || window.innerWidth);
  const mobileUA = /Mobi|Android|iPhone|iPod/i.test(ua);
  const tabletUA = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua)) || (touch && /Macintosh/.test(ua));
  if (w < 640) return 'smartphone';
  if (tabletUA || (mobileUA && w < 1100) || (touch && w < 1100)) return 'tablet';
  return 'pc';
}

function aggiornaDispositivo() {
  const d = rilevaDispositivo();
  if (document.documentElement.dataset.dispositivo === d) return;
  document.documentElement.dataset.dispositivo = d;
  const info = $('#dispositivo-info');
  if (info) info.textContent = `Dispositivo rilevato: ${{ smartphone: '📱 smartphone', tablet: '📱 tablet', pc: '💻 PC' }[d]}.`;
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
  localStorage.setItem('sb-stampa-campi', JSON.stringify(campiScelti));

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
    const opz = { qr: $('#st-qr').checked, foto: $('#st-foto').checked, colonne: Number($('#st-colonne').value), fotoMax: Number($('#st-foto-max').value) || 0, campi: new Set(campiScelti) };
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
    const v = JSON.parse(localStorage.getItem('sb-stampa-campi') || 'null');
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
    const campi = CAMPI.filter((c) => c.sez === sez.id && !CAMPI_TESTATA.includes(c.k) && (!opz.campi || opz.campi.has(c.k)));
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
  if (stima.volumeChioma != null || stima.co2Kg != null) {
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
        el('img', { src: await urlFoto(p.id), alt: '', style: `height:${altezza}` }),
        el('figcaption', { testo: [p.didascalia, dataIT(p.quando)].filter(Boolean).join(' – ') }))));
    pagina.append(el('section', {},
      el('h3', { class: 'p-titolo-foto', testo: `Foto (${fotoStampa.length}${fotoStampa.length < fotoStampaTutte.length ? ` di ${fotoStampaTutte.length}` : ''})` }),
      el('div', { class: 'p-foto', style: `grid-template-columns:repeat(${opz.colonne},1fr)` }, figure)));
  }
  pagina.append(el('p', { class: 'p-piede', testo: `Creata il ${dataIT(r.creato)} – ultima modifica ${dataIT(r.modificato)} – stampata il ${dataIT(oraISO())} · by Lollo ®2026` }));
  return pagina;
}

/* =====================================================================
   11. BACKUP, IMPORTAZIONE, ESPORTAZIONI
   ===================================================================== */
async function esportaBackup() {
  await salvaTuttiInSospeso();
  await TRK.coda;
  stato('Preparo il backup…');
  const foto = {}, audio = {};
  const tutteLeSchede = [...S.schede, ...S.cestino];
  for (const r of tutteLeSchede) {
    for (const p of r.foto) { const b = await DB.leggi('foto', p.id); if (!b) throw new Error(`Foto mancante nella scheda ${r.prog}`); foto[p.id] = await blobInDataURL(b); }
    for (const a of r.audio) { const b = await DB.leggi('audio', a.id); if (!b) throw new Error(`Nota vocale mancante nella scheda ${r.prog}`); audio[a.id] = await blobInDataURL(b); }
  }
  const dati = { app: 'scheda-botanica', versione: 5, esportato: oraISO(), schede: tutteLeSchede, foto, audio, specie: S.specie, guida: S.guida, traccia: S.traccia };
  scarica(new Blob([JSON.stringify(dati)], { type: 'application/json' }), `scheda-botanica-backup-${oggi()}.json`);
  localStorage.setItem('sb-ultimo-backup', oraISO());
  stato(`Backup esportato: ${tutteLeSchede.length} schede, ${Object.keys(foto).length} foto, ${Object.keys(audio).length} audio`);
}

// Accetta: backup v2 (con audio), backup v1, dati.json dello ZIP della vecchia app (campo "full"), array semplice
// Un campo presente ma del tipo sbagliato non equivale a un archivio vuoto:
// rifiutiamo il file prima di poter sostituire i dati locali.
function validaStrutturaBackup(json) {
  for (const campo of ['schede', 'specie', 'guida', 'traccia']) {
    if (json[campo] !== undefined && !Array.isArray(json[campo]))
      throw new Error(`Backup non valido: ${campo} deve essere un elenco`);
  }
  for (const campo of ['foto', 'audio', 'file']) {
    if (json[campo] !== undefined && (!json[campo] || typeof json[campo] !== 'object' || Array.isArray(json[campo])))
      throw new Error(`Backup non valido: ${campo} deve essere un indice di file`);
  }
}

function leggiFormatoBackup(json) {
  if (json?.app === 'scheda-botanica') validaStrutturaBackup(json);
  let voci;
  if (json && json.app === 'scheda-botanica' && Array.isArray(json.schede)) {
    voci = json.schede.map((s) => {
      const { record } = normalizza(s);
      const fotoDaSalvare = record.foto.filter((p) => json.foto?.[p.id]).map((p) => ({ id: p.id, dataUrl: json.foto[p.id] }));
      const audioDaSalvare = record.audio.filter((a) => json.audio?.[a.id]).map((a) => ({ id: a.id, dataUrl: json.audio[a.id] }));
      return { record, fotoDaSalvare, audioDaSalvare };
    });
    voci.specie = Array.isArray(json.specie) ? json.specie : [];
    voci.guida = json.guida === undefined ? [] : json.guida;
    voci.traccia = Array.isArray(json.traccia) ? json.traccia : [];
    return voci;
  }
  if (json && Array.isArray(json.full)) voci = json.full.map(normalizza);
  else if (Array.isArray(json)) voci = json.map(normalizza);
  if (voci) { voci.specie = []; voci.guida = []; voci.traccia = []; return voci; }
  throw new Error('il file non è un backup di Scheda Botanica');
}

async function preparaMediaImportazione(voci) {
  const foto = [], audio = [];
  const identificativi = new Set();
  for (const { record, fotoDaSalvare = [], audioDaSalvare = [] } of voci) {
    for (const m of [...record.foto, ...record.audio]) {
      if (typeof m.id !== 'string' || !m.id || identificativi.has(m.id)) throw new Error('Identificativo media non valido o duplicato');
      identificativi.add(m.id);
    }
    if (fotoDaSalvare.length !== record.foto.length)
      throw new Error(`backup incompleto: mancano foto della scheda N° ${record.prog || '?'}`);
    if (audioDaSalvare.length !== record.audio.length)
      throw new Error(`backup incompleto: mancano note vocali della scheda N° ${record.prog || '?'}`);
    for (const f of fotoDaSalvare) {
      let blob = f.blob || await dataURLInBlob(f.dataUrl);
      if (!(blob instanceof Blob) || !blob.size) throw new Error(`foto ${f.id} non leggibile`);
      if (blob.size > 900000) blob = await comprimiFoto(blob);
      foto.push({ id: f.id, blob });
    }
    for (const a of audioDaSalvare) {
      const blob = a.blob || await dataURLInBlob(a.dataUrl);
      if (!(blob instanceof Blob) || !blob.size) throw new Error(`audio ${a.id} non leggibile`);
      audio.push({ id: a.id, blob });
    }
  }
  return { foto, audio };
}

async function importaDati(voci, modo) {
  if (!['sostituisci', 'unisci'].includes(modo)) throw new Error('Modalità importazione non valida');
  if (REG.attiva || REG.inAttesa || TRK.watch !== null || GPSR.watch !== null || S.aperta)
    throw new Error('Chiudi la scheda e ferma le registrazioni prima di importare');
  if (!(await salvaTuttiInSospeso())) throw new Error('Salva prima le modifiche in sospeso');
  await TRK.coda;
  if (!Array.isArray(voci)) throw new Error('Elenco schede non valido');
  validaStrutturaBackup({ specie: voci.specie, guida: voci.guida, traccia: voci.traccia });
  if (new Set(voci.map((v) => v.record.uid)).size !== voci.length) throw new Error('Identificativi scheda duplicati');
  for (const s of voci.specie || []) if (!s || typeof s.nomeSci !== 'string' || !s.nomeSci.trim()) throw new Error('Catalogo specie non valido');
  const guidaArrivata = validaIntegrazioniGuida(voci.guida || []);

  if (modo === 'sostituisci') {
    // Prima leggiamo e validiamo ogni file. Solo dopo sostituiamo i sei store
    // in un'unica transazione atomica.
    const media = await preparaMediaImportazione(voci);
    const schede = voci.map((v) => v.record);
    if (new Set(schede.map((r) => r.uid)).size !== schede.length)
      throw new Error('backup non valido: contiene identificativi scheda duplicati');
    const specie = Array.isArray(voci.specie) ? voci.specie.filter((s) => s?.nomeSci) : [];
    const traccia = Array.isArray(voci.traccia) ? voci.traccia.filter((p) =>
      numeroFinito(p?.lat) && numeroFinito(p?.lng) && Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180 && Number.isFinite(Date.parse(p.quando))).map((p) => ({
        lat: Number(p.lat), lng: Number(p.lng), alt: numeroFinito(p.alt) ? Number(p.alt) : null,
        acc: numeroFinito(p.acc) && Number(p.acc) >= 0 ? Number(p.acc) : null, quando: p.quando, segmento: Number(p.segmento) || 1,
      })) : [];
    if (traccia.length !== (voci.traccia || []).length) throw new Error('Traccia con coordinate o date non valide: archivio conservato');
    await DB.sostituisciArchivio({ schede, foto: media.foto, audio: media.audio, specie, traccia, guida: guidaArrivata });
    S.urlFoto.forEach((u) => URL.revokeObjectURL(u));
    S.urlFoto.clear();
    S.urlAudio.forEach((u) => URL.revokeObjectURL(u));
    S.urlAudio.clear();
    S.schede = schede.filter((r) => !r.cancellata);
    S.cestino = schede.filter((r) => r.cancellata);
    S.specie = specie;
    S.guida = guidaArrivata;
    applicaIntegrazioniGuida();
    S.traccia = traccia;
    S.selezionate.clear();
    disegnaElenco();
    disegnaLineaTraccia();
    aggiornaBadgeCestino();
    mostraEsitoImportazione(voci.length, 0, 0, 0);
    return;
  }
  let nuove = 0, aggiornate = 0, invariate = 0;
  const accettate = [];
  for (const voce of voci) {
    const esistente = [...S.schede, ...S.cestino].find((s) => s.uid === voce.record.uid);
    if (esistente && Date.parse(esistente.modificato) >= Date.parse(voce.record.modificato)) { invariate++; continue; }
    accettate.push(voce);
    esistente ? aggiornate++ : nuove++;
  }
  const media = await preparaMediaImportazione(accettate);
  // Nuovi ID per i media importati: non sovrascrivono i file di altre schede.
  const records = accettate.map(({ record }) => structuredClone(record));
  for (const [tipo, pref] of [['foto', 'f'], ['audio', 'a']]) {
    const mappa = new Map(media[tipo].map((m) => [m.id, nuovoId(pref)]));
    media[tipo].forEach((m) => { m.id = mappa.get(m.id); });
    records.forEach((r) => r[tipo].forEach((m) => { m.id = mappa.get(m.id); }));
  }
  const catalogo = new Map(S.specie.map((s) => [s.nomeSci, s]));
  for (const s of voci.specie || []) {
    const precedente = catalogo.get(s.nomeSci);
    catalogo.set(s.nomeSci, precedente ? { ...s, ...precedente,
      volte: Math.max(Number(s.volte) || 0, Number(precedente.volte) || 0),
      confidenzaMax: Math.max(Number(s.confidenzaMax) || 0, Number(precedente.confidenzaMax) || 0),
    } : s);
  }
  const guidaUnita = new Map(S.guida.map(v => [v.id, v]));
  for (const entrata of guidaArrivata) {
    // Se una pianta è già integrata qui, preserva anche la sua fonte.
    // Un'unione di campi con fonti diverse richiederebbe una revisione manuale.
    if (!guidaUnita.has(entrata.id)) guidaUnita.set(entrata.id, entrata);
  }
  await DB.sostituisciArchivio({ schede: records, ...media, specie: [...catalogo.values()], traccia: [], guida: [...guidaUnita.values()] }, false);
  for (const record of records) {
    const esistente = [...S.schede, ...S.cestino].find((s) => s.uid === record.uid);
    if (esistente) liberaMediaRecord(esistente);
    S.schede = S.schede.filter((s) => s.uid !== record.uid);
    S.cestino = S.cestino.filter((s) => s.uid !== record.uid);
    (record.cancellata ? S.cestino : S.schede).push(record);
  }
  S.specie = [...catalogo.values()];
  S.guida = [...guidaUnita.values()];
  applicaIntegrazioniGuida();
  await disegnaElenco();
  aggiornaBadgeCestino();
  mostraEsitoImportazione(nuove, aggiornate, invariate, 0);
}

function mostraEsitoImportazione(nuove, aggiornate, invariate, mediaErr) {
  const dup = progDuplicati().size;

  const dlg = el('dialog', {},
    el('h2', { testo: 'Importazione completata' }),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;padding:12px;background:var(--focus);border-left:4px solid var(--lichene);border-radius:6px' },
      el('div', {}, el('div', { style: 'font:700 18px system-ui;color:var(--bosco)', testo: String(nuove) }), el('div', { style: 'font-size:12px;color:var(--tenue)', testo: 'Nuove schede' })),
      el('div', {}, el('div', { style: 'font:700 18px system-ui;color:var(--bosco)', testo: String(aggiornate) }), el('div', { style: 'font-size:12px;color:var(--tenue)', testo: 'Aggiornate' })),
      el('div', {}, el('div', { style: 'font:700 18px system-ui;color:var(--tenue)', testo: String(invariate) }), el('div', { style: 'font-size:12px;color:var(--tenue)', testo: 'Già attuali' })),
      el('div', {}, el('div', { style: 'font:700 18px system-ui;color:var(--bosco)', testo: String(S.schede.length) }), el('div', { style: 'font-size:12px;color:var(--tenue)', testo: 'Totale attive ora' }))),
    mediaErr ? el('p', { style: 'color:var(--ruggine);font-weight:600;font-size:13px', testo: `⚠ ${mediaErr} file media non importati` }) : null,
    dup ? el('p', { style: 'color:var(--ruggine);font-weight:600;font-size:13px', testo: `⚠ ${dup} numeri progressivi duplicati (segnalati nell'elenco)` }) : null,
    el('div', { class: 'azioni' }, el('button', { type: 'button', class: 'btn primario', onclick: () => dlg.close() }, 'OK')));
  document.body.append(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

function liberaMediaRecord(r) {
  for (const p of r.foto) liberaUrlFoto(p.id);
  for (const a of r.audio) liberaUrlAudio(a.id);
}

// Legge un backup ZIP (v3/v4): dati da backup.json, foto e audio come file veri
async function leggiBackupZip(file) {
  const zip = await JSZip.loadAsync(file);
  const dj = zip.file('backup.json');
  if (!dj) throw new Error('questo ZIP non contiene backup.json: è un’esportazione vecchia o non creata dall’app');
  const json = JSON.parse(await dj.async('string'));
  if (json?.app !== 'scheda-botanica' || !Array.isArray(json.schede)) throw new Error('backup.json non è un archivio valido');
  validaStrutturaBackup(json);
  const indice = json.file || {};
  const specieFile = zip.file('specie.json');
  const voci = await Promise.all((json.schede || []).map(async (s) => {
    const { record } = normalizza(s);
    const fotoDaSalvare = [], audioDaSalvare = [];
    for (const p of record.foto) {
      const f = indice[p.id] && zip.file(indice[p.id]);
      if (f) fotoDaSalvare.push({ id: p.id, blob: new Blob([await f.async('arraybuffer')], { type: 'image/jpeg' }) });
    }
    for (const a of record.audio) {
      const voce = indice[a.id];
      const f = voce && zip.file(voce.percorso);
      if (f) audioDaSalvare.push({ id: a.id, blob: new Blob([await f.async('arraybuffer')], { type: voce.tipo || 'audio/webm' }) });
    }
    return { record, fotoDaSalvare, audioDaSalvare };
  }));
  voci.specie = specieFile ? JSON.parse(await specieFile.async('string')) : [];
  voci.guida = json.guida === undefined ? [] : json.guida;
  voci.traccia = Array.isArray(json.traccia) ? json.traccia : [];
  return voci;
}

async function importaBackupDaFile(file) {
  try {
    stato('Leggo il backup…');
    const eZip = /\.zip$/i.test(file.name) || file.type.includes('zip');
    const voci = eZip ? await leggiBackupZip(file) : leggiFormatoBackup(JSON.parse(await file.text()));
    const nFoto = voci.reduce((n, v) => n + (v.fotoDaSalvare?.length || 0), 0);
    const nAudio = voci.reduce((n, v) => n + (v.audioDaSalvare?.length || 0), 0);
    const nAttive = voci.filter((v) => !v.record.cancellata).length;
    const nCestino = voci.length - nAttive;
    const nTraccia = voci.traccia?.length || 0;
    $('#import-info').textContent = `Contenuto verificato: ${nAttive} schede attive, ${nCestino} nel cestino, ${nFoto} foto, ${nAudio} audio, ${voci.specie?.length || 0} specie identificate, ${voci.guida?.length || 0} piante integrate nella guida e ${nTraccia} punti traccia.`;
    const modo = await chiedi($('#dlg-import'));
    if (modo === 'annulla') return;
    if (modo === 'sostituisci' && !confirm('L’archivio attuale verrà sostituito, comprese schede e integrazioni del catalogo. Un backup precedente alla versione 3.17 non contiene le integrazioni. Continuare?')) return;
    stato('Importazione in corso…');
    await importaDati(voci, modo);
    // Catalogo e media sono già stati salvati nella stessa transazione.
    stato('Importazione completata');
  } catch (e) {
    alert('Importazione non riuscita: ' + e.message);
    stato('');
  }
}

function testoCSV() {
  if (!S.schede.length) return null;
  const q = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (v, dec) => (v == null || v === '' ? '' : Number(v).toFixed(dec).replace('.', ','));
  const intest = [...CAMPI.map((c) => c.label), 'Latitudine', 'Longitudine', 'Precisione (m)', 'Quota (m)', 'Volume chioma (m³)', 'Ombra (m²)', 'CO2 stoccata (kg)', 'ID GBIF', 'N° foto', 'N° audio', 'Creata', 'Modificata'];
  const righe = [...S.schede].sort(perProg).map((r) => {
    const s = stimaAlbero(r);
    return [
      ...CAMPI.map((c) => (c.tipo === 'numero' ? String(r[c.k]).replace('.', ',') : r[c.k])),
      num(r.gps?.lat, 6), num(r.gps?.lng, 6), num(r.gps?.acc, 0), num(r.gps?.alt, 0),
      num(s.volumeChioma, 1), num(s.ombraM2, 0), num(s.co2Kg, 0), r.gbifId || '',
      r.foto.length, r.audio.length, dataIT(r.creato), dataIT(r.modificato),
    ];
  });
  // BOM + separatore ";" → Excel in italiano lo apre già in colonne
  return '\uFEFF' + [intest, ...righe].map((riga) => riga.map(q).join(';')).join('\r\n');
}

function esportaCSV() {
  const csv = testoCSV();
  if (!csv) return alert('Nessuna scheda da esportare.');
  scarica(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `scheda-botanica-${oggi()}.csv`);
}

function schedeConGPS(avvisa = true) {
  const l = [...S.schede].filter((r) => r.gps).sort(perProg);
  if (!l.length && avvisa) alert('Nessuna scheda ha coordinate GPS.');
  return l;
}

function testoGeoJSON() {
  const l = schedeConGPS(false);
  if (!l.length) return null;
  const gj = {
    type: 'FeatureCollection',
    features: l.map((r) => {
      const s = stimaAlbero(r);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.gps.lng, r.gps.lat] },
        properties: Object.fromEntries([
          ...CAMPI.map((c) => [c.k, c.tipo === 'numero' && r[c.k] !== '' ? Number(r[c.k]) : r[c.k]]),
          ['precisione_m', r.gps.acc], ['quota_m', r.gps.alt], ['n_foto', r.foto.length], ['n_audio', r.audio.length],
          ['volume_chioma_m3', s.volumeChioma != null ? Number(s.volumeChioma.toFixed(1)) : null],
          ['ombra_m2', s.ombraM2 != null ? Number(s.ombraM2.toFixed(0)) : null],
          ['co2_kg', s.co2Kg != null ? Number(s.co2Kg.toFixed(0)) : null],
          ['gbif_id', r.gbifId || null],
          ['qr', testoQR(r)],
        ]),
      };
    }),
  };
  return JSON.stringify(gj, null, 2);
}

function esportaGeoJSON() {
  const gj = testoGeoJSON();
  if (!gj) return schedeConGPS();
  scarica(new Blob([gj], { type: 'application/geo+json' }), `scheda-botanica-${oggi()}.geojson`);
}

function testoGPX() {
  const l = schedeConGPS(false);
  if (!l.length) return null;
  const wpt = l.map((r) => `  <wpt lat="${r.gps.lat}" lon="${r.gps.lng}">` +
    (r.gps.alt != null ? `<ele>${r.gps.alt}</ele>` : '') +
    `<time>${escHtml(r.gps.quando)}</time><name>${escHtml(`${r.prog} ${r.nome}`)}</name>` +
    `<desc>${escHtml([dataBreveIT(r.data), r.problemi].filter(Boolean).join(' – '))}</desc></wpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Scheda Botanica" xmlns="http://www.topografix.com/GPX/1/1">\n${wpt}\n</gpx>\n`;
}

function esportaGPX() {
  const gpx = testoGPX();
  if (!gpx) return schedeConGPS();
  scarica(new Blob([gpx], { type: 'application/gpx+xml' }), `scheda-botanica-${oggi()}.gpx`);
}

function testoKML() {
  const l = schedeConGPS(false);
  if (!l.length) return null;
  const placemark = l.map((r) => `<Placemark><name>${escHtml(r.prog + ' - ' + (r.nome || ''))}</name>` +
    `<description>${escHtml([dataBreveIT(r.data), r.problemi, r.gbifId ? `GBIF: https://www.gbif.org/species/${r.gbifId}` : ''].filter(Boolean).join(' – '))}</description>` +
    `<Point><coordinates>${r.gps.lng},${r.gps.lat}${r.gps.alt != null ? ',' + r.gps.alt : ''}</coordinates></Point></Placemark>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Scheda Botanica</name>${placemark}</Document></kml>`;
}

function esportaKML() {
  const kml = testoKML();
  if (!kml) return schedeConGPS();
  scarica(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `scheda-botanica-${oggi()}.kml`);
}

/* ---------- ZIP completo: dati in formati aperti + foto e audio reali ---------- */
// modo 'scarica' (predefinito): salva il file nella cartella Download come sempre.
// modo 'condividi': apre il pannello "Condividi" del telefono (Drive, Dropbox, WhatsApp…),
//                    così l'utente sceglie la destinazione in un tocco in più, senza uscire dall'app.
async function esportaZIP(modo = 'scarica', opzioni = {}) {
  await TRK.coda;
  const tutteLeSchede = opzioni.soloAttive ? [...S.schede] : [...S.schede, ...S.cestino];
  if (!tutteLeSchede.length && !S.traccia.length && !S.specie.length && !S.guida.length) { alert('Nessun dato da esportare.'); return false; }
  await salvaTuttiInSospeso();
  stato('Preparo lo ZIP…');
  try {
    const zip = new JSZip();
    const cartFoto = zip.folder('foto');
    const cartAudio = zip.folder('audio');
    const indice = {};   // id file -> percorso nello ZIP, serve al ripristino
    let n = 0;
    for (const r of tutteLeSchede) {
      stato(`Preparo il backup… ${++n}/${tutteLeSchede.length}`);
      const base = `${r.prog}_${nomeFile(r.nome)}`;
      for (const p of r.foto) {
        const b = await DB.leggi('foto', p.id);
        if (!b) throw new Error(`foto mancante nella scheda N° ${r.prog}`);
        const f = `foto/${base}_${p.id}.jpg`; cartFoto.file(f.slice(5), b); indice[p.id] = f;
      }
      for (const a of r.audio) {
        const b = await DB.leggi('audio', a.id);
        if (!b) throw new Error(`nota vocale mancante nella scheda N° ${r.prog}`);
        const f = `audio/${base}_${a.id}.${estensioneAudio(b.type || '')}`; cartAudio.file(f.slice(6), b); indice[a.id] = { percorso: f, tipo: b.type || '' };
      }
    }
    zip.file('backup.json', JSON.stringify({ app: 'scheda-botanica', versione: 5, esportato: oraISO(), schede: tutteLeSchede, file: indice, traccia: S.traccia, guida: S.guida }));
    if (S.specie.length) zip.file('specie.json', JSON.stringify(S.specie));
    const csv = testoCSV(); if (csv) zip.file('rilevazioni.csv', csv);
    const gj = testoGeoJSON(); if (gj) zip.file('rilevazioni.geojson', gj);
    const gpx = testoGPX(); if (gpx) zip.file('rilevazioni.gpx', gpx);
    const kml = testoKML(); if (kml) zip.file('rilevazioni.kml', kml);
    const percorso = testoTracciaGPX(); if (percorso) zip.file('percorso.gpx', percorso);
    zip.file('leggimi.txt',
      `Scheda Botanica by Lollo ®2026 — esportazione completa del ${dataIT(oraISO())}\n` +
      `${tutteLeSchede.length} schede, foto nella cartella /foto, audio nella cartella /audio.\n\n` +
      `CSV, GeoJSON, KML e GPX si aprono con Excel, QGIS e Google Earth.\n` +
      `Per ripristinare tutto nell'app: menu ⋮ → "Ripristina backup" e scegli questo ZIP (non scompattarlo).`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const nomeFileZip = opzioni.nomeFile || `scheda-botanica-backup-${oggi()}.zip`;

    if (modo === 'condividi') {
      const condiviso = await condividiFile(blob, nomeFileZip, 'application/zip',
        'Backup Scheda Botanica', `${tutteLeSchede.length} schede — ${dataIT(oraISO())}`);
      if (!condiviso) {
        // Il dispositivo/browser non supporta la condivisione di file: scarichiamo come sempre.
        const destinazione = await scarica(blob, nomeFileZip);
        stato(destinazione === 'cartella' ? 'Condivisione non supportata: backup salvato nella cartella Botanica.' :
          'Il tuo browser non supporta "Condividi": ho scaricato il file, caricalo a mano nella cartella condivisa.');
      } else {
        stato(`Backup pronto per la condivisione: ${tutteLeSchede.length} schede`);
      }
    } else {
      const destinazione = await scarica(blob, nomeFileZip);
      stato(destinazione === 'cartella' ? `Backup salvato in Botanica: ${tutteLeSchede.length} schede.` :
        `Backup preparato: ${tutteLeSchede.length} schede. Verifica il file nei Download.`);
    }
    localStorage.setItem('sb-ultimo-backup', oraISO());
    return true;
  } catch (e) {
    // L'utente che annulla la finestra di condivisione genera un errore "AbortError": non è un vero errore.
    if (e.name === 'AbortError') { stato('Condivisione annullata'); return false; }
    alert('Esportazione ZIP non riuscita: ' + e.message);
    stato('Backup non riuscito', true);
    return false;
  }
}

// Prova ad aprire il pannello "Condividi" nativo del telefono con il file allegato.
// Restituisce true se ci è riuscito, false se il dispositivo/browser non lo supporta
// (in quel caso chi chiama questa funzione ripiega sul download normale).
async function condividiFile(blob, nomeFile, tipo, titolo, testo) {
  if (!navigator.share || !navigator.canShare) return false;
  const file = new File([blob], nomeFile, { type: tipo });
  if (!navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], title: titolo, text: testo });
  return true;
}

/* ---------- importazione da Excel (.xlsx): colonne riconosciute per nome ---------- */
const ALIAS_EXCEL = {
  prog: ['prog'], data: ['data'], nome: ['nome esemplare', 'nome'],
  numero: ['medesimo esemplare', 'medesimo', 'esemplari uguali'],
  grandezza: ['grandezza'], altezza: ['altezza'], circonferenza: ['circonferenza'],
  persistenza: ['persistenza'], formaChioma: ['chioma'], rami: ['rami'],
  crescita: ['crescita'], estensione: ['estensione'],
  tipoFoglia: ['tipo di foglia', 'tipofoglia'], lamina: ['lamina'],
  margine: ['margine'], terreno: ['terreno'], problemi: ['problemi'],
  note: ['altro notato', 'note'],
};

// Associa ogni campo alla colonna dell'intestazione il cui testo lo nomina,
// invece di assumere un ordine fisso: così un foglio con meno colonne (es.
// le vecchie esportazioni senza "circonferenza") si importa comunque bene.
function mappaColonneExcel(rigaIntestazione) {
  const colonneUsate = new Set();
  const mappa = {};
  for (const c of CAMPI) {
    const alias = ALIAS_EXCEL[c.k] || [c.label.toLowerCase()];
    let trovata = -1;
    for (let i = 0; i < rigaIntestazione.length; i++) {
      if (colonneUsate.has(i)) continue;
      const testo = String(rigaIntestazione[i] || '').toLowerCase();
      if (alias.some((a) => testo.includes(a))) { trovata = i; break; }
    }
    if (trovata >= 0) colonneUsate.add(trovata);
    mappa[c.k] = trovata;
  }
  return mappa;
}

function leggiRigheCSV(testo) {
  const contenuto = testo.replace(/^\uFEFF/, '');
  let separatore = ';', campo = '', riga = [], righe = [], virgolette = false;
  let virgole = 0, puntiVirgola = 0, dentro = false;
  for (let i = 0; i < contenuto.length; i++) {
    const c = contenuto[i];
    if (c === '"') {
      if (dentro && contenuto[i + 1] === '"') i++;
      else dentro = !dentro;
    } else if (!dentro) {
      if (c === '\r' || c === '\n') break;
      if (c === ',') virgole++;
      if (c === ';') puntiVirgola++;
    }
  }
  if (virgole > puntiVirgola) separatore = ',';
  for (let i = 0; i < contenuto.length; i++) {
    const c = contenuto[i];
    if (c === '"') {
      if (virgolette && contenuto[i + 1] === '"') { campo += '"'; i++; }
      else virgolette = !virgolette;
    } else if (c === separatore && !virgolette) { riga.push(campo); campo = ''; }
    else if ((c === '\n' || c === '\r') && !virgolette) {
      if (c === '\r' && contenuto[i + 1] === '\n') i++;
      riga.push(campo); righe.push(riga); riga = []; campo = '';
    } else campo += c;
  }
  if (virgolette) throw new Error('CSV non valido: virgolette non chiuse');
  if (riga.length || campo) { riga.push(campo); righe.push(riga); }
  return righe;
}

async function leggiRigheExcel(file) {
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.csv')) return { righe: leggiRigheCSV(await file.text()), date1904: false };
  if (!nome.endsWith('.xlsx')) throw new Error('Formato non supportato: usa .xlsx o .csv. Per un vecchio .xls, salvalo prima come .xlsx.');
  const XlsxPopulate = await caricaLibreriaExcel();
  const buf = await file.arrayBuffer();
  const cartella = await XlsxPopulate.fromDataAsync(buf);
  const foglio = cartella.sheet(0);
  const righe = foglio.usedRange()?.value() || [];
  // Manteniamo la compatibilità con i fogli Excel che usano il calendario 1904.
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('xl/workbook.xml')?.async('text');
  const proprieta = xml ? new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('workbookPr')[0] : null;
  const date1904 = /^(1|true)$/i.test(proprieta?.getAttribute('date1904') || '');
  return { righe, date1904 };
}

async function importaExcelDaFile(file) {
  try {
    const { righe, date1904 } = await leggiRigheExcel(file);
    let indiceIntest = -1;
    for (let i = 0; i < Math.min(10, righe.length); i++) {
      const t = (righe[i] || []).join(' ').toLowerCase();
      if (t.includes('prog') && t.includes('data')) { indiceIntest = i; break; }
    }
    if (indiceIntest === -1) return alert('Intestazione non riconosciuta: la prima riga con i nomi delle colonne deve contenere almeno "Prog." e "Data".');
    const mappa = mappaColonneExcel(righe[indiceIntest]);
    const dati = righe.slice(indiceIntest + 1).filter((r) => r.some((v) => String(v).trim() !== ''));
    if (!dati.length) return alert('Nessuna riga di dati trovata sotto l’intestazione.');
    const voci = dati.map((cols) => {
      const obj = {};
      CAMPI.forEach((c) => {
        const i = mappa[c.k];
        const valore = i >= 0 && cols[i] !== undefined ? cols[i] : '';
        obj[c.k] = c.tipo === 'data' ? normalizzaData(valore, date1904) : String(valore ?? '');
      });
      return normalizza(obj);
    });
    // Il foglio contiene solo rilievi: non deve eliminare le integrazioni
    // botaniche locali, neppure se si sostituiscono tutte le schede.
    voci.guida = S.guida;
    const nonTrovate = CAMPI.filter((c) => mappa[c.k] < 0).map((c) => c.label);
    $('#import-info').textContent = `Il file Excel contiene ${voci.length} righe.` +
      (nonTrovate.length ? ` Colonne non trovate (restano vuote): ${nonTrovate.join(', ')}.` : '') +
      ` Le foto e l'audio non sono nel foglio Excel e non verranno importati. Le integrazioni della guida restano conservate.`;
    const modo = await chiedi($('#dlg-import'));
    if (modo === 'annulla') return;
    if (modo === 'sostituisci' && !confirm('Tutte le schede attuali verranno cancellate. Continuare?')) return;
    stato('Importazione da Excel…');
    await importaDati(voci, modo);
    stato('Importazione da Excel completata');
  } catch (e) {
    alert('Importazione Excel non riuscita: ' + e.message);
    stato('');
  }
}

async function mostraSpazio() {
  const ultimo = localStorage.getItem('sb-ultimo-backup');
  let t = ultimo ? `Ultimo backup: ${dataIT(ultimo)}.` : 'Nessun backup esportato finora.';
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      t += ` Spazio usato ${(usage / 1048576).toFixed(1)} MB su ${(quota / 1048576).toFixed(0)} MB disponibili.`;
    }
    if (navigator.storage?.persisted) {
      t += (await navigator.storage.persisted())
        ? ' Archivio protetto dalla pulizia automatica del browser.'
        : ' Archivio non protetto: se il telefono resta senza spazio il browser può cancellarlo, quindi esporta backup regolari.';
    }
  } catch { /* informazione facoltativa */ }
  $('#spazio').textContent = t;
}

/* =====================================================================
   12. MIGRAZIONE DALLA VECCHIA APP (localStorage "scheda-botanica-v3")
   Funziona solo se il file nuovo viene aperto dallo stesso percorso/sito
   della versione precedente; altrimenti usa "Importa backup".
   ===================================================================== */
async function migraVecchiaVersione() {
  if (localStorage.getItem('sb-migrazione')) return;
  let vecchi = null;
  try { vecchi = JSON.parse(localStorage.getItem('scheda-botanica-v3') || 'null'); } catch { /* dati illeggibili */ }
  if (!Array.isArray(vecchi) || !vecchi.length) return;
  if (!confirm(`Trovate ${vecchi.length} schede della versione precedente. Importarle?`)) {
    localStorage.setItem('sb-migrazione', 'rifiutata');
    return;
  }
  await importaDati(vecchi.map(normalizza), 'unisci');
  localStorage.setItem('sb-migrazione', oraISO());
}

/* =====================================================================
   13. AVVIO
   ===================================================================== */
function applicaTema(t) {
  document.documentElement.dataset.tema = t;
  document.querySelector('meta[name=theme-color]').content = t === 'scuro' ? '#1c241f' : '#2f5d3a';
}

function applicaDimensioneInterfaccia(valore) {
  const scelto = ['auto', '110', '125'].includes(valore) ? valore : 'auto';
  document.body.dataset.interfaccia = scelto;
  $('#sel-dimensione-interfaccia').value = scelto;
  localStorage.setItem('sb-dimensione-interfaccia', scelto);
}

async function aggiornaStatoCartellaBotanica() {
  const testo = $('#cartella-botanica-stato');
  const scegli = $('#btn-cartella-botanica');
  const dimentica = $('#btn-cartella-botanica-dimentica');
  if (typeof window.showDirectoryPicker !== 'function') {
    testo.textContent = 'Selezione cartella non supportata su questo browser: i file vanno nei Download normali.';
    scegli.textContent = 'Funzione non disponibile';
    scegli.disabled = true;
    dimentica.classList.add('nascosto');
    return;
  }
  scegli.disabled = false;
  const permesso = await permessoCartellaBotanica();
  if (permesso === 'granted') {
    testo.textContent = `Cartella attiva: ${cartellaBotanicaHandle.name || 'Botanica'}. Tutti i nuovi salvataggi finiranno qui.`;
    scegli.textContent = 'Cambia cartella';
    dimentica.classList.remove('nascosto');
  } else if (cartellaBotanicaHandle) {
    testo.textContent = 'Cartella ricordata, ma il browser richiede di autorizzarla nuovamente.';
    scegli.textContent = 'Riautorizza cartella';
    dimentica.classList.remove('nascosto');
  } else {
    testo.textContent = 'Download normali del browser. Puoi collegare Download/Botanica.';
    scegli.textContent = 'Scegli Download/Botanica';
    dimentica.classList.add('nascosto');
  }
}

async function collegaCartellaBotanica() {
  const motivo = cartellaBotanicaHandle ?
    'La cartella Botanica è già stata scelta, ma il browser deve autorizzarla nuovamente per poter continuare a salvare i file.' :
    'Per raccogliere automaticamente backup, QR, report ed esportazioni, l’app deve poter creare e scrivere nella cartella Download/Botanica.';
  if (!confirm(`${motivo}\n\nIl permesso vale solo per la cartella che scegli. L’app non cancella i file, non accede alle altre cartelle e non invia nulla online.\n\nVuoi continuare e aprire la richiesta di autorizzazione del browser?`)) {
    $('#cartella-botanica-stato').textContent = 'Autorizzazione non richiesta: i file continueranno nei Download normali.';
    return;
  }
  try {
    if (cartellaBotanicaHandle && await permessoCartellaBotanica() === 'prompt' && cartellaBotanicaHandle.requestPermission) {
      const permesso = await cartellaBotanicaHandle.requestPermission({ mode: 'readwrite' });
      if (permesso !== 'granted') throw new Error('Permesso di scrittura non concesso.');
    } else await scegliCartellaBotanica();
    await aggiornaStatoCartellaBotanica();
  } catch (e) {
    if (e.name !== 'AbortError') $('#cartella-botanica-stato').textContent = e.message || 'Impossibile collegare la cartella.';
  }
}

function collegaEventi() {
  $('#btn-versione').textContent = `v${APP_VERSIONE} ↻`;
  $('#btn-versione').onclick = () => {
    $('#btn-menu').click();
    $('#dlg-menu .aggiornamento-app').scrollIntoView({ block: 'nearest' });
    verificaAggiornamenti(true);
  };
  $('.nav-editor').onclick = (e) => { const link = e.target.closest('a'); if (link) { e.preventDefault(); $(link.getAttribute('href')).scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
  $('#btn-tema').onclick = () => {
    const t = document.documentElement.dataset.tema === 'scuro' ? 'chiaro' : 'scuro';
    localStorage.setItem('sb-tema', t);
    applicaTema(t);
  };
  $('#f-nome').addEventListener('focus', mostraRisultatiNome);
  $('#f-nome').addEventListener('keydown', (e) => {
    const aperto = !$('#nome-risultati').classList.contains('nascosto');
    if (e.key === 'Escape' && aperto) { e.preventDefault(); e.stopPropagation(); chiudiRisultatiNome(); return; }
    if (e.key === 'Tab') { chiudiRisultatiNome(); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && nomeSuggerimenti.length) {
      if (!aperto) mostraRisultatiNome();
      e.preventDefault();
      nomeSuggerimentoAttivo = (nomeSuggerimentoAttivo + (e.key === 'ArrowDown' ? 1 : -1) + nomeSuggerimenti.length) % nomeSuggerimenti.length;
      aggiornaAttivoNome();
    } else if (e.key === 'Enter' && aperto && nomeSuggerimentoAttivo >= 0) {
      e.preventDefault();
      selezionaRisultatoNome(nomeSuggerimenti[nomeSuggerimentoAttivo]);
    }
  });
  $('#f-nome').addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== $('#f-nome')) chiudiRisultatiNome();
  }, 120));
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.campo-nome')) chiudiRisultatiNome();
  });
  $('#editor').addEventListener('scroll', posizionaRisultatiNome, { passive: true });
  window.visualViewport?.addEventListener('resize', posizionaRisultatiNome);
  $('#cerca').oninput = disegnaElenco;
  $('#filtro-data').onchange = disegnaElenco;
  $('#apri-scheda-salvata').onchange = (e) => {
    const uid = e.target.value;
    e.target.value = '';
    if (uid) { cambiaVista('schede'); apriEditor(uid); }
  };
  $('#btn-filtri-avanzati').onclick = () => {
    const nascosto = $('#pannello-filtri').classList.toggle('nascosto');
    $('#btn-filtri-avanzati').setAttribute('aria-expanded', String(!nascosto));
  };
  $('#btn-seleziona-tutte').onclick = toggleSelezionaTutte;
  for (const id of ['#filtro-specie', '#filtro-dal', '#filtro-al']) $(id).onchange = disegnaElenco;
  for (const id of ['#filtro-problemi', '#filtro-senza-foto', '#filtro-senza-gps']) $(id).onchange = disegnaElenco;
  $('#btn-filtri-azzera').onclick = azzeraFiltriAvanzati;
  $('#btn-nuova').onclick = () => { cambiaVista('schede'); nuovaScheda(); };
  $('#home-traccia-avvia').onclick = avviaTraccia;
  $('#home-traccia-pausa').onclick = pausaTraccia;
  $('#home-traccia-ferma').onclick = fermaTraccia;
  $('#home-meteo').onclick = () => $('#dlg-meteo').showModal();
  $('#meteo-form').onsubmit = cercaMeteo3B;
  $('#meteo-gps').onclick = () => apriMeteo3B('https://www.3bmeteo.com/');
  $('#meteo-chiudi').onclick = () => $('#dlg-meteo').close();
  $('#btn-stampa').onclick = () => apriStampa();
  $('#st-campi-tutti').onclick = (e) => { e.preventDefault(); document.querySelectorAll('input[name=st-campo]').forEach((c) => { c.checked = true; }); };
  $('#st-campi-nessuno').onclick = (e) => { e.preventDefault(); document.querySelectorAll('input[name=st-campo]').forEach((c) => { c.checked = false; }); };

  $('#btn-chiudi').onclick = () => chiudiEditor();
  $('#btn-salva-scheda').onclick = salvaSchedaVisibile;
  $('#btn-elimina').onclick = eliminaScheda;
  $('#btn-stampa-una').onclick = async () => { await salvaOra(S.aperta); apriStampa(S.aperta); };
  $('#btn-scatta').onclick = () => $('#in-scatta').click();
  $('#btn-galleria').onclick = () => $('#in-galleria').click();
  for (const id of ['#in-scatta', '#in-galleria']) {
    $(id).onchange = (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length && S.aperta) aggiungiFoto(S.aperta, files);
    };
  }
  $('#vista-chiudi').onclick = () => $('#vista-foto').close();
  $('#vista-foto').onclick = (e) => { if (e.target.id === 'vista-foto') e.target.close(); };

  $('#btn-menu').onclick = () => {
    document.documentElement.dataset.dispositivo = '';
    aggiornaDispositivo();
    mostraSpazio();
    $('#chk-backup-auto').checked = localStorage.getItem('sb-backup-auto') !== '0';
    $('#sel-backup-auto-giorni').value = localStorage.getItem('sb-backup-auto-giorni') || '1';
    $('#chk-notifica-backup').checked = localStorage.getItem('sb-notifica-backup') === '1';
    aggiornaStatoNotificaBackup();
    aggiornaStatoCartellaBotanica();
    $('#aggiornamento-stato').textContent = `Versione installata: ${APP_VERSIONE}`;
    $('#dlg-menu').showModal();
  };
  $('#btn-controlla-aggiornamenti').onclick = () => verificaAggiornamenti(true);
  $('#btn-applica-aggiornamento').onclick = applicaAggiornamento;
  $('#sel-dimensione-interfaccia').onchange = (e) => applicaDimensioneInterfaccia(e.target.value);
  $('#btn-cartella-botanica').onclick = collegaCartellaBotanica;
  $('#btn-cartella-botanica-dimentica').onclick = async () => { await dimenticaCartellaBotanica(); await aggiornaStatoCartellaBotanica(); };
  $('#chk-backup-auto').onchange = (e) => localStorage.setItem('sb-backup-auto', e.target.checked ? '1' : '0');
  $('#sel-backup-auto-giorni').onchange = (e) => localStorage.setItem('sb-backup-auto-giorni', e.target.value);
  $('#chk-notifica-backup').onchange = async (e) => {
    if (e.target.checked) {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      if (!('Notification' in window) || Notification.permission !== 'granted') e.target.checked = false;
    }
    localStorage.setItem('sb-notifica-backup', e.target.checked ? '1' : '0');
    aggiornaStatoNotificaBackup();
  };
  $('#avviso-db-riprova').onclick = () => location.reload();
  $('#avviso-backup-fai').onclick = () => { nascondiAvvisoBackup(); esportaZIP(); };
  $('#avviso-backup-ignora').onclick = () => { localStorage.setItem('sb-avviso-backup-ignorato', oggi()); nascondiAvvisoBackup(); };
  $('#dlg-menu').addEventListener('click', (e) => {
    const az = e.target.closest('button[data-az]')?.dataset.az;
    if (!az) return;
    $('#dlg-menu').close();
    if (az === 'backup') esportaBackup().catch((e) => { stato('Backup non riuscito: ' + e.message, true); alert('Backup non riuscito: ' + e.message); });
    if (az === 'ripristina') $('#in-backup').click();
    if (az === 'excel') $('#in-excel').click();
    if (az === 'zip') esportaZIP();
    if (az === 'zip-condividi') esportaZIP('condividi');
    if (az === 'plantnet') apriImpostazioniPlantNet();
    if (az === 'completa-guida') apriCompletaGuida();
    if (az === 'csv') esportaCSV();
    if (az === 'geojson') esportaGeoJSON();
    if (az === 'gpx') esportaGPX();
    if (az === 'kml') esportaKML();
  });
  $('#in-backup').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importaBackupDaFile(f);
  };
  $('#in-excel').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importaExcelDaFile(f);
  };

  // le opzioni foto/QR servono solo per le schede A4
  document.querySelectorAll('input[name=st-tipo]').forEach((x) => {
    x.onchange = () => {
      const tipo = $('input[name=st-tipo]:checked').value;
      $('#st-opz-schede').classList.toggle('nascosto', tipo === 'etichette');
      $('#st-opz-pdf').classList.toggle('nascosto', tipo === 'excel');
      $('#st-suggerimento').classList.toggle('nascosto', tipo === 'excel');
      $('#st-btn-conferma').textContent = tipo === 'excel' ? '📊 Scarica Excel' : 'Stampa';
    };
  });

  // aiuto
  $('#btn-aiuto').onclick = () => { $('#aiuto-versione').textContent = `Versione dell'app: ${APP_VERSIONE}`; $('#dlg-aiuto').showModal(); };
  $('#gs-cerca').oninput = disegnaListaGuidaSpecie;
  $('#auto-chiudi').onclick = () => { AUTO_RICERCA.serie++; $('#dlg-cerca-auto').close(); };
  $('#dlg-cerca-auto').addEventListener('cancel', () => { AUTO_RICERCA.serie++; });
  $('#gs-chiudi').onclick = () => $('#dlg-guida-specie').close();
  popolaDatalistZonaHabitat();
  $('#zh-cerca').oninput = disegnaListaZonaHabitat;
  $('#zh-chiudi').onclick = () => $('#dlg-zona-habitat').close();
  inizializzaSelectCaratteristiche();
  $('#gs-modo-nome').onclick = () => { cambiaModoGuidaSpecie('nome'); disegnaListaGuidaSpecie(); };
  $('#gs-modo-carat').onclick = () => { cambiaModoGuidaSpecie('carat'); precompilaCaratteristicheDaScheda(); disegnaListaGuidaSpecie(); };
  $('#gs-modo-foto').onclick = () => cambiaModoGuidaSpecie('foto');
  $('#gs-btn-scatta').onclick = () => $('#gs-in-scatta').click();
  $('#gs-btn-galleria').onclick = () => $('#gs-in-galleria').click();
  for (const id of ['#gs-in-scatta', '#gs-in-galleria']) {
    $(id).onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file || !S.aperta) return;
      const r = S.aperta;
      $('#dlg-guida-specie').close();
      await aggiungiFoto(r, [file]);
      const nuovaFoto = r.foto[r.foto.length - 1];
      if (nuovaFoto) apriIdentificazione(r, nuovaFoto);
    };
  }
  for (const k of GS_CAMPI_SCHEDA) $('#gs-c-' + k).onchange = disegnaListaGuidaSpecie;
  $('#gs-c-grandezza').onchange = disegnaListaGuidaSpecie;
  $('#gs-c-altro').oninput = disegnaListaGuidaSpecie;

  // Catalogo integrabile: editor separato dai rilievi.
  const controlliAI = ['ai-ricerca-servizio', 'ai-modello-gemini', 'ai-modello-groq', 'ai-modello-groq-vision', 'ai-modello-openrouter'];
  for (const id of controlliAI) {
    try {
      const salvato = localStorage.getItem('sb-' + id);
      if (salvato) $('#' + id).value = salvato;
    } catch { /* Impostazioni avanzate facoltative. */ }
    $('#' + id).onchange = () => {
      try { localStorage.setItem('sb-' + id, $('#' + id).value.trim()); } catch { /* Resta valido per questa pagina. */ }
      if (id === 'ai-modello-openrouter') $('#cg-ai-modello').value = $('#' + id).value.trim();
    };
  }
  $('#cg-ai-modello').value = $('#ai-modello-openrouter').value;
  $('#cg-ai-modello').onchange = () => {
    $('#ai-modello-openrouter').value = $('#cg-ai-modello').value.trim();
    $('#ai-modello-openrouter').dispatchEvent(new Event('change'));
  };
  ripristinaChiaviAI();
  $('#ai-carica-env').onclick = () => $('#ai-file-env').click();
  $('#ai-file-env').onchange = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) caricaChiaviAI(file);
  };
  $('#ai-ricorda-env').onchange = ricordaChiaviAI;
  $('#ai-rimuovi-env').onclick = () => { chiaviAI = {}; ServiziRicerca.svuotaCache(); $('#ai-file-env').value = ''; ricordaChiaviAI(); };
  $('#cg-ai-proponi').onclick = proponiCaratteriSlideAI;
  $('#cg-ai-fornitore').onchange = () => aggiornaFornitoreSlide();
  $('#cg-cerca').oninput = listaCompletaGuida;
  $('#cg-filtro').onchange = listaCompletaGuida;
  $('#cg-form').oninput = () => { $('#cg-stato').classList.remove('cg-errore'); aggiornaModificheCatalogo(); };
  $('#cg-form').onchange = () => { $('#cg-stato').classList.remove('cg-errore'); aggiornaModificheCatalogo(); };
  $('#cg-fonte').onchange = () => { $('#cg-stato').classList.remove('cg-errore'); aggiornaModificheCatalogo(); };
  $('#cg-form').onsubmit = (e) => e.preventDefault();
  $('#cg-salva').onclick = salvaIntegrazioneGuida;
  $('#cg-esporta').onclick = esportaIntegrazioniGuida;
  $('#cg-esporta-completo').onclick = esportaCatalogoCompleto;
  $('#cg-importa').onclick = () => $('#cg-file-importa').click();
  $('#cg-importa-completo').onclick = () => $('#cg-file-completo').click();
  $('#cg-file-importa').onchange = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) importaIntegrazioniGuida(file);
  };
  $('#cg-file-completo').onchange = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) importaCatalogoCompleto(file);
  };
  $('#cg-indietro').onclick = () => {
    if (!confermaUscitaCatalogo()) return;
    cgSpecie = null; cgSporco = false;
    $('#cg-editor').classList.add('nascosto');
    $('#cg-lista').classList.remove('nascosto');
    listaCompletaGuida();
  };
  $('#cg-precedente').onclick = () => cambiaPiantaCatalogo(-1);
  $('#cg-successiva').onclick = () => cambiaPiantaCatalogo(1);
  $('#cg-chiudi').onclick = () => { if (confermaUscitaCatalogo()) { cgSporco = false; $('#dlg-completa-guida').close(); } };
  $('#dlg-completa-guida').addEventListener('cancel', (e) => { if (!confermaUscitaCatalogo()) e.preventDefault(); else cgSporco = false; });

  // cestino
  $('#btn-cestino').onclick = () => {
    $('#cestino-giorni').value = giorniConservazioneCestino();
    disegnaCestino();
    $('#dlg-cestino').showModal();
  };
  $('#cestino-giorni').onchange = (e) => {
    const v = Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 30)));
    e.target.value = v;
    localStorage.setItem('sb-cestino-giorni', v);
  };
  $('#btn-cestino-svuota').onclick = svuotaCestino;
  $('#btn-nuovo-elenco').onclick = nuovoElenco;
  $('#btn-cestino-chiudi').onclick = () => $('#dlg-cestino').close();

  // tab schede / mappa
  $('#tab-schede').onclick = () => cambiaVista('schede');
  $('#tab-mappa').onclick = () => cambiaVista('mappa');
  $('#tab-timeline').onclick = () => cambiaVista('timeline');

  // traccia GPS (percorso)
  $('#btn-traccia-gpx').onclick = esportaTracciaGPX;
  $('#btn-traccia-cancella').onclick = cancellaTraccia;

  // scegliere un punto GPS dalla mappa
  $('#btn-mappa-scegli-usa').onclick = confermaPosizioneScelta;
  $('#btn-mappa-scegli-annulla').onclick = () => $('#dlg-mappa-scegli').close();

  // cache offline delle tile della mappa
  $('#btn-mappa-scarica-area').onclick = apriScaricaAreaMappa;
  $('#mo-margine').onchange = aggiornaStimaAreaMappa;
  $('#btn-mo-scarica').onclick = avviaScaricamentoAreaMappa;
  $('#btn-mo-annulla-scaricamento').onclick = () => { SCARICAMENTO_MAPPA.annulla = true; };
  $('#btn-mo-svuota').onclick = svuotaCacheMappa;
  $('#dlg-mappa-offline').querySelector('[data-chiudi-mo]').onclick = () => $('#dlg-mappa-offline').close();

  // scansione QR
  $('#btn-scansiona').onclick = apriScanner;
  $('#scanner-chiudi').onclick = chiudiScanner;
  $('#dlg-scanner').addEventListener('cancel', chiudiScanner);

  // campo illustrato: picker con icona + spiegazione
  $('#pk-chiudi').onclick = () => $('#dlg-illustrata').close();
  $('#pk-usa-altro').onclick = () => {
    const v = $('#pk-altro').value.trim();
    if (v && campoIllustratoCorrente) sceglIllustrata(campoIllustratoCorrente, v);
  };

  // note vocali
  $('#btn-audio-rec').onclick = () => avviaRegistrazione(S.aperta);
  $('#btn-audio-stop').onclick = fermaRegistrazione;
  $('#btn-audio-annulla').onclick = annullaRegistrazione;

  // QR e report della scheda aperta
  $('#btn-qr-scarica').onclick = () => scaricaQR(S.aperta);
  $('#btn-report').onclick = () => scaricaReportSingolo(S.aperta);

  // identificazione specie (PlantNet)
  $('#pn-verifica').onclick = verificaChiavePlantNet;
  $('#pn-mostra').onclick = () => { $('#pn-chiave').type = $('#pn-chiave').type === 'password' ? 'text' : 'password'; };
  $('#pn-salva').onclick = () => {
    localStorage.setItem('sb-plantnet-key', $('#pn-chiave').value.trim());
    stato('Chiave PlantNet salvata');
    $('#dlg-plantnet').close();
  };
  $('#pn-rimuovi').onclick = () => {
    localStorage.removeItem('sb-plantnet-key');
    $('#pn-chiave').value = '';
    $('#pn-stato').textContent = 'Chiave rimossa.';
  };
  $('#ident-invia').onclick = eseguiIdentificazione;
  $('#ident-chiudi').onclick = () => $('#dlg-identifica').close();

  // dispositivo (badge + colonne griglie)
  window.addEventListener('resize', aggiornaDispositivo);

  // barra azioni rapide
  $('#ar-foto').onclick = () => { scorriA('#foto-griglia'); $('#in-scatta').click(); };
  $('#ar-nuova').onclick = nuovaSchedaDaEditor;
  $('#ar-gps').onclick = () => { scorriA('#gps-box'); rilevaGPS(); };
  $('#ar-audio').onclick = () => {
    if (REG.attiva && REG.riga === S.aperta) fermaRegistrazione();
    else { scorriA('#audio-lista'); avviaRegistrazione(S.aperta); }
  };
}

function rilevaIO() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

function avvisoIOSpazio() {
  const ioS = rilevaIO();
  if (!ioS) return;
  const avviso = localStorage.getItem('sb-avviso-ios-spazio');
  if (avviso === 'ignorato-' + new Date().toISOString().split('T')[0]) return;
  setTimeout(() => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `
      <div style="padding:20px;max-width:400px;font-size:15px;">
        <h2 style="margin-top:0;color:var(--ruggine)">⚠️ Avviso iOS</h2>
        <p>Su iPhone/iPad lo spazio è limitato (~50MB).</p>
        <p><strong>Consigli:</strong></p>
        <ul style="font-size:14px;margin:10px 0;padding-left:20px;">
          <li>Fai backup regolari (Menu → Backup)</li>
          <li>Comprimi le foto prima di caricarle</li>
          <li>Svuota cestino app</li>
        </ul>
        <div style="display:flex;gap:10px;">
          <button class="btn" onclick="this.closest('dialog').close()">OK</button>
          <button class="btn" onclick="localStorage.setItem('sb-avviso-ios-spazio','ignorato-'+new Date().toISOString().split('T')[0]);this.closest('dialog').close()">Non oggi</button>
        </div>
      </div>
    `;
    dlg.showModal();
  }, 1000);
}

/* =====================================================================
   PROMEMORIA BACKUP — un banner (e, se autorizzata, una notifica di
   sistema) quando il backup non gira da più tempo di quanto previsto,
   o quando il tentativo automatico di oggi non è riuscito.
   ===================================================================== */
// Giorni entro cui ci si aspetta un backup: se l'automatico è attivo, il suo
// intervallo +1 giorno di margine; se è spento, una settimana di default.
function intervalloBackupAtteso() {
  if (localStorage.getItem('sb-backup-auto') !== '0') {
    return (Number(localStorage.getItem('sb-backup-auto-giorni')) || 1) + 1;
  }
  return 7;
}

function giorniDaUltimoBackup() {
  const ultimo = localStorage.getItem('sb-ultimo-backup');
  return ultimo ? (Date.now() - Date.parse(ultimo)) / 864e5 : Infinity;
}

function mostraAvvisoBackup(testo) {
  $('#avviso-backup-testo').textContent = testo;
  $('#avviso-backup').classList.remove('nascosto');
}

function nascondiAvvisoBackup() {
  $('#avviso-backup').classList.add('nascosto');
}

// Notifica di sistema, solo se l'utente l'ha esplicitamente attivata e il
// browser ha dato il permesso; al massimo una volta al giorno.
function notificaBackupInRitardo(testo) {
  if (localStorage.getItem('sb-notifica-backup') !== '1') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (localStorage.getItem('sb-notifica-backup-data') === oggi()) return;
  localStorage.setItem('sb-notifica-backup-data', oggi());
  try { new Notification('Scheda Botanica PRO', { body: testo, icon: 'icons/icon-192.png' }); }
  catch { /* alcuni browser non supportano new Notification() diretta: si ignora */ }
}

function aggiornaStatoNotificaBackup() {
  const p = $('#notifica-backup-stato');
  if (!('Notification' in window)) p.textContent = 'Le notifiche non sono supportate su questo browser.';
  else if (Notification.permission === 'denied') p.textContent = 'Notifiche bloccate dal browser: vanno riabilitate nelle impostazioni del sito.';
  else p.textContent = '';
}

function controllaPromemoriaBackup() {
  if (!S.schede.length) return;
  if (localStorage.getItem('sb-avviso-backup-ignorato') === oggi()) return; // ignorato per oggi
  if (localStorage.getItem('sb-backup-auto-fallito')) {
    const testo = 'Il backup automatico di oggi non è riuscito (spazio o permessi?). Conviene farne uno a mano.';
    mostraAvvisoBackup('⚠ ' + testo);
    notificaBackupInRitardo(testo);
    return;
  }
  const giorni = giorniDaUltimoBackup();
  if (giorni > intervalloBackupAtteso()) {
    const testo = giorni === Infinity ? 'Nessun backup è mai stato fatto.' : `Ultimo backup ${Math.floor(giorni)} giorni fa.`;
    mostraAvvisoBackup(`⚠ ${testo} Conviene farne uno adesso (menu ⋮ → Backup completo).`);
    notificaBackupInRitardo(testo + ' Apri Scheda Botanica PRO per farne uno.');
  }
}

async function avvio() {
  applicaTema(localStorage.getItem('sb-tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'scuro' : 'chiaro'));
  applicaDimensioneInterfaccia(localStorage.getItem('sb-dimensione-interfaccia') || 'auto');
  aggiornaDispositivo();
  costruisciModulo();
  collegaEventi();
  await ripristinaCartellaBotanica();

  async function proviAprireDB() {
    try { await DB.apri(); return null; } catch (e) { return e; }
  }
  let erroreDB = await proviAprireDB();
  if (erroreDB) {
    // un errore nell'apertura di IndexedDB è spesso transitorio (es. il
    // service worker si è appena attivato proprio in quel momento): un
    // secondo tentativo, dopo una breve pausa, spesso basta da solo.
    await new Promise((r) => setTimeout(r, 500));
    erroreDB = await proviAprireDB();
  }
  if (erroreDB) {
    $('#avviso-db-testo').textContent = `⚠ Archivio non disponibile (${erroreDB.message || 'errore sconosciuto'}). In navigazione anonima o con poco spazio libero può succedere: il salvataggio non funziona finché non si risolve.`;
    $('#avviso-db').classList.remove('nascosto');
    $('#btn-nuova').disabled = true;
    stato('Archivio non disponibile: vedi l\'avviso qui sopra.', true);
    return;
  }
  $('#avviso-db').classList.add('nascosto');
  $('#btn-nuova').disabled = false;
  navigator.storage?.persist?.().catch(() => {});

  const tutte = (await DB.tutte('schede')).map((r) => normalizza(r).record);
  // Se il browser e stato chiuso mentre era aperta una nuova scheda ancora
  // vuota, la bozza tecnica non deve riapparire come se fosse un rilievo.
  const bozzeVuote = tutte.filter((r) => !r.cancellata && r.bozzaVuota && schedaSenzaContenuto(r));
  await Promise.all(bozzeVuote.map((r) => DB.cancella('schede', r.uid)));
  const conservate = tutte.filter((r) => !bozzeVuote.includes(r));
  S.schede = conservate.filter((r) => !r.cancellata);
  S.cestino = conservate.filter((r) => r.cancellata);
  disegnaElenco();
  aggiornaBadgeCestino();
  await migraVecchiaVersione();
  await purgaCestinoScaduto();

  S.traccia = (await DB.tutte('traccia')).map((p) => ({ ...p, segmento: Number(p.segmento) || 1 }));
  aggiornaInfoTraccia();
  S.specie = await DB.tutte('specie');
  S.guida = validaIntegrazioniGuida(await DB.tutte('guida'));
  applicaIntegrazioniGuida();
  if (localStorage.getItem('sb-traccia-attiva')) avviaTraccia(); // riprende la registrazione se era rimasta attiva

  // Backup automatico: scarica da sola un backup completo ogni tot giorni,
  // così non dipende dal ricordarsene. Attivo di default; si spegne o si
  // regola la frequenza dal menu ⋮. Se il download fallisce (es. permesso
  // negato dal browser) lo segnaliamo con il promemoria qui sotto, invece
  // di ignorarlo in silenzio come prima.
  const ultimo = localStorage.getItem('sb-ultimo-backup');
  if (S.schede.length && localStorage.getItem('sb-backup-auto') !== '0') {
    const giorni = Number(localStorage.getItem('sb-backup-auto-giorni')) || 1;
    if (!ultimo || Date.now() - Date.parse(ultimo) > giorni * 864e5) {
      try {
        const riuscito = await esportaZIP('scarica');
        if (!riuscito) throw new Error('backup non creato');
        localStorage.removeItem('sb-backup-auto-fallito');
      } catch {
        localStorage.setItem('sb-backup-auto-fallito', oggi());
      }
    } else {
      localStorage.removeItem('sb-backup-auto-fallito');
    }
  }

  controllaPromemoriaBackup();
}

avvio().catch((e) => { stato('Avvio non riuscito: ' + e.message, true); $('#avviso-db').classList.remove('nascosto'); $('#avviso-db-testo').textContent = 'Impossibile caricare l’archivio. Ricarica l’app; non cancellare i dati del browser.'; });

// Indicatore live "online/offline" in alto: utile per sapere se, al momento
// del rilievo, i dati sono stati presi con o senza connessione (la mappa e
// PlantNet ne hanno bisogno; il resto dell'app funziona comunque offline).
function aggiornaStatoRete() {
  const el = document.getElementById('stato-rete');
  if (!el) return;
  const rete = navigator.onLine ? '🌐 online' : '📴 offline';
  const pronta = el.dataset.offline || 'offline in verifica…';
  el.textContent = `${rete} · ${pronta}`;
}
aggiornaStatoRete();
window.addEventListener('online', aggiornaStatoRete);
window.addEventListener('offline', aggiornaStatoRete);

async function aggiornaStatoOffline() {
  const el = document.getElementById('stato-rete');
  if (!el) return;
  let testo = 'offline non disponibile';
  try {
    if ('serviceWorker' in navigator) {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, ko) => setTimeout(() => ko(new Error('service worker non pronto')), 5000)),
      ]);
      const diagnostica = await caches.match('./__sw-diagnostica__');
      const falliti = diagnostica ? await diagnostica.json() : [];
      testo = falliti?.length ? `offline parziale (${falliti.length} file mancanti)` : '✓ offline pronta';
    }
  } catch { testo = 'offline da verificare'; }
  el.dataset.offline = testo;
  aggiornaStatoRete();
}

let aggiornamentoRichiesto = false;
let ultimoControlloAggiornamenti = 0;

function confrontaVersioni(a, b) {
  const parti = (v) => String(v).split('.').map(n => Number(n) || 0);
  const x = parti(a), y = parti(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}

function mostraAggiornamentoPronto(reg, versione = '') {
  const pronto = !!reg?.waiting && !!navigator.serviceWorker.controller;
  $('#btn-applica-aggiornamento').classList.toggle('nascosto', !pronto);
  if (pronto) $('#aggiornamento-stato').textContent = `Versione installata: ${APP_VERSIONE}. Aggiornamento${versione ? ` ${versione}` : ''} pronto: puoi applicarlo ora.`;
  return pronto;
}

async function verificaAggiornamenti(forza = false) {
  const statoVersione = $('#aggiornamento-stato');
  const bottone = $('#btn-controlla-aggiornamenti');
  if (!forza && Date.now() - ultimoControlloAggiornamenti < 60000) return;
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
    statoVersione.textContent = `Versione installata: ${APP_VERSIONE}. Aggiornamenti automatici disponibili solo dal sito HTTPS.`;
    return;
  }
  if (!navigator.onLine) {
    statoVersione.textContent = `Versione installata: ${APP_VERSIONE}. Sei offline: riprova quando hai rete.`;
    return;
  }
  ultimoControlloAggiornamenti = Date.now();
  bottone.disabled = true;
  statoVersione.textContent = `Versione installata: ${APP_VERSIONE}. Controllo la versione pubblicata…`;
  try {
    const risposta = await fetch(`./versione.json?controllo=${Date.now()}`, { cache: 'no-store' });
    if (!risposta.ok) throw new Error('file della versione non disponibile sul sito');
    const pubblicata = (await risposta.json()).versione;
    if (!/^\d+\.\d+\.\d+$/.test(pubblicata || '')) throw new Error('versione pubblicata non valida');
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) throw new Error('installazione dell’app offline non ancora pronta: riapri la pagina');
    if (mostraAggiornamentoPronto(reg, pubblicata)) return;
    if (confrontaVersioni(pubblicata, APP_VERSIONE) <= 0) {
      statoVersione.textContent = `Versione installata: ${APP_VERSIONE}. Nessun aggiornamento disponibile.`;
      return;
    }
    if (!confirm(`È disponibile Scheda Botanica ${pubblicata} (installata: ${APP_VERSIONE}).\n\nVuoi scaricare ora l’aggiornamento? I dati e le schede salvate resteranno invariati.`)) {
      statoVersione.textContent = `Versione ${pubblicata} disponibile. Download non avviato; premi «Controlla aggiornamenti» quando vuoi riprovare.`;
      return;
    }
    statoVersione.textContent = `Versione installata: ${APP_VERSIONE}. Versione ${pubblicata} pubblicata; preparo l’aggiornamento…`;
    const attesa = new Promise(resolve => {
      const termine = () => { clearTimeout(timer); reg.removeEventListener('updatefound', osserva); resolve(); };
      const osserva = () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant')
            setTimeout(termine, 0);
        });
      };
      const timer = setTimeout(termine, 20000);
      reg.addEventListener('updatefound', osserva);
      if (reg.installing) osserva();
    });
    await reg.update();
    if (!reg.waiting) await attesa;
    if (!mostraAggiornamentoPronto(reg, pubblicata))
      statoVersione.textContent = `Versione ${pubblicata} pubblicata, ma il download non è ancora pronto. Riprova tra poco.`;
  } catch (e) {
    statoVersione.textContent = `Versione installata: ${APP_VERSIONE}. Controllo non riuscito: ${e.message}.`;
    ultimoControlloAggiornamenti = 0;
  } finally { bottone.disabled = false; }
}

async function applicaAggiornamento() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.waiting) { await verificaAggiornamenti(true); return; }
  if (TRK.watch !== null || REG.attiva || REG.inAttesa || GPSR.watch !== null) {
    $('#aggiornamento-stato').textContent = 'Ferma traccia GPS, rilevamento GPS e nota vocale prima di aggiornare.';
    return;
  }
  if ($('#dlg-completa-guida').open && aggiornaModificheCatalogo(false)) {
    $('#aggiornamento-stato').textContent = 'Salva o annulla le integrazioni del catalogo prima di aggiornare.';
    return;
  }
  if (S.aperta && $('#modulo').querySelector(':invalid')) {
    $('#aggiornamento-stato').textContent = 'Correggi i campi non validi nella scheda prima di aggiornare.';
    return;
  }
  if (S.aperta && !(await salvaOra(S.aperta))) return;
  if (!(await salvaTuttiInSospeso())) return;
  await TRK.coda;
  aggiornamentoRichiesto = true;
  $('#aggiornamento-stato').textContent = 'Aggiornamento in corso…';
  reg.waiting.postMessage({ tipo: 'ATTIVA_AGGIORNAMENTO' });
  setTimeout(() => {
    if (aggiornamentoRichiesto) $('#aggiornamento-stato').textContent = 'Aggiornamento in attesa: chiudi le altre finestre dell’app e riprova.';
  }, 10000);
}

// Registrazione del service worker: rende l'app installabile e utilizzabile offline
// dopo la prima visita. Se il file non è servito da un vero server (es. aperto
// come file locale) l'app funziona comunque, solo senza installazione PWA.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (aggiornamentoRichiesto) { aggiornamentoRichiesto = false; location.reload(); }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' }).then((reg) => {
      const avvisa = () => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          mostraAggiornamentoPronto(reg);
          toast('Aggiornamento pronto: apri Configurazione e tocca «Aggiorna ora».', null, null, 12000);
        }
      };
      avvisa();
      reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', avvisa));
      aggiornaStatoOffline();
    }).catch(aggiornaStatoOffline);
  });
  // Se all'installazione il service worker non è riuscito a mettere in cache
  // uno o più file dell'app-shell (es. percorso sbagliato sul sito
  // pubblicato), lo trova qui e lo segnala: un avviso diretto in app, senza
  // bisogno di collegare il telefono a un computer per vederlo negli
  // strumenti sviluppatore. Compare una volta sola per ogni elenco di file
  // mancanti (si azzera da solo quando li ricarichi e ripubblichi).
  navigator.serviceWorker.ready.then(() => caches.match('./__sw-diagnostica__')).then((risposta) => risposta && risposta.json()).then((falliti) => {
    if (!falliti || !falliti.length) return;
    const chiave = falliti.join('|');
    if (localStorage.getItem('sw-diagnostica-vista') === chiave) return;
    localStorage.setItem('sw-diagnostica-vista', chiave);
    alert('Attenzione: questi file non sono stati trovati sul sito pubblicato e vanno ricaricati:\n\n' + falliti.join('\n') + '\n\nL\'app funziona comunque, ma quei file non saranno disponibili offline finché non li ricarichi nel posto giusto.');
  }).catch(() => {});
}
