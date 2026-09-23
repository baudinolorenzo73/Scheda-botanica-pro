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
    const data = XLSX.SSF.parse_date_code(valore, { date1904 });
    if (!data) return '';
    ({ y, m, d } = data);
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
