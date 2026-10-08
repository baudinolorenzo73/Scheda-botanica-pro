// Pagina «Chiave delle Pinaceae»: percorso della chiave, schede, ripasso, schema, link dal menu e cache offline.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errori = [], falliti = [];
  page.on('pageerror', e => errori.push(e.message));
  page.on('response', r => { if (r.url().startsWith('http://127.0.0.1') && r.status() >= 400) falliti.push(r.url()); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // Ogni risposta della chiave porta al genere previsto
    const percorsi = { Abies: ['sol', 'ventosa'], Picea: ['sol', 'pulvino'], Pinus: ['ciu'], Cedrus: ['maz', 'sempre'], Larix: ['maz', 'caduco'], Tsuga: ['sol', 'picciolo', 'piccola'], Pseudotsuga: ['sol', 'picciolo', 'tridente'] };
    for (const [genere, scelte] of Object.entries(percorsi)) {
      await page.goto(base + '/pinaceae.html');
      for (const o of scelte) await page.click(`[data-act="choose"][data-o="${o}"]`);
      assert.equal((await page.locator('.genus-head h2').innerText()).trim(), genere);
      assert.ok(await page.locator('.ill svg').count() >= 4, 'illustrazioni mancanti per ' + genere);
    }
    // Slide del corso: ogni numero esiste nella cartella slides/ e corrisponde a una specie Pinaceae del catalogo
    const guida = JSON.parse(JSON.stringify(require('node:vm').runInNewContext(fs.readFileSync(path.join(root, 'data/guida-specie.js'), 'utf8') + ';GUIDA_SPECIE')));
    await page.goto(base + '/pinaceae.html');
    const slide = await page.evaluate(() => SLIDES);
    const attese = guida.filter(v => v.famiglia === 'Pinaceae').map(v => v.pagina).sort((x, y) => x - y);
    const trovate = Object.values(slide).flat().map(([n]) => n).sort((x, y) => x - y);
    assert.deepEqual(trovate, attese, 'le slide collegate non coincidono con le Pinaceae del catalogo');
    for (const [genere, lista] of Object.entries(slide)) for (const [n, nome] of lista) {
      assert.ok(fs.existsSync(path.join(root, 'slides', n + '.webp')), 'slide mancante ' + n);
      assert.ok(guida.find(v => v.pagina === n).nomeSci.split(' ')[0] === genere, `slide ${n} (${nome}) non è di ${genere}`);
    }
    await page.click('nav.tabs [data-view="generi"]');
    await page.click('.gen:has-text("Cedrus")');
    assert.equal(await page.locator('.slide-th').count(), 6);
    await page.locator('.slide-th').nth(2).click();
    await page.waitForFunction(() => { const i = document.getElementById('slideImg'); return i.complete && i.naturalWidth === 900; });
    assert.ok(/172\.webp$/.test(await page.locator('#slideImg').getAttribute('src')));
    await page.click('#slideNext');
    assert.ok(/173\.webp$/.test(await page.locator('#slideImg').getAttribute('src')));
    await page.click('#closeSlide');
    await page.click('[data-act="closeGenus"]');
    await page.click('.gen:has-text("Tsuga")');
    assert.equal(await page.locator('.slide-th').count(), 0);
    console.log('OK Slide del corso collegate ai generi (18 slide, viewer con avanti/indietro)');
    console.log('OK Chiave: 7 percorsi → 7 generi, con illustrazioni');
    // Schema del corso: l'immagine esterna si carica
    await page.goto(base + '/pinaceae.html');
    await page.click('[data-act="schema"]');
    await page.waitForFunction(() => { const i = document.getElementById('schemaImg'); return i.complete && i.naturalWidth === 1448; });
    console.log('OK Schema del corso caricato (1448 px)');
    await page.click('#closeDlg');
    // Generi, ripasso, glossario
    await page.click('nav.tabs [data-view="generi"]');
    assert.equal(await page.locator('.gen').count(), 7);
    await page.click('nav.tabs [data-view="ripasso"]');
    assert.equal(await page.locator('.ans').count(), 7);
    await page.locator('.ans').first().click();
    await page.waitForSelector('.feedback');
    await page.click('nav.tabs [data-view="glossario"]');
    assert.equal(await page.locator('details').count(), 9);
    assert.equal(await page.locator('.fix li').count(), 8);
    console.log('OK Generi, ripasso e glossario');
    // Il ripasso copre tutti i generi e ogni indizio ha una risposta valida
    const ok = await page.evaluate(() => CLUES.every(([g]) => GENERA[g]) && Object.keys(GENERA).every(g => KEY && ILL(g)));
    assert.ok(ok);
    // Link e Stampa nella sezione «Sul campo» della prima pagina, visibili senza aprire le Opzioni
    await page.goto(base + '/index.html');
    assert.equal(await page.locator('.azioni-home #link-pinaceae').getAttribute('href'), 'pinaceae.html');
    assert.ok(await page.locator('.azioni-home > .azioni-home-extra #btn-stampa').isVisible());
    assert.ok(await page.locator('.azioni-home > .azioni-home-extra #link-pinaceae').isVisible());
    assert.equal(await page.locator('#dlg-menu #link-pinaceae, #opzioni-home #btn-stampa').count(), 0);
    // Cache offline: la pagina e lo schema sono nell'app shell
    const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
    assert.ok(sw.includes("'./pinaceae.html'") && sw.includes("'./img/pinaceae-schema.jpg'"));
    assert.deepEqual(errori, [], 'errori JS: ' + errori.join('; '));
    assert.deepEqual(falliti, [], 'risorse non trovate: ' + falliti.join(', '));
    // Dal catalogo alla chiave: link nella pagina della specie e apertura diretta del genere
    const link = await page.evaluate(() => {
      const v = GUIDA_SPECIE.find(x => x.nomeSci === 'Larix decidua');
      const a = linkChiavePinaceae(v);
      return { href: a && a.getAttribute('href'), altra: linkChiavePinaceae(GUIDA_SPECIE.find(x => x.famiglia !== 'Pinaceae')) };
    });
    assert.equal(link.href, 'pinaceae.html#genere=Larix');
    assert.equal(link.altra, null);
    await page.goto(base + '/pinaceae.html#genere=Cedrus');
    assert.equal((await page.locator('.genus-head h2').innerText()).trim(), 'Cedrus');
    assert.equal(await page.locator('.slide-th').count(), 6);
    await page.goto('about:blank');
    await page.goto(base + '/pinaceae.html#genere=Inesistente');
    assert.ok(await page.locator('.opts').count() > 0, 'un genere sconosciuto deve aprire la chiave');
    console.log('OK Collegamento dal catalogo al genere');
    console.log('OK Link e Stampa in prima pagina, cache offline, nessun errore');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FALLITO', e); process.exit(1); });
