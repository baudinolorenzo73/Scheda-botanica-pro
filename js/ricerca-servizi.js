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
          resp.status === 413 ? 'immagine troppo grande' : 'richiesta non disponibile';
        const temporaneo = [502, 503, 504].includes(resp.status);
        const errore = new Error(`${servizio}: ${temporaneo ? 'servizio temporaneamente indisponibile; riprova più tardi' : spiegazione} (${resp.status}).`);
        errore.status = resp.status;
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
  function modelloValido(s) { return typeof s === 'string' && /^[\w.-]+(?:\/[\w.:-]+)*$/.test(s) && !s.includes('..'); }
  function impostazione(nome, chiave, modello = '', immagine = false) {
    if (!nomi[nome] || nome === 'plantnet' || !chiave) throw new Error('Carica la chiave del servizio AI scelto da Configurazione.');
    if (modello && !modelloValido(modello)) throw new Error('ID modello non valido. Controllalo in Configurazione.');
    if (nome === 'openrouter' && (!modello || !modello.includes('/')))
      throw new Error('Inserisci l’ID esatto del modello OpenRouter in Configurazione; per le slide deve supportare immagini. Controlla prima i costi.');
    return { nome, chiave, esplicito: !!modello, etichetta: nomi[nome], immagine,
      modello: modello || (nome === 'gemini' ? 'gemini-2.5-flash' : immagine ? 'qwen/qwen3.8-27b' : 'llama-3.1-8b-instant') };
  }
  async function modelloAlternativo(cfg) {
    const cache = cacheModelli.get(cfg.nome);
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
    if (cfg.nome === 'gemini') modello = disponibili.filter(m => modelloValido(m) && /^gemini-[\d.]+-flash$/.test(m))
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).find(m => m !== cfg.modello);
    else {
      const preferiti = cfg.immagine ? ['qwen/qwen3.8-27b', 'meta-llama/llama-4-scout-17b-16e-instruct'] :
        ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];
      modello = preferiti.find(m => m !== cfg.modello && disponibili.includes(m));
    }
    if (!modello) throw new Error(`${cfg.etichetta}: nessun modello ${cfg.immagine ? 'con immagini ' : ''}compatibile trovato. Imposta un modello disponibile in Configurazione.`);
    cacheModelli.set(cfg.nome, { chiave: cfg.chiave, immagine: cfg.immagine, modello });
    return modello;
  }
  async function ai(cfg, istruzioni, base64 = '', opzioni = {}) {
    const esegui = async modello => {
      let url, body, headers;
      if (cfg.nome === 'gemini') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent`;
        headers = { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.chiave };
        body = { contents: [{ parts: [{ text: istruzioni }, ...(base64 ? [{ inline_data: { mime_type: 'image/webp', data: base64 } }] : [])] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 } };
      } else {
        url = cfg.nome === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.chiave}` };
        body = { model: modello, temperature: 0, [cfg.nome === 'groq' ? 'max_completion_tokens' : 'max_tokens']: 1800,
          ...(cfg.nome === 'groq' ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'user', content: base64 ? [{ type: 'text', text: istruzioni },
            { type: 'image_url', image_url: { url: `data:image/webp;base64,${base64}` } }] : istruzioni }] };
      }
      let dati;
      for (let tentativo = 1; tentativo <= 3; tentativo++) {
        if (opzioni.attiva && !opzioni.attiva()) throw new Error('Ricerca annullata.');
        try {
          dati = await json(url, { method: 'POST', headers, body: JSON.stringify(body) }, 60000, `${cfg.etichetta} · ${modello}`);
          break;
        } catch (errore) {
          if (![502, 503, 504].includes(errore.status) || tentativo === 3) throw errore;
          if (opzioni.attiva && !opzioni.attiva()) throw new Error('Ricerca annullata.');
          opzioni.onRetry?.(`${cfg.etichetta}: servizio temporaneamente indisponibile (${errore.status}). Riprovo: tentativo ${tentativo + 1}/3…`);
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (tentativo - 1) + Math.floor(Math.random() * 250)));
        }
      }
      const testo = cfg.nome === 'gemini' ? dati.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') : dati.choices?.[0]?.message?.content;
      if (typeof testo !== 'string' || !testo.trim()) throw new Error(`${cfg.etichetta}: risposta vuota o bloccata; aggiungi dati botanici più precisi.`);
      try { return JSON.parse(testo.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
      catch { throw new Error(`${cfg.etichetta}: risposta fuori formato. Nessun dato applicato; riprova.`); }
    };
    const cache = cacheModelli.get(cfg.nome);
    const primo = !cfg.esplicito && cache?.chiave === cfg.chiave && cache.immagine === cfg.immagine ? cache.modello : cfg.modello;
    try { return await esegui(primo); }
    catch (e) {
      if (e.status !== 404 || cfg.esplicito || cfg.nome === 'openrouter') {
        if (e.status === 404) throw new Error(`${cfg.etichetta}: il modello «${primo}» non è disponibile (404). Controlla l’ID e l’accesso al modello in Configurazione.`);
        throw e;
      }
      cacheModelli.delete(cfg.nome);
      let nuovo;
      try { nuovo = await modelloAlternativo({ ...cfg, modello: primo }); }
      catch (err) { throw new Error(`${cfg.etichetta}: il modello «${primo}» non è disponibile (404). Recupero del modello non riuscito: ${err.message} Controlla le impostazioni AI.`); }
      // Una sola riprova, nello stesso servizio, dopo aver verificato il catalogo ufficiale.
      try { return await esegui(nuovo); }
      catch (err) {
        if (err.status === 404) throw new Error(`${cfg.etichetta}: anche «${nuovo}» non è disponibile per questa chiave (404). Scegli un modello autorizzato in Configurazione.`);
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
  return { json, impostazione, ai, plantnetNome, gbifBotanico, svuotaCache: () => cacheModelli.clear() };
})();
