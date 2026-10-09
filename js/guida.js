'use strict';
// Scheda Botanica PRO — Guida delle 144 specie, completamento del catalogo, assistente AI, ricerca per caratteristiche, foto e nome, ricerche Wikipedia/Wikidata.
// Caricato da index.html prima di app.js: le funzioni condividono lo stesso ambito globale.

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
// Il catalogo del corso usa «spinoso» dove la scheda ha «dentato-spinoso».
const GS_ALIAS_VALORE = { margine: { spinoso: 'dentato-spinoso' } };
function valoreGuidaPerScheda(campoScheda, valore) {
  return GS_ALIAS_VALORE[campoScheda]?.[String(valore || '').toLowerCase()] || valore;
}
const GS_CAMPO_GUIDA = { formaChioma: 'chiomaForma', rami: 'ramiInserzione', tipoFoglia: 'fogliaTipo', fogliaComposta: 'fogliaComposta', lamina: 'fogliaLamina', margine: 'fogliaMargine', crescita: 'crescita', estensione: 'estensione' };

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

async function richiediProposteSlideAI(fornitore, istruzioni, base64, mime = 'image/webp') {
  return ServiziRicerca.ai(configurazioneFornitoreAI(fornitore, true), istruzioni, base64, { mime });
}

// Groq e molti modelli OpenRouter accettano con certezza solo JPEG/PNG: la slide WebP
// viene convertita in JPEG (lato massimo 1600 px). Gemini riceve il WebP originale.
async function slidePerAI(blob, fornitore) {
  if (fornitore === 'gemini' || typeof createImageBitmap !== 'function') return { blob, mime: blob.type || 'image/webp' };
  try {
    const bmp = await createImageBitmap(blob);
    const scala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * scala); cv.height = Math.round(bmp.height * scala);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close?.();
    const jpeg = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85));
    return jpeg ? { blob: jpeg, mime: 'image/jpeg' } : { blob, mime: blob.type || 'image/webp' };
  } catch { return { blob, mime: blob.type || 'image/webp' }; }
}

// Confronto tollerante con i valori ammessi: maiuscole, accenti e spazi non contano.
const normaValoreAI = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function configurazioneFornitoreAI(nome, immagine = false) {
  const chiave = nome === 'gemini' ? (chiaviAI.GEMINI_API_KEY || chiaviAI.GOOGLE_API_KEY) :
    nome === 'groq' ? chiaviAI.GROQ_API_KEY : chiaviAI.OPENROUTER_API_KEY;
  const modello = nome === 'openrouter' ? ($('#cg-ai-modello')?.value?.trim() || $('#ai-modello-openrouter')?.value?.trim() || '') :
    $(`#ai-modello-${nome === 'groq' && immagine ? 'groq-vision' : nome}`)?.value?.trim() || '';
  return ServiziRicerca.impostazione(nome, chiave, modello, immagine);
}

// Diagnosi: una richiesta minima a ogni servizio con chiave, per vedere subito quale
// modello risponde e, se fallisce, il motivo esatto dato dal servizio.
async function provaServiziAI() {
  const esito = $('#ai-prova-esito'), bottone = $('#ai-prova');
  const servizi = [['gemini', 'Gemini', chiaviAI.GEMINI_API_KEY || chiaviAI.GOOGLE_API_KEY], ['groq', 'Groq', chiaviAI.GROQ_API_KEY],
    ['openrouter', 'OpenRouter', chiaviAI.OPENROUTER_API_KEY]].filter(x => x[2]);
  if (!servizi.length) { esito.textContent = 'Nessuna chiave Gemini, Groq o OpenRouter caricata: usa «Carica open.env».'; return; }
  if (!navigator.onLine) { esito.textContent = 'Sei offline: la prova richiede Internet.'; return; }
  bottone.disabled = true;
  esito.replaceChildren(el('p', { testo: 'Prova in corso…' }));
  const righe = [];
  try {
    for (const [nome, etichetta] of servizi) {
      for (const immagine of nome === 'groq' ? [false, true] : [false]) {
        const tipo = immagine ? ' · slide' : '';
        try {
          const cfg = configurazioneFornitoreAI(nome, immagine);
          const prova = immagine ? await ServiziRicerca.ai(cfg, 'Descrivi il colore dominante. Rispondi solo con JSON {"ok":true,"colore":"..."}', PIXEL_PROVA_JPEG, { mime: 'image/jpeg' })
            : await ServiziRicerca.ai(cfg, 'Test di collegamento. Rispondi solo con JSON {"ok":true}');
          righe.push(el('p', { class: 'ai-ok', testo: `✓ ${etichetta}${tipo}: risponde con ${prova?._modello || cfg.modello}` }));
        } catch (e) {
          righe.push(el('p', { class: 'ai-errore', testo: `✗ ${etichetta}${tipo}: ${e.message}` }));
        }
        esito.replaceChildren(...righe);
      }
    }
  } finally { bottone.disabled = false; }
}
// JPEG 64×64 verde: immagine minima per provare i modelli che leggono le slide.
const PIXEL_PROVA_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDOoooryj5kKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k=';

function normalizzaProposteAI(dato, specie) {
  const elenco = Array.isArray(dato) ? dato : Array.isArray(dato?.proposte) ? dato.proposte : Array.isArray(dato?.proposals) ? dato.proposals : [];
  const base = GUIDA_ORIGINALE.get(specie.id);
  const definizioni = CG_SEZIONI.flatMap(s => s.campi);
  const viste = new Set();
  const risultato = [];
  for (const p of elenco.slice(0, 25)) {
    if (!p || typeof p !== 'object') continue;
    // Il campo può arrivare come chiave interna («fogliaMargine») o come etichetta («Margine fogliare»).
    const def = definizioni.find(c => c[0] === p.campo) || definizioni.find(c => normaValoreAI(c[1]) === normaValoreAI(p.campo));
    const campo = def?.[0];
    const valore = typeof p.valore === 'string' ? p.valore.trim() : typeof p.valore === 'number' ? String(p.valore) : '';
    if (!campo || base[campo] || viste.has(campo) || !valore || valore.length > 180) continue;
    const scelta = def[2] && CAMPI.find(c => c.k === def[2]);
    const ammesso = scelta ? scelta.valori.find(v => normaValoreAI(v) === normaValoreAI(valore)) : valore;
    if (!ammesso) continue;
    viste.add(campo);
    const evidenza = typeof p.evidenza === 'string' ? p.evidenza.trim().slice(0, 220) : '';
    risultato.push({ campo, valore: ammesso, evidenza });
  }
  return risultato;
}

