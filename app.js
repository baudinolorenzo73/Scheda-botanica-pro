
'use strict';

/* =====================================================================
   1. CONFIGURAZIONE CAMPI
   Per aggiungere un campo basta una riga qui: editor, stampa, CSV,
   GeoJSON e ricerca leggono tutti da questa tabella.
   ===================================================================== */
const SEZIONI = [
  { id: 'oss', titolo: 'Osservazioni' },
  { id: 'veg', titolo: 'Vegetazione' },
  { id: 'ped', titolo: 'Pedologia' },
  { id: 'fit', titolo: 'Fitopatologia' },
  { id: 'not', titolo: 'Note' },
];

// tipo: testo | numero | scelta (select chiusa) | lista (testo libero con suggerimenti)
//       | illustrata (scelta guidata con icona + spiegazione, vedi ICONE/DEFINIZIONI) | area
const CAMPI = [
  { k: 'prog',          sez: 'oss', label: 'N° progressivo',              tipo: 'numero', passo: 1,
    aiuto: 'Numero identificativo unico di questa scheda su tutto l\'archivio: non si ripete mai. Usato dal codice QR per ritrovarla sempre in modo sicuro.' },
  { k: 'data',          sez: 'oss', label: 'Data',                       tipo: 'data' },
  { k: 'numeroZona',    sez: 'oss', label: 'N° nel giorno',              tipo: 'numero', passo: 1, etichettaStampa: 'N° nel giorno',
    aiuto: 'Numerazione che riparte da 1 a ogni nuova data: si calcola da sola quando scegli la Data qui sopra. Utile per contare gli alberi rilevati in una stessa giornata.' },
  { k: 'nome',          sez: 'oss', label: 'Nome esemplare (genere, specie, varietà)', tipo: 'lista', largo: true },
  { k: 'numero',        sez: 'oss', label: 'N° medesimo esemplare',         tipo: 'numero', passo: 1, etichettaStampa: 'Esemplari vicini',
    aiuto: 'Quanti alberi uguali a questo si trovano nelle vicinanze (per esempio un filare). Di default è 1, cioè "esemplare isolato, nessun altro uguale intorno".' },
  { k: 'grandezza',     sez: 'oss', label: 'Classe di grandezza',         tipo: 'scelta', etichettaStampa: 'Grandezza',
    valori: [['', '—'], ['1', '1ª grandezza (maggiore)'], ['2', '2ª grandezza'], ['3', '3ª grandezza'], ['4', '4ª grandezza (minore)']] },
  { k: 'altezza',       sez: 'oss', label: 'Altezza (m)',                 tipo: 'numero', passo: 0.5 },
  { k: 'circonferenza', sez: 'oss', label: 'Circonferenza a 1,30 m (cm)', tipo: 'numero', passo: 1, etichettaStampa: 'Circonferenza (cm)' },
  { k: 'persistenza',   sez: 'oss', label: 'Persistenza foglie',          tipo: 'illustrata', valori: ['sempreverde', 'caduca', 'semisempreverde', 'semicaduca'] },
  { k: 'formaChioma',   sez: 'oss', label: 'Forma della chioma',          tipo: 'illustrata', etichettaStampa: 'Forma chioma', valori: ['piramidale', 'a cono', 'espansa', 'globosa', 'colonnare', 'a ombrello', 'piangente'] },
  { k: 'rami',          sez: 'oss', label: 'Rami secondari',              tipo: 'illustrata', valori: ['opposti', 'alterni', 'verticillati'] },
  { k: 'crescita',      sez: 'oss', label: 'Tipo di crescita',            tipo: 'illustrata', valori: ['monopodiale', 'simpodiale'] },
  { k: 'estensione',    sez: 'oss', label: 'Tipologia di estensione (gemme)', tipo: 'illustrata', etichettaStampa: 'Estensione (gemme)', valori: ['1 – monociclica', '2 – policiclica (olmo)', '3 – continua'] },
  { k: 'tipoFoglia',    sez: 'veg', label: 'Tipo di foglia',              tipo: 'illustrata', valori: ['aghiforme', 'semplice', 'composta', 'squamiforme'] },
  { k: 'lamina',        sez: 'veg', label: 'Forma della lamina',          tipo: 'illustrata', etichettaStampa: 'Forma lamina', valori: ['ovata', 'lanceolata', 'ellittica', 'aghiforme', 'squamiforme', 'palmata'] },
  { k: 'margine',       sez: 'veg', label: 'Margine fogliare',            tipo: 'illustrata', valori: ['intero', 'seghettato', 'dentato', 'lobato', 'ondulato'] },
  { k: 'terreno',       sez: 'ped', label: 'Condizioni del terreno',      tipo: 'lista', largo: true, etichettaStampa: 'Terreno', valori: ['prato coltivato', 'prato non concimato', 'aiuola', 'terreno compatto', 'terreno drenato', 'pacciamato'] },
  { k: 'problemi',      sez: 'fit', label: 'Problemi tronco / foglie',    tipo: 'area', largo: true, etichettaStampa: 'Problemi' },
  { k: 'note',          sez: 'not', label: 'Altro notato',                tipo: 'area', largo: true, etichettaStampa: 'Note' },
];

// Dipendenze tra campi: se il campo "se" ha valore "valore", i campi
// elencati in "nascondi" non sono pertinenti e vengono nascosti + svuotati.
// Per aggiungere altre regole basta una riga qui.
const DIPENDENZE_CAMPI = [
  { se: 'tipoFoglia', valore: 'aghiforme', nascondi: ['lamina', 'margine'] },
];

const DB_NOME = 'scheda-botanica';
const APP_VERSIONE = '3.5.0';
const DB_VERSIONE = 4;        // v4: aggiunto lo store "specie" (catalogo specie identificate)
const FOTO_LATO_MAX = 1600;   // px, lato lungo
const FOTO_QUALITA = 0.82;    // qualità JPEG

/* =====================================================================
   2. UTILITÀ
   ===================================================================== */
const $ = (sel, rad = document) => rad.querySelector(sel);

