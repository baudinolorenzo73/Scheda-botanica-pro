const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const versione = JSON.parse(fs.readFileSync(path.join(root, 'versione.json'), 'utf8')).versione;
const parti = versione.split('.').map(Number); parti[parti.length - 1]++;
const versioneNuova = parti.join('.');
let nuovo = false;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    res.setHeader('Content-Type', ({'.js':'application/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.webp':'image/webp','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    let bytes = fs.readFileSync(file);
    if (nuovo && pathname === '/versione.json') bytes = Buffer.from(JSON.stringify({versione:versioneNuova}));
    if (nuovo && pathname === '/service-worker.js') bytes = Buffer.from(String(bytes).replace(/scheda-botanica-app-v(\d+)-/, (_, v) => `scheda-botanica-app-v${Number(v)+1}-`));
    if (nuovo && pathname === '/js/config.js') bytes = Buffer.from(String(bytes).replace(`APP_VERSIONE = '${versione}'`, `APP_VERSIONE = '${versioneNuova}'`));
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox','--disable-dev-shm-usage'], headless:true });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function nuovoContesto() {
    const context = await browser.newContext({ acceptDownloads:true });
    await context.route(/https:\/\//, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto(base);
    await page.waitForFunction(() => DB.db);
    await page.evaluate(() => localStorage.setItem('sb-backup-auto','0'));
    return { context, page, errors };
  }
  try {
    {
      const { context, page, errors } = await nuovoContesto();
      page.on('dialog', d => d.dismiss());
      await page.click('#btn-nuova'); await page.waitForFunction(()=>S.aperta!==null);
      await page.fill('#f-nome','Quercus robur');
      await page.evaluate(() => {
        Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{throw Error('permesso negato simulato');}}});
        window.MediaRecorder = class {};
      });
      const negato=page.waitForEvent('dialog');
      await page.click('#ar-audio');
      assert.match((await negato).message(),/permesso negato simulato/);
      await page.waitForFunction(() => !REG.inAttesa);
      assert.equal(await page.evaluate(() => S.aperta.audio.length),0);
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){}}]});
        window.MediaRecorder=class {
          static isTypeSupported(m){return m==='audio/webm';}
          constructor(stream,options){this.mimeType=options?.mimeType||'audio/webm';}
          start(){}
          stop(){this.ondataavailable({data:new Blob(['nota di prova'],{type:this.mimeType})});this.onstop();}
        };
      });
      await page.click('#ar-audio');
      await page.waitForFunction(() => REG.attiva);
      await page.click('#ar-audio');
      await page.waitForFunction(async()=>{
        const audio=S.aperta?.audio[0];
        return !REG.attiva && !!audio && !!(await DB.leggi('audio',audio.id));
      });
      await page.click('#btn-chiudi');
      await page.waitForFunction(() => S.aperta===null);
      const dl=page.waitForEvent('download');
      assert.equal(await page.evaluate(() => esportaZIP()),true);
      const bytes=fs.readFileSync(await (await dl).path());
      assert.equal(await page.evaluate(async data=>{
        const rows=await leggiBackupZip(new Blob([new Uint8Array(data)]));
        return rows.some(r=>r.record.nome==='Quercus robur' && r.audioDaSalvare?.[0]?.blob.size>0);
      },[...bytes]),true);
      assert.deepEqual(errors,[]);
      await context.close();
      console.log('OK Audio: permesso negato, registrazione e backup');
    }
    {
      const { context, page, errors } = await nuovoContesto();
      await page.click('#btn-nuova'); await page.waitForFunction(()=>S.aperta!==null);
      await page.fill('#f-nome','Fagus sylvatica');
      await page.click('#btn-chiudi');
      await page.waitForFunction(() => S.aperta===null);
      await page.evaluate(() => navigator.serviceWorker.ready);
      if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller && DB.db);
      nuovo=true;
      // Dalla 3.27.0 l'app chiede conferma prima di scaricare l'aggiornamento.
      page.once('dialog', d => d.type() === 'confirm' ? d.accept() : d.dismiss());
      await page.evaluate(() => verificaAggiornamenti(true));
      await page.waitForFunction(() => !document.querySelector('#btn-applica-aggiornamento').classList.contains('nascosto'));
      await page.evaluate(()=>{
        apriCompletaGuida();
        apriPiantaCatalogo(GUIDA_SPECIE[0].id);
        const campo=document.querySelector('#cg-form [name="fiore"]');
        campo.value='Nota da conservare';
        campo.dispatchEvent(new Event('input',{bubbles:true}));
      });
      await page.evaluate(()=>applicaAggiornamento());
      assert.match(await page.locator('#aggiornamento-stato').textContent(),/Salva o annulla le integrazioni/);
      assert.equal(await page.locator('#cg-form [name="fiore"]').inputValue(),'Nota da conservare');
      // Simula l'abbandono confermato delle integrazioni: l'editor chiuso
      // non deve impedire l'aggiornamento anche se conserva i campi nel DOM.
      await page.evaluate(()=>{cgSporco=false;document.querySelector('#dlg-completa-guida').close();});
      const caricamento=page.waitForEvent('load');
      await page.evaluate(() => applicaAggiornamento());
      await caricamento;
      await page.waitForFunction(v => DB.db && APP_VERSIONE===v,versioneNuova);
      assert.equal(await page.evaluate(() => S.schede.some(r=>r.nome==='Fagus sylvatica')),true);
      await context.setOffline(true);
      await page.reload();
      await page.waitForFunction(() => DB.db && S.schede.some(r=>r.nome==='Fagus sylvatica'));
      assert.equal(await page.evaluate(() => APP_VERSIONE),versioneNuova);
      assert.deepEqual(errors,[]);
      await context.close();
      console.log('OK Aggiornamento PWA: scheda conservata offline');
    }
  } finally {await browser.close();server.close();}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
