'use strict';
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

// Icone vettoriali decorative, indipendenti dai font del dispositivo.
function iconaSvg(nome) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icona');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + nome);
  svg.append(use);
  return svg;
}

const nuovoId = (pref) => `${pref}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
const nomeFile = (s) => (s || 'esemplare').trim().replace(/[^a-z0-9_-]+/gi, '_').slice(0, 30) || 'esemplare';
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (sec) => { const n = Math.max(0, Math.round(Number(sec) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const oraISO = () => new Date().toISOString();
const dataIT = (iso) => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
// Formatta una data "sola" (YYYY-MM-DD, senza ora) in gg/mm/aaaa senza passare da Date/fuso orario,
// per evitare che una data-solo-giorno slitti di un giorno vicino alla mezzanotte.
const dataBreveIT = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
// Data del calendario locale. toISOString() usa UTC e, dopo mezzanotte in Italia,
// può ancora restituire il giorno precedente.
const dataLocaleISO = (data = new Date()) => {
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const d = String(data.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const oggi = () => dataLocaleISO();
const numeroFinito = (v) => (typeof v === 'number' || typeof v === 'string') && String(v).trim() !== '' && Number.isFinite(Number(v));
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

let cartellaBotanicaHandle = null;

function databaseCartellaBotanica() {
  return new Promise((ok, ko) => {
    const richiesta = indexedDB.open('scheda-botanica-cartella-file', 1);
    richiesta.onupgradeneeded = () => richiesta.result.createObjectStore('impostazioni');
    richiesta.onsuccess = () => ok(richiesta.result);
    richiesta.onerror = () => ko(richiesta.error);
  });
}

async function ricordaCartellaBotanica(handle) {
  const db = await databaseCartellaBotanica();
  await new Promise((ok, ko) => {
    const tx = db.transaction('impostazioni', 'readwrite');
    tx.objectStore('impostazioni').put(handle, 'cartella');
    tx.oncomplete = ok;
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error('Memorizzazione cartella annullata'));
  });
  db.close();
}

async function ripristinaCartellaBotanica() {
  try {
    const db = await databaseCartellaBotanica();
    cartellaBotanicaHandle = await new Promise((ok, ko) => {
      const richiesta = db.transaction('impostazioni').objectStore('impostazioni').get('cartella');
      richiesta.onsuccess = () => ok(richiesta.result || null);
      richiesta.onerror = () => ko(richiesta.error);
    });
    db.close();
  } catch { cartellaBotanicaHandle = null; }
  return cartellaBotanicaHandle;
}

async function permessoCartellaBotanica() {
  if (!cartellaBotanicaHandle) return 'non-scelta';
  try { return cartellaBotanicaHandle.queryPermission ? await cartellaBotanicaHandle.queryPermission({ mode: 'readwrite' }) : 'granted'; }
  catch { return 'denied'; }
}

async function scegliCartellaBotanica() {
  if (typeof window.showDirectoryPicker !== 'function') throw new Error('Questo browser non permette a una pagina web di scegliere una cartella. I file continueranno nei Download normali.');
  let scelta;
  try { scelta = await window.showDirectoryPicker({ id: 'scheda-botanica-salvataggi', mode: 'readwrite', startIn: 'downloads' }); }
  catch (e) {
    if (e.name === 'AbortError') throw e;
    scelta = await window.showDirectoryPicker({ mode: 'readwrite' });
  }
  const cartella = scelta.name?.toLocaleLowerCase('it') === 'botanica' ? scelta : await scelta.getDirectoryHandle('Botanica', { create: true });
  const permesso = cartella.requestPermission ? await cartella.requestPermission({ mode: 'readwrite' }) : 'granted';
  if (permesso !== 'granted') throw new Error('Permesso di scrittura non concesso.');
  await ricordaCartellaBotanica(cartella);
  cartellaBotanicaHandle = cartella;
  return cartella;
}

async function dimenticaCartellaBotanica() {
  try {
    const db = await databaseCartellaBotanica();
    await new Promise((ok, ko) => {
      const tx = db.transaction('impostazioni', 'readwrite');
      tx.objectStore('impostazioni').delete('cartella');
      tx.oncomplete = ok;
      tx.onerror = () => ko(tx.error);
    });
    db.close();
  } catch { /* La scelta in memoria viene rimossa comunque. */ }
  cartellaBotanicaHandle = null;
}

function scaricaNormale(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function scarica(blob, nome) {
  if (cartellaBotanicaHandle && await permessoCartellaBotanica() === 'granted') {
    try {
      const punto = nome.lastIndexOf('.');
      const base = punto > 0 ? nome.slice(0, punto) : nome;
      const estensione = punto > 0 ? nome.slice(punto) : '';
      let nomeLibero = nome;
      let libero = false;
      for (let i = 0; i < 1000; i++) {
        nomeLibero = i ? `${base} (${i})${estensione}` : nome;
        try { await cartellaBotanicaHandle.getFileHandle(nomeLibero); }
        catch (e) { if (e.name === 'NotFoundError') { libero = true; break; } throw e; }
      }
      if (!libero) throw new Error('Troppi file con lo stesso nome nella cartella Botanica');
      const file = await cartellaBotanicaHandle.getFileHandle(nomeLibero, { create: true });
      const scrittura = await file.createWritable();
      await scrittura.write(blob);
      await scrittura.close();
      return 'cartella';
    } catch { /* Cartella rimossa o non più accessibile: uso il download normale. */ }
  }
  scaricaNormale(blob, nome);
  return 'download';
}

const blobInDataURL = (blob) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => ko(r.error);
  r.readAsDataURL(blob);
});

async function dataURLInBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:(image|audio)\//i.test(dataUrl)) throw new Error('Formato media non valido: richiesto un file incorporato');
  const risposta = await fetch(dataUrl);
  if (!risposta.ok) throw new Error('Media non leggibile');
  return risposta.blob();
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


// Date del calendario e seriali Excel, senza slittamenti di fuso orario.
function normalizzaData(valore, date1904 = false) {
  if (valore === '' || valore == null) return '';
  let y, m, d;
  if (typeof valore === 'number') {
    if (!Number.isFinite(valore) || valore < (date1904 ? 0 : 1) || (!date1904 && Math.floor(valore) === 60)) return '';
    const giorni = Math.floor(valore);
    const data = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11,
      (date1904 ? 1 : 31) + giorni - (!date1904 && giorni >= 61 ? 1 : 0)));
    if (!Number.isFinite(data.getTime())) return '';
    y = data.getUTCFullYear(); m = data.getUTCMonth() + 1; d = data.getUTCDate();
  } else {
    const testo = String(valore).trim();
    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(testo);
    if (match) [, y, m, d] = match;
    else {
      match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(testo);
      if (!match) return '';
      [, d, m, y] = match;
    }
  }
  const data = new Date(0);
  data.setUTCFullYear(Number(y), Number(m) - 1, Number(d));
  if (data.getUTCFullYear() !== Number(y) || data.getUTCMonth() + 1 !== Number(m) || data.getUTCDate() !== Number(d)) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Il file Excel resta disponibile offline nella cache dell'app, ma lo script
// viene eseguito soltanto al primo uso. Le chiamate simultanee condividono
// il caricamento e un errore consente un nuovo tentativo.
let caricamentoExcel = null;
function caricaLibreriaExcel() {
  if (window.XlsxPopulate) return Promise.resolve(window.XlsxPopulate);
  if (caricamentoExcel) return caricamentoExcel;
  caricamentoExcel = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './lib/xlsx-populate.js';
    script.onload = () => window.XlsxPopulate ? resolve(window.XlsxPopulate) : reject(new Error('Libreria Excel non disponibile'));
    script.onerror = () => { script.remove(); reject(new Error('Impossibile caricare la libreria Excel')); };
    document.head.append(script);
  }).catch((errore) => { caricamentoExcel = null; throw errore; });
  return caricamentoExcel;
}

// Preferenze in localStorage protette: in navigazione privata, con memoria piena
// o con i dati del sito bloccati, localStorage può lanciare un errore. Qui
// l'errore viene assorbito: l'app continua con il valore predefinito.
function leggiPref(chiave) {
  try { return localStorage.getItem(chiave); } catch { return null; }
}
function scriviPref(chiave, valore) {
  try { localStorage.setItem(chiave, valore); return true; } catch { return false; }
}
function cancellaPref(chiave) {
  try { localStorage.removeItem(chiave); } catch { /* niente da fare */ }
}

// Valore di un campo come lo legge una persona (le «scelte» hanno un'etichetta).
// Unica versione: usata da stampa, pagina HTML, elenco e report.
function valoreLeggibile(c, v) {
  if (c.tipo === 'scelta') return v ? (c.valori.find(([x]) => x === v) || [, v])[1] : '';
  return String(v ?? '').trim();
}

/* Indicatore dello spazio del browser (3.38): barra usato / disponibile,
   con l'eventuale aggiunta prevista (es. una zona di mappa da scaricare). */
async function statoSpazio() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0, usageDetails } = await navigator.storage.estimate();
    if (!quota) return null;
    return { usato: usage, quota, dettagli: usageDetails || null };
  } catch { return null; }
}
function testoByte(b) {
  const mb = b / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`;
}
// Livello per colori e avvisi: ok < 70% ≤ attenzione < 90% ≤ critico.
const livelloSpazio = (frazione) => frazione >= 0.9 ? 'critico' : frazione >= 0.7 ? 'attenzione' : 'ok';
function barraSpazio(st, aggiunta = 0, etichettaAggiunta = 'dopo lo scaricamento') {
  if (!st) return el('p', { class: 'spazio-nota', testo: 'Il browser non indica lo spazio disponibile.' });
  const fUsato = Math.min(1, st.usato / st.quota), fDopo = Math.min(1, (st.usato + aggiunta) / st.quota);
  const pct = (f) => `${(f * 100).toFixed(f < 0.1 ? 1 : 0).replace('.', ',')}%`;
  const dettagli = st.dettagli ? [['Schede, foto e audio', st.dettagli.indexedDB], ['Mappe offline, slide e app', st.dettagli.caches]]
    .filter(([, v]) => v > 0).map(([t, v]) => `${t}: ${testoByte(v)}`).join(' · ') : '';
  return el('div', { class: 'spazio-ind livello-' + livelloSpazio(fDopo) },
    el('div', { class: 'spazio-traccia', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(fUsato * 100)),
      'aria-label': 'Spazio usato dall’app' },
      el('span', { class: 'spazio-usato', style: `width:${(fUsato * 100).toFixed(2)}%` }),
      aggiunta > 0 ? el('span', { class: 'spazio-aggiunta', style: `width:${((fDopo - fUsato) * 100).toFixed(2)}%` }) : null),
    el('p', { class: 'spazio-testo', testo: `Spazio usato ${testoByte(st.usato)} su ${testoByte(st.quota)} (${pct(fUsato)})` +
      (aggiunta > 0 ? ` · ${etichettaAggiunta} (+${testoByte(aggiunta)}): ${pct(fDopo)}` : '') }),
    dettagli ? el('p', { class: 'spazio-nota', testo: dettagli }) : null);
}