// Crea un elemento DOM. Il testo passa sempre da textContent: nessun
// problema con nomi che contengono < & " (bug della versione precedente).
function el(tag, attr = {}, ...figli) {
  const n = document.createElement(tag);
  for (const [a, v] of Object.entries(attr)) {
    if (v === null || v === undefined || v === false) continue;
    if (a.startsWith('on')) n.addEventListener(a.slice(2), v);
    else if (a === 'class') n.className = v;
    else if (a === 'testo') n.textContent = v;
    else n.setAttribute(a, v === true ? '' : v);
  }
  for (const f of figli.flat()) {
    if (f === null || f === undefined || f === false) continue;
    n.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return n;
}

const nuovoId = (pref) => `${pref}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const nomeFile = (s) => (s || 'esemplare').trim().replace(/[^a-z0-9_-]+/gi, '_').slice(0, 30) || 'esemplare';
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;
const oraISO = () => new Date().toISOString();
const dataIT = (iso) => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
// Formatta una data "sola" (YYYY-MM-DD, senza ora) in gg/mm/aaaa senza passare da Date/fuso orario,
// per evitare che una data-solo-giorno slitti di un giorno vicino alla mezzanotte.
const dataBreveIT = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const oggi = () => new Date().toISOString().slice(0, 10);
const perProg = (a, b) => (Number(a.prog) || 0) - (Number(b.prog) || 0);

function stato(msg, errore = false) {
  const s = $('#stato');
  s.textContent = msg;
  s.classList.toggle('err', errore);
  if (S.aperta) $('#ed-stato').textContent = msg;
}

let toastTimer = null;
function toast(msg, azione, fn, durata = 7000) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const t = el('div', { class: 'toast', role: 'status' }, el('span', { testo: msg }));
  if (azione) t.append(el('button', { testo: azione, onclick: () => { t.remove(); fn(); } }));
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), durata);
}

function scarica(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const blobInDataURL = (blob) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => ko(r.error);
  r.readAsDataURL(blob);
});

async function dataURLInBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

// Apre un <dialog> e restituisce il value del pulsante premuto
function chiedi(dlg) {
  return new Promise((ok) => {
    const clic = (e) => {
      const b = e.target.closest('button[value]');
      if (b) fine(b.value);
    };
    const annulla = (e) => { e.preventDefault(); fine('annulla'); };
    function fine(v) {
      dlg.removeEventListener('click', clic);
      dlg.removeEventListener('cancel', annulla);
      dlg.close();
      ok(v);
    }
    dlg.addEventListener('click', clic);
    dlg.addEventListener('cancel', annulla);
    dlg.showModal();
  });
}

/* =====================================================================
   3. DATABASE (IndexedDB)
   store "schede": record senza immagini (chiave uid)
   store "foto":   Blob JPEG compressi (chiave = id foto)
   Niente più localStorage da 5 MB: lo spazio è quello del dispositivo.
   ===================================================================== */
const DB = {
  db: null,
  apri() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open(DB_NOME, DB_VERSIONE);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('schede')) d.createObjectStore('schede', { keyPath: 'uid' });
        if (!d.objectStoreNames.contains('foto')) d.createObjectStore('foto');
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio');
        if (!d.objectStoreNames.contains('traccia')) d.createObjectStore('traccia', { autoIncrement: true });
        if (!d.objectStoreNames.contains('specie')) d.createObjectStore('specie', { keyPath: 'nomeSci' });
      };
      r.onsuccess = () => { this.db = r.result; ok(); };
      r.onerror = () => ko(r.error);
    });
  },
  // Risolve solo quando la transazione è davvero scritta su disco
  tx(store, modo, fn) {
    return new Promise((ok, ko) => {
      const t = this.db.transaction(store, modo);
      let esito;
      const rq = fn(t.objectStore(store));
      if (rq) rq.onsuccess = () => { esito = rq.result; };
      t.oncomplete = () => ok(esito);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error || new Error('Scrittura annullata (spazio esaurito?)'));
    });
  },
  tutte: (store) => DB.tx(store, 'readonly', (s) => s.getAll()),
  leggi: (store, k) => DB.tx(store, 'readonly', (s) => s.get(k)),
  scrivi: (store, v, k) => DB.tx(store, 'readwrite', (s) => (k === undefined ? s.put(v) : s.put(v, k))),
  cancella: (store, k) => DB.tx(store, 'readwrite', (s) => s.delete(k)),
  svuota: (store) => DB.tx(store, 'readwrite', (s) => s.clear()),
};

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
};

function schedaVuota() {
  const r = { uid: nuovoId('s'), creato: oraISO(), modificato: oraISO(), gps: null, foto: [], audio: [], gbifId: '' };
  for (const c of CAMPI) r[c.k] = '';
  r.prog = String(S.schede.reduce((m, s) => Math.max(m, Number(s.prog) || 0), 0) + 1);
  r.data = oggi();
  r.numeroZona = calcolaNumeroZona(r.data, r.uid);
  // "N° medesimo esemplare" conta quanti alberi uguali ci sono vicino: di default 1
  // (nessun altro uguale intorno, esemplare isolato). L'utente lo cambia solo se serve.
  r.numero = 1;
  return r;
}

// Rende compatibile un record di qualsiasi versione (vecchia app inclusa).
// Restituisce { record, fotoDaSalvare: [{id, dataUrl}], audioDaSalvare: [{id, dataUrl}] }
function normalizza(v) {
  const r = { uid: v.uid || nuovoId('s'), creato: v.creato || oraISO(), modificato: v.modificato || oraISO() };
  r.cancellata = v.cancellata || null;   // null = attiva; altrimenti data ISO di spostamento nel cestino
  r.gbifId = v.gbifId || '';             // ID GBIF della specie, se identificata con PlantNet
  for (const c of CAMPI) {
    let val = v[c.k] === undefined || v[c.k] === null ? '' : String(v[c.k]).trim();
    if (c.tipo === 'numero') {
      val = val.replace(',', '.');
      if (val !== '' && !isFinite(Number(val))) val = '';   // un campo numerico non accetta testo
    }
    r[c.k] = val;
  }
  r.gps = null;
  if (v.gps && isFinite(v.gps.lat) && isFinite(v.gps.lng) &&
      Math.abs(v.gps.lat) <= 90 && Math.abs(v.gps.lng) <= 180) {
    r.gps = {
      lat: Number(v.gps.lat), lng: Number(v.gps.lng),
      acc: v.gps.acc ?? v.gps.accuracy ?? null,
      alt: v.gps.alt ?? v.gps.altitude ?? null,
      quando: v.gps.quando || oraISO(),
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

function salvaPresto(r) {
  r.modificato = oraISO();
  clearTimeout(timerSalva.get(r.uid));
  timerSalva.set(r.uid, setTimeout(() => salvaOra(r), 400));
}

async function salvaOra(r) {
  if (!r) return false;
  clearTimeout(timerSalva.get(r.uid));
  timerSalva.delete(r.uid);
  try {
    await DB.scrivi('schede', r);
    stato(`Salvato alle ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    return true;
  } catch (e) {
    stato('ERRORE: salvataggio non riuscito — ' + e.message, true);
    alert('Salvataggio non riuscito: ' + e.message + '\nEsporta subito un backup dal menu ⋮.');
    return false;
  }
}

