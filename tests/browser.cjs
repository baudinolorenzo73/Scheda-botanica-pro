// npm install && npx playwright install chromium && npm test
// Opzionale: CHROMIUM_PATH=/percorso/chromium per usare un browser già installato.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const results = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox','--disable-dev-shm-usage'], headless: true });
  const context = await browser.newContext({viewport:{width:390,height:844}, reducedMotion:'reduce'});
  const page = await context.newPage();
  const errors = [], failed = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().startsWith('http://127.0.0.1') && r.status() >= 400) failed.push(r.url()); });
  page.on('dialog', d => d.dismiss());
  // Non si inviano nomi o foto di prova a servizi esterni.
  await context.route(/https:\/\//, r => r.abort());
  const base = `http://127.0.0.1:${server.address().port}`;
  const test = async (nome, fn) => { await fn(); results.push(nome); console.log('OK', nome); };
  try {
    await page.goto(base);
    await page.waitForFunction(() => DB.db && document.querySelector('#elenco').children.length > 0);
    await page.evaluate(() => localStorage.setItem('sb-backup-auto','0'));
    await test('Avvio e librerie locali', async()=>{
      assert.equal(await page.evaluate(()=>typeof XlsxPopulate.fromBlankAsync), 'function');
      assert.equal(await page.evaluate(()=>typeof JSZip), 'function');
      assert.deepEqual(failed, []);
    });
    await test('Scheda: misura decimale libera e persistenza al ricaricamento',async()=>{
      await page.click('#btn-nuova');await page.fill('#f-nome','Quercus robur');await page.fill('#f-altezza','12.3');
      assert.equal(await page.locator('#f-altezza').evaluate(e=>e.checkValidity()),true);
      await page.click('#btn-chiudi'); await page.waitForFunction(()=>S.aperta===null);
      await page.reload(); await page.waitForFunction(()=>S.schede.length===1);
      assert.equal(await page.evaluate(()=>S.schede[0].altezza),'12.3');
    });
    await test('Normalizzazione coordinate, date Excel e scelte',async()=>{
      assert.deepEqual(await page.evaluate(()=>[
        normalizza({gps:{lat:null,lng:''}}).record.gps,
        normalizza({gps:{lat:0,lng:0}}).record.gps.lat,
        normalizzaData('23/09/2026'),normalizzaData(46288),normalizzaData('31/02/2026'),
        normalizza({grandezza:'1ª grandezza (maggiore)'}).record.grandezza,mmss(59.8)
      ]),[null,0,'2026-09-23','2026-09-23','','1','1:00']);
    });
    await test('Errore sincrono durante ripristino: rollback completo',async()=>{
      assert.equal(await page.evaluate(async()=>{
        const prima = JSON.stringify(await DB.tutte('schede'));
        let fallito=false;
        try {await DB.sostituisciArchivio({schede:[{nome:'senza chiave'}],foto:[],audio:[],specie:[],traccia:[]});} catch {fallito=true;}
        return fallito && prima===JSON.stringify(await DB.tutte('schede'));
      }),true);
    });
    await test('Backup incompleto e traccia malformata rifiutati senza cancellazioni',async()=>{
      assert.equal(await page.evaluate(async()=>{
        const prima=JSON.stringify(await DB.tutte('schede'));
        for(const dato of [
          {app:'scheda-botanica',schede:[{uid:'incompleta',foto:[{id:'mancante'}]}]},
          {app:'scheda-botanica',schede:[],traccia:[{lat:null,lng:0,quando:new Date().toISOString()}]}
        ]) {let fallito=false;try{await importaDati(leggiFormatoBackup(dato),'sostituisci');}catch{fallito=true;}if(!fallito)return false;}
        return prima===JSON.stringify(await DB.tutte('schede'));
      }),true);
    });
    await test('Unione atomica con foto e separazione ID media',async()=>{
      assert.equal(await page.evaluate(async()=>{
        const v=leggiFormatoBackup({app:'scheda-botanica',schede:[{uid:'importata',nome:'Fagus sylvatica',foto:[{id:'foto_importata'}]}],foto:{foto_importata:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII='}});
        await importaDati(v,'unisci');document.querySelectorAll('dialog[open]').forEach(d=>d.close());
        const r=await DB.leggi('schede','importata');return S.schede.length===2 && r.foto[0].id!=='foto_importata' && (await DB.leggi('foto',r.foto[0].id)).size>0;
      }),true);
    });
    await test('Esportazione Excel con contenuto rileggibile',async()=>{
      const download=page.waitForEvent('download');
      await page.evaluate(()=>esportaRegistroExcel(S.schede,new Set()));
      const file=await download; const bytes=fs.readFileSync(await file.path());
      assert(bytes.length>1000);assert.equal(bytes.slice(0,2).toString(),'PK');
      assert.equal(await page.evaluate(async(b)=>{const book=XLSX.read(new Uint8Array(b),{type:'array'});return book.Sheets[book.SheetNames[0]].B6.v;},[...bytes]),'Quercus robur');
    });
    await test('Backup ZIP: andata e ritorno con foto',async()=>{
      const download=page.waitForEvent('download');assert.equal(await page.evaluate(()=>esportaZIP()),true);
      const bytes=fs.readFileSync(await (await download).path());
      assert.equal(await page.evaluate(async(b)=>{const v=await leggiBackupZip(new Blob([new Uint8Array(b)]));await importaDati(v,'sostituisci');document.querySelectorAll('dialog[open]').forEach(d=>d.close());return (await DB.tutte('schede')).length===2 && v[1].fotoDaSalvare[0].blob.size>0;},[...bytes]),true);
    });
    await test('Ricerca, selezione da tastiera e cestino',async()=>{
      await page.fill('#cerca','Quercus');await page.waitForFunction(()=>document.querySelectorAll('#elenco .voce').length===1);
      const box=page.locator('#elenco input[type=checkbox]').first();await box.focus();await page.keyboard.press('Space');
      assert.equal(await page.evaluate(()=>S.aperta===null && S.selezionate.size===1),true);
      await page.fill('#cerca','');await page.evaluate(async()=>{const r=S.schede[0];await spostaNelCestino(r);await ripristinaDalCestino(r);});
      assert.equal(await page.evaluate(()=>S.cestino.length),0);
    });
    await test('Interfaccia senza overflow a 320, 390, 768 e 1440 px',async()=>{
      for(const width of [320,390,768,1440]){
        await page.setViewportSize({width,height:900});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Elenco ${width}`);
        await page.evaluate(()=>apriEditor(S.schede[0].uid));
        assert.equal(await page.evaluate(()=>document.querySelector('#editor').scrollWidth<=innerWidth),true,`Editor ${width}`);
        await page.evaluate(()=>chiudiEditor());await page.waitForTimeout(50);
      }
    });
    await test('Pulsanti mobili: navigazione, filtri, menu, stampa e nuova scheda',async()=>{
      await page.setViewportSize({width:390,height:844});
      const targets=await page.evaluate(()=>['#tab-schede','#tab-mappa','#btn-nuova','#btn-menu','#btn-filtri-avanzati'].map(sel=>{
        const box=document.querySelector(sel).getBoundingClientRect();return [sel,box.width,box.height];
      }));
      for(const [sel,width,height] of targets) assert(width>=44&&height>=44,sel);
      await page.click('#btn-filtri-avanzati');
      assert.equal(await page.locator('#pannello-filtri').isVisible(),true);
      assert.equal(await page.locator('#btn-filtri-avanzati').getAttribute('aria-expanded'),'true');
      await page.click('#btn-filtri-avanzati');
      await page.click('#btn-menu');
      assert.equal(await page.locator('#dlg-menu').evaluate(el=>el.open),true);
      await page.locator('#dlg-menu [data-az=chiudi]').click();
      await page.click('#btn-stampa');
      assert.equal(await page.locator('#dlg-stampa').evaluate(el=>el.open),true);
      await page.keyboard.press('Escape');
      await page.click('#tab-mappa');
      assert.equal(await page.locator('#tab-mappa').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#btn-nuova').isVisible(),true);
      await page.click('#btn-nuova');
      await page.waitForFunction(()=>S.vista==='schede'&&!!S.aperta);
      await page.click('#btn-chiudi');
      await page.click('#btn-tema');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.tema==='scuro'),true);
      await page.click('#btn-tema');
    });
    await test('Errore di salvataggio: editor resta aperto e recuperabile',async()=>{
      await page.evaluate(()=>apriEditor(S.schede[0].uid));
      assert.equal(await page.evaluate(async()=>{const prima=DB.scrivi;DB.scrivi=async()=>{throw new Error('Quota simulata');};await chiudiEditor();const aperta=!!S.aperta;DB.scrivi=prima;await chiudiEditor();return aperta&&!S.aperta;}),true);
    });
    await test('Riapertura offline con librerie disponibili',async()=>{
      await page.evaluate(()=>navigator.serviceWorker.ready);
      if(!await page.evaluate(()=>!!navigator.serviceWorker.controller)) await page.reload();
      await page.waitForFunction(()=>navigator.serviceWorker.controller);
      const n=await page.evaluate(()=>S.schede.length);
      await context.setOffline(true);await page.reload();await page.waitForFunction((atteso)=>S.schede.length===atteso,n);
      assert.equal(await page.evaluate(()=>typeof XlsxPopulate.fromBlankAsync),'function');
      assert.equal(await page.locator('#stato-rete').textContent().then(s=>s.includes('offline')),true);
      await context.setOffline(false);
    });
    // Anteprime finali con dati fittizi esclusivamente nella sessione di test.
    if(process.env.SCREENSHOT_DIR){
      fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
      await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'mobile.png'),animations:'disabled',fullPage:true});
      await page.evaluate(()=>apriEditor(S.schede.find(s=>s.nome==='Quercus robur').uid));await page.evaluate(()=>document.querySelector('#editor').scrollTop=0);
      await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'editor.png'),animations:'disabled'});
      await page.evaluate(()=>chiudiEditor());await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'desktop.png'),animations:'disabled',fullPage:true});
      await page.click('#btn-tema');await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'scuro.png'),animations:'disabled',fullPage:true});
    }
    assert.deepEqual(errors,[],'Eccezioni JavaScript');assert.deepEqual(failed,[],'Risorse locali mancanti');
    console.log(`\n${results.length} verifiche superate. Nessuna eccezione JavaScript, nessuna risorsa locale mancante.`);
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