/* Coordinate GPS in più formati (3.48): per la stampa e il registro Excel.
   Le coordinate salvate restano sempre in gradi decimali WGS84. */
const FORMATI_COORDINATE = {
  dec: 'Gradi decimali (45.053200, 7.686800)',
  gms: 'Gradi, minuti, secondi (45°03′11.5″ N)',
  gm: 'Gradi e minuti (45°03.192′ N)',
  utm: 'UTM WGS84 (32T 396596 E 4989699 N)',
  no: 'Non stampare le coordinate',
};
const formatoCoordinateValido = (f) => Object.hasOwn(FORMATI_COORDINATE, f) ? f : 'dec';

// Un valore in gradi sessagesimali; arrotonda prima di dividere, così non esce mai «60″».
function gradiSessagesimali(v, pos, neg, conSecondi = true) {
  const emisfero = v < 0 ? neg : pos;
  const x = Math.abs(v);
  if (conSecondi) {
    let decimi = Math.round(x * 36000);
    const g = Math.floor(decimi / 36000); decimi -= g * 36000;
    const m = Math.floor(decimi / 600);
    const s = (decimi - m * 600) / 10;
    return `${g}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″ ${emisfero}`;
  }
  const millesimi = Math.round(x * 60000);
  const g = Math.floor(millesimi / 60000);
  const m = (millesimi - g * 60000) / 1000;
  return `${g}°${m.toFixed(3).padStart(6, '0')}′ ${emisfero}`;
}