async function salvaTuttiInSospeso() {
  const lista = [...timerSalva.keys()].map((uid) => S.schede.find((s) => s.uid === uid)).filter(Boolean);
  await Promise.all(lista.map(salvaOra));
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
const REG = { attiva: false, annullata: false, recorder: null, stream: null, chunks: [], inizio: 0, timer: null, riga: null };

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
  if (!navigator.mediaDevices?.getUserMedia) return alert('Microfono non disponibile su questo dispositivo/browser.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    REG.stream = stream; REG.recorder = rec; REG.chunks = []; REG.riga = r; REG.annullata = false; REG.attiva = true; REG.inizio = Date.now();
    rec.ondataavailable = (e) => { if (e.data.size > 0) REG.chunks.push(e.data); };
    rec.onstop = async () => {
      REG.stream.getTracks().forEach((t) => t.stop());
      clearInterval(REG.timer);
      // catturo tutto in locale prima di toccare REG: mette al riparo da una seconda
      // registrazione avviata mentre questa è ancora in fase di salvataggio
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
    };
    rec.start();
    aggiornaUIRegistrazione();
    REG.timer = setInterval(aggiornaUIRegistrazione, 500);
  } catch (e) {
    alert('Microfono non accessibile: ' + e.message);
  }
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

function etichettaValore(c, v) {
  if (!v) return '';
  if (c.tipo === 'scelta') return (c.valori.find(([x]) => x === v) || [, v])[1];
  return v;
}

const CAMPI_RIASSUNTO = ['grandezza', 'persistenza', 'formaChioma'].map((k) => CAMPI.find((c) => c.k === k));

async function disegnaElenco() {
  aggiornaFiltroData();
  aggiornaFiltroSpecie();
  aggiornaBottoneFiltriAvanzati();
  const vis = schedeVisibili();
  const dup = progDuplicati();
  const dupZona = numeroZonaDuplicati();
  const nFoto = S.schede.reduce((n, r) => n + r.foto.length, 0);
  $('#conteggio').textContent = `${S.schede.length} schede, ${nFoto} foto`;

  const elenco = $('#elenco');
  if (!vis.length) {
    elenco.replaceChildren(el('div', { class: 'vuoto' },
      S.schede.length ? 'Nessuna scheda corrisponde alla ricerca.' : 'Nessuna scheda. Tocca “+ Nuova scheda” per iniziare il rilievo.'));
    return;
  }
  const righe = await Promise.all(vis.map(async (r) => {
    const segni = [];
    if (r.foto.length) segni.push(`📷 ${r.foto.length}`);
    if (r.audio.length) segni.push(`🎙 ${r.audio.length}`);
    if (r.gps) segni.push('📍 GPS');
    if (r.altezza) segni.push(`↕ ${String(r.altezza).replace('.', ',')} m`);
    const dati = CAMPI_RIASSUNTO.map((c) => etichettaValore(c, r[c.k])).filter(Boolean).join(' · ');
    const foto = r.foto.length
      ? el('img', { class: 'miniatura', src: await urlFoto(r.foto[0].id), alt: '' })
      : el('div', { class: 'miniatura vuota' }, '🌳');
    return el('div', {
      class: 'voce', role: 'button', tabindex: '0', id: 'voce-' + r.uid,
      onclick: () => apriEditor(r.uid),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriEditor(r.uid); } },
    },
      el('div', { class: 'voce-foto' }, foto, el('span', { class: 'voce-num', testo: r.prog || '?' })),
      el('div', { style: 'min-width:0' },
        el('div', { class: 'titolo specie', testo: r.nome || 'Senza nome' }),
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
            onchange: (e) => { e.target.checked ? S.selezionate.add(r.uid) : S.selezionate.delete(r.uid); },
          }), '🖨'),
        el('button', {
          type: 'button', class: 'btn-elimina-riga', 'aria-label': `Elimina scheda ${r.prog}`,
          onclick: (e) => { e.stopPropagation(); eliminaSchedaDaElenco(r.uid); },
        }, '🗑')));
  }));
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
      else if (c.tipo === 'numero') input = el('input', { id, name: c.k, type: 'number', inputmode: 'decimal', step: c.passo, min: 0 });
      else if (c.tipo === 'data') input = el('input', { id, name: c.k, type: 'date' });
      else if (c.tipo === 'illustrata') input = el('button', { type: 'button', id, class: 'illustr-bottone', onclick: () => apriPicker(c.k) },
        el('span', { class: 'illustr-icona', id: id + '-icona' }),
        el('span', { class: 'illustr-testo', id: id + '-testo' }, 'Tocca per scegliere…'),
        el('span', { class: 'illustr-freccia', 'aria-hidden': 'true' }, '▾'));
      else input = el('input', { id, name: c.k, type: 'text', list: c.tipo === 'lista' ? 'dl-' + c.k : null, autocapitalize: 'off' });

      // Il campo "nome" ha in più un pulsante per consultare la guida delle 144 specie del corso.
      const campoInput = c.k === 'nome'
        ? el('div', { class: 'campo-nome-riga' }, input,
            el('button', { type: 'button', class: 'btn nome-guida-bottone', title: 'Guida specie (144 alberi)', 'aria-label': 'Apri guida specie', onclick: () => apriGuidaSpecie($('#f-nome').value) }, '📖'))
        : input;

      griglia.append(el('label', { class: 'campo' + (c.largo ? ' largo' : ''), for: id },
        c.label, campoInput, c.k === 'prog' ? el('span', { class: 'avviso-campo', id: 'avviso-prog' }) : null,
        c.aiuto ? el('span', { class: 'campo-aiuto', testo: c.aiuto }) : null));
      if (c.tipo === 'lista') griglia.append(el('datalist', { id: 'dl-' + c.k }, (c.valori || []).map((v) => el('option', { value: v }))));
    }
    cont.append(el('fieldset', { class: sez.id }, el('legend', { testo: sez.titolo }), griglia,
      sez.id === 'fit' ? el('div', { id: 'fito-suggerimenti' }) : null));
  }

  // Un solo ascoltatore per tutti i campi
  $('#modulo').addEventListener('input', (e) => {
    const r = S.aperta;
    const k = e.target.name;
    if (!r || !k || !CAMPI.some((c) => c.k === k)) return;
    let valore = e.target.value;
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
    if (k === 'problemi') aggiornaSuggerimentiFito(e.target.value);
    if (k === 'altezza' || k === 'grandezza' || k === 'circonferenza') disegnaStima();
    salvaPresto(r);
  });

  // "N° nel giorno" si ricalcola da solo quando si sceglie la Data.
  $('#modulo').addEventListener('change', (e) => {
    const r = S.aperta;
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
  $('#ed-titolo').firstChild.textContent = `N° ${r.prog || '?'}${r.nome ? ' – ' + r.nome : ''} `;
}

function apriEditor(uid) {
  const r = S.schede.find((s) => s.uid === uid);
  if (!r) return;
  S.aperta = r;
  // il datalist del nome propone le specie già viste (nelle schede e nel catalogo
  // identificato con PlantNet), utile anche offline
  aggiornaDatalistNome();
  for (const c of CAMPI) {
    if (c.tipo === 'illustrata') aggiornaBottoneIllustrato(c.k);
    else $('#f-' + c.k).value = r[c.k] ?? '';
  }
  applicaDipendenze();
  controllaProg();
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
  history.pushState({ editor: true }, '');
}

function nascondiEditor() {
  S.aperta = null;
  $('#editor').classList.add('nascosto');
  document.body.style.overflow = '';
  disegnaElenco();
}

async function chiudiEditor(daIndietro = false) {
  if (!S.aperta) return;
  if (REG.attiva && REG.riga === S.aperta) fermaRegistrazione();
  if (GPSR.watch !== null && GPSR.riga === S.aperta) fermaGPS(true);
  const uid = S.aperta.uid;
  await salvaOra(S.aperta);
  nascondiEditor();
  document.getElementById('voce-' + uid)?.scrollIntoView({ block: 'center' });
  if (!daIndietro && history.state?.editor) history.back();
}
// Il tasto "indietro" di Android chiude l'editor invece di uscire
window.addEventListener('popstate', () => { if (S.aperta) chiudiEditor(true); });

async function nuovaScheda() {
  const r = schedaVuota();
  S.schede.push(r);
  await salvaOra(r);
  apriEditor(r.uid);
  $('#f-nome').focus();
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
  r.cancellata = oraISO();
  r.modificato = oraISO();
  await DB.scrivi('schede', r);
  S.schede = S.schede.filter((s) => s.uid !== r.uid);
  S.selezionate.delete(r.uid);
  S.cestino.push(r);
  disegnaElenco();
  aggiornaBadgeCestino();
  toast(`Scheda N° ${r.prog} spostata nel cestino`, 'Annulla', () => ripristinaDalCestino(r));
}

async function ripristinaDalCestino(r) {
  r.cancellata = null;
  r.modificato = oraISO();
  await DB.scrivi('schede', r);
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
  const n = S.schede.length;
  if (!n) { alert('Non ci sono schede da archiviare: l\'elenco è già vuoto.'); return; }
  if (!confirm(`Salvo un backup delle ${n} schede attuali e apro un elenco nuovo.\n\nLe schede di adesso andranno nel cestino (recuperabili per ${giorniConservazioneCestino()} giorni); il N° progressivo del nuovo elenco ripartirà da 1.\n\nContinuare?`)) return;
  $('#dlg-menu').close();
  await salvaTuttiInSospeso();
  const adesso = new Date();
  const bolla = `${oggi()}_${String(adesso.getHours()).padStart(2, '0')}-${String(adesso.getMinutes()).padStart(2, '0')}`;
  await esportaZIP('scarica', { nomeFile: `scheda-botanica-elenco-${bolla}.zip`, soloAttive: true });
  const quando = oraISO();
  for (const r of S.schede) { r.cancellata = quando; r.modificato = quando; await DB.scrivi('schede', r); }
  S.cestino.push(...S.schede);
  S.schede = [];
  S.selezionate.clear();
  disegnaElenco();
  aggiornaBadgeCestino();
  stato(`Nuovo elenco iniziato: ${n} schede archiviate nel cestino, backup scaricato`);
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
  b.textContent = n ? `🗑 ${n}` : '🗑';
  b.title = n ? `Cestino (${n})` : 'Cestino';
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
    markerScegliPos = L.marker([lat, lng], { draggable: true }).addTo(mappaScegli);
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
const IDENT = { riga: null, foto: null };

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
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#2f5d3a'; ctx.fillRect(0, 0, 32, 32);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.7));
    const form = new FormData(); form.append('images', blob, 'test.jpg'); form.append('organs', 'auto');
    const resp = await fetch(`https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(chiave)}&lang=it`, { method: 'POST', body: form });
    if (resp.status === 401 || resp.status === 403) { $('#pn-stato').textContent = '❌ Chiave non valida: ricontrolla di averla copiata per intero da my.plantnet.org.'; return; }
    if (resp.status === 429) { $('#pn-stato').textContent = '⚠️ Chiave valida, ma la quota gratuita di oggi (500) è già esaurita. Riprova domani.'; return; }
    if (resp.status === 404) { $('#pn-stato').textContent = '✅ Chiave valida (la foto di prova, volutamente vuota, non è una pianta).'; return; }
    if (!resp.ok) { $('#pn-stato').textContent = `⚠️ Risposta inattesa (${resp.status}); la chiave sembra comunque accettata.`; return; }
    const dati = await resp.json().catch(() => null);
    const rimaste = dati?.remainingIdentificationRequests;
    $('#pn-stato').textContent = `✅ Chiave valida.${rimaste != null ? ` Richieste rimaste oggi: ${rimaste}.` : ''}`;
  } catch (e) {
    $('#pn-stato').textContent = '⚠️ Impossibile verificare adesso (sei offline o la rete blocca la richiesta): ' + e.message;
  }
}

