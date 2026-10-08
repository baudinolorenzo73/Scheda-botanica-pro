// Configurazione a gruppi e Aiuto con indice e ricerca (3.44).
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
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/https:\/\//, r => r.abort());
  const page = await ctx.newPage();
  const errori = [];
  page.on('pageerror', e => errori.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(base);
    await page.waitForFunction(() => typeof DB !== 'undefined' && DB.db);
    await page.evaluate(() => localStorage.setItem('sb-backup-auto', '0'));
    // Configurazione: 6 gruppi, di base aperto solo Backup; lo stato viene ricordato
    await page.evaluate(() => document.querySelector('#btn-menu').click());
    const gruppi = await page.$$eval('#dlg-menu .menu-gruppo', g => g.map(x => [x.id, x.open]));
    assert.deepEqual(gruppi.map(g => g[0]), ['mg-backup', 'mg-dati', 'mg-schermo', 'mg-catalogo', 'mg-ai', 'mg-manutenzione']);
    assert.deepEqual(gruppi.filter(g => g[1]).map(g => g[0]), ['mg-backup']);
    assert.ok(await page.locator('[data-az="zip"]').isVisible());
    assert.ok(!(await page.locator('[data-az="csv"]').isVisible()));
    await page.click('#mg-dati > summary');
    assert.ok(await page.locator('[data-az="csv"]').isVisible());
    await page.waitForFunction(() => (localStorage.getItem('sb-menu-gruppi') || '').includes('mg-dati'));
    await page.click('#dlg-menu [data-az="chiudi"]');
    await page.evaluate(() => document.querySelector('#btn-menu').click());
    assert.ok(await page.locator('[data-az="csv"]').isVisible(), 'il gruppo aperto va ricordato');
    await page.click('#dlg-menu [data-az="chiudi"]');
    // Il numero di versione apre il gruppo degli aggiornamenti
    await page.click('#btn-versione');
    assert.ok(await page.locator('#btn-controlla-aggiornamenti').isVisible());
    await page.click('#dlg-menu [data-az="chiudi"]');
    console.log('OK Configurazione a gruppi');
    // Aiuto: pulsante in testata, indice, ricerca senza accenti
    assert.ok(await page.locator('header #btn-aiuto-testa').isVisible());
    await page.click('#btn-aiuto-testa');
    assert.ok(await page.locator('#dlg-aiuto').evaluate(d => d.open));
    assert.match(await page.locator('#aiuto-versione').textContent(), /\d+\.\d+\.\d+/);
    assert.ok(await page.locator('details[data-sez="progetto"]').evaluate(d => d.open));
    const sezioni = await page.$$eval('#dlg-aiuto .aiuto-sez', d => d.map(x => x.dataset.sez));
    const indice = await page.$$eval('#dlg-aiuto [data-vai]', b => b.map(x => x.dataset.vai));
    assert.deepEqual(indice, sezioni, 'ogni voce dell’indice deve avere la sua sezione');
    await page.click('[data-vai="backup"]');
    assert.ok(await page.locator('details[data-sez="backup"]').evaluate(d => d.open));
    await page.fill('#aiuto-cerca', 'QUALITA ZIP');   // nessuna sezione contiene entrambe
    assert.ok(await page.locator('#aiuto-nessuno').isVisible());
    await page.fill('#aiuto-cerca', 'traccia gpx');
    const visibili = await page.$$eval('#dlg-aiuto .aiuto-sez:not(.nascosto)', d => d.map(x => x.dataset.sez));
    assert.ok(visibili.includes('mappa') && !visibili.includes('pinaceae'), visibili.join());
    await page.fill('#aiuto-cerca', 'piu precisa');   // senza accento trova «più precisa»
    assert.ok(await page.$$eval('#dlg-aiuto .aiuto-sez:not(.nascosto)', d => d.length) > 0);
    await page.fill('#aiuto-cerca', '');
    assert.equal(await page.$$eval('#dlg-aiuto .aiuto-sez.nascosto', d => d.length), 0);
    await page.click('#aiuto-x');
    assert.ok(!(await page.locator('#dlg-aiuto').evaluate(d => d.open)));
    console.log('OK Aiuto: pulsante, indice e ricerca');
    assert.ok(fs.existsSync(path.join(root, 'manuali/manuale-utente.pdf')), 'manuale PDF mancante');
    assert.deepEqual(errori, [], errori.join('; '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FALLITO', e); process.exit(1); });