function mostraProposteAI(proposte, id) {
  const contenitore = $('#cg-ai-risultati');
  contenitore.replaceChildren(...proposte.map(p => {
    const nome = CG_SEZIONI.flatMap(s => s.campi).find(c => c[0] === p.campo)?.[1] || p.campo;
    const attuale = $('#cg-form').elements.namedItem(p.campo)?.value.trim() || '';
    return el('div', { class: 'cg-ai-proposta' },
      el('strong', { testo: nome }),
      el('p', { testo: `Proposta: ${p.valore}` }),
      el('small', { testo: p.evidenza ? `Indicazione riportata dall’AI: «${p.evidenza}». Controlla la slide.` : 'L’AI non ha citato la frase della slide: controlla con attenzione.' }),
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
    const fornitore = $('#cg-ai-fornitore').value;
    const slide = await slidePerAI(await immagine.blob(), fornitore);
    const base64 = codificaBase64(new Uint8Array(await slide.blob.arrayBuffer()));
    const campi = CG_SEZIONI.flatMap(s => s.campi).filter(([k]) => !specie[k]).map(([k, label, scheda]) => {
      const scelta = scheda && CAMPI.find(c => c.k === scheda);
      return `${k} (${label}${scelta ? `; valori ammessi: ${scelta.valori.join(', ')}` : ''})`;
    }).join('; ');
    const istruzioni = `Analizza la slide del corso relativa a ${nomeCatalogo(specie)}. Usa solo caratteristiche ESPLICITAMENTE scritte nella slide o nella nota trascritta qui sotto; non dedurre tratti botanici dalle foto né inventare fonti. Restituisci soltanto JSON {"proposte":[{"campo":"...","valore":"...","evidenza":"breve frase presente nella slide"}]}. Campi ammessi: ${campi}. Non inventare valori se mancano. Nota trascritta: ${specie.note || ''}`;
    const proposte = normalizzaProposteAI(await richiediProposteSlideAI(fornitore, istruzioni, base64, slide.mime), specie);
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

// Valori che l'elenco della scheda non offre più (3.41) ma che un'integrazione già salvata può contenere:
// vanno accettati, altrimenti l'archivio non si carica. «squamiforme» del tipo di foglia diventa «a squame».
const VALORI_CATALOGO_VECCHI = { tipoFoglia: ['aghiforme', 'squamiforme'], lamina: ['squamiforme'], margine: ['lobato'] };

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
      if (k === 'nomeSci') { // correzione del nome: unico dato originale sostituibile
        if (typeof valore !== 'string' || !valore.trim() || valore.trim().length > 120 || valore.trim() === base.nomeSci)
          throw new Error('Nome del catalogo non valido');
        campi.nomeSci = valore.trim();
        continue;
      }
      if (!CG_CHIAVI.has(k) || typeof valore !== 'string' || !valore.trim() || valore.length > 1000 || base[k])
        throw new Error('Campo del catalogo non valido');
      const def = CG_SEZIONI.flatMap(s => s.campi).find(c => c[0] === k);
      const scelta = def?.[2] && CAMPI.find(c => c.k === def[2]);
      const vecchio = def?.[2] && VALORI_CATALOGO_VECCHI[def[2]]?.includes(valore);
      if (scelta && !scelta.valori.includes(valore) && !vecchio) throw new Error('Scelta del catalogo non valida');
      campi[k] = k === 'fogliaTipo' && valore.trim() === 'squamiforme' ? 'a squame' : valore.trim();
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
      if (k === 'nomeSci' || (!base[k] && CG_CHIAVI.has(k))) v[k] = valore;
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
  const nome = $('#cg-form').elements.namedItem('nomeSci')?.value.trim();
  if (nome && nome !== base.nomeSci) campi.nomeSci = nome;
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
  $('#cg-form').replaceChildren(
    el('fieldset', { class: 'cg-gruppo' }, el('legend', { testo: 'Nome' }),
      el('label', { class: 'cg-campo ' + (salvata?.campi.nomeSci ? 'cg-integrato' : '') },
        el('span', { testo: 'Nome scientifico' }),
        el('input', { type: 'text', class: 'campo-base', name: 'nomeSci', value: specie.nomeSci, maxlength: 120, autocomplete: 'off', spellcheck: 'false' }),
        el('small', { testo: salvata?.campi.nomeSci ? `Nome corretto da te · originale della guida: ${base.nomeSci}. Svuota il campo per tornare all'originale.` : `Modificabile, per correggere un nome incompleto. Originale: ${base.nomeSci}. Svuota il campo per tornare all'originale.` }))),
    ...CG_SEZIONI.map(sezione =>
    el('fieldset', { class: 'cg-gruppo' }, el('legend', { testo: sezione.titolo }),
      ...sezione.campi.map(([k, etichetta, scheda]) => {
        const originale = base[k];
        const valori = scheda && CAMPI.find(c => c.k === scheda)?.valori;
        const controllo = valori ? el('select', { class: 'campo-base', name: k, disabled: !!originale },
          el('option', { value: '' }, '— Da verificare —'), ...[...valori, ...(specie[k] && !valori.includes(specie[k]) ? [specie[k]] : [])].map(v => el('option', { value: v, selected: v === (specie[k] || '') }, v))) :
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
  const altriCampi = Object.keys(campi).some(k => k !== 'nomeSci');
  if (altriCampi && !fonte) {
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
    const fonteEff = fonte || (altriCampi ? 'pagina' : 'altro');
    const fontiCampi = {};
    for (const [k, valore] of Object.entries(campi))
      fontiCampi[k] = precedente?.campi[k] === valore ? (precedente.fontiCampi?.[k] || precedente.fonte) : fonteEff;
    const voce = { id: cgSpecie, campi, fonte: fonteEff, fontiCampi, modificato: oraISO() };
    validaIntegrazioniGuida([voce]);
    if (Object.keys(campi).length) await DB.scrivi('guida', voce);
    else await DB.cancella('guida', cgSpecie);
    S.guida = S.guida.filter(v => v.id !== cgSpecie);
    if (Object.keys(campi).length) S.guida.push(voce);
    applicaIntegrazioniGuida();
    aggiornaDatalistNome();
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
  tipoFoglia: { semplice: ['semplice'], composta: ['compost'], 'a squame': ['squam'] },
  // " paripennat" con lo spazio: senza, la parola si troverebbe anche dentro «imparipennata».
  fogliaComposta: { imparipennata: ['imparipennat'], paripennata: [' paripennat', '(paripennat'], bipennata: ['bipennat'] },
  // «ovata» con lo spazio/parentesi davanti: senza, si troverebbe anche dentro «obovata».
  lamina: { rotonda: ['rotond'], lobata: ['lobat'], ovata: [' ovata', '(ovata', '/ovata', ' ovato'], obovata: ['obovat'], ellittica: ['ellittic'], lanceolata: ['lanceolat'],
    romboidale: ['romboidal'], palmata: ['palmata'], 'palmato-lobata': ['palmato-lobat', 'palmato lobat'], flabello: ['flabell'], aghiforme: ['aghiform'] },
  margine: { intero: ['margine inter'], dentato: ['dentat'], ondulato: ['ondulat'], seghettato: ['seghettat'], roncinato: ['roncinat'], crenato: ['crenat'], 'dentato-spinoso': ['dentato-spinos', 'spinos'] },
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
    if (campoGuida && v[campoGuida] && valoreGuidaPerScheda(campo, v[campoGuida]).toLowerCase() === valore.toLowerCase()) return 'dato';
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
      tipoFoglia: $('#gs-c-tipoFoglia').value, fogliaComposta: $('#gs-c-fogliaComposta').value, lamina: $('#gs-c-lamina').value, margine: $('#gs-c-margine').value,
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
  popolaSelectCaratteristica('#gs-c-fogliaComposta', campo('fogliaComposta'));
  popolaSelectCaratteristica('#gs-c-lamina', campo('lamina'));
  popolaSelectCaratteristica('#gs-c-margine', campo('margine'));
  $('#gs-c-grandezza').replaceChildren(
    el('option', { value: '' }, '—'), el('option', { value: '1' }, '1ª grandezza'),
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
      el('span', { class: 'testo-nota' }, v.famiglia, trovata ? ' · ✓ già rilevata' : null));
  }));
}

// Per le Pinaceae: collegamento alla scheda del genere nella Chiave delle Pinaceae.
const GENERI_PINACEAE = ['Abies', 'Picea', 'Pinus', 'Cedrus', 'Larix', 'Tsuga', 'Pseudotsuga'];
function linkChiavePinaceae(v) {
  const genere = String(v.nomeSci || '').split(' ')[0];
  if (v.famiglia !== 'Pinaceae' || !GENERI_PINACEAE.includes(genere)) return null;
  return el('a', { class: 'btn', href: `pinaceae.html#genere=${genere}`, style: 'margin-top:12px;width:100%;text-decoration:none;color:inherit' },
    `🌲 Chiave delle Pinaceae · ${genere}`);
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
    linkChiavePinaceae(v),
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

const GS_CAMPI_SCHEDA = ['persistenza', 'formaChioma', 'rami', 'tipoFoglia', 'fogliaComposta', 'lamina', 'margine'];

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

function apriSchedaLocale() {
  if (!S.aperta) return;
  const nome = $('#f-nome').value.trim();
  const normalizzato = nomeRicercaNormalizzato(nome);
  const specie = normalizzato ? GUIDA_SPECIE.find(v => nomeRicercaNormalizzato(nomeCatalogo(v)) === normalizzato) || trovaSpecieGuida(nome) : null;
  $('#gs-modo-foto').classList.remove('nascosto');
  cambiaModoGuidaSpecie('nome');
  $('#gs-cerca').value = nome;
  disegnaListaGuidaSpecie();
  if (specie) mostraDettaglioGuidaSpecie(specie);
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
    .toLocaleLowerCase('it').replace(/[‘’']/g, '').replace(/\s+/g, ' ').trim();
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
  // Ogni ricerca riparte pulita: fonti, foto e conteggio delle AI sono solo della Super ricerca.
  AUTO_RICERCA.aiChieste = 0;
  $('#auto-fonti')?.replaceChildren();
  $('#auto-foto')?.replaceChildren();
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

// Una foto o un elenco (al massimo 5, una sola richiesta: PlantNet le combina come foto dello
// stesso esemplare, con l'organo riconosciuto in automatico). Con simili: true chiede anche le
// foto di riferimento più somiglianti di ogni specie, da confrontare con le proprie.
async function fotoPlantNetAuto(foto, opzioni = {}) {
  const elenco = (Array.isArray(foto) ? foto : [foto]).filter(Boolean).slice(0, 5);
  const form = new FormData();
  let n = 0;
  for (const f of elenco) {
    const blob = await DB.leggi('foto', f.id);
    if (!blob) continue;
    form.append('images', blob, `foto-${++n}.jpg`);
    form.append('organs', 'auto');
  }
  if (!n) throw new Error('foto non disponibile nel dispositivo');
  const dati = await richiestaFotoPlantNet(`https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(chiavePlantNet())}&lang=it&include-related-images=${opzioni.simili ? 'true' : 'false'}`, form);
  const risultati = (dati?.results || []).slice(0, 5).map(r => ({
    nome: r.species?.scientificNameWithoutAuthor || r.species?.scientificName,
    nomeCompleto: r.species?.scientificName || '',
    percentuale: Math.round(Math.max(0, Math.min(1, Number(r.score) || 0)) * 100),
    gbifId: r.gbif?.id || '',
    simili: opzioni.simili ? (Array.isArray(r.images) ? r.images : []).slice(0, 3).map(i => ({
      url: String(i?.url?.s || i?.url?.m || ''), grande: String(i?.url?.m || i?.url?.o || i?.url?.s || ''),
      credito: String(i?.citation || [i?.author, i?.license].filter(Boolean).join(' · ')).slice(0, 120),
    })).filter(i => /^https:\/\//.test(i.url)) : [],
  })).filter(r => r.nome);
  if (Number.isFinite(dati?.remainingIdentificationRequests)) risultati.rimanenti = dati.remainingIdentificationRequests;
  return risultati;
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

// opzioni.fornitore: servizio da usare (Super ricerca: uno per ogni chiave). opzioni.immagini:
// foto dell'esemplare in base64 (Super ricerca); senza, invia solo nome e caratteri come prima.
async function richiediRicercaSpecieAI(r, opzioni = {}) {
  const serie = AUTO_RICERCA.serie;
  const attiva = () => serie === AUTO_RICERCA.serie && S.aperta === r && $('#dlg-cerca-auto').open;
  const fornitore = opzioni.fornitore ? { nome: opzioni.fornitore, etichetta: ETICHETTE_AI[opzioni.fornitore] } : fornitoreRicercaAI();
  if (!fornitore) throw new Error('Carica open.env da «+ Opzioni → Backup e configurazione» e scegli Gemini, Groq o OpenRouter.');
  const osservazioni = datiRicercaAI(r);
  const immagini = opzioni.immagini || [];
  if (!osservazioni.nomeInserito && !Object.keys(osservazioni.caratteristiche).length && !immagini.length)
    throw new Error('Inserisci un nome o almeno una caratteristica botanica prima della ricerca AI.');
  const regole = 'Usa soltanto nomi scientifici binomiali (genere e specie); non inventare taxa e non proporre animali, funghi o nomi soltanto di genere. Ibridi nella forma «Genere × specie»; una cultivar solo se il nome inserito la indica. La percentuale è un numero intero da 0 a 100, stima orientativa basata esclusivamente sui dati forniti, non una certezza. Motivazione in italiano. Rispondi esclusivamente con JSON nel formato {"candidati":[{"nomeScientifico":"Genere specie","percentuale":70,"motivazione":"massimo 180 caratteri"}]}.';
  const istruzioniPer = (n) => n
    ? `Sei un assistente di identificazione botanica prudente. Guarda ${n === 1 ? 'la foto' : `le ${n} foto`} dello stesso albero o arbusto (portamento, foglie, corteccia, fiori o frutti) e considera anche questi dati osservati sul campo: ${JSON.stringify(osservazioni)}. Proponi al massimo 4 taxa vegetali compatibili. Se foto e dati non bastano, dillo nella motivazione e abbassa la percentuale. ${regole}`
    : `Sei un assistente di identificazione botanica prudente. Proponi al massimo 4 taxa vegetali compatibili con questi dati: ${JSON.stringify(osservazioni)}. ${regole}`;
  const chiedi = (foto) => ServiziRicerca.ai(configurazioneFornitoreAI(fornitore.nome, foto.length > 0), istruzioniPer(foto.length), '', {
    attiva, immagini: foto, onRetry: testo => { if (attiva()) $('#auto-stato').textContent = testo; }
  });
  let json;
  try { json = await chiedi(immagini); }
  catch (e) {
    // Alcuni modelli accettano una sola immagine per richiesta: si riprova con la prima foto.
    if (immagini.length < 2 || [401, 403, 429].includes(e.status) || /annullata/i.test(e.message)) throw e;
    json = await chiedi(immagini.slice(0, 1));
  }
  if (!attiva()) throw new Error('Ricerca annullata.');
  const validi = candidatiAIValidi(json);
  const verificati = await Promise.allSettled(validi.map(async c => {
    const gbif = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(c.nome.replace(/\s+['\u2018\u2019"].*$/, ''))}&kingdom=Plantae`);
    if (!ServiziRicerca.gbifBotanico(gbif)) return null;
    const cultivar = c.nome.match(/\s+(['\u2018\u2019"].*)$/)?.[1];
    return { nome: (gbif.canonicalName || gbif.scientificName || c.nome) + (cultivar ? ' ' + cultivar : ''), ai: { percentuale: c.percentuale, motivazione: c.motivazione, fornitore: fornitore.etichetta, conFoto: immagini.length > 0 },
      gbif: gbif.confidence, gbifId: gbif.usageKey };
  }));
  const risultati = verificati.filter(e => e.status === 'fulfilled' && e.value).map(e => e.value);
  if (!risultati.length && verificati.some(e => e.status === 'rejected'))
    throw new Error('L’AI ha risposto, ma GBIF non è raggiungibile per verificare i nomi. Nessun dato applicato; riprova più tardi.');
  return risultati;
}

// Legge i candidati anche quando il modello cambia leggermente il formato: chiavi inglesi,
// percentuale scritta «70%» o 0,7, motivazione assente, ibridi «Platanus × hispanica»,
// cultivar tra apici. Restano esclusi i nomi che non sono binomi botanici.
function candidatiAIValidi(json) {
  const elenco = Array.isArray(json) ? json : json?.candidati || json?.candidates || json?.risultati || [];
  if (!Array.isArray(elenco)) return [];
  const binomio = /^[A-ZÀ-ÖØ-Þ][\p{L}-]+\s+(?:[×x]\s*)?[a-zà-öø-ÿ][\p{L}.-]+(?:\s+(?:subsp\.|ssp\.|var\.|f\.)\s+[a-zà-öø-ÿ][\p{L}.-]+)?(?:\s+['\u2018\u2019"][^'\u2018\u2019"]{1,40}['\u2018\u2019"])?$/u;
  const visti = new Set();
  return elenco.slice(0, 6).map(c => {
    if (!c || typeof c !== 'object') return null;
    const nome = String(c.nomeScientifico || c.nome || c.scientificName || c.name || '').trim().replace(/\s+/g, ' ');
    if (!binomio.test(nome) || visti.has(nome.toLowerCase())) return null;
    visti.add(nome.toLowerCase());
    let p = typeof c.percentuale === 'string' ? parseFloat(c.percentuale.replace(',', '.')) : Number(c.percentuale ?? c.confidenza ?? c.confidence);
    if (Number.isFinite(p) && p > 0 && p < 1 && !/%/.test(String(c.percentuale))) p *= 100;
    const motivazione = String(c.motivazione || c.motivo || c.reason || '').trim();
    return { nome: nome.slice(0, 160), percentuale: Number.isFinite(p) ? Math.round(Math.max(0, Math.min(100, p))) : null,
      motivazione: (motivazione || 'Nessuna motivazione fornita.').slice(0, 180) };
  }).filter(Boolean).slice(0, 4);
}

function disegnaRisultatiAuto(candidati, messaggioVuoto = 'Nessuna proposta verificabile. Inserisci qualche caratteristica, un nome o una foto e riprova.') {
  const destinazione = S.aperta;
  const serie = AUTO_RICERCA.serie;
  const ordinati = ordinaCandidati(candidati).slice(0, 8);
  const aiChieste = AUTO_RICERCA.aiChieste || 0;
  const ingrandisci = (src, alt) => { const img = $('#vista-img'); if (!img || !src) return; img.src = src; img.alt = alt; $('#vista-foto').showModal(); };
  $('#auto-risultati').replaceChildren(...(ordinati.length ? ordinati.map(c => {
    const indizi = [];
    const voti = c.aiVoti || (c.ai ? [c.ai] : []);
    if (c.attinenzaNome >= 3) indizi.push('Corrisponde al nome cercato; l’esemplare resta da verificare.');
    else if (c.attinenzaNome === 2) indizi.push('Nome compatibile con il testo cercato.');
    else if (c.attinenzaNome === 1) indizi.push(`Possibile correzione di «${c.nomeCercato}». Il nome cambia solo se confermi.`);
    if (c.foto != null) indizi.push(`Foto PlantNet: ${c.foto}% di confidenza del modello`);
    if (c.locale?.totale >= 2) indizi.push(`Guida locale: ${c.locale.punti}/${c.locale.totale} caratteri concordanti. ${c.locale.totale < 3 ? 'Pochi indizi: non bastano per identificare la pianta.' : 'La somiglianza dei caratteri non conferma l’identificazione.'}`);
    else if (c.locale?.totale === 1) indizi.push(`Guida locale: ${c.locale.punti}/1 carattere concordante; troppo poco per stimare una compatibilità.`);
    else if (c.guida) indizi.push('Presente nella guida delle 144 piante');
    if (c.wikipedia) indizi.push('Nome del taxon su Wikidata, trovato tramite Wikipedia');
    if (c.plantnet) indizi.push(`Catalogo PlantNet${c.nomiComuni?.length ? ': ' + c.nomiComuni.join(', ') : ''}. La presenza nel catalogo non identifica l’esemplare.`);
    for (const v of voti) indizi.push(`AI ${v.fornitore}${v.conFoto ? ' (con foto)' : ''}: ${v.percentuale != null ? v.percentuale + '% (stima orientativa)' : 'senza percentuale'} · ${v.motivazione}`);
    if (c.gbif != null) indizi.push(`GBIF: corrispondenza del nome ${c.gbif}% (non identificazione della pianta)`);
    if (c.presenza) indizi.push(c.presenza.km10 > 0
      ? `Presenza: ${c.presenza.km10} ${c.presenza.km10 === 1 ? 'osservazione' : 'osservazioni'} GBIF entro 10 km (comprese quelle di iNaturalist).`
      : c.presenza.km50 > 0 ? `Presenza: nessuna osservazione GBIF entro 10 km, ${c.presenza.km50} entro 50 km.`
        : 'Presenza: nessuna osservazione GBIF entro 50 km. Specie rara qui, coltivata o non ancora segnalata: verifica con attenzione.');
    if (c.scritto && !c.guida && !c.wikipedia && c.gbif == null && c.foto == null) indizi.push('Nome inserito nella scheda: ancora da verificare.');

    // Riepilogo a colpo d'occhio: una pastiglia per ogni fonte che indica questa specie.
    const pastiglie = [];
    if (c.foto != null) pastiglie.push(['📷', `PlantNet ${c.foto}%`]);
    if (voti.length) pastiglie.push(['🤖', aiChieste > 1 ? `AI ${voti.length}/${aiChieste}` : `AI ${voti[0].percentuale ?? '?'}%`]);
    if (c.locale?.totale >= 2) pastiglie.push(['📖', `guida ${c.locale.punti}/${c.locale.totale}`]);
    else if (c.guida) pastiglie.push(['📖', 'nella guida']);
    if (c.gbif != null) pastiglie.push(['✔', 'GBIF']);
    if (c.presenza) pastiglie.push(['📍', c.presenza.km10 > 0 ? `${c.presenza.km10} entro 10 km` : c.presenza.km50 > 0 ? `${c.presenza.km50} entro 50 km` : '0 entro 50 km']);

    // Foto di confronto: slide del corso, immagine di Wikipedia, foto simili di PlantNet.
    const confronto = [];
    if (Number.isInteger(c.guida?.pagina) && c.guida.pagina > 0) {
      const src = `./slides/${c.guida.pagina}.webp`;
      confronto.push(el('button', { type: 'button', class: 'auto-confronto-img', title: 'Slide del corso', onclick: () => ingrandisci(src, `Slide ${c.guida.pagina}`) },
        el('img', { src, alt: `Slide ${c.guida.pagina}`, loading: 'lazy' }), el('small', {}, 'Slide del corso')));
    }
    if (c.wiki?.immagine) confronto.push(el('button', { type: 'button', class: 'auto-confronto-img', title: 'Immagine di Wikipedia', onclick: () => ingrandisci(c.wiki.immagine, c.wiki.titolo) },
      el('img', { src: c.wiki.immagine, alt: c.wiki.titolo, loading: 'lazy', referrerpolicy: 'no-referrer' }), el('small', {}, 'Wikipedia')));
    for (const f of c.simili || []) confronto.push(el('button', { type: 'button', class: 'auto-confronto-img', title: f.credito || 'Foto simile PlantNet', onclick: () => ingrandisci(f.grande || f.url, f.credito || c.nome) },
      el('img', { src: f.url, alt: `Foto simile: ${c.nome}`, loading: 'lazy', referrerpolicy: 'no-referrer' }), el('small', {}, 'PlantNet')));

    const nomeLink = c.nome.replace(/\s+['‘’"].*$/, '');
    const link = (href, testo) => el('a', { class: 'btn auto-link', target: '_blank', rel: 'noopener', href }, testo);
    const collegamenti = [
      c.nomeCompleto ? link(`https://identify.plantnet.org/it/k-world-flora/species/${encodeURIComponent(c.nomeCompleto)}/data`, 'Apri scheda PlantNet ↗') : null,
      c.gbifId ? link(`https://www.gbif.org/species/${encodeURIComponent(c.gbifId)}`, 'GBIF ↗') : null,
      c.wiki?.url ? link(c.wiki.url, 'Wikipedia ↗') : null,
      /^\S+\s+\S+/.test(nomeLink) ? link(c.fontiIt?.acta || linkRicercaSito('actaplantarum.org', nomeLink), 'Acta Plantarum ↗') : null,
      /^\S+\s+\S+/.test(nomeLink) ? link(c.fontiIt?.flora || linkRicercaSito('dryades.units.it/floritaly', nomeLink), 'Flora d’Italia ↗') : null,
    ].filter(Boolean);
    return el('div', { class: 'auto-carta' },
      el('h3', { class: 'specie', testo: c.nome }),
      pastiglie.length ? el('div', { class: 'auto-pastiglie' }, ...pastiglie.map(([icona, testo]) => el('span', { class: 'auto-pastiglia' }, `${icona} ${testo}`))) : null,
      ...indizi.map(s => el('p', {}, s)),
      c.wiki?.estratto ? el('p', { class: 'auto-wiki' }, `«${c.wiki.estratto}» — Wikipedia`) : null,
      confronto.length ? el('div', { class: 'auto-confronto' }, ...confronto) : null,
      collegamenti.length ? el('div', { class: 'auto-collegamenti' }, ...collegamenti) : null,
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
  if (avvisaBloccata(S.aperta)) return;
  const r = S.aperta;
  if (!r) return;
  if (r.nome.trim() && r.nome.trim().toLowerCase() !== c.nome.toLowerCase() &&
      !confirm(`Sostituire «${r.nome}» con «${c.nome}»? I dati già inseriti negli altri campi saranno conservati.`)) return;
  if (c.guida) usaNomeDaGuidaSpecie(c.guida);
  else usaRisultatoWeb(c.nome);
  if (c.gbifId) r.gbifId = String(c.gbifId);
  if (c.nomeCompleto) r.plantnetNome = c.nomeCompleto;
  if (c.gbifId) disegnaLinkGbif(); // mostra subito l'ID confermato
  salvaPresto(r);
  $('#dlg-cerca-auto').close();
}

/* =====================================================================
   SUPER RICERCA (3.47): tutte le foto a PlantNet, tutte le AI con chiave
   (con foto, nome e caratteri), guida locale, Wikipedia, GBIF; poi, per le
   prime proposte, presenza nei dintorni (GBIF), foto di confronto e
   collegamenti alle fonti italiane. Niente cambia finché non confermi.
   ===================================================================== */
const ETICHETTE_AI = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter' };

// Tutti i servizi AI con una chiave caricata, nell'ordine Gemini, Groq, OpenRouter.
function fornitoriAIDisponibili() {
  return [['gemini', chiaviAI.GEMINI_API_KEY || chiaviAI.GOOGLE_API_KEY], ['groq', chiaviAI.GROQ_API_KEY], ['openrouter', chiaviAI.OPENROUTER_API_KEY]]
    .filter(([, chiave]) => Boolean(chiave)).map(([nome]) => ({ nome, etichetta: ETICHETTE_AI[nome] }));
}

// Foto ridotta (lato lungo 1024 px, JPEG) per non pesare su quota e tempi delle AI.
async function riduciFotoPerAI(blob, lato = 1024) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return blob;
  try {
    const img = await createImageBitmap(blob);
    const k = Math.min(1, lato / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    img.close?.();
    return await new Promise((ok) => c.toBlob((b) => ok(b || blob), 'image/jpeg', 0.8));
  } catch { return blob; }
}
async function blobInBase64(blob) {
  const byte = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(s);
}
async function fotoPerAI(r, max = 3) {
  const out = [];
  for (const f of (r.foto || []).slice(0, max)) {
    const blob = await DB.leggi('foto', f.id);
    if (blob) out.push({ base64: await blobInBase64(await riduciFotoPerAI(blob)), mime: 'image/jpeg' });
  }
  return out;
}

// Osservazioni GBIF della specie attorno al punto: coordinate arrotondate a circa 1 km.
async function presenzaGbif(id, gps) {
  const lat = Number(gps.lat).toFixed(2), lng = Number(gps.lng).toFixed(2);
  const conta = async (km) => {
    const n = Number((await jsonAuto(`https://api.gbif.org/v1/occurrence/search?taxonKey=${encodeURIComponent(id)}&geoDistance=${lat},${lng},${km}km&limit=0`))?.count);
    return Number.isFinite(n) ? n : null;
  };
  const km10 = await conta(10);
  if (km10 == null) return null;
  return { km10, km50: km10 > 0 ? null : await conta(50).catch(() => null) };
}

// Riassunto e immagine della voce di Wikipedia in italiano (la voce scientifica reindirizza a quella italiana).
async function riassuntoWikipedia(nome) {
  const d = await jsonAuto(`https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(nome).trim().replace(/\s+/g, '_'))}`);
  if (!d || d.type === 'disambiguation' || typeof d.extract !== 'string' || !d.extract.trim()) return null;
  const immagine = String(d.thumbnail?.source || '');
  const url = String(d.content_urls?.mobile?.page || d.content_urls?.desktop?.page || '');
  return { titolo: String(d.title || nome).slice(0, 120), estratto: d.extract.trim().slice(0, 260),
    immagine: /^https:\/\/upload\.wikimedia\.org\//.test(immagine) ? immagine : '', url: /^https:\/\/it\.(m\.)?wikipedia\.org\//.test(url) ? url : '' };
}

// Collegamenti diretti ad Acta Plantarum e al Portale della Flora d'Italia, trovati tramite Wikidata.
const PROPRIETA_FLORA = { promessa: null };
function proprietaFloraItaliana() {
  if (!PROPRIETA_FLORA.promessa) PROPRIETA_FLORA.promessa = (async () => {
    const cerca = async (q) => (await jsonAuto(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&type=property&language=en&limit=5&format=json&origin=*`))?.search || [];
    const [acta, flora] = await Promise.all([cerca('Acta Plantarum'), cerca('Flora of Italy')]);
    const ids = [...new Set([...acta, ...flora].map((p) => p?.id).filter((id) => /^P\d+$/.test(id || '')))];
    if (!ids.length) return [];
    const dati = await jsonAuto(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels|claims&languages=en&format=json&origin=*`);
    return ids.map((id) => {
      const e = dati?.entities?.[id];
      const etichetta = String(e?.labels?.en?.value || '');
      const formato = e?.claims?.P1630?.[0]?.mainsnak?.datavalue?.value;
      const tipo = /acta plantarum/i.test(etichetta) ? 'acta' : /flora of italy/i.test(etichetta) ? 'flora' : null;
      return tipo && typeof formato === 'string' && formato.startsWith('https://') && formato.includes('$1') ? { id, tipo, formato } : null;
    }).filter(Boolean);
  })().catch((e) => { PROPRIETA_FLORA.promessa = null; throw e; });
  return PROPRIETA_FLORA.promessa;
}
async function linkFontiItaliane(nome) {
  const proprieta = await proprietaFloraItaliana();
  if (!proprieta.length) return {};
  const ricerca = await jsonAuto(`https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent('haswbstatement:P225=' + nome)}&srlimit=1&format=json&origin=*`);
  const q = ricerca?.query?.search?.[0]?.title;
  if (!/^Q\d+$/.test(q || '')) return {};
  const entita = (await jsonAuto(`https://www.wikidata.org/wiki/Special:EntityData/${q}.json`))?.entities?.[q];
  const out = {};
  for (const p of proprieta) {
    const v = entita?.claims?.[p.id]?.[0]?.mainsnak?.datavalue?.value;
    if (typeof v === 'string' && /^[\w.\-/]{1,80}$/.test(v) && !out[p.tipo]) out[p.tipo] = p.formato.replace('$1', v);
  }
  return out;
}
// Senza collegamento diretto: ricerca limitata al sito, così il pulsante porta comunque alla pianta giusta.
function linkRicercaSito(sito, nome) {
  return `https://duckduckgo.com/?q=${encodeURIComponent(`site:${sito} "${nome}"`)}`;
}

// Google Lens non ha un'API pubblica: la foto scelta passa all'app Lens con il pannello «Condividi».
async function apriInGoogleLens(foto) {
  const blob = foto && await DB.leggi('foto', foto.id);
  if (!blob) { stato('Foto non disponibile sul dispositivo', true); return; }
  const file = new File([blob], 'pianta.jpg', { type: blob.type || 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Foto della pianta' }); }
    catch (e) { if (e.name !== 'AbortError') stato('Condivisione non riuscita: ' + e.message, true); }
    return;
  }
  alert('Questo browser non può passare la foto ad altre app. Apri Google Lens (o l’app Google → icona della fotocamera) e scegli la foto dalla galleria.');
}

function disegnaFotoRicerca(r) {
  const box = $('#auto-foto');
  if (!box) return;
  const foto = (r.foto || []).slice(0, 5);
  if (!foto.length) { box.replaceChildren(); return; }
  let scelta = foto[0];
  const miniature = foto.map((f, i) => {
    const img = el('img', { alt: f.didascalia || `Foto ${i + 1}`, loading: 'lazy' });
    if (typeof urlFoto === 'function') urlFoto(f.id).then((src) => { img.src = src; }).catch(() => {});
    const b = el('button', { type: 'button', class: 'auto-foto-mini' + (i ? '' : ' scelta'), title: 'Scegli questa foto per Google Lens', onclick: () => {
      scelta = f;
      box.querySelectorAll?.('.auto-foto-mini').forEach((x) => x.classList.toggle('scelta', x === b));
    } }, img);
    return b;
  });
  box.replaceChildren(
    el('span', { class: 'auto-foto-titolo' }, `Le tue foto (${foto.length})`),
    el('div', { class: 'auto-foto-riga' }, ...miniature),
    el('button', { type: 'button', class: 'btn', id: 'auto-lens', onclick: () => apriInGoogleLens(scelta) }, '🔍 Apri in Google Lens ↗'));
}

function disegnaFontiRicerca(fonti) {
  const box = $('#auto-fonti');
  if (!box) return;
  const icone = { attesa: '⏳', ok: '✅', errore: '⚠️', saltata: '➖' };
  box.replaceChildren(...[...fonti.values()].map((f) => el('span', { class: `auto-fonte auto-fonte-${f.stato}`, title: f.testo || '' },
    `${icone[f.stato] || ''} ${f.nome}${f.testo ? ' · ' + f.testo : ''}`)));
}

// Fonti indipendenti che indicano la stessa specie (la presenza nei dintorni è un controllo, non un voto).
function consensoCandidato(c) {
  const voti = c.aiVoti?.length || (c.ai ? 1 : 0);
  const locale = c.locale && c.locale.totale >= 2 && c.locale.punti / c.locale.totale >= 0.6 ? 1 : 0;
  return (c.foto >= 10 ? 1 : 0) + voti + locale;
}
function ordinaCandidati(candidati) {
  const maxAI = (c) => Math.max(-1, ...(c.aiVoti || (c.ai ? [c.ai] : [])).map((v) => v.percentuale ?? -1));
  return [...candidati.values()].sort((a, b) =>
    (b.attinenzaNome ?? 0) - (a.attinenzaNome ?? 0) || consensoCandidato(b) - consensoCandidato(a) ||
    (b.foto ?? -1) - (a.foto ?? -1) || maxAI(b) - maxAI(a) ||
    (b.locale?.punti ?? -1) - (a.locale?.punti ?? -1) || a.nome.localeCompare(b.nome, 'it'));
}

async function cercaAutoDaScheda() {
  const r = S.aperta;
  if (!r) return;
  descriviRicerca('🔎 Super ricerca', 'Interroga insieme la guida delle 144 piante, Wikipedia/Wikidata, GBIF, PlantNet con tutte le foto della scheda (al massimo 5) e ogni servizio AI con chiave, a cui invia le prime 3 foto, il nome e i caratteri botanici: mai GPS, località o note. Per la presenza nei dintorni GBIF riceve le coordinate arrotondate a circa 1 km. Le percentuali delle fonti non sono confrontabili né vengono mediate.');
  const serie = ++AUTO_RICERCA.serie;
  const attiva = () => serie === AUTO_RICERCA.serie && S.aperta === r && $('#dlg-cerca-auto').open;
  const nome = $('#f-nome').value.trim();
  const fotoScheda = (r.foto || []).slice(0, 5);
  const campi = Object.fromEntries(GS_CAMPI_SCHEDA.map(k => [k, r[k] || '']));
  const filtri = { campi, grandezza: r.grandezza || '', altro: '' };
  const haCaratteri = Object.values(campi).some(Boolean) || !!filtri.grandezza;
  const online = navigator.onLine;
  const fornitori = online ? fornitoriAIDisponibili() : [];
  AUTO_RICERCA.aiChieste = fornitori.length;
  const candidati = new Map();
  const aggiungi = (nomeSci, nuovi) => {
    const chiave = (nomeSci || '').trim().toLocaleLowerCase('it');
    if (!chiave) return;
    const precedente = candidati.get(chiave) || { nome: nomeSci.trim(), guida: trovaSpecieGuida(nomeSci) };
    const aiVoti = nuovi.ai ? [...(precedente.aiVoti || []), nuovi.ai] : precedente.aiVoti;
    candidati.set(chiave, { ...precedente, ...nuovi, ...(aiVoti ? { aiVoti } : {}),
      attinenzaNome: attinenzaNomeRicerca(nome, precedente.guida?.nomeSci || nomeSci, nomeSci), nomeCercato: nome });
  };
  const fonti = new Map();
  const fonte = (id, nomeFonte, statoFonte, testo = '') => { fonti.set(id, { nome: nomeFonte, stato: statoFonte, testo }); if (attiva()) disegnaFontiRicerca(fonti); };
  const locali = GUIDA_SPECIE.map(v => ({ v, attinenza: attinenzaNomeRicerca(nome, v.nomeSci, nomeCatalogo(v)), ...punteggioCaratteristiche(v, filtri) }))
    .filter(x => nome ? x.attinenza > 0 : haCaratteri && x.punti >= Math.max(1, Math.ceil(x.totale / 2)))
    .sort((a, b) => b.attinenza - a.attinenza || b.punti - a.punti).slice(0, 8);
  for (const x of locali) aggiungi(nomeCatalogo(x.v), { guida: x.v, locale: haCaratteri ? { punti: x.punti, totale: x.totale } : null });
  if (/^\S+\s+\S+/.test(nome)) aggiungi(nome, { scritto: true });
  $('#auto-stato').textContent = 'Confronto locale completato. Verifico le fonti disponibili…';
  disegnaRisultatiAuto(candidati);
  disegnaFotoRicerca(r);
  $('#dlg-cerca-auto').showModal();
  fonte('guida', 'Guida 144', 'ok', `${locali.length} ${locali.length === 1 ? 'proposta' : 'proposte'}`);

  const prove = [];
  if (nome && online) {
    fonte('wiki', 'Wikipedia', 'attesa');
    prove.push(nomeWikipediaAuto(nome).then(v => { if (v) aggiungi(v, { wikipedia: true }); fonte('wiki', 'Wikipedia', 'ok', v ? 'nome trovato' : 'nessun taxon'); },
      e => { fonte('wiki', 'Wikipedia', 'errore', e.message); throw e; }));
  }
  if (!fotoScheda.length) fonte('plantnet', 'PlantNet', 'saltata', 'nessuna foto');
  else if (!chiavePlantNet()) fonte('plantnet', 'PlantNet', 'saltata', 'manca la chiave');
  else if (!online) fonte('plantnet', 'PlantNet', 'saltata', 'offline');
  else {
    const etichetta = `PlantNet · ${fotoScheda.length} ${fotoScheda.length === 1 ? 'foto' : 'foto insieme'}`;
    fonte('plantnet', etichetta, 'attesa');
    prove.push(fotoPlantNetAuto(fotoScheda, { simili: true }).then(lista => {
      for (const v of lista) aggiungi(v.nome, { foto: v.percentuale, nomeCompleto: v.nomeCompleto, gbifId: v.gbifId, simili: v.simili });
      fonte('plantnet', etichetta, 'ok', `${lista.length} specie${Number.isFinite(lista.rimanenti) ? ` · ${lista.rimanenti} identificazioni rimaste oggi` : ''}`);
    }, e => { fonte('plantnet', etichetta, 'errore', e.message); throw e; }));
  }
  if (online && !fornitori.length) fonte('ai', 'AI', 'saltata', 'nessuna chiave in open.env');
  const immaginiAI = fornitori.length && fotoScheda.length ? fotoPerAI(r, 3).catch(() => []) : Promise.resolve([]);
  for (const f of fornitori) {
    if (!(nome || haCaratteri || fotoScheda.length)) { fonte('ai-' + f.nome, f.etichetta, 'saltata', 'niente da analizzare'); continue; }
    fonte('ai-' + f.nome, f.etichetta, 'attesa');
    prove.push((async () => {
      const immagini = await immaginiAI;
      const lista = await richiediRicercaSpecieAI(r, { fornitore: f.nome, immagini });
      for (const v of lista) aggiungi(v.nome, { ai: v.ai, gbif: v.gbif, gbifId: v.gbifId });
      fonte('ai-' + f.nome, f.etichetta, 'ok', `${lista.length} ${lista.length === 1 ? 'proposta' : 'proposte'}${immagini.length ? ` · ${immagini.length} foto` : ''}`);
    })().catch(e => { fonte('ai-' + f.nome, f.etichetta, 'errore', e.message); throw e; }));
  }
  const esiti = await Promise.allSettled(prove);
  if (!attiva()) return;
  const nomiGbif = ordinaCandidati(candidati).filter(c => /^\S+\s+\S+/.test(c.nome)).slice(0, 4);
  if (nomiGbif.length && online) fonte('gbif', 'GBIF', 'attesa');
  const esitiGbif = online ? await Promise.allSettled(nomiGbif.map(async c => {
    const dati = await jsonAuto(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(c.nome)}&kingdom=Plantae`);
    if (ServiziRicerca.gbifBotanico(dati)) {
      c.gbif = dati.confidence;
      c.gbifId = dati.usageKey;
    }
  })) : [];
  if (!attiva()) return;
  if (nomiGbif.length && online) fonte('gbif', 'GBIF', esitiGbif.some(e => e.status === 'rejected') ? 'errore' : 'ok', `${nomiGbif.filter(c => c.gbif != null).length} nomi verificati`);
  for (const [chiave, c] of candidati) {
    if (c.scritto && !c.guida && !c.wikipedia && c.gbif == null && c.foto == null) candidati.delete(chiave);
  }
  disegnaRisultatiAuto(candidati);
  const errori = [...esiti, ...esitiGbif].filter(e => e.status === 'rejected').map(e => e.reason?.message || 'Servizio non disponibile.');
  const avvisoFoto = !fotoScheda.length ? 'Nessuna foto salvata: prova fotografica saltata. · '
    : !chiavePlantNet() ? 'Foto non analizzate: manca la chiave PlantNet. · ' : '';
  const avvisoAI = online && !fornitori.length ? 'AI saltata: nessuna chiave compatibile caricata. · ' : '';
  const conteggio = candidati.size > 8 ? `Prime 8 di ${candidati.size} proposte` : `${candidati.size} proposte`;
  $('#auto-stato').textContent = `${conteggio} · ${avvisoFoto}${avvisoAI}${!online ? 'Offline: solo guida locale.' : errori.length ? `${[...new Set(errori)].join(' ')} Gli altri risultati restano utilizzabili.` : 'Verifica completata.'}`;
  if (!online) return;

  // Controlli in più sulle prime 4 proposte: un errore qui non tocca i risultati già mostrati.
  const prime = ordinaCandidati(candidati).slice(0, 4);
  if (!prime.length) return;
  fonte('extra', 'Presenza, foto di confronto e fonti italiane', 'attesa');
  const ridisegna = () => { if (attiva()) disegnaRisultatiAuto(candidati); };
  await Promise.allSettled(prime.flatMap(c => [
    c.gbifId && r.gps ? presenzaGbif(c.gbifId, r.gps).then(p => { c.presenza = p; ridisegna(); }) : null,
    riassuntoWikipedia(c.guida ? nomeCatalogo(c.guida).replace(/\s+['‘’"].*$/, '') : c.nome).then(w => { c.wiki = w; ridisegna(); }),
    linkFontiItaliane(c.nome.replace(/\s+['‘’"].*$/, '')).then(l => { c.fontiIt = l; ridisegna(); }),
  ].filter(Boolean)));
  if (attiva()) fonte('extra', 'Presenza, foto di confronto e fonti italiane', 'ok', `${prime.length} specie controllate`);
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
  for (const [scheda, guida] of Object.entries(GS_CAMPO_GUIDA)) attesi[scheda] = valoreGuidaPerScheda(scheda, specie[guida]);
  const conflitti = Object.entries(attesi).filter(([k, valore]) => valore && r[k] && r[k] !== valore)
    .map(([k, valore]) => `${CAMPI.find(c => c.k === k)?.label || k}: ${r[k]} / guida ${valore}`);
  for (const dip of DIPENDENZE_CAMPI) {
    if (r[dip.se] || !attesi[dip.se] || !dipendenzaAttiva(dip, attesi[dip.se])) continue;
    const compilati = dip.nascondi.filter(k => r[k]);
    if (compilati.length) conflitti.push(`${CAMPI.find(c => c.k === dip.se)?.label || dip.se}: guida ${attesi[dip.se]} non applicato, per conservare ${compilati.map(k => CAMPI.find(c => c.k === k)?.label || k).join(', ')} già osservati`);
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

function aggiornaSlideScheda() {
  const cont = $('#scheda-slide');
  if (!cont) return;
  const nome = nomeRicercaNormalizzato(S.aperta?.nome);
  const specie = nome ? GUIDA_SPECIE.find(v => nomeRicercaNormalizzato(nomeCatalogo(v)) === nome) : null;
  if (!specie || !Number.isInteger(specie.pagina) || specie.pagina <= 0) {
    cont.replaceChildren(); cont.classList.add('nascosto'); cont.dataset.slide = ''; return;
  }
  const chiave = `${specie.id}:${specie.pagina}`;
  if (cont.dataset.slide === chiave) return;
  cont.dataset.slide = chiave;
  const src = `./slides/${specie.pagina}.webp`;
  const descrizione = `Slide ${specie.pagina} · ${nomeCatalogo(specie)}`;
  cont.replaceChildren(el('button', { type: 'button', class: 'scheda-slide-apri',
    'aria-label': `Apri ${descrizione}`, onclick: () => {
      $('#vista-img').src = src; $('#vista-img').alt = descrizione; $('#vista-foto').showModal();
    } }, el('img', { src, alt: descrizione, loading: 'lazy', onerror: () => {
      if (cont.dataset.slide === chiave) { cont.classList.add('nascosto'); cont.dataset.slide = ''; }
    } }), el('span', {}, `Slide ${specie.pagina}`, el('small', {}, 'Tocca per ingrandire'))));
  cont.classList.remove('nascosto');
}

function confrontaConCatalogo() {
  aggiornaSlideScheda();
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
    const valoreGuida = valoreGuidaPerScheda(campoScheda, specie[campoGuida]);
    // La ricerca non deve cancellare o nascondere osservazioni già inserite.
    if (DIPENDENZE_CAMPI.some(dip => (dip.se === campoScheda && dipendenzaAttiva(dip, valoreGuida) && dip.nascondi.some(k => r[k])) ||
        (dip.nascondi.includes(campoScheda) && dipendenzaAttiva(dip, r[dip.se])))) continue;
    const valori = CAMPI.find((c) => c.k === campoScheda)?.valori || [];
    if (valori.includes(valoreGuida)) {
      r[campoScheda] = valoreGuida;
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
      : el('p', { class: 'testo-nota sotto', testo: 'Non è tra le 144 del corso: verranno compilati solo il nome e la nota, gli altri campi restano a te' }),
    dati.nomeSci !== dati.titoloPagina ? el('p', { class: 'testo-nota sotto', testo: `Pagina Wikipedia: ${dati.titoloPagina}` }) : null,
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
  if (avvisaBloccata(S.aperta)) return;
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
  if (avvisaBloccata(S.aperta)) return;
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
      el('span', { class: 'testo-nota' },
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