async function apriIdentificazione(r, p) {
  if (!chiavePlantNet()) {
    if (confirm('Per identificare le foto serve una chiave PlantNet gratuita, non ancora configurata.\nVuoi inserirla ora?')) apriImpostazioniPlantNet();
    return;
  }
  IDENT.riga = r; IDENT.foto = p;
  $('#ident-anteprima').src = await urlFoto(p.id);
  $('#ident-stato').textContent = '';
  $('#ident-risultati').replaceChildren();
  $('#dlg-identifica').showModal();
}

async function eseguiIdentificazione() {
  const chiave = chiavePlantNet();
  if (!chiave) { $('#ident-stato').textContent = 'Manca la chiave PlantNet.'; return; }
  const organo = $('#ident-organo').value;
  $('#ident-stato').textContent = '⏳ Invio della foto a PlantNet…';
  $('#ident-risultati').replaceChildren();
  try {
    const blob = await DB.leggi('foto', IDENT.foto.id);
    if (!blob) throw new Error('foto non trovata sul dispositivo');
    const form = new FormData();
    form.append('images', blob, 'foto.jpg');
    form.append('organs', organo);
    const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(chiave)}&lang=it&include-related-images=false`;
    const resp = await fetch(url, { method: 'POST', body: form });
    const testoResp = await resp.text();
    let dati = null; try { dati = JSON.parse(testoResp); } catch { /* risposta non JSON */ }
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) throw new Error('chiave non valida — controllala in ⋮ → Chiave PlantNet');
      if (resp.status === 429) throw new Error('quota gratuita di oggi esaurita (500 identificazioni/giorno) — riprova domani');
      if (resp.status === 404) throw new Error('nessuna specie riconosciuta con sicurezza: prova una foto più ravvicinata di una sola foglia, oppure indica l’organo (foglia, corteccia, fiore, frutto)');
      if (resp.status === 413) throw new Error('foto troppo grande per il servizio');
      throw new Error(dati?.message || `errore del servizio (${resp.status})`);
    }
    const risultati = (dati?.results || []).slice(0, 5);
    if (!risultati.length) { $('#ident-stato').textContent = 'Nessun risultato: prova con un’altra foto o un altro organo (foglia/corteccia/fiore/frutto).'; return; }
    const rimaste = dati?.remainingIdentificationRequests;
    $('#ident-stato').textContent = rimaste != null ? `Richieste rimaste oggi: ${rimaste}` : '';
    $('#ident-risultati').replaceChildren(...risultati.map((ris) => {
      const conf = Math.round((ris.score || 0) * 100);
      const nomeSci = ris.species?.scientificNameWithoutAuthor || ris.species?.scientificName || 'Sconosciuto';
      const nomeComune = ris.species?.commonNames?.[0] || '';
      const gbifId = ris.gbif?.id || '';
      return el('div', { class: 'ident-carta' },
        el('div', {}, el('b', { class: 'specie' }, nomeSci), nomeComune ? ` — ${nomeComune}` : ''),
        el('div', { class: 'ident-conf' }, `${conf}% di confidenza`),
        el('button', { type: 'button', class: 'btn primario', onclick: () => usaIdentificazione(nomeSci, nomeComune, conf, gbifId) }, 'Usa come nome esemplare'));
    }));
  } catch (e) {
    const rete = e instanceof TypeError; // fetch fallita: niente rete o richiesta bloccata
    $('#ident-stato').textContent = '❌ ' + (rete ? 'impossibile contattare PlantNet: controlla di essere online (serve internet solo per l’identificazione).' : e.message);
  }
}

function usaIdentificazione(nomeSci, nomeComune, conf, gbifId) {
  const r = IDENT.riga;
  const sostituire = !r.nome.trim() || confirm(`Il nome attuale è "${r.nome}". Sostituirlo con "${nomeSci}"?`);
  if (sostituire) {
    r.nome = nomeSci;
    if (S.aperta === r) { $('#f-nome').value = nomeSci; aggiornaTitoloEditor(); }
  }
  if (gbifId) r.gbifId = gbifId;
  const linkGbif = gbifId ? ` — GBIF: https://www.gbif.org/species/${gbifId}` : '';
  const nota = `Identificato con PlantNet: ${nomeSci}${nomeComune ? ' (' + nomeComune + ')' : ''} — ${conf}%, ${dataIT(oraISO())}${linkGbif}`;
  r.note = r.note ? r.note + '\n' + nota : nota;
  if (S.aperta === r) $('#f-note').value = r.note;
  IDENT.foto.identificata = true;
  r.modificato = oraISO();
  salvaOra(r);
  registraSpecieIdentificata(nomeSci, nomeComune, conf, gbifId);
  if (S.aperta === r) { disegnaFoto(); disegnaLinkGbif(); }
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

// Piccolo link cliccabile verso la scheda della specie su GBIF, quando la conosciamo.
function disegnaLinkGbif() {
  const cont = $('#gbif-link');
  if (!cont) return;
  const r = S.aperta;
  cont.replaceChildren(r?.gbifId
    ? el('a', { href: `https://www.gbif.org/species/${r.gbifId}`, target: '_blank', rel: 'noopener', style: 'font-size:13px' }, '🔗 Apri la specie su GBIF')
    : null);
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
   Fontana). È un dato di sola consultazione che arriva già con l'app (non
   sta in IndexedDB): serve a confermare sul posto quello che si osserva,
   non riempie da sola i campi della scheda — quelli restano sempre una
   scelta di chi rileva.
   ===================================================================== */


