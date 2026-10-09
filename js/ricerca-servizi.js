'use strict';
// Trasporto unico per le ricerche online. Nessuna chiave o risposta è scritta nei log.
const ServiziRicerca = (() => {
  const nomi = { gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', plantnet: 'PlantNet' };
  const cacheModelli = new Map();
  async function json(url, opzioni = {}, durata = 12000, servizio = 'Servizio') {
    const controllo = new AbortController();
    const timer = setTimeout(() => controllo.abort(), durata);
    try {
      const resp = await fetch(url, { ...opzioni, signal: controllo.signal });
      if (!resp.ok) {
        const spiegazione = resp.status === 401 || resp.status === 403 ? 'chiave non valida o accesso negato' :
          resp.status === 429 ? 'quota o limite di richieste raggiunto; riprova più tardi' :
          resp.status === 413 ? 'immagine troppo grande' : resp.status === 400 ? 'richiesta rifiutata dal servizio' : 'richiesta non disponibile';
        const temporaneo = [500, 502, 503, 504].includes(resp.status);
        // Il motivo dato dal servizio (es. «model not found») rende l'errore diagnosticabile.
        const dettaglio = await dettaglioErrore(resp);
        const errore = new Error(`${servizio}: ${temporaneo ? 'servizio temporaneamente indisponibile; riprova più tardi' : spiegazione} (${resp.status})${dettaglio ? ' – ' + dettaglio : ''}.`);
        errore.status = resp.status;
        errore.dettaglio = dettaglio;
        throw errore;
      }
      try { return await resp.json(); }
      catch { throw new Error(`${servizio}: risposta non leggibile, riprova più tardi.`); }
    } catch (e) {
      if (controllo.signal.aborted) throw new Error(`${servizio}: tempo di attesa scaduto. Controlla la rete e riprova.`);
      if (e instanceof TypeError) throw new Error(`${servizio}: connessione non riuscita o richiesta bloccata dal browser.`);
      throw e;
    } finally { clearTimeout(timer); }
  }
  // Testo dell'errore restituito dall'API, ripulito da qualsiasi cosa somigli a una chiave.
  async function dettaglioErrore(resp) {
    try {
      if (typeof resp.text !== 'function') return '';
      const testo = await resp.text();
      let msg = testo;
      try {
        const d = JSON.parse(testo);
        const e = Array.isArray(d) ? d[0]?.error : d?.error;
        msg = typeof e === 'string' ? e : e?.message || d?.message || '';
      } catch { /* testo semplice */ }
      return String(msg || '').replace(/(AIza[\w-]{10,}|gsk_[\w-]{10,}|sk-[\w-]{10,}|key=[^&\s]+)/g, '[chiave]')
        .replace(/\s+/g, ' ').trim().slice(0, 220);
    } catch { return ''; }
  }
  // Modelli predefiniti (ottobre 2026): Gemini 2.5 non è più concesso alle chiavi nuove,
  // su Groq l'unico modello con immagini è Qwen 3.8.
  const PREDEFINITI = { gemini: 'gemini-3.5-flash', groq: 'llama-3.3-70b-versatile', groqVision: 'qwen/qwen3.8-27b' };
  const ragiona = modello => /qwen|gpt-oss|deepseek|reason/i.test(modello);
  // Errore dovuto al modello (non esiste, ritirato, non concesso a questa chiave o senza quota gratuita).
  function erroreDiModello(e) {
    if (e.status === 404) return true;
    const d = String(e.dettaglio || '').toLowerCase();
    if ([400, 403].includes(e.status)) return /model|not found|not supported|no longer available|decommission|deprecat/.test(d);
    if (e.status === 429) return /limit: 0|free_tier|free tier/.test(d);
    return false;
  }
  function modelloValido(s) { return typeof s === 'string' && /^[\w.-]+(?:\/[\w.:-]+)*$/.test(s) && !s.includes('..'); }
  function impostazione(nome, chiave, modello = '', immagine = false) {
    if (!nomi[nome] || nome === 'plantnet' || !chiave) throw new Error('Carica la chiave del servizio AI scelto da Configurazione.');
    if (modello && !modelloValido(modello)) throw new Error('ID modello non valido. Controllalo in Configurazione.');
    if (nome === 'openrouter' && (!modello || !modello.includes('/')))
      throw new Error('Inserisci l’ID esatto del modello OpenRouter in Configurazione; per le slide deve supportare immagini. Controlla prima i costi.');
    return { nome, chiave, esplicito: !!modello, etichetta: nomi[nome], immagine,
      modello: modello || (nome === 'gemini' ? PREDEFINITI.gemini : immagine ? PREDEFINITI.groqVision : PREDEFINITI.groq) };
  }
  async function modelloAlternativo(cfg) {
    const cache = cacheModelli.get(cfg.nome + '|' + cfg.immagine);
    if (cache && cache.chiave === cfg.chiave && cache.immagine === cfg.immagine) return cache.modello;
    const url = cfg.nome === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' :
      'https://api.groq.com/openai/v1/models';
    const headers = cfg.nome === 'gemini' ? { 'x-goog-api-key': cfg.chiave } : { Authorization: `Bearer ${cfg.chiave}` };
    const dati = await json(url, { headers }, 15000, cfg.etichetta);
    const disponibili = cfg.nome === 'gemini' ? (dati.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, '')) : (dati.data || []).filter(m => m.active !== false).map(m => m.id);
    // Nessun cambio di servizio e nessun modello Pro/paid di OpenRouter scelto automaticamente.
    let modello;
    if (cfg.nome === 'gemini') modello = disponibili.filter(m => modelloValido(m) && /^gemini-[\d.]+-flash(?:-lite)?$/.test(m) && m !== cfg.modello)
      // prima i Flash (più precisi), poi i Flash-Lite; a parità, la versione più recente
      .sort((a, b) => Number(a.endsWith('-lite')) - Number(b.endsWith('-lite')) || b.localeCompare(a, 'en', { numeric: true }))[0];
    else {
      const preferiti = cfg.immagine ? ['qwen/qwen3.8-27b', 'meta-llama/llama-4-scout-17b-16e-instruct'] :
        ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'];
      modello = preferiti.find(m => m !== cfg.modello && disponibili.includes(m));
    }
    if (!modello) throw new Error(`${cfg.etichetta}: nessun modello ${cfg.immagine ? 'con immagini ' : ''}compatibile trovato. Imposta un modello disponibile in Configurazione.`);
    cacheModelli.set(cfg.nome + '|' + cfg.immagine, { chiave: cfg.chiave, immagine: cfg.immagine, modello });
    return modello;
  }
  // Estrae l'oggetto JSON dalla risposta anche se il modello aggiunge ragionamento, ``` o testo attorno.
  function estraiJSON(testo) {
    const pulito = String(testo).replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try { return JSON.parse(pulito); } catch { /* cerco il blocco JSON */ }
    const inizio = pulito.search(/[{[]/), fine = Math.max(pulito.lastIndexOf('}'), pulito.lastIndexOf(']'));
    if (inizio >= 0 && fine > inizio) return JSON.parse(pulito.slice(inizio, fine + 1));
    throw new SyntaxError('JSON assente');
  }
  // Immagini: una sola (base64 + opzioni.mime, come le slide) oppure più foto in opzioni.immagini [{base64, mime}].
  async function ai(cfg, istruzioni, base64 = '', opzioni = {}) {
    const mime = opzioni.mime || 'image/webp';
    const immagini = base64 ? [{ base64, mime }] : (opzioni.immagini || []).filter((i) => i && i.base64);
    const esegui = async modello => {
      let url, body, headers;
      if (cfg.nome === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`;
        headers = { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.chiave };
        body = { contents: [{ parts: [{ text: istruzioni }, ...immagini.map((i) => ({ inline_data: { mime_type: i.mime || 'image/jpeg', data: i.base64 } }))] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 } };
      } else {
        url = cfg.nome === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.chiave}`,
          ...(cfg.nome === 'openrouter' ? { 'X-Title': 'Scheda Botanica PRO' } : {}) };
        body = { model: modello, temperature: 0, [cfg.nome === 'groq' ? 'max_completion_tokens' : 'max_tokens']: 1800,
          // Groq: con la modalità JSON i modelli che ragionano (Qwen, gpt-oss) rispondono 400 se il ragionamento
          // resta nel testo; va nascosto. Per Qwen lo si spegne del tutto: più veloce, risposta più corta.
          ...(cfg.nome === 'groq' ? { response_format: { type: 'json_object' },
            ...(ragiona(modello) ? { reasoning_format: 'hidden', reasoning_effort: /qwen/i.test(modello) ? 'none' : 'low' } : {}) } : {}),
          messages: [{ role: 'user', content: immagini.length ? [{ type: 'text', text: istruzioni },
            ...immagini.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime || 'image/jpeg'};base64,${i.base64}` } }))] : istruzioni }] };
      }
      let dati;
      for (let tentativo = 1; tentativo <= 3; tentativo++) {
        if (opzioni.attiva && !opzioni.attiva()) throw new Error('Ricerca annullata.');
        try {
          dati = await json(url, { method: 'POST', headers, body: JSON.stringify(body) }, 60000, `${cfg.etichetta} · ${modello}`);
          break;
        } catch (errore) {
          if (![500, 502, 503, 504].includes(errore.status) || tentativo === 3) throw errore;
          if (opzioni.attiva && !opzioni.attiva()) throw new Error('Ricerca annullata.');
          opzioni.onRetry?.(`${cfg.etichetta}: servizio temporaneamente indisponibile (${errore.status}). Riprovo: tentativo ${tentativo + 1}/3…`);
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (tentativo - 1) + Math.floor(Math.random() * 250)));
        }
      }
      // Gemini: le parti «thought» sono ragionamento interno, non la risposta.
      const testo = cfg.nome === 'gemini' ? dati.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') : dati.choices?.[0]?.message?.content;
      if (typeof testo !== 'string' || !testo.trim()) {
        const motivo = cfg.nome === 'gemini' ? (dati.promptFeedback?.blockReason || dati.candidates?.[0]?.finishReason || '') : (dati.choices?.[0]?.finish_reason || '');
        throw new Error(`${cfg.etichetta}: risposta vuota o bloccata${motivo ? ` (${motivo})` : ''}; riprova o aggiungi dati botanici più precisi.`);
      }
      let dato;
      try { dato = estraiJSON(testo); }
      catch { throw new Error(`${cfg.etichetta}: risposta fuori formato. Nessun dato applicato; riprova.`); }
      // Modello che ha davvero risposto (utile per «Prova AI»), senza alterare il JSON.
      if (dato && typeof dato === 'object') Object.defineProperty(dato, '_modello', { value: modello, enumerable: false });
      return dato;
    };
    const cache = cacheModelli.get(cfg.nome + '|' + cfg.immagine);
    const primo = !cfg.esplicito && cache?.chiave === cfg.chiave && cache.immagine === cfg.immagine ? cache.modello : cfg.modello;
    try { return await esegui(primo); }
    catch (e) {
      if (!erroreDiModello(e) || cfg.esplicito || cfg.nome === 'openrouter') {
        if (e.status === 404) throw new Error(`${cfg.etichetta}: il modello «${primo}» non è disponibile (404)${e.dettaglio ? ' – ' + e.dettaglio : ''}. Controlla l’ID e l’accesso al modello in Configurazione.`);
        throw e;
      }
      cacheModelli.delete(cfg.nome + '|' + cfg.immagine);
      let nuovo;
      try { nuovo = await modelloAlternativo({ ...cfg, modello: primo }); }
      catch (err) { throw new Error(`${cfg.etichetta}: il modello «${primo}» non è disponibile (${e.status})${e.dettaglio ? ' – ' + e.dettaglio : ''}. Recupero del modello non riuscito: ${err.message} Controlla le impostazioni AI.`); }
      // Una sola riprova, nello stesso servizio, dopo aver verificato il catalogo ufficiale.
      try { return await esegui(nuovo); }
      catch (err) {
        if (erroreDiModello(err)) throw new Error(`${cfg.etichetta}: anche «${nuovo}» non è disponibile per questa chiave (${err.status})${err.dettaglio ? ' – ' + err.dettaglio : ''}. Scegli un modello autorizzato in Configurazione.`);
        throw err;
      }
    }
  }
  async function plantnetNome(nome, chiave) {
    if (!chiave) throw new Error('Per la ricerca nel catalogo PlantNet serve la chiave PlantNet in Configurazione. Senza chiave usa la guida locale o Wikipedia.');
    const q = String(nome || '').trim().slice(0, 160);
    if (!q) throw new Error('Inserisci prima il nome della pianta.');
    const url = `https://my-api.plantnet.org/v2/projects/k-world-flora/species?prefix=${encodeURIComponent(q)}&page=1&pageSize=20&lang=it&api-key=${encodeURIComponent(chiave)}`;
    const dati = await json(url, {}, 30000, 'PlantNet · catalogo per nome');
    if (!Array.isArray(dati)) throw new Error('PlantNet: formato del catalogo non riconosciuto. Nessun dato applicato.');
    return dati.filter(s => typeof s?.scientificNameWithoutAuthor === 'string')
      .filter(s => s.scientificNameWithoutAuthor.toLocaleLowerCase('it').startsWith(q.toLocaleLowerCase('it')))
      .map(s => ({ nome: s.scientificNameWithoutAuthor, nomeCompleto: [s.scientificNameWithoutAuthor, s.scientificNameAuthorship].filter(Boolean).join(' '),
        nomiComuni: Array.isArray(s.commonNames) ? s.commonNames.filter(n => typeof n === 'string').slice(0, 3) : [],
        gbifId: /^\d+$/.test(String(s.gbifId || '')) ? String(s.gbifId) : '' }));
  }
  function gbifBotanico(dati, ammettiGenere = false) {
    return dati?.kingdom === 'Plantae' && dati.matchType === 'EXACT' && dati.confidence >= 90 &&
      /^\d+$/.test(String(dati.usageKey || '')) &&
      ['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM', ...(ammettiGenere ? ['GENUS'] : [])].includes(dati.rank);
  }
  return { json, impostazione, ai, estraiJSON, PREDEFINITI, plantnetNome, gbifBotanico, svuotaCache: () => cacheModelli.clear() };
})();
