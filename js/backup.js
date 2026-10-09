'use strict';
// Scheda Botanica PRO — Backup ZIP, ripristino, unione con i colleghi, importazione Excel/CSV ed esportazioni (CSV, GeoJSON, KML, GPX).
// Caricato da index.html prima di app.js: le funzioni condividono lo stesso ambito globale.

/* =====================================================================
   11. BACKUP, IMPORTAZIONE, ESPORTAZIONI
   ===================================================================== */
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

/* ---------- Unione di backup tra colleghi ----------
   Regole: un campo vuoto prende il valore dell'altro; due valori diversi sono
   un conflitto che decide l'utente (preselezionata la versione più recente);
   il GPS è un blocco unico; foto e audio si sommano, riconosciuti per ID. */
const CAMPI_AUTOMATICI_UNIONE = new Set(['numeroZona']);   // ricalcolati, mai in conflitto

// id foto/audio -> uid della scheda locale che lo usa (cestino compreso)
function proprietariMediaLocali() {
  const mappa = new Map();
  for (const s of [...S.schede, ...S.cestino]) for (const m of [...s.foto, ...s.audio]) mappa.set(m.id, s.uid);
  return mappa;
}

// Elimina foto e audio che nessuna scheda (nemmeno nel cestino) usa più.
// Da chiamare solo senza schede aperte: all'avvio o dopo un'importazione.
async function pulisciMediaOrfani() {
  let eliminati = 0;
  // Un file appena creato (es. foto scattata mentre l'app si avvia) può essere scritto
  // un attimo prima di essere collegato alla scheda: sotto i 10 minuti non si tocca.
  const recente = (id) => {
    const t = parseInt(String(id).split('_')[1] || '', 36);
    return Number.isFinite(t) && Date.now() - t < 10 * 60 * 1000;
  };
  for (const store of ['foto', 'audio']) {
    const chiavi = await DB.chiavi(store);
    const usati = proprietariMediaLocali(); // letto dopo le chiavi: include i collegamenti più recenti
    const orfani = chiavi.filter((k) => !usati.has(k) && !recente(k));
    if (!orfani.length) continue;
    await DB.cancellaMolte(store, orfani);
    orfani.forEach((id) => (store === 'foto' ? liberaUrlFoto(id) : liberaUrlAudio(id)));
    eliminati += orfani.length;
  }
  return eliminati;
}

function testoValoreCampo(c, valore) {
  if (valore === '' || valore === null || valore === undefined) return '— vuoto —';
  if (c?.tipo === 'scelta') return c.valori.find(([codice]) => codice === valore)?.[1] || String(valore);
  return String(valore);
}

function testoGPS(g) {
  return g ? `${Number(g.lat).toFixed(6)}, ${Number(g.lng).toFixed(6)}${g.manuale ? ' (manuale)' : ''}` : '— nessuna posizione —';
}

function stessoGPS(a, b) {
  if (!a || !b) return !a && !b;
  return Number(a.lat) === Number(b.lat) && Number(a.lng) === Number(b.lng);
}

// Un campo è da ignorare se, con entrambe le versioni, una dipendenza lo rende non pertinente.
function campoNonPertinente(k, mio, suo) {
  return DIPENDENZE_CAMPI.some((d) => d.nascondi.includes(k) && dipendenzaAttiva(d, mio[d.se]) && dipendenzaAttiva(d, suo[d.se]));
}

