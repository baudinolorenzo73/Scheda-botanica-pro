// Test di rete simulata: non legge open.env e non usa API, quote o credenziali reali.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let chiamate = [], risposta, totale = 0;
// Acceleriamo solo il backoff nei test, conservando i veri timer di timeout.
const timerTest = (fn, ms) => setTimeout(fn, ms >= 1000 && ms < 2500 ? 0 : ms);
const contesto = vm.createContext({ AbortController, setTimeout: timerTest, clearTimeout, TypeError,
  fetch: async (url, opzioni) => { chiamate.push({ url: String(url), opzioni }); return risposta(String(url), opzioni); } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/ricerca-servizi.js'), 'utf8') + '\nglobalThis.servizi = ServiziRicerca;', contesto);
const s = contesto.servizi;
const ok = dati => ({ ok: true, status: 200, json: async () => dati });
const errore = status => ({ ok: false, status });
const chat = dato => ok({ choices: [{ message: { content: JSON.stringify(dato) } }] });
const gemini = dato => ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(dato) }] } }] });
const prova = async (nome, fn) => { chiamate = []; s.svuotaCache(); await fn(); totale++; console.log('OK', nome); };
function flussoApplicazione() {
  // Esegue le vere funzioni dell'app con una piccola UI simulata, senza browser o rete.
  const nodi = new Map(), richieste = [];
  const elemento = (tipo = '', attrs = {}, figli = []) => ({ tipo, ...attrs, figli, value: attrs.value || '', open: false,
    get textContent() { return this.testo || this.figli.flat(Infinity).filter(Boolean).map(n => typeof n === 'string' ? n : n.textContent || '').join(' '); },
    set textContent(val) { this.testo = val; this.figli = []; },
    replaceChildren(...nuovi) { this.testo = ''; this.figli = nuovi; }, prepend(...nuovi) { this.figli.unshift(...nuovi); },
    showModal() { this.open = true; }, close() { this.open = false; }, classList: { toggle() {} } });
  const $ = id => { if (!nodi.has(id)) nodi.set(id, elemento()); return nodi.get(id); };
  const r = { uid: 'riga-test', nome: 'Fagus sylvatica', foto: [], persistenza: 'caduca', note: 'Nota personale da NON inviare', gps: { lat: 45, lng: 7 } };
  const guida = { nomeSci: 'Fagus sylvatica', famiglia: 'Fagaceae' };
  let chiave = 'chiave-simulata', invii = async () => ok([]);
  const c = vm.createContext({ AbortController, setTimeout: timerTest, clearTimeout, TypeError, FormData, Blob,
    DB: { leggi: async () => new Blob(['immagine-finta'], { type: 'image/jpeg' }) }, navigator: { onLine: true }, $, S: { aperta: r },
    GS_CAMPI_SCHEDA: ['persistenza', 'formaChioma', 'rami', 'tipoFoglia', 'lamina', 'margine'],
    CAMPI: [{ k: 'persistenza', label: 'Persistenza foglie' }, { k: 'altezza', label: 'Altezza' }],
    GUIDA_SPECIE: [guida], chiaviAI: {}, chiavePlantNet: () => chiave,
    trovaSpecieGuida: nome => nome === guida.nomeSci ? guida : null, nomeCatalogo: v => v.nomeSci,
    punteggioCaratteristiche: () => ({ punti: 1, totale: 1 }),
    el: (tipo, attrs, ...figli) => elemento(tipo, attrs, figli),
    confirm: () => true, salvaPresto() {}, usaNomeDaGuidaSpecie: v => { r.nome = v.nomeSci; }, usaRisultatoWeb: nome => { r.nome = nome; },
    fetch: async (url, opzioni) => { richieste.push(String(url)); return invii(String(url), opzioni); } });
  $('#f-nome').value = r.nome;
  $('#cg-ai-fornitore').value = 'gemini';
  $('#ai-ricerca-servizio').value = 'auto';
  const fonte = ['app.js', 'js/guida.js', 'js/mappa.js', 'js/stampa-qr.js', 'js/backup.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  const segmento = (inizio, fine) => fonte.slice(fonte.indexOf(inizio), fonte.indexOf(fine, fonte.indexOf(inizio)));
  vm.runInContext(fs.readFileSync(path.join(root, 'js/ricerca-servizi.js'), 'utf8') + '\n' +
    segmento('function configurazioneFornitoreAI(', 'function normalizzaProposteAI(') +
    segmento('const AUTO_RICERCA =', '// Scorciatoia dal campo') +
    segmento('function precompilaCaratteristicheDaScheda(', 'function apriGuidaSpecie('), c);
  return { c, r, $, richieste, invia: fn => { invii = fn; }, senzaChiave: () => { chiave = ''; },
    esegui: espressione => vm.runInContext(espressione, c) };
}
(async () => {
  await prova('Gemini 503 transitorio: massimo tre tentativi dello stesso modello', async () => {
    const progressi = [];
    risposta = async () => chiamate.length < 3 ? errore(503) : gemini({ candidati: [] });
    await s.ai(s.impostazione('gemini', 'chiave-finta', 'gemini-personalizzato'), 'test', '', { onRetry: testo => progressi.push(testo) });
    assert.equal(chiamate.length, 3);
    assert.equal(new Set(chiamate.map(c => c.url)).size, 1);
    assert.equal(progressi.length, 2);
    assert.match(progressi[1], /tentativo 3\/3/);
  });
  await prova('503 persistente: stop dopo tre tentativi, nessun cambio provider', async () => {
    risposta = async () => errore(503);
    await assert.rejects(s.ai(s.impostazione('groq', 'chiave-finta'), 'test'), /temporaneamente indisponibile.*503/);
    assert.equal(chiamate.length, 3);
    assert.ok(chiamate.every(c => c.url.startsWith('https://api.groq.com/')));
  });
  await prova('AI chiusa durante il backoff: nessun nuovo invio', async () => {
    let attiva = true;
    risposta = async () => errore(503);
    await assert.rejects(s.ai(s.impostazione('gemini', 'chiave-finta'), 'test', '', {
      attiva: () => attiva, onRetry: () => { attiva = false; }
    }), /annullata/);
    assert.equal(chiamate.length, 1);
  });
  await prova('Robinia: il nome non viene escluso da otto aceri con più caratteri', async () => {
    const f = flussoApplicazione();
    f.c.navigator.onLine = false;
    f.r.nome = f.$('#f-nome').value = 'Robinia pseudoacacia';
    f.c.GUIDA_SPECIE = [...Array.from({ length: 10 }, (_, i) => ({ nomeSci: `Acer platanoides ${i}` })), { nomeSci: 'Robinia pseudoacacia' }];
    f.c.trovaSpecieGuida = nome => f.c.GUIDA_SPECIE.find(v => v.nomeSci === nome);
    f.c.punteggioCaratteristiche = v => ({ punti: v.nomeSci.startsWith('Acer') ? 2 : 0, totale: 2 });
    await f.esegui('cercaAutoDaScheda()');
    assert.equal(f.$('#auto-risultati').figli.length, 1);
    assert.match(f.$('#auto-risultati').textContent, /Robinia pseudoacacia.*Corrisponde al nome/);
    assert.doesNotMatch(f.$('#auto-risultati').textContent, /Acer|100%/);
    assert.equal(f.r.nome, 'Robinia pseudoacacia');
  });
  await prova('Rubinia: refuso suggerito, senza modificare automaticamente il nome', async () => {
    const f = flussoApplicazione();
    f.c.navigator.onLine = false;
    f.r.nome = f.$('#f-nome').value = 'rubinia pseudoacacia';
    f.c.GUIDA_SPECIE = [{ nomeSci: 'Acer platanoides' }, { nomeSci: 'Robinia pseudoacacia' }];
    f.c.trovaSpecieGuida = nome => f.c.GUIDA_SPECIE.find(v => v.nomeSci === nome);
    await f.esegui('cercaAutoDaScheda()');
    assert.match(f.$('#auto-risultati').textContent, /Robinia pseudoacacia.*Possibile correzione di «rubinia pseudoacacia»/);
    assert.doesNotMatch(f.$('#auto-risultati').textContent, /Acer/);
    assert.equal(f.r.nome, 'rubinia pseudoacacia');
  });
  await prova('Nome ignoto: nessuna sostituzione con piante genericamente simili', async () => {
    const f = flussoApplicazione();
    f.c.navigator.onLine = false;
    f.r.nome = f.$('#f-nome').value = 'Pianta sconosciuta';
    await f.esegui('cercaAutoDaScheda()');
    assert.doesNotMatch(f.$('#auto-risultati').textContent, /Fagus sylvatica/);
  });
  await prova('Ricerca senza nome: confronta i caratteri, senza percentuale fuorviante', async () => {
    const f = flussoApplicazione();
    f.c.navigator.onLine = false;
    f.r.nome = f.$('#f-nome').value = '';
    f.c.punteggioCaratteristiche = () => ({ punti: 2, totale: 2 });
    await f.esegui('cercaAutoDaScheda()');
    assert.match(f.$('#auto-risultati').textContent, /Fagus sylvatica.*2\/2 caratteri concordanti.*Pochi indizi/);
    assert.doesNotMatch(f.$('#auto-risultati').textContent, /100%/);
  });
  await prova('Flusso AI 503: indisponibilità distinta da nessuna pianta, riprova visibile', async () => {
    const f = flussoApplicazione();
    f.c.chiaviAI = { GOOGLE_API_KEY: 'chiave-finta' };
    f.invia(async () => errore(503));
    await f.esegui('cercaAIDaScheda()');
    assert.equal(f.richieste.length, 3);
    assert.match(f.$('#auto-stato').textContent, /temporaneamente indisponibile.*503/);
    assert.match(f.$('#auto-risultati').textContent, /Riprova AI.*Ricerca AI non completata/);
    assert.doesNotMatch(f.$('#auto-risultati').textContent, /Inserisci qualche|Nessuna proposta verificabile/);
    assert.equal(f.r.nome, 'Fagus sylvatica');
  });
  await prova('Groq: ricerca testuale usa un modello diverso dal Vision', async () => {
    risposta = async () => chat({ candidati: [] });
    await s.ai(s.impostazione('groq', 'chiave-finta'), 'testo');
    const corpo = JSON.parse(chiamate[0].opzioni.body);
    assert.equal(corpo.model, 'llama-3.1-8b-instant');
    assert.equal(typeof corpo.messages[0].content, 'string');
    assert.equal(corpo.max_completion_tokens, 1800);
    assert.equal(chiamate[0].opzioni.headers.Authorization, 'Bearer chiave-finta');
  });
  await prova('Groq: le slide inviano immagini a un modello Vision', async () => {
    risposta = async () => chat({ proposte: [] });
    await s.ai(s.impostazione('groq', 'chiave-finta', '', true), 'slide', 'AQID');
    const corpo = JSON.parse(chiamate[0].opzioni.body);
    assert.equal(corpo.model, 'qwen/qwen3.8-27b');
    assert.equal(corpo.messages[0].content[1].image_url.url, 'data:image/webp;base64,AQID');
  });
  await prova('Gemini 404: consulta modelli e riprova una sola volta; mai Pro', async () => {
    risposta = async url => url.includes('gemini-2.5-flash:') ? errore(404) : url.includes('pageSize=') ?
      ok({ models: [
        { name: 'models/gemini-3.0-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-4.0-flash', supportedGenerationMethods: ['embedContent'] }
      ] }) : gemini({ candidati: [] });
    const cfg = s.impostazione('gemini', 'chiave-finta');
    await s.ai(cfg, 'nome pianta');
    assert.equal(chiamate.length, 3);
    assert.match(chiamate[2].url, /gemini-3\.0-flash:generateContent/);
    assert.ok(chiamate.every(c => c.url.startsWith('https://generativelanguage.googleapis.com/')));
    await s.ai(cfg, 'nome pianta');
    assert.equal(chiamate.length, 4, 'La seconda richiesta usa il modello già verificato');
  });
  await prova('Modello personalizzato 404: non viene sostituito', async () => {
    risposta = async () => errore(404);
    await assert.rejects(s.ai(s.impostazione('gemini', 'chiave-finta', 'gemini-personalizzato'), 'test'), /modello.*non è disponibile.*404/);
    assert.equal(chiamate.length, 1);
  });
  await prova('OpenRouter 404: niente passaggi a modelli potenzialmente a pagamento', async () => {
    risposta = async () => errore(404);
    await assert.rejects(s.ai(s.impostazione('openrouter', 'chiave-finta', 'esempio/modello'), 'test'), /OpenRouter.*404/);
    assert.equal(chiamate.length, 1);
    assert.throws(() => s.impostazione('openrouter', 'chiave-finta'), /ID esatto/);
  });
  await prova('Autenticazione e quota: errori distinti senza esporre chiavi', async () => {
    for (const status of [401, 403, 429]) {
      risposta = async () => errore(status);
      await assert.rejects(s.ai(s.impostazione('gemini', 'SEGRETO-DI-PROVA'), 'test'), e => {
        assert.doesNotMatch(e.message, /SEGRETO-DI-PROVA/);
        assert.match(e.message, status === 429 ? /quota o limite/ : /accesso negato/);
        return true;
      });
    }
    assert.equal(chiamate.length, 3);
  });
  await prova('AI: JSON invalido o risposta vuota non vengono applicati', async () => {
    risposta = async () => ok({ choices: [{ message: { content: 'un testo invece del JSON' } }] });
    await assert.rejects(s.ai(s.impostazione('groq', 'chiave-finta'), 'test'), /fuori formato/);
    risposta = async () => ok({ candidates: [] });
    await assert.rejects(s.ai(s.impostazione('gemini', 'chiave-finta'), 'test'), /risposta vuota/);
  });
  await prova('PlantNet: vera query per prefisso, paginata e con nomi e autore', async () => {
    risposta = async () => ok([
      { scientificNameWithoutAuthor: 'Fagus sylvatica', scientificNameAuthorship: 'L.', commonNames: ['Faggio'], gbifId: 2882316 },
      { scientificNameWithoutAuthor: 'Canis lupus', gbifId: 1 }, { datoInvalido: true }
    ]);
    const dati = await s.plantnetNome('Fagus', 'chiave-finta');
    assert.equal(dati.length, 1);
    assert.equal(dati[0].nomeCompleto, 'Fagus sylvatica L.');
    assert.equal(dati[0].gbifId, '2882316');
    const url = new URL(chiamate[0].url);
    assert.equal(url.pathname, '/v2/projects/k-world-flora/species');
    for (const [k, val] of Object.entries({ prefix: 'Fagus', page: '1', pageSize: '20', lang: 'it' })) assert.equal(url.searchParams.get(k), val);
    assert.equal(url.searchParams.has('images'), false, 'Nessuna funzione pro a pagamento richiesta');
  });
  await prova('PlantNet: chiave assente, quota e formato errato', async () => {
    await assert.rejects(s.plantnetNome('Fagus', ''), /chiave PlantNet/);
    assert.equal(chiamate.length, 0);
    risposta = async () => errore(429);
    await assert.rejects(s.plantnetNome('Fagus', 'SEGRETO-DI-PROVA'), e => /quota/.test(e.message) && !e.message.includes('SEGRETO'));
    risposta = async () => ok({ results: [] });
    await assert.rejects(s.plantnetNome('Fagus', 'chiave-finta'), /formato del catalogo/);
  });
  await prova('GBIF: piante soltanto; niente fuzzy o identificazione al solo genere', async () => {
    const dati = { kingdom: 'Plantae', matchType: 'EXACT', confidence: 98, rank: 'SPECIES', usageKey: 123 };
    assert.equal(s.gbifBotanico(dati), true);
    for (const modifica of [{ kingdom: 'Animalia' }, { kingdom: 'Fungi' }, { matchType: 'FUZZY' }, { confidence: 85 }, { rank: 'GENUS' }, { usageKey: 'URL-invalido' }])
      assert.equal(s.gbifBotanico({ ...dati, ...modifica }), false);
    assert.equal(s.gbifBotanico({ ...dati, rank: 'GENUS' }, true), true);
    assert.equal(s.gbifBotanico({ ...dati, rank: 'VARIETY' }), true);
  });
  await prova('Rete: scadenza controllata senza richieste in attesa infinita', async () => {
    risposta = (url, opzioni) => new Promise((resolve, reject) => opzioni.signal.addEventListener('abort', () => reject(new Error('abort')), { once: true }));
    await assert.rejects(s.json('https://example.invalid', {}, 10, 'PlantNet'), /PlantNet.*tempo di attesa scaduto/);
  });
  await prova('Creazione schede: nessun nome automatico; data odierna e bozze vuote', async () => {
    const app = ['app.js', 'js/guida.js', 'js/mappa.js', 'js/stampa-qr.js', 'js/backup.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
    const estrai = (nome, fine) => app.slice(app.indexOf(`function ${nome}(`), app.indexOf(fine, app.indexOf(`function ${nome}(`)));
    const c = vm.createContext({ S: { schede: [] }, CAMPI: [{ k: 'nome' }, { k: 'note' }, { k: 'prog' }, { k: 'data' }, { k: 'numeroZona' }, { k: 'numero' }],
      nuovoId: () => 'test', oraISO: () => '2026-10-02T12:00:00Z', oggi: () => '2026-10-02', calcolaNumeroZona: () => 1 });
    vm.runInContext(estrai('schedaVuota', '// Rende compatibile') + estrai('etichettaScheda', 'function schedeVisibili') + '\nglobalThis.r = schedaVuota();', c);
    assert.equal(c.r.nome, '');
    assert.equal(c.r.nomeScheda, undefined);
    assert.equal(c.r.data, '2026-10-02');
    assert.equal(c.r.bozzaVuota, true);
    assert.equal(vm.runInContext("etichettaScheda({prog:'1',nomeScheda:'Prova1',nome:'Fagus sylvatica'})", c), 'Fagus sylvatica');
    assert.equal(vm.runInContext("etichettaScheda({prog:'2',nomeScheda:'Prova2',nome:''})", c), 'Senza nome');
  });
  await prova('Flusso PlantNet: risultati dentro l’app, nessuna modifica prima della conferma', async () => {
    const f = flussoApplicazione();
    f.invia(async () => ok([{ scientificNameWithoutAuthor: 'Fagus sylvatica', scientificNameAuthorship: 'L.', commonNames: ['Faggio'], gbifId: 123 }]));
    await f.esegui('cercaPlantNetDaScheda()');
    assert.match(f.$('#auto-stato').textContent, /1 risultati nel catalogo PlantNet/);
    assert.match(f.$('#auto-risultati').textContent, /Faggio/);
    assert.equal(f.r.plantnetNome, undefined);
    const carta = f.$('#auto-risultati').figli[0];
    const link = carta.figli.find(n => n?.tipo === 'a');
    assert.match(link.href, /Fagus%20sylvatica%20L\./);
    carta.figli.find(n => n?.tipo === 'button').onclick();
    assert.equal(f.r.plantnetNome, 'Fagus sylvatica L.');
    assert.equal(f.r.persistenza, 'caduca');
  });
  await prova('Flusso PlantNet: nome comune risolto con Wikipedia e filtro botanico', async () => {
    const f = flussoApplicazione();
    f.$('#f-nome').value = 'faggio';
    f.invia(async url => url.includes('prefix=faggio') ? ok([]) : url.includes('projects/k-world-flora/species') ?
      ok([{ scientificNameWithoutAuthor: 'Fagus sylvatica', scientificNameAuthorship: 'L.' }]) :
      url.includes('list=search') ? ok({ query: { search: [{ title: 'Faggio' }] } }) :
      url.includes('prop=pageprops') ? ok({ query: { pages: { '1': { pageprops: { wikibase_item: 'Q1' } } } } }) :
      url.includes('EntityData') ? ok({ entities: { Q1: { claims: { P225: [{ mainsnak: { datavalue: { value: 'Fagus sylvatica' } } }] } } } }) :
      ok({ kingdom: 'Plantae', rank: 'SPECIES', matchType: 'EXACT', confidence: 98, usageKey: 123 }));
    await f.esegui('cercaPlantNetDaScheda()');
    assert.match(f.$('#auto-risultati').textContent, /Fagus sylvatica/);
    assert.ok(f.richieste.some(url => url.includes('prefix=Fagus%20sylvatica')));
  });
  await prova('Flusso PlantNet: offline o senza chiave non apre pagine generiche', async () => {
    const f = flussoApplicazione();
    f.senzaChiave();
    await f.esegui('cercaPlantNetDaScheda()');
    assert.match(f.$('#auto-stato').textContent, /Manca la chiave PlantNet/);
    assert.equal(f.richieste.length, 0);
    f.c.navigator.onLine = false;
    await f.esegui('cercaPlantNetDaScheda()');
    assert.match(f.$('#auto-stato').textContent, /Sei offline/);
  });
  await prova('Flusso GBIF: conserva le osservazioni; propone solo un taxon vegetale', async () => {
    const f = flussoApplicazione();
    f.invia(async () => ok({ kingdom: 'Plantae', rank: 'SPECIES', matchType: 'EXACT', confidence: 98, usageKey: 123, canonicalName: 'Fagus sylvatica' }));
    await f.esegui('cercaGbifDaScheda()');
    assert.match(f.$('#auto-stato').textContent, /Nome verificato/);
    assert.equal(f.r.gbifId, undefined);
    assert.equal(f.r.persistenza, 'caduca');
    assert.ok(f.richieste.every(url => url.includes('kingdom=Plantae')));
  });
  await prova('Flusso AI: filtra animali e non invia GPS o note personali', async () => {
    const f = flussoApplicazione();
    f.c.chiaviAI = { GOOGLE_API_KEY: 'chiave-finta' };
    f.invia(async (url, opzioni) => {
      if (url.includes('generativelanguage')) {
        assert.doesNotMatch(opzioni.body, /Nota personale|"gps"|"uid"|"lat"/);
        return gemini({ candidati: [{ nomeScientifico: 'Fagus sylvatica', percentuale: 84, motivazione: 'Compatibile' },
          { nomeScientifico: 'Canis lupus', percentuale: 99, motivazione: 'Errore simulato' }] });
      }
      return ok({ kingdom: url.includes('Canis') ? 'Animalia' : 'Plantae', rank: 'SPECIES', matchType: 'EXACT', confidence: 98, usageKey: 123, canonicalName: 'Fagus sylvatica' });
    });
    await f.esegui('cercaAIDaScheda()');
    assert.match(f.$('#auto-risultati').textContent, /AI Gemini: 84%/);
    assert.doesNotMatch(f.$('#auto-risultati').textContent, /Canis/);
    assert.equal(f.r.persistenza, 'caduca');
    assert.match(f.$('#auto-stato').textContent, /confermate come taxa vegetali/);
  });
  await prova('Flusso AI: verifica GBIF non disponibile distinta da nessuna pianta trovata', async () => {
    const f = flussoApplicazione();
    f.c.chiaviAI = { GOOGLE_API_KEY: 'chiave-finta' };
    f.invia(async url => url.includes('generativelanguage') ? gemini({ candidati: [{ nomeScientifico: 'Fagus sylvatica', percentuale: 80, motivazione: 'Compatibile' }] }) : errore(503));
    await f.esegui('cercaAIDaScheda()');
    assert.match(f.$('#auto-stato').textContent, /AI ha risposto, ma GBIF non è raggiungibile/);
    assert.equal(f.r.gbifId, undefined);
  });
  await prova('Ricerche chiuse: la risposta tardiva non riempie un altro modulo', async () => {
    const f = flussoApplicazione();
    let completa;
    f.invia(() => new Promise(resolve => { completa = resolve; }));
    const pendente = f.esegui('cercaPlantNetDaScheda()');
    f.$('#dlg-cerca-auto').close();
    completa(ok([{ scientificNameWithoutAuthor: 'Fagus sylvatica' }]));
    await pendente;
    assert.equal(f.$('#auto-risultati').figli.length, 0);
    assert.equal(f.r.plantnetNome, undefined);
  });
  await prova('Caratteristiche: azzera vecchie parole chiave non pertinenti', async () => {
    const f = flussoApplicazione();
    f.$('#gs-c-altro').value = 'vecchia ricerca';
    f.esegui('precompilaCaratteristicheDaScheda()');
    assert.equal(f.$('#gs-c-altro').value, '');
    assert.equal(f.$('#gs-c-persistenza').value, 'caduca');
  });
  await prova('Ricerca intelligente: un’AI in quota non nasconde guida e GBIF', async () => {
    const f = flussoApplicazione();
    f.c.chiaviAI = { GOOGLE_API_KEY: 'chiave-finta' };
    f.invia(async url => url.includes('generativelanguage') ? errore(429) : url.includes('list=search') ? ok({ query: { search: [] } }) :
      ok({ kingdom: 'Plantae', rank: 'SPECIES', matchType: 'EXACT', confidence: 98, usageKey: 123, canonicalName: 'Fagus sylvatica' }));
    await f.esegui('cercaAutoDaScheda()');
    assert.match(f.$('#auto-risultati').textContent, /Fagus sylvatica/);
    assert.match(f.$('#auto-stato').textContent, /quota o limite/);
    assert.match(f.$('#auto-stato').textContent, /altri risultati restano utilizzabili/);
    assert.equal(f.r.gbifId, undefined);
  });
  await prova('Foto PlantNet: invia foto e organo, con punteggio separato', async () => {
    const f = flussoApplicazione();
    f.invia(async (url, opzioni) => {
      assert.match(url, /\/v2\/identify\/all\?/);
      assert.equal(opzioni.method, 'POST');
      assert.equal(opzioni.body.get('organs'), 'auto');
      assert.ok(opzioni.body.get('images') instanceof Blob);
      return ok({ results: [{ score: .83, species: { scientificNameWithoutAuthor: 'Fagus sylvatica', scientificName: 'Fagus sylvatica L.' } }] });
    });
    const risultati = await f.esegui("fotoPlantNetAuto({id:'foto-test'})");
    assert.equal(risultati[0].percentuale, 83);
    assert.equal(risultati[0].nomeCompleto, 'Fagus sylvatica L.');
  });
  await prova('Foto PlantNet 404: nessuna pianta riconosciuta, non errore del modello AI', async () => {
    const f = flussoApplicazione();
    f.invia(async () => errore(404));
    await assert.rejects(f.esegui("fotoPlantNetAuto({id:'foto-test'})"), /PlantNet: nessuna pianta riconosciuta.*404/);
  });
  await prova('Completamento dalla guida: una dipendenza non cancella osservazioni esistenti', async () => {
    const app = ['app.js', 'js/guida.js', 'js/mappa.js', 'js/stampa-qr.js', 'js/backup.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
    const estrai = (inizio, fine) => app.slice(app.indexOf(inizio), app.indexOf(fine, app.indexOf(inizio)));
    const r = { tipoFoglia: '', lamina: 'ovata', margine: 'intero' };
    const c = vm.createContext({ r, GS_MAPPA_TIPOLOGIA: {}, GS_CAMPO_GUIDA: { tipoFoglia: 'fogliaTipo', lamina: 'fogliaLamina', margine: 'fogliaMargine' },
      DIPENDENZE_CAMPI: [{ se: 'tipoFoglia', valore: 'aghiforme', nascondi: ['lamina', 'margine'] }],
      CAMPI: [{ k: 'tipoFoglia', label: 'Tipo di foglia', tipo: 'illustrata', valori: ['aghiforme'] },
        { k: 'lamina', label: 'Lamina', tipo: 'illustrata', valori: ['ovata'] }, { k: 'margine', label: 'Margine', tipo: 'illustrata', valori: ['intero'] }],
      aggiornaBottoneIllustrato() {}, $: () => null });
    const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');
    vm.runInContext(config.slice(config.indexOf('function dipendenzaAttiva('), config.indexOf('function campoPertinente(')), c);
    vm.runInContext(estrai('function conflittiConGuida(', 'function mostraConflittiNome(') +
      estrai('function compilaCampiDaGuidaSpecie(', '/* =====================================================================\n   7f.'), c);
    c.specie = { fogliaTipo: 'aghiforme' };
    const conflitti = vm.runInContext('conflittiConGuida(r, specie)', c);
    assert.match(conflitti.join(' '), /non applicato.*Lamina, Margine/);
    vm.runInContext('compilaCampiDaGuidaSpecie(r, specie)', c);
    assert.equal(r.tipoFoglia, '');
    assert.equal(r.lamina, 'ovata');
    assert.equal(r.margine, 'intero');
    // Regola «tranne»: la foglia composta si compila solo quando il tipo è «composta».
    c.DIPENDENZE_CAMPI.push({ se: 'tipoFoglia', tranne: 'composta', nascondi: ['fogliaComposta'] });
    c.GS_CAMPO_GUIDA.fogliaComposta = 'fogliaComposta';
    c.CAMPI.push({ k: 'fogliaComposta', label: 'Foglia composta', tipo: 'illustrata', valori: ['imparipennata'] });
    c.CAMPI[0].valori.push('composta');
    c.r2 = { tipoFoglia: '' };
    c.specie = { fogliaTipo: 'composta', fogliaComposta: 'imparipennata' };
    vm.runInContext('compilaCampiDaGuidaSpecie(r2, specie)', c);
    assert.equal(c.r2.tipoFoglia, 'composta');
    assert.equal(c.r2.fogliaComposta, 'imparipennata');
    c.r3 = { tipoFoglia: 'semplice' };
    vm.runInContext('compilaCampiDaGuidaSpecie(r3, { fogliaComposta: "imparipennata" })', c);
    assert.equal(c.r3.fogliaComposta, undefined);
  });
  console.log(`${totale} gruppi di test di ricerca superati. Nessun servizio esterno contattato.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
