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

// «Altro notato» contiene solo ciò che scrive l'utente. Fino alla 3.32 l'app vi
// aggiungeva da sola una riga «Identificato con PlantNet: …» a ogni identificazione:
// qui la si toglie (anche da backup e file importati) e i suoi dati passano nel
// campo tecnico identPlantNet, che non finisce nelle note né nelle stampe.
const RIGA_NOTA_PLANTNET = /^\s*Identificato con PlantNet: (.+?)(?: \(([^()]*)\))? — (\d{1,3})%, (.+?)(?: — GBIF: \S+)?\s*$/;
function separaNoteAutomatiche(testo) {
  let ident = null; const tenute = [];
  for (const riga of String(testo || '').split('\n')) {
    const m = RIGA_NOTA_PLANTNET.exec(riga);
    if (m) { ident = { nome: m[1].slice(0, 180), comune: (m[2] || '').slice(0, 180), conf: Math.min(100, Number(m[3])), quando: m[4].slice(0, 40) }; continue; }
    tenute.push(riga);
  }
  return { testo: tenute.join('\n').replace(/\n{3,}/g, '\n\n').trim(), ident };
}
function identPlantNetValido(v) {
  if (!v || typeof v !== 'object' || typeof v.nome !== 'string' || !v.nome.trim()) return null;
  const conf = Number(v.conf);
  return { nome: v.nome.slice(0, 180), comune: typeof v.comune === 'string' ? v.comune.slice(0, 180) : '',
    conf: Number.isFinite(conf) ? Math.max(0, Math.min(100, Math.round(conf))) : null, quando: typeof v.quando === 'string' ? v.quando.slice(0, 40) : '' };
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
      else if (c.vecchieEtichette?.[val] !== undefined) val = c.vecchieEtichette[val];
    }
    r[c.k] = val;
  }
  const note = separaNoteAutomatiche(r.note);
  r.note = note.testo;
  r.identPlantNet = identPlantNetValido(v.identPlantNet) || note.ident;
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
    lista.replaceChildren(el('p', { class: 'testo-tenue senza-margine' }, 'Nessuna nota vocale.'));
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
    box.replaceChildren(el('p', { class: 'testo-tenue senza-margine' }, 'Inserisci Altezza e Classe di grandezza per una stima; aggiungi anche la Circonferenza per la CO₂.'));
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
                el('button', { type: 'button', class: 'btn', id: 'nome-apri-locale', onclick: apriSchedaLocale }, 'Apri scheda locale'),
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
      } else if (c.k === 'data') {
        griglia.append(el('div', { class: 'campo' },
          el('label', { class: 'campo', for: id }, c.label, campoInput),
          el('div', { id: 'scheda-slide', class: 'scheda-slide nascosto' })));
      } else if (c.k === 'altezza') {
        // Il pulsante sta fuori dall'etichetta: un tocco non porta il cursore nel campo.
        griglia.append(el('div', { class: 'campo' },
          el('label', { class: 'campo', for: id }, c.label, campoInput),
          el('button', { type: 'button', class: 'btn btn-misura', id: 'btn-misura-altezza', onclick: apriMisuraAltezza },
            '📐 Misura altezza')));
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
    if (dipendenzaAttiva(dip, r[dip.se])) {
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
    if (dip.se !== kCambiato || !dipendenzaAttiva(dip, vNuovo)) continue;
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
  // Il menu "Cerca" non deve restare aperto passando da una scheda all'altra.
  const menuCerca = $('#nome-ricerca');
  if (menuCerca) menuCerca.open = false;
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
  // Se l'editor è già in cronologia (passaggio da una scheda all'altra) non si
  // aggiunge un'altra voce: altrimenti servirebbero più "indietro" per uscire.
  if (sostituisciCronologia || history.state?.editor) history.replaceState({ editor: true }, '');
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

let creazioneSchedaInCorso = false;
async function nuovaScheda() {
  // Un doppio tocco veloce non deve creare due schede vuote.
  if (creazioneSchedaInCorso) return;
  creazioneSchedaInCorso = true;
  try {
    const r = schedaVuota();
    S.schede.push(r);
    if (!(await salvaOra(r))) { S.schede = S.schede.filter((s) => s.uid !== r.uid); return; }
    apriEditor(r.uid);
    $('#f-nome').focus();
  } finally { creazioneSchedaInCorso = false; }
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
  return Number(leggiPref('sb-cestino-giorni')) || 30;
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

// "Rinumera le schede": dopo le cancellazioni il N° progressivo ha dei buchi.
// Le schede attive restano nello stesso ordine (per N°, a parità per data di
// creazione) e prendono 1, 2, 3… Il cestino non si tocca. Si può annullare.
function pianoRinumerazione(schede) {
  const ordinate = [...schede].sort((a, b) =>
    (Number(a.prog) || Infinity) - (Number(b.prog) || Infinity) ||
    String(a.creato).localeCompare(String(b.creato)));
  return ordinate.map((r, i) => ({ r, vecchio: r.prog, nuovo: String(i + 1) })).filter((x) => x.vecchio !== x.nuovo);
}

async function rinumeraSchede() {
  const bottone = $('#btn-rinumera');
  if (bottone.disabled) return;
  if (!S.schede.length) { alert('Non ci sono schede da rinumerare.'); return; }
  if (!(await salvaTuttiInSospeso())) { alert('Ci sono schede non salvate. Riprova dopo aver liberato spazio.'); return; }
  const piano = pianoRinumerazione(S.schede);
  if (!piano.length) { alert(`I numeri sono già in fila (1–${S.schede.length}): niente da cambiare.`); return; }
  if (!confirm(`Rinumero ${S.schede.length} schede da 1 a ${S.schede.length}, mantenendo l'ordine attuale: cambia il numero di ${piano.length} schede.\n\nQR, etichette, stampe ed esportazioni già fatti restano con i vecchi numeri. Puoi annullare subito dopo.\n\nContinuare?`)) return;
  bottone.disabled = true;
  try {
    await applicaNumeri(piano.map((x) => [x.r, x.nuovo]));
    toast(`Rinumerate ${piano.length} schede`, 'Annulla', () => applicaNumeri(piano.map((x) => [x.r, x.vecchio])));
  } catch (e) {
    stato(`Rinumerazione non completata: ${e.message}`, true);
    alert(`Rinumerazione non completata: ${e.message}`);
  } finally {
    bottone.disabled = false;
  }
}

async function applicaNumeri(coppie) {
  const quando = oraISO();
  for (const [r, prog] of coppie) {
    r.prog = prog;
    r.modificato = quando;
    if (!(await salvaOra(r))) throw new Error('salvataggio non riuscito');
  }
  disegnaElenco();
  if (typeof aggiornaTitoloEditor === 'function' && $('#ed-titolo')) { try { aggiornaTitoloEditor(); } catch {} }
  stato(`${coppie.length} schede rinumerate`);
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
      el('span', { class: 'testo-tenue' }, 'Nessuna coordinata'),
      el('button', { type: 'button', class: 'btn primario', onclick: rilevaGPS }, '📍 Rileva posizione'),
      el('button', { type: 'button', class: 'btn', onclick: () => sceglierePosizioneDaMappa(r) }, '🗺 Scegli dalla mappa'));
    return;
  }
  const g = r.gps;
  const qualita = qualitaSegnaleGPS(g.acc);
  box.replaceChildren(...[
    el('strong', { testo: `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}` }),
    g.manuale ? el('span', { class: 'testo-tenue' }, 'posizione scelta a mano') : (g.acc != null ? el('span', { testo: `±${Math.round(g.acc)} m` }) : null),
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
        el('span', { class: 'testo-tenue', testo: dataIT(p.quando) })));
  }));
  if (S.aperta === r) griglia.replaceChildren(...blocchi);
}