function unisciScheda(mio, suo) {
  const suoPiuRecente = Date.parse(suo.modificato) > Date.parse(mio.modificato);
  const recente = suoPiuRecente ? suo : mio;
  const record = structuredClone(recente);
  const conflitti = [];
  for (const c of CAMPI) {
    const a = String(mio[c.k] ?? '').trim(), b = String(suo[c.k] ?? '').trim();
    if (a === b) { record[c.k] = mio[c.k]; continue; }
    if (!a) { record[c.k] = suo[c.k]; continue; }
    if (!b) { record[c.k] = mio[c.k]; continue; }
    if (CAMPI_AUTOMATICI_UNIONE.has(c.k) || campoNonPertinente(c.k, mio, suo)) continue;   // resta quello più recente
    conflitti.push({ campo: c.k, etichetta: c.label, area: c.tipo === 'area', mio: mio[c.k], suo: suo[c.k], scelta: suoPiuRecente ? 'suo' : 'mio' });
  }
  // GPS: blocco unico, mai coordinate mescolate.
  if (!stessoGPS(mio.gps, suo.gps)) {
    if (!mio.gps || !suo.gps) record.gps = structuredClone(mio.gps || suo.gps);
    else conflitti.push({ campo: 'gps', etichetta: 'Posizione GPS', mio: mio.gps, suo: suo.gps, scelta: suoPiuRecente ? 'suo' : 'mio' });
  }
  // Foto e audio: sempre cumulativi. Didascalie dalla versione più recente.
  for (const tipo of ['foto', 'audio']) {
    const perId = new Map();
    for (const m of [...mio[tipo], ...suo[tipo]]) if (!perId.has(m.id)) perId.set(m.id, structuredClone(m));
    for (const m of recente[tipo]) perId.set(m.id, structuredClone(m));
    record[tipo] = [...perId.values()].sort((x, y) => String(x.quando).localeCompare(String(y.quando)));
  }
  for (const k of ['gbifId', 'plantnetNome']) record[k] = recente[k] || mio[k] || suo[k] || '';
  record.infoGbif = [recente, mio, suo].map((x) => x.infoGbif).find((i) => i && i.gbifId === record.gbifId) || null;
  record.bozzaVuota = false;
  record.modificato = suoPiuRecente ? suo.modificato : mio.modificato;
  return { record, conflitti, suoPiuRecente };
}

function applicaSceltaConflitti(unione) {
  const { record, conflitti } = unione;
  for (const c of conflitti) {
    if (c.scelta === 'entrambi') record[c.campo] = `${c.mio}\n${c.suo}`;
    else record[c.campo] = structuredClone(c.scelta === 'suo' ? c.suo : c.mio);
  }
  // Se l'unione ha cambiato qualcosa rispetto a entrambe le versioni, è una modifica nuova.
  if (conflitti.some((c) => c.scelta === 'entrambi')) record.modificato = oraISO();
}

function schedeEquivalenti(a, b) {
  const campi = ['cancellata', 'bloccata', 'gbifId', 'plantnetNome', ...CAMPI.map((c) => c.k)];
  if (campi.some((k) => String(a[k] ?? '') !== String(b[k] ?? ''))) return false;
  if (!stessoGPS(a.gps, b.gps)) return false;
  const ids = (r) => [...r.foto, ...r.audio].map((m) => `${m.id}|${m.didascalia || ''}`).sort().join(',');
  return ids(a) === ids(b);
}