const GS_TIPOLOGIA_ETICHETTA = { caducifoglia: 'caducifoglia', sempreverde: 'sempreverde', 'ex palme': 'palma (sempreverde)' };
const GS_CHIP_ETICHETTA = {
  chiomaForma: 'Chioma', ramiForma: 'Rami', ramiInserzione: 'Rami',
  fogliaTipo: 'Foglia', fogliaComposta: 'Foglia composta', fogliaLamina: 'Lamina',
  fogliaMargine: 'Margine', fogliaBase: 'Base', fogliaApice: 'Apice',
  gemmeForma: 'Gemme', gemmePosizione: 'Gemme (posizione)', gemmeOrientamento: 'Gemme (orientamento)', gemmeTipologia: 'Gemme (tipo)',
};

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
  const ris = risultatiGuidaSpecie($('#gs-cerca').value);
  const gia = nomiGiaRilevati();
  $('#gs-dettaglio').classList.add('nascosto');
  $('#gs-lista').classList.remove('nascosto');
  if (!ris.length) { $('#gs-lista').replaceChildren(el('p', { class: 'vuoto' }, 'Nessuna specie trovata.')); return; }
  $('#gs-lista').replaceChildren(...ris.map((v) => {
    const trovata = gia.has(v.nomeSci.toLowerCase());
    return el('button', { type: 'button', class: 'gs-riga', onclick: () => mostraDettaglioGuidaSpecie(v) },
      el('b', { class: 'specie', testo: v.nomeSci + (v.varieta ? ` '${v.varieta}'` : '') }),
      el('span', { style: 'font-size:12px;color:var(--tenue)' }, v.famiglia, trovata ? ' · ✓ già rilevata' : null));
  }));
}

function schedaGuidaSpecie(v) {
  const righe = [
    v.famiglia && `Famiglia: ${v.famiglia}`,
    v.tipologia && `Tipologia: ${GS_TIPOLOGIA_ETICHETTA[v.tipologia] || v.tipologia}`,
    v.grandezza && `Classe di grandezza: ${v.grandezza}ª`,
    v.provenienza && `Provenienza: ${v.provenienza}`,
  ].filter(Boolean);
  const chip = Object.keys(GS_CHIP_ETICHETTA).filter((k) => v[k]).map((k) => `${GS_CHIP_ETICHETTA[k]}: ${v[k]}`);
  return el('div', {},
    el('h3', { class: 'specie', style: 'margin:0 0 2px' }, v.nomeSci + (v.varieta ? ` '${v.varieta}'` : '')),
    el('p', { style: 'font-size:13px;color:var(--tenue);margin:0 0 8px', testo: righe.join(' · ') }),
    chip.length ? el('p', { style: 'font-size:12.5px;margin:0 0 8px', testo: chip.join(' · ') }) : null,
    v.note ? el('p', { style: 'font-size:13.5px;line-height:1.5;margin:0', testo: v.note }) : null,
    S.aperta ? el('button', { type: 'button', class: 'btn primario', style: 'margin-top:12px', onclick: () => usaNomeDaGuidaSpecie(v.nomeSci) }, '✓ Usa questo nome nella scheda') : null);
}

function mostraDettaglioGuidaSpecie(v) {
  $('#gs-lista').classList.add('nascosto');
  const dett = $('#gs-dettaglio');
  dett.classList.remove('nascosto');
  dett.replaceChildren(
    el('button', { type: 'button', class: 'btn', style: 'margin-bottom:12px', onclick: disegnaListaGuidaSpecie }, '← Elenco'),
    schedaGuidaSpecie(v));
}

function apriGuidaSpecie(filtroIniziale) {
  $('#gs-cerca').value = filtroIniziale || '';
  disegnaListaGuidaSpecie();
  $('#dlg-guida-specie').showModal();
}