// Da latitudine e longitudine WGS84 a UTM (proiezione di Mercatore trasversa, serie di Snyder:
// errore ben sotto il metro). Zona calcolata dal punto, con le eccezioni di Norvegia e Svalbard.
function utmDaLatLng(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -80 || lat > 84) return null;
  let zona = Math.min(60, Math.floor((((lng + 180) % 360) + 360) % 360 / 6) + 1);
  if (lat >= 56 && lat < 64 && lng >= 3 && lng < 12) zona = 32;
  if (lat >= 72 && lng >= 0 && lng < 42) zona = lng < 9 ? 31 : lng < 21 ? 33 : lng < 33 ? 35 : 37;
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const fi = lat * Math.PI / 180;
  const dl = ((lng - ((zona - 1) * 6 - 180 + 3) + 540) % 360 - 180) * Math.PI / 180;
  const sen = Math.sin(fi), cos = Math.cos(fi), tan = Math.tan(fi);
  const N = a / Math.sqrt(1 - e2 * sen * sen);
  const T = tan * tan, C = ep2 * cos * cos, A = cos * dl;
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * fi
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * fi)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * fi)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * fi));
  const est = 500000 + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120);
  let nord = k0 * (M + N * tan * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) nord += 10000000;
  const banda = 'CDEFGHJKLMNPQRSTUVWX'[Math.min(19, Math.floor((lat + 80) / 8))];
  return { zona, banda, est, nord };
}

// Testo delle coordinate nel formato scelto; '' con «no» o senza GPS.
function testoCoordinate(gps, formato = 'dec') {
  const lat = Number(gps?.lat), lng = Number(gps?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  switch (formatoCoordinateValido(formato)) {
    case 'no': return '';
    case 'gms': return `${gradiSessagesimali(lat, 'N', 'S')}  ${gradiSessagesimali(lng, 'E', 'O')}`;
    case 'gm': return `${gradiSessagesimali(lat, 'N', 'S', false)}  ${gradiSessagesimali(lng, 'E', 'O', false)}`;
    case 'utm': {
      const u = utmDaLatLng(lat, lng);
      return u ? `UTM ${u.zona}${u.banda} ${Math.round(u.est)} E  ${Math.round(u.nord)} N (WGS84)` : `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    default: return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}