/* =====================================================================
   7d. IDENTIFICAZIONE SPECIE (PlantNet) — solo su richiesta esplicita:
   la foto lascia il telefono SOLO quando l'utente tocca "Identifica".
   Nessuna chiave = nessuna chiamata di rete, mai automatica.
   ===================================================================== */
const IDENT = { riga: null, foto: null, serie: 0 };

function chiavePlantNet() { return (leggiPref('sb-plantnet-key') || '').trim(); }

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
  // L'identificazione resta registrata a parte: «Altro notato» è solo dell'utente.
  r.identPlantNet = identPlantNetValido({ nome: nomeSci, comune: nomeComune || '', conf, quando: dataIT(oraISO()) });
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
  cont.replaceChildren(el('span', { class: 'testo-nota' }, 'Cerco il riferimento GBIF…'));
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
    const id = r.identPlantNet;
    link.textContent = '↗ Scheda PlantNet' + (id && id.conf != null ? ` · ${id.conf}%${id.quando ? ' il ' + id.quando.split(',')[0] : ''}` : '');
    link.title = id ? `Identificato con PlantNet: ${id.nome}${id.comune ? ' (' + id.comune + ')' : ''}${id.conf != null ? ', ' + id.conf + '%' : ''}${id.quando ? ', ' + id.quando : ''}` : '';
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
   12. MIGRAZIONE DALLA VECCHIA APP (localStorage "scheda-botanica-v3")
   Funziona solo se il file nuovo viene aperto dallo stesso percorso/sito
   della versione precedente; altrimenti usa "Importa backup".
   ===================================================================== */