// Finestra di scelta: per ogni campo diverso, la mia versione o quella del collega.
function risolviConflittiUnione(unioni) {
  return new Promise((risolvi) => {
    const conConflitti = unioni.filter((u) => u.conflitti.length);
    const blocchi = conConflitti.map((u, iu) => el('section', { class: 'unione-scheda' },
      el('h3', { testo: `Scheda N° ${u.record.prog || '?'} · ${u.record.nome || 'senza nome'}` }),
      el('p', { class: 'unione-nota', testo: `Versione più recente: ${u.suoPiuRecente ? 'quella arrivata' : 'la tua'}. Foto e note vocali vengono sommate.` }),
      ...u.conflitti.map((c, ic) => {
        const nome = `unione-${iu}-${ic}`;
        const valore = (v) => c.campo === 'gps' ? testoGPS(v) : testoValoreCampo(CAMPI.find((x) => x.k === c.campo), v);
        const opzione = (codice, titolo, testo) => el('label', { class: 'unione-opzione' },
          el('input', { type: 'radio', name: nome, value: codice, checked: c.scelta === codice, onchange: () => { c.scelta = codice; } }),
          el('span', {}, el('b', { testo: titolo }), el('span', { class: 'unione-valore', testo })));
        return el('fieldset', { class: 'unione-campo' },
          el('legend', { testo: c.etichetta }),
          opzione('mio', 'La mia', valore(c.mio)),
          opzione('suo', 'Arrivata', valore(c.suo)),
          c.area ? opzione('entrambi', 'Entrambe', 'Il mio testo e sotto quello arrivato') : null);
      })));
    const chiudi = (esito) => { dlg.close(); risolvi(esito); };
    const dlg = el('dialog', { class: 'dlg-unione' },
      el('h2', { testo: 'Dati diversi da scegliere' }),
      el('p', { testo: `${conConflitti.length === 1 ? 'Una scheda ha' : `${conConflitti.length} schede hanno`} campi compilati in modo diverso. Scegli il valore da tenere; i campi vuoti sono già stati completati.` }),
      el('div', { class: 'unione-elenco' }, ...blocchi),
      el('div', { class: 'azioni' },
        el('button', { type: 'button', class: 'btn', onclick: () => chiudi(false) }, 'Annulla importazione'),
        el('button', { type: 'button', class: 'btn primario', onclick: () => chiudi(true) }, 'Unisci con queste scelte')));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); chiudi(false); });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  });
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
    await pulisciMediaOrfani().catch(() => 0);
    mostraEsitoImportazione(voci.length, 0, 0, 0);
    return;
  }
  let nuove = 0, aggiornate = 0, invariate = 0, protette = 0;
  // Unione campo per campo: foto e audio si sommano, i campi diversi li sceglie l'utente.
  const media = await preparaMediaImportazione(voci);
  const locali = new Map([...S.schede, ...S.cestino].map((s) => [s.uid, s]));
  const proprietari = proprietariMediaLocali();
  const unioni = [];
  for (const { record: arrivata } of voci) {
    const arr = structuredClone(arrivata);
    // Lo stesso ID di foto/audio in un'altra scheda locale sarebbe un caso anomalo:
    // solo allora il file arrivato riceve un ID nuovo, per non sovrascrivere nulla.
    for (const [tipo, pref] of [['foto', 'f'], ['audio', 'a']]) {
      for (const m of arr[tipo]) {
        const proprietario = proprietari.get(m.id);
        if (proprietario && proprietario !== arr.uid) {
          const nuovo = nuovoId(pref);
          media[tipo].filter((x) => x.id === m.id).forEach((x) => { x.id = nuovo; });
          m.id = nuovo;
        }
      }
    }
    const locale = locali.get(arr.uid);
    // Una scheda bloccata su questo dispositivo non viene toccata dall'unione.
    if (locale && schedaBloccata(locale)) { protette++; invariate++; continue; }
    if (!locale) { unioni.push({ arrivata: arr, record: arr, conflitti: [], nuova: true }); continue; }
    unioni.push({ arrivata: arr, ...unisciScheda(locale, arr) });
  }
  const conflittiTotali = unioni.reduce((n, u) => n + u.conflitti.length, 0);
  if (conflittiTotali && !(await risolviConflittiUnione(unioni))) {
    stato('Importazione annullata: nessuna scheda modificata.');
    return;
  }
  const records = [];
  for (const u of unioni) {
    if (u.nuova) { records.push(u.record); nuove++; continue; }
    applicaSceltaConflitti(u);
    const locale = locali.get(u.record.uid);
    if (schedeEquivalenti(locale, u.record)) { invariate++; continue; }
    records.push(u.record);
    aggiornate++;
  }
  // Si salvano solo i file che la scheda locale non possiede già.
  const idRecord = new Set(records.flatMap((r) => [...r.foto, ...r.audio].map((m) => m.id)));
  for (const tipo of ['foto', 'audio']) {
    media[tipo] = media[tipo].filter((m) => idRecord.has(m.id) && !proprietari.has(m.id));
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
  await pulisciMediaOrfani().catch(() => 0);
  mostraEsitoImportazione(nuove, aggiornate, invariate, 0, protette);
}