function usaNomeDaGuidaSpecie(nome) {
  if (!S.aperta) { $('#dlg-guida-specie').close(); return; }
  const r = S.aperta;
  r.nome = nome;
  r.modificato = oraISO();
  $('#f-nome').value = nome;
  aggiornaTitoloEditor();
  salvaPresto(r);
  $('#dlg-guida-specie').close();
  toast('Nome aggiornato dalla guida specie');
}

/* =====================================================================
   9. QR CODE (SVG vettoriale, nitido in stampa)
   Stesso formato della versione precedente: SCHEDA:prog|nome|lat,lng
   ===================================================================== */
function testoQR(r) {
  const pos = r.gps ? `${r.gps.lat.toFixed(6)},${r.gps.lng.toFixed(6)}` : 'no-gps';
  return `SCHEDA:${r.prog}|${r.nome || 'esemplare'}|${pos}`;
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
const SCAN = { attiva: false, stream: null };

async function apriScanner() {
  if (!('BarcodeDetector' in window)) {
    const testo = prompt('La lettura automatica del QR non è supportata da questo browser.\nPuoi incollare qui il testo del codice oppure scrivere solo il N° progressivo:');
    if (testo) cercaDaTestoQR(testo);
    return;
  }
  const dlg = $('#dlg-scanner');
  dlg.showModal();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
  SCAN.attiva = false;
  SCAN.stream?.getTracks().forEach((t) => t.stop());
  SCAN.stream = null;
  if ($('#dlg-scanner').open) $('#dlg-scanner').close();
}

function cercaDaTestoQR(testo) {
  const m = testo.match(/SCHEDA:([^|]+)/i);
  const prog = m ? m[1].trim() : (testo.trim() ? testo.trim() : null);
  if (!prog) return alert('Codice non riconosciuto:\n' + testo);
  const r = S.schede.find((s) => s.prog === prog);
  if (!r) return alert(`Nessuna scheda con N° ${prog}.`);
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
  $('#tab-schede').classList.toggle('attiva', tab === 'schede');
  $('#tab-mappa').classList.toggle('attiva', tab === 'mappa');
  $('#tab-timeline').classList.toggle('attiva', tab === 'timeline');
  $('#vista-schede').classList.toggle('nascosto', tab !== 'schede');
  $('#vista-mappa').classList.toggle('nascosto', tab !== 'mappa');
  $('#vista-timeline').classList.toggle('nascosto', tab !== 'timeline');
  $('#btn-nuova').classList.toggle('nascosto', tab !== 'schede');
  if (tab === 'mappa') { assicuraMappa(); disegnaMappa(); disegnaLineaTraccia(); aggiornaInfoTraccia(); aggiornaInfoCacheMappa(); }
  if (tab === 'timeline') disegnaTimeline();
}

/* =====================================================================
   9d. TRACCIA — registra il percorso fatto a piedi (breadcrumb GPS),
   indipendente dai punti delle singole schede. Resta salvata offline
   nello store IndexedDB "traccia" finché non la cancelli.
   ===================================================================== */
const TRK = { watch: null };
let lineaTraccia = null;

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
  for (let i = 1; i < S.traccia.length; i++) tot += distanzaMetri(S.traccia[i - 1], S.traccia[i]);
  return tot;
}
const formattaDistanza = (m) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`;

function aggiornaInfoTraccia() {
  const n = S.traccia.length;
  const info = $('#traccia-info');
  if (!n) { info.textContent = TRK.watch !== null ? 'Registrazione avviata… in attesa del primo punto' : ''; }
  else {
    const durataMin = Math.round((Date.parse(S.traccia[n - 1].quando) - Date.parse(S.traccia[0].quando)) / 60000);
    info.textContent = `${n} punti · ${formattaDistanza(distanzaTotaleTraccia())} · ${durataMin} min`;
  }
  $('#btn-traccia-avvia').classList.toggle('nascosto', TRK.watch !== null);
  $('#btn-traccia-ferma').classList.toggle('nascosto', TRK.watch === null);
  $('#btn-traccia-gpx').classList.toggle('nascosto', n === 0);
  $('#btn-traccia-cancella').classList.toggle('nascosto', n === 0);
}

function disegnaLineaTraccia() {
  if (!mappa) return;
  if (lineaTraccia) { mappa.removeLayer(lineaTraccia); lineaTraccia = null; }
  if (S.traccia.length < 2) return;
  lineaTraccia = L.polyline(S.traccia.map((p) => [p.lat, p.lng]), { color: '#2f5d3a', weight: 4, opacity: .8 }).addTo(mappa);
}

function avviaTraccia() {
  if (!navigator.geolocation) return alert('Geolocalizzazione non disponibile su questo dispositivo.');
  if (TRK.watch !== null) return;
  localStorage.setItem('sb-traccia-attiva', '1');
  TRK.watch = navigator.geolocation.watchPosition(
    async (p) => {
      const c = p.coords;
      const punto = { lat: c.latitude, lng: c.longitude, alt: c.altitude, acc: c.accuracy, quando: oraISO() };
      S.traccia.push(punto);
      await DB.scrivi('traccia', punto);
      disegnaLineaTraccia();
      aggiornaInfoTraccia();
    },
    (err) => {
      const motivi = { 1: 'permesso negato (abilita la posizione per il browser)', 2: 'posizione non disponibile', 3: 'tempo scaduto' };
      stato('Traccia: ' + (motivi[err.code] || err.message), true);
    },
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  aggiornaInfoTraccia();
  stato('Traccia avviata');
}

function fermaTraccia() {
  if (TRK.watch !== null) navigator.geolocation.clearWatch(TRK.watch);
  TRK.watch = null;
  localStorage.removeItem('sb-traccia-attiva');
  aggiornaInfoTraccia();
  stato('Traccia fermata');
}

async function cancellaTraccia() {
  if (!confirm(`Cancellare la traccia registrata (${S.traccia.length} punti)? Non si può annullare.`)) return;
  fermaTraccia();
  S.traccia = [];
  await DB.svuota('traccia');
  disegnaLineaTraccia();
  aggiornaInfoTraccia();
}

function testoTracciaGPX() {
  if (S.traccia.length < 2) return null;
  const pt = S.traccia.map((p) => `    <trkpt lat="${p.lat}" lon="${p.lng}">` +
    (p.alt != null ? `<ele>${p.alt}</ele>` : '') + `<time>${escHtml(p.quando)}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Scheda Botanica" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <trk><name>Percorso ${oggi()}</name><trkseg>\n${pt}\n  </trkseg></trk>\n</gpx>\n`;
}
function esportaTracciaGPX() {
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
        onclick: () => apriEditor(r.uid), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apriEditor(r.uid); } } },
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
  const area = $('#stampa');
  stato('Preparo la stampa…');
  if (tipo === 'etichette') {
    area.replaceChildren(el('div', { class: 'p-etichette' }, lista.map((r) =>
      el('div', { class: 'p-etichetta' }, qrSVG(testoQR(r)), el('b', { testo: `N° ${r.prog}` }), el('i', { testo: r.nome || '' })))));
  } else {
    const campiScelti = [...document.querySelectorAll('input[name=st-campo]:checked')].map((i) => i.value);
    localStorage.setItem('sb-stampa-campi', JSON.stringify(campiScelti));
    const opz = { qr: $('#st-qr').checked, foto: $('#st-foto').checked, colonne: Number($('#st-colonne').value), campi: new Set(campiScelti) };
    area.replaceChildren(...await Promise.all(lista.map((r) => paginaScheda(r, opz))));
  }
  // aspetta che le immagini siano pronte, altrimenti escono riquadri vuoti
  await Promise.all([...area.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
  stato(`Stampa pronta: ${lista.length} ${tipo === 'etichette' ? 'etichette' : 'schede'}`);
  window.print();
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

  const fotoStampa = r.foto.filter((p) => p.stampa);
  if (opz.foto && fotoStampa.length) {
    const altezza = { 1: '120mm', 2: '70mm', 3: '48mm' }[opz.colonne];
    const figure = await Promise.all(fotoStampa.map(async (p) =>
      el('figure', {},
        el('img', { src: await urlFoto(p.id), alt: '', style: `height:${altezza}` }),
        el('figcaption', { testo: [p.didascalia, dataIT(p.quando)].filter(Boolean).join(' – ') }))));
    pagina.append(el('section', {},
      el('h3', { class: 'p-titolo-foto', testo: `Foto (${fotoStampa.length})` }),
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
  stato('Preparo il backup…');
  const foto = {}, audio = {};
  for (const r of S.schede) {
    for (const p of r.foto) { const b = await DB.leggi('foto', p.id); if (b) foto[p.id] = await blobInDataURL(b); }
    for (const a of r.audio) { const b = await DB.leggi('audio', a.id); if (b) audio[a.id] = await blobInDataURL(b); }
  }
  const dati = { app: 'scheda-botanica', versione: 2, esportato: oraISO(), schede: S.schede, foto, audio };
  scarica(new Blob([JSON.stringify(dati)], { type: 'application/json' }), `scheda-botanica-backup-${oggi()}.json`);
  localStorage.setItem('sb-ultimo-backup', oraISO());
  stato(`Backup esportato: ${S.schede.length} schede, ${Object.keys(foto).length} foto, ${Object.keys(audio).length} audio`);
}

// Accetta: backup v2 (con audio), backup v1, dati.json dello ZIP della vecchia app (campo "full"), array semplice
function leggiFormatoBackup(json) {
  if (json && json.app === 'scheda-botanica' && Array.isArray(json.schede)) {
    return json.schede.map((s) => {
      const { record } = normalizza(s);
      const fotoDaSalvare = record.foto.filter((p) => json.foto?.[p.id]).map((p) => ({ id: p.id, dataUrl: json.foto[p.id] }));
      const audioDaSalvare = record.audio.filter((a) => json.audio?.[a.id]).map((a) => ({ id: a.id, dataUrl: json.audio[a.id] }));
      return { record, fotoDaSalvare, audioDaSalvare };
    });
  }
  if (json && Array.isArray(json.full)) return json.full.map(normalizza);
  if (Array.isArray(json)) return json.map(normalizza);
  throw new Error('il file non è un backup di Scheda Botanica');
}

async function importaDati(voci, modo) {
  if (modo === 'sostituisci') {
    await DB.svuota('schede');
    await DB.svuota('foto');
    await DB.svuota('audio');
    S.urlFoto.forEach((u) => URL.revokeObjectURL(u));
    S.urlFoto.clear();
    S.urlAudio.forEach((u) => URL.revokeObjectURL(u));
    S.urlAudio.clear();
    S.schede = [];
    S.cestino = [];
    S.selezionate.clear();
  }
  let nuove = 0, aggiornate = 0, invariate = 0, mediaErr = 0;
  for (const { record, fotoDaSalvare, audioDaSalvare } of voci) {
    const esistente = S.schede.find((s) => s.uid === record.uid) || S.cestino.find((s) => s.uid === record.uid);
    if (esistente && esistente.modificato >= record.modificato) { invariate++; continue; }
    for (const f of fotoDaSalvare || []) {
      try {
        const blob = f.blob || await dataURLInBlob(f.dataUrl);
        // le foto enormi della vecchia app vengono ricompresse
        await DB.scrivi('foto', blob.size > 900000 ? await comprimiFoto(blob) : blob, f.id);
      } catch { mediaErr++; }
    }
    for (const a of audioDaSalvare || []) {
      try { await DB.scrivi('audio', a.blob || await dataURLInBlob(a.dataUrl), a.id); } catch { mediaErr++; }
    }
    await DB.scrivi('schede', record);
    if (esistente) {
      liberaMediaRecord(esistente);
      S.schede = S.schede.filter((s) => s.uid !== record.uid);
      S.cestino = S.cestino.filter((s) => s.uid !== record.uid);
      (record.cancellata ? S.cestino : S.schede).push(record);
      aggiornate++;
    } else {
      (record.cancellata ? S.cestino : S.schede).push(record);
      nuove++;
    }
  }
  disegnaElenco();
  aggiornaBadgeCestino();
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

// Legge un backup ZIP (v3): dati da backup.json, foto e audio come file veri
async function leggiBackupZip(file) {
  const zip = await JSZip.loadAsync(file);
  const dj = zip.file('backup.json');
  if (!dj) throw new Error('questo ZIP non contiene backup.json: è un’esportazione vecchia o non creata dall’app');
  const json = JSON.parse(await dj.async('string'));
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
  return voci;
}

async function importaBackupDaFile(file) {
  try {
    stato('Leggo il backup…');
    const eZip = /\.zip$/i.test(file.name) || file.type.includes('zip');
    const voci = eZip ? await leggiBackupZip(file) : leggiFormatoBackup(JSON.parse(await file.text()));
    const nFoto = voci.reduce((n, v) => n + (v.fotoDaSalvare?.length || 0), 0);
    const nAudio = voci.reduce((n, v) => n + (v.audioDaSalvare?.length || 0), 0);
    $('#import-info').textContent = `Il file contiene ${voci.length} schede, ${nFoto} foto e ${nAudio} audio.`;
    const modo = await chiedi($('#dlg-import'));
    if (modo === 'annulla') return;
    if (modo === 'sostituisci' && !confirm('Tutte le schede attuali verranno cancellate. Continuare?')) return;
    stato('Importazione in corso…');
    await importaDati(voci, modo);
    await unisciCatalogoSpecie(voci.specie);
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
  const tutteLeSchede = opzioni.soloAttive ? [...S.schede] : [...S.schede, ...S.cestino];
  if (!tutteLeSchede.length) return alert('Nessuna scheda da esportare.');
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
        if (b) { const f = `foto/${base}_${p.id}.jpg`; cartFoto.file(f.slice(5), b); indice[p.id] = f; }
      }
      for (const a of r.audio) {
        const b = await DB.leggi('audio', a.id);
        if (b) { const f = `audio/${base}_${a.id}.${estensioneAudio(b.type || '')}`; cartAudio.file(f.slice(6), b); indice[a.id] = { percorso: f, tipo: b.type || '' }; }
      }
    }
    zip.file('backup.json', JSON.stringify({ app: 'scheda-botanica', versione: 3, esportato: oraISO(), schede: tutteLeSchede, file: indice }));
    if (S.specie.length) zip.file('specie.json', JSON.stringify(S.specie));
    zip.file('rilevazioni.csv', testoCSV());
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
        scarica(blob, nomeFileZip);
        stato('Il tuo browser non supporta "Condividi": ho scaricato il file, caricalo a mano nella cartella condivisa.');
      } else {
        stato(`Backup pronto per la condivisione: ${tutteLeSchede.length} schede`);
      }
    } else {
      scarica(blob, nomeFileZip);
      stato(`Backup esportato: ${tutteLeSchede.length} schede`);
    }
    localStorage.setItem('sb-ultimo-backup', oraISO());
  } catch (e) {
    // L'utente che annulla la finestra di condivisione genera un errore "AbortError": non è un vero errore.
    if (e.name === 'AbortError') { stato(''); return; }
    alert('Esportazione ZIP non riuscita: ' + e.message);
    stato('');
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

async function importaExcelDaFile(file) {
  try {
    const buf = await file.arrayBuffer();
    const cartella = XLSX.read(buf, { type: 'array' });
    const foglio = cartella.Sheets[cartella.SheetNames[0]];
    const righe = XLSX.utils.sheet_to_json(foglio, { header: 1, defval: '' });
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
        obj[c.k] = i >= 0 && cols[i] !== undefined ? String(cols[i]) : '';
      });
      return normalizza(obj);
    });
    const nonTrovate = CAMPI.filter((c) => mappa[c.k] < 0).map((c) => c.label);
    $('#import-info').textContent = `Il file Excel contiene ${voci.length} righe.` +
      (nonTrovate.length ? ` Colonne non trovate (restano vuote): ${nonTrovate.join(', ')}.` : '') +
      ` Le foto e l'audio non sono nel foglio Excel e non verranno importati.`;
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

function collegaEventi() {
  $('#btn-tema').onclick = () => {
    const t = document.documentElement.dataset.tema === 'scuro' ? 'chiaro' : 'scuro';
    localStorage.setItem('sb-tema', t);
    applicaTema(t);
  };
  $('#cerca').oninput = disegnaElenco;
  $('#filtro-data').onchange = disegnaElenco;
  $('#btn-filtri-avanzati').onclick = () => $('#pannello-filtri').classList.toggle('nascosto');
  for (const id of ['#filtro-specie', '#filtro-dal', '#filtro-al']) $(id).onchange = disegnaElenco;
  for (const id of ['#filtro-problemi', '#filtro-senza-foto', '#filtro-senza-gps']) $(id).onchange = disegnaElenco;
  $('#btn-filtri-azzera').onclick = azzeraFiltriAvanzati;
  $('#btn-nuova').onclick = nuovaScheda;
  $('#btn-stampa').onclick = () => apriStampa();
  $('#st-campi-tutti').onclick = (e) => { e.preventDefault(); document.querySelectorAll('input[name=st-campo]').forEach((c) => { c.checked = true; }); };
  $('#st-campi-nessuno').onclick = (e) => { e.preventDefault(); document.querySelectorAll('input[name=st-campo]').forEach((c) => { c.checked = false; }); };

  $('#btn-chiudi').onclick = () => chiudiEditor();
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
    $('#dlg-menu').showModal();
  };
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
  $('#avviso-backup-fai').onclick = () => { nascondiAvvisoBackup(); esportaZIP(); };
  $('#avviso-backup-ignora').onclick = () => { localStorage.setItem('sb-avviso-backup-ignorato', oggi()); nascondiAvvisoBackup(); };
  $('#dlg-menu').addEventListener('click', (e) => {
    const az = e.target.closest('button[data-az]')?.dataset.az;
    if (!az) return;
    $('#dlg-menu').close();
    if (az === 'backup') esportaBackup();
    if (az === 'ripristina') $('#in-backup').click();
    if (az === 'excel') $('#in-excel').click();
    if (az === 'zip') esportaZIP();
    if (az === 'zip-condividi') esportaZIP('condividi');
    if (az === 'plantnet') apriImpostazioniPlantNet();
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
    x.onchange = () => $('#st-opz-schede').classList.toggle('nascosto', $('input[name=st-tipo]:checked').value === 'etichette');
  });

  // aiuto
  $('#btn-aiuto').onclick = () => { $('#aiuto-versione').textContent = `Versione dell'app: ${APP_VERSIONE}`; $('#dlg-aiuto').showModal(); };
  $('#gs-cerca').oninput = disegnaListaGuidaSpecie;
  $('#gs-chiudi').onclick = () => $('#dlg-guida-specie').close();

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
  $('#btn-traccia-avvia').onclick = avviaTraccia;
  $('#btn-traccia-ferma').onclick = fermaTraccia;
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
  aggiornaDispositivo();
  costruisciModulo();
  collegaEventi();

  try {
    await DB.apri();
  } catch (e) {
    stato('Archivio non disponibile (' + e.message + '). In navigazione anonima il salvataggio non funziona.', true);
    return;
  }
  navigator.storage?.persist?.().catch(() => {});

  const tutte = (await DB.tutte('schede')).map((r) => normalizza(r).record);
  S.schede = tutte.filter((r) => !r.cancellata);
  S.cestino = tutte.filter((r) => r.cancellata);
  disegnaElenco();
  aggiornaBadgeCestino();
  await migraVecchiaVersione();
  await purgaCestinoScaduto();

  S.traccia = await DB.tutte('traccia');
  S.specie = await DB.tutte('specie');
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
        await esportaZIP('scarica');
        stato('Backup automatico scaricato');
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

avvio();

// Indicatore live "online/offline" in alto: utile per sapere se, al momento
// del rilievo, i dati sono stati presi con o senza connessione (la mappa e
// PlantNet ne hanno bisogno; il resto dell'app funziona comunque offline).
function aggiornaStatoRete() {
  const el = document.getElementById('stato-rete');
  if (!el) return;
  el.textContent = navigator.onLine ? '' : ' · 📴 offline';
}
aggiornaStatoRete();
window.addEventListener('online', aggiornaStatoRete);
window.addEventListener('offline', aggiornaStatoRete);

// Registrazione del service worker: rende l'app installabile e utilizzabile offline
// dopo la prima visita. Se il file non è servito da un vero server (es. aperto
// come file locale) l'app funziona comunque, solo senza installazione PWA.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