async function migraVecchiaVersione() {
  if (leggiPref('sb-migrazione')) return;
  let vecchi = null;
  try { vecchi = JSON.parse(localStorage.getItem('scheda-botanica-v3') || 'null'); } catch { /* dati illeggibili */ }
  if (!Array.isArray(vecchi) || !vecchi.length) return;
  if (!confirm(`Trovate ${vecchi.length} schede della versione precedente. Importarle?`)) {
    scriviPref('sb-migrazione', 'rifiutata');
    return;
  }
  await importaDati(vecchi.map(normalizza), 'unisci');
  scriviPref('sb-migrazione', oraISO());
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
  scriviPref('sb-dimensione-interfaccia', scelto);
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
    scriviPref('sb-tema', t);
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
    $('#chk-backup-auto').checked = leggiPref('sb-backup-auto') !== '0';
    $('#sel-backup-auto-giorni').value = leggiPref('sb-backup-auto-giorni') || '1';
    $('#chk-notifica-backup').checked = leggiPref('sb-notifica-backup') === '1';
    aggiornaStatoNotificaBackup();
    aggiornaStatoCartellaBotanica();
    $('#aggiornamento-stato').textContent = `Versione installata: ${APP_VERSIONE}`;
    aggiornaPannelloSlide().catch(() => {});
    $('#dlg-menu').showModal();
  };
  $('#btn-controlla-aggiornamenti').onclick = () => verificaAggiornamenti(true);
  $('#btn-slide-offline').onclick = scaricaSlideDaPulsante;
  $('#btn-applica-aggiornamento').onclick = applicaAggiornamento;
  $('#sel-dimensione-interfaccia').onchange = (e) => applicaDimensioneInterfaccia(e.target.value);
  $('#btn-cartella-botanica').onclick = collegaCartellaBotanica;
  $('#btn-cartella-botanica-dimentica').onclick = async () => { await dimenticaCartellaBotanica(); await aggiornaStatoCartellaBotanica(); };
  $('#chk-backup-auto').onchange = (e) => scriviPref('sb-backup-auto', e.target.checked ? '1' : '0');
  $('#sel-backup-auto-giorni').onchange = (e) => scriviPref('sb-backup-auto-giorni', e.target.value);
  $('#chk-notifica-backup').onchange = async (e) => {
    if (e.target.checked) {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      if (!('Notification' in window) || Notification.permission !== 'granted') e.target.checked = false;
    }
    scriviPref('sb-notifica-backup', e.target.checked ? '1' : '0');
    aggiornaStatoNotificaBackup();
  };
  $('#avviso-db-riprova').onclick = () => location.reload();
  $('#avviso-backup-fai').onclick = () => { nascondiAvvisoBackup(); esportaZIP(); };
  $('#avviso-backup-ignora').onclick = () => { scriviPref('sb-avviso-backup-ignorato', oggi()); nascondiAvvisoBackup(); };
  $('#dlg-menu').addEventListener('click', (e) => {
    const az = e.target.closest('button[data-az]')?.dataset.az;
    if (!az) return;
    $('#dlg-menu').close();
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
      const salvato = leggiPref('sb-' + id);
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
    scriviPref('sb-cestino-giorni', v);
  };
  $('#btn-cestino-svuota').onclick = svuotaCestino;
  $('#btn-nuovo-elenco').onclick = nuovoElenco;
  $('#btn-rinumera').onclick = rinumeraSchede;
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
  $('#btn-mappa-stampa').onclick = stampaMappa;
  $('#btn-mappa-html').onclick = esportaMappaHTML;
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
    scriviPref('sb-plantnet-key', $('#pn-chiave').value.trim());
    stato('Chiave PlantNet salvata');
    $('#dlg-plantnet').close();
  };
  $('#pn-rimuovi').onclick = () => {
    cancellaPref('sb-plantnet-key');
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
  // iPadOS si presenta come Mac: lo distinguono i punti di tocco.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Avviso per iPhone/iPad, al massimo una volta ogni 30 giorni.
async function avvisoIOSpazio() {
  if (!rilevaIO() || document.querySelector('dialog[open]')) return;
  const ultimo = Date.parse(leggiPref('sb-avviso-ios-spazio') || '');
  if (Number.isFinite(ultimo) && Date.now() - ultimo < 30 * 864e5) return;
  const installata = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let spazio = '';
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (quota) spazio = `Spazio usato dall’app: ${(usage / 1048576).toFixed(1)} MB su ${(quota / 1048576).toFixed(0)} MB disponibili.`;
  } catch { /* stima non disponibile */ }
  const dlg = el('dialog', {},
    el('h2', { testo: 'Consigli per iPhone e iPad' }),
    spazio ? el('p', { testo: spazio }) : null,
    installata ? null : el('p', { style: 'color:var(--ruggine);font-weight:600',
      testo: 'Safari può cancellare i dati di un sito non usato per 7 giorni. Installa l’app con Condividi → «Aggiungi alla schermata Home» per proteggere le schede.' }),
    el('ul', {},
      el('li', { testo: 'Fai spesso un backup ZIP da Configurazione e backup.' }),
      el('li', { testo: 'Svuota il cestino dell’app quando non ti serve più.' })),
    el('div', { class: 'azioni' }, el('button', { type: 'button', class: 'btn primario', onclick: () => dlg.close() }, 'Ho capito')));
  dlg.addEventListener('close', () => { scriviPref('sb-avviso-ios-spazio', oraISO()); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
}

/* =====================================================================
   PROMEMORIA BACKUP — un banner (e, se autorizzata, una notifica di
   sistema) quando il backup non gira da più tempo di quanto previsto,
   o quando il tentativo automatico di oggi non è riuscito.
   ===================================================================== */
// Giorni entro cui ci si aspetta un backup: se l'automatico è attivo, il suo
// intervallo +1 giorno di margine; se è spento, una settimana di default.
function intervalloBackupAtteso() {
  if (leggiPref('sb-backup-auto') !== '0') {
    return (Number(leggiPref('sb-backup-auto-giorni')) || 1) + 1;
  }
  return 7;
}

function giorniDaUltimoBackup() {
  const ultimo = leggiPref('sb-ultimo-backup');
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
  if (leggiPref('sb-notifica-backup') !== '1') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (leggiPref('sb-notifica-backup-data') === oggi()) return;
  scriviPref('sb-notifica-backup-data', oggi());
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
  if (leggiPref('sb-avviso-backup-ignorato') === oggi()) return; // ignorato per oggi
  if (leggiPref('sb-backup-auto-fallito')) {
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
  applicaTema(leggiPref('sb-tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'scuro' : 'chiaro'));
  applicaDimensioneInterfaccia(leggiPref('sb-dimensione-interfaccia') || 'auto');
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

  const grezze = await DB.tutte('schede');
  const tutte = grezze.map((r) => normalizza(r).record);
  // Una volta sola: salva ripulite le schede che avevano righe automatiche in «Altro notato».
  const ripulite = tutte.filter((r, i) => String(grezze[i].note ?? '').trim() !== r.note);
  if (ripulite.length) await Promise.all(ripulite.map((r) => DB.scrivi('schede', r).catch(() => {})));
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
  // Recupera lo spazio di foto/audio rimasti senza scheda (es. vecchie unioni di backup).
  try {
    const orfani = await pulisciMediaOrfani();
    if (orfani) stato(`Liberato spazio: ${orfani} file senza scheda eliminati`);
  } catch { /* la pulizia è facoltativa: l'app funziona comunque */ }
  setTimeout(() => avvisoIOSpazio().catch(() => {}), 1500);

  S.traccia = (await DB.tutte('traccia')).map((p) => ({ ...p, segmento: Number(p.segmento) || 1 }));
  aggiornaInfoTraccia();
  S.specie = await DB.tutte('specie');
  S.guida = validaIntegrazioniGuida(await DB.tutte('guida'));
  applicaIntegrazioniGuida();
  if (leggiPref('sb-traccia-attiva')) avviaTraccia(); // riprende la registrazione se era rimasta attiva

  // Backup automatico: scarica da sola un backup completo ogni tot giorni,
  // così non dipende dal ricordarsene. Attivo di default; si spegne o si
  // regola la frequenza dal menu ⋮. Se il download fallisce (es. permesso
  // negato dal browser) lo segnaliamo con il promemoria qui sotto, invece
  // di ignorarlo in silenzio come prima.
  const ultimo = leggiPref('sb-ultimo-backup');
  if (S.schede.length && leggiPref('sb-backup-auto') !== '0') {
    const giorni = Number(leggiPref('sb-backup-auto-giorni')) || 1;
    if (!ultimo || Date.now() - Date.parse(ultimo) > giorni * 864e5) {
      try {
        const riuscito = await esportaZIP('scarica');
        if (!riuscito) throw new Error('backup non creato');
        cancellaPref('sb-backup-auto-fallito');
      } catch {
        scriviPref('sb-backup-auto-fallito', oggi());
      }
    } else {
      cancellaPref('sb-backup-auto-fallito');
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
      const { presenti, totale } = await contaSlideOffline();
      testo = presenti >= totale ? '✓ offline pronta' : `offline parziale (slide ${presenti}/${totale})`;
    }
  } catch { testo = 'offline da verificare'; }
  el.dataset.offline = testo;
  aggiornaStatoRete();
}

/* ---------- Slide del corso disponibili offline ----------
   Le 144 slide (~9 MB) vanno in una cache propria, non legata alla versione
   dell'app: un aggiornamento non costringe a riscaricarle. Il service worker
   la legge per tutte le richieste a slides/. */
const CACHE_SLIDE = 'scheda-botanica-slide-v1-' + new URL('./', location.href).pathname;
let slideInDownload = null;

function urlSlide() {
  return [...new Set(GUIDA_SPECIE.map((v) => v.pagina).filter(Boolean))].map((n) => new URL(`./slides/${n}.webp`, location.href).href);
}

async function contaSlideOffline() {
  const tutte = urlSlide();
  if (!('caches' in window)) return { presenti: 0, totale: tutte.length };
  const cache = await caches.open(CACHE_SLIDE);
  const salvate = new Set((await cache.keys()).map((r) => r.url));
  return { presenti: tutte.filter((u) => salvate.has(u)).length, totale: tutte.length };
}

// Scarica le slide mancanti, poche alla volta. Ritorna quante ne mancano ancora.
function scaricaSlideOffline(avanzamento = () => {}) {
  if (slideInDownload) return slideInDownload;
  slideInDownload = (async () => {
    const cache = await caches.open(CACHE_SLIDE);
    const salvate = new Set((await cache.keys()).map((r) => r.url));
    const mancanti = urlSlide().filter((u) => !salvate.has(u));
    const totale = urlSlide().length;
    let fatte = totale - mancanti.length, errori = 0;
    avanzamento(fatte, totale);
    const coda = [...mancanti];
    const lavoratore = async () => {
      while (coda.length) {
        const url = coda.shift();
        try {
          const risposta = await fetch(url, { cache: 'no-cache' });
          if (!risposta.ok) throw new Error(risposta.status);
          await cache.put(url, risposta);
          fatte++;
        } catch { errori++; }
        avanzamento(fatte, totale);
      }
    };
    await Promise.all([lavoratore(), lavoratore(), lavoratore()]);
    aggiornaStatoOffline();
    return errori;
  })().finally(() => { slideInDownload = null; });
  return slideInDownload;
}

async function aggiornaPannelloSlide() {
  const riga = $('#slide-offline-stato');
  if (!riga) return;
  if (!('caches' in window) || !window.isSecureContext) { riga.textContent = 'Non disponibile in questo contesto (serve l’app da https:// o installata).'; return; }
  const { presenti, totale } = await contaSlideOffline();
  riga.textContent = presenti >= totale ? `✓ Tutte le ${totale} slide sono disponibili offline.` : `${presenti} di ${totale} slide disponibili offline.`;
}

async function scaricaSlideDaPulsante() {
  const bottone = $('#btn-slide-offline');
  if (!navigator.onLine) { $('#slide-offline-stato').textContent = 'Sei offline: collegati a Internet per scaricare le slide.'; return; }
  bottone.disabled = true;
  try {
    const errori = await scaricaSlideOffline((fatte, totale) => { $('#slide-offline-stato').textContent = `Scarico le slide: ${fatte} di ${totale}…`; });
    if (errori) $('#slide-offline-stato').textContent = `${errori} slide non scaricate: riprova con una connessione migliore.`;
    else await aggiornaPannelloSlide();
  } finally { bottone.disabled = false; }
}

// Alla prima apertura online scarica da sola le slide mancanti, se l'utente non
// ha attivato il risparmio dati.
async function scaricaSlideAutomatico() {
  if (!('caches' in window) || !window.isSecureContext || !navigator.onLine || navigator.connection?.saveData) return;
  const { presenti, totale } = await contaSlideOffline();
  if (presenti >= totale) return;
  aggiornaStatoOffline();
  await scaricaSlideOffline((fatte, tot) => {
    const el = document.getElementById('stato-rete');
    if (el) { el.dataset.offline = `scarico slide ${fatte}/${tot}…`; aggiornaStatoRete(); }
  });
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
      navigator.serviceWorker.ready.then(() => scaricaSlideAutomatico()).catch(() => {});
    }).catch(aggiornaStatoOffline);
  });
}