function mostraEsitoImportazione(nuove, aggiornate, invariate, mediaErr, protette = 0) {
  const dup = progDuplicati().size;

  const dlg = el('dialog', {},
    el('h2', { testo: 'Importazione completata' }),
    el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0;padding:12px;background:var(--focus);border-left:4px solid var(--lichene);border-radius:6px' },
      el('div', {}, el('div', { class: 'esito-numero', testo: String(nuove) }), el('div', { class: 'testo-nota', testo: 'Nuove schede' })),
      el('div', {}, el('div', { class: 'esito-numero', testo: String(aggiornate) }), el('div', { class: 'testo-nota', testo: 'Aggiornate' })),
      el('div', {}, el('div', { class: 'esito-numero esito-neutro', testo: String(invariate) }), el('div', { class: 'testo-nota', testo: 'Già attuali' })),
      el('div', {}, el('div', { class: 'esito-numero', testo: String(S.schede.length) }), el('div', { class: 'testo-nota', testo: 'Totale attive ora' }))),
    mediaErr ? el('p', { class: 'avviso-rosso', testo: `⚠ ${mediaErr} file media non importati` }) : null,
    protette ? el('p', { testo: `🔒 ${protette === 1 ? '1 scheda bloccata è rimasta' : protette + ' schede bloccate sono rimaste'} com’era su questo dispositivo: sbloccala prima, se vuoi unire i dati arrivati.` }) : null,
    dup ? el('p', { class: 'avviso-rosso', testo: `⚠ ${dup} numeri progressivi duplicati (segnalati nell'elenco)` }) : null,
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
        const f = `foto/${base}_${p.id}.jpg`; cartFoto.file(f.slice(5), b, { compression: 'STORE' }); indice[p.id] = f;   // JPEG già compresso: niente lavoro inutile
      }
      for (const a of r.audio) {
        const b = await DB.leggi('audio', a.id);
        if (!b) throw new Error(`nota vocale mancante nella scheda N° ${r.prog}`);
        const f = `audio/${base}_${a.id}.${estensioneAudio(b.type || '')}`; cartAudio.file(f.slice(6), b, { compression: 'STORE' }); indice[a.id] = { percorso: f, tipo: b.type || '' };
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
      `Per ripristinare tutto nell'app: + Opzioni → Backup e configurazione → "Ripristina backup" e scegli questo ZIP (non scompattarlo).`);
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
    scriviPref('sb-ultimo-backup', oraISO());
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
  tipoFoglia: ['tipo di foglia', 'tipofoglia'], fogliaComposta: ['foglia composta', 'fogliacomposta'], lamina: ['lamina'],
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
    // Coordinate: le colonne che l'app stessa scrive nel CSV (Latitudine, Longitudine, Precisione, Quota).
    const intest = (righe[indiceIntest] || []).map((v) => String(v ?? '').trim().toLowerCase());
    const col = (...nomi) => intest.findIndex((t) => nomi.some((n) => t === n || t.startsWith(n + ' ')));
    const iGps = { lat: col('latitudine', 'lat'), lng: col('longitudine', 'lng', 'lon'), acc: col('precisione'), alt: col('quota', 'altitudine') };
    const numero = (v) => { const n = Number(String(v ?? '').replace(',', '.').trim()); return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null; };
    const voci = dati.map((cols) => {
      const obj = {};
      CAMPI.forEach((c) => {
        const i = mappa[c.k];
        const valore = i >= 0 && cols[i] !== undefined ? cols[i] : '';
        obj[c.k] = c.tipo === 'data' ? normalizzaData(valore, date1904) : String(valore ?? '');
      });
      const lat = iGps.lat >= 0 ? numero(cols[iGps.lat]) : null, lng = iGps.lng >= 0 ? numero(cols[iGps.lng]) : null;
      if (lat !== null && lng !== null) obj.gps = { lat, lng, acc: iGps.acc >= 0 ? numero(cols[iGps.acc]) : null, alt: iGps.alt >= 0 ? numero(cols[iGps.alt]) : null };
      return normalizza(obj);
    });
    const conGps = voci.filter((v) => v.record.gps).length;
    // Il foglio contiene solo rilievi: non deve eliminare le integrazioni
    // botaniche locali, neppure se si sostituiscono tutte le schede.
    voci.guida = S.guida;
    // Lo stesso vale per traccia GPS e catalogo delle specie identificate.
    voci.specie = S.specie;
    voci.traccia = S.traccia;
    const nonTrovate = CAMPI.filter((c) => mappa[c.k] < 0).map((c) => c.label);
    $('#import-info').textContent = `Il file Excel contiene ${voci.length} righe.` +
      (nonTrovate.length ? ` Colonne non trovate (restano vuote): ${nonTrovate.join(', ')}.` : '') +
      (conGps ? ` Coordinate GPS lette per ${conGps} righe.` : '') +
      ` Le foto e l'audio non sono nel foglio Excel e non verranno importati. Le integrazioni della guida, la traccia e il catalogo specie restano conservati.`;
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
  const ultimo = leggiPref('sb-ultimo-backup');
  let t = ultimo ? `Ultimo backup: ${dataIT(ultimo)}.` : 'Nessun backup esportato finora.';
  const st = await statoSpazio();
  $('#spazio-barra').replaceChildren(barraSpazio(st));
  if (st && st.usato / st.quota >= 0.9) t += ' ⚠ Spazio quasi esaurito: esporta un backup, svuota il cestino o la cache della mappa, altrimenti i salvataggi possono fallire.';
  try {
    if (navigator.storage?.persisted) {
      t += (await navigator.storage.persisted())
        ? ' Archivio protetto dalla pulizia automatica del browser.'
        : ' Archivio non protetto: se il telefono resta senza spazio il browser può cancellarlo, quindi esporta backup regolari.';
    }
  } catch { /* informazione facoltativa */ }
  $('#spazio').textContent = t;
}
