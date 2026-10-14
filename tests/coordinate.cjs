// Formati delle coordinate in stampa e nel registro Excel (3.48).
// I valori UTM di riferimento vengono da PROJ (pyproj, EPSG:326xx/327xx).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

// ---------- 1. Conversioni, in Node ----------
const utils = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(utils.slice(utils.indexOf('const FORMATI_COORDINATE')) + '\nglobalThis.T = { utmDaLatLng, testoCoordinate, gradiSessagesimali, formatoCoordinateValido };', ctx);
const T = ctx.T;
const riferimenti = [
  // lat, lng, zona, est, nord (PROJ)
  [45.0532, 7.6868, '32T', 396595.6, 4989699.0], // Torino
  [41.9028, 12.4964, '33T', 292335.3, 4642015.5], // Roma
  [37.5, 15.09, '33S', 507955.1, 4150345.1], // Catania
  [46.5, 11.35, '32T', 680317.4, 5152286.4], // Bolzano
  [-33.86, 151.2, '56H', 333491.2, 6251909.2], // emisfero sud
];
for (const [lat, lng, zona, est, nord] of riferimenti) {
  const u = T.utmDaLatLng(lat, lng);
  assert.equal(`${u.zona}${u.banda}`, zona);
  assert.ok(Math.abs(u.est - est) < 0.5 && Math.abs(u.nord - nord) < 0.5, `${lat},${lng}: ${u.est} ${u.nord}`);
}
assert.equal(T.utmDaLatLng(60, 5).zona, 32, 'eccezione della Norvegia');
assert.equal(T.utmDaLatLng(85, 5), null, 'oltre 84° N l’UTM non si usa');
const g = { lat: 45.0532, lng: 7.6868 };
assert.equal(T.testoCoordinate(g, 'dec'), '45.053200, 7.686800');
assert.equal(T.testoCoordinate(g, 'gms'), '45°03′11.5″ N  7°41′12.5″ E');
assert.equal(T.testoCoordinate(g, 'gm'), '45°03.192′ N  7°41.208′ E');
assert.equal(T.testoCoordinate(g, 'utm'), 'UTM 32T 396596 E  4989699 N (WGS84)');
assert.equal(T.testoCoordinate(g, 'no'), '');
assert.equal(T.testoCoordinate(null, 'dec'), '');
assert.equal(T.testoCoordinate(g, 'sconosciuto'), '45.053200, 7.686800', 'formato non valido → gradi decimali');
assert.equal(T.testoCoordinate({ lat: -33.86, lng: -70.65 }, 'gms'), '33°51′36.0″ S  70°39′00.0″ O');
assert.equal(T.gradiSessagesimali(45.99999999, 'N', 'S'), '46°00′00.0″ N', 'mai 60″ per arrotondamento');
assert.equal(T.gradiSessagesimali(7.9999999, 'E', 'O', false), '8°00.000′ E', 'mai 60′ per arrotondamento');
console.log('OK Conversioni: UTM entro mezzo metro da PROJ, gradi sessagesimali senza 60″');

// ---------- 2. Nel browser: finestra Stampa, scheda A4, QR ed Excel ----------
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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
  await context.route(/https:\/\//, route => route.abort());
  const page = await context.newPage();
  const errori = [];
  page.on('pageerror', e => errori.push(e.message));
  page.on('dialog', d => d.accept());
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(base);
    await page.waitForFunction(() => typeof DB !== 'undefined' && DB.db && typeof S !== 'undefined');
    await page.evaluate(async () => {
      localStorage.setItem('sb-backup-auto', '0');
      const r = schedaVuota(); r.nome = 'Quercus robur'; r.bozzaVuota = false;
      r.gps = { lat: 45.0532, lng: 7.6868, acc: 4, alt: 270, quotaTerreno: 241, quando: new Date().toISOString(), online: true };
      const s = schedaVuota(); s.nome = 'Tilia cordata'; s.bozzaVuota = false;
      S.schede.push(r, s); await salvaOra(r); await salvaOra(s); disegnaElenco();
      window.print = () => { window.__stampe = (window.__stampe || 0) + 1; };
      const originale = testoQR; window.__qr = [];
      testoQR = (...a) => { const t = originale(...a); window.__qr.push(t); return t; };
    });
    const stampa = async (formato, tipo = 'schede') => {
      await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); S.selezionate.clear(); window.__stampe = 0; window.__qr = []; window.__st = apriStampa(); });
      await page.waitForSelector('#dlg-stampa[open]');
      await page.check('#dlg-stampa input[value=tutte]');
      await page.check(`#dlg-stampa input[name=st-tipo][value=${tipo}]`);
      if (formato) await page.selectOption('#st-coord', formato);
      await page.uncheck('#st-foto').catch(() => {});
      await page.click('#st-btn-conferma');
      await page.waitForFunction(() => window.__stampe === 1, null, { timeout: 15000 });
    };
    // Predefinito: gradi decimali, come prima della 3.48
    await stampa(null);
    assert.equal(await page.inputValue('#st-coord'), 'dec');
    assert.match(await page.locator('#stampa .p-scheda').first().textContent(), /GPS 45\.053200, 7\.686800 \(±4 m\) – 241 m s\.l\.m\. \(terreno\)/);
    assert.match(await page.locator('#stampa .p-scheda').nth(1).textContent(), /GPS non rilevato/);
    // UTM
    await stampa('utm');
    assert.match(await page.locator('#stampa .p-scheda .p-gps').first().textContent(), /^UTM 32T 396596 E {2}4989699 N \(WGS84\) \(±4 m\)/);
    // La scelta resta per la stampa successiva
    await page.evaluate(() => { window.__st = apriStampa(); });
    await page.waitForSelector('#dlg-stampa[open]');
    assert.equal(await page.inputValue('#st-coord'), 'utm');
    await page.click('#dlg-stampa button[value=annulla]');
    // Gradi, minuti, secondi
    await stampa('gms');
    assert.match(await page.locator('#stampa .p-gps').first().textContent(), /GPS 45°03′11\.5″ N {2}7°41′12\.5″ E/);
    console.log('OK Stampa A4: gradi decimali, UTM e gradi-minuti-secondi; scelta ricordata');
    // Non stampare: nessuna riga GPS e QR senza posizione
    await stampa('no');
    assert.equal(await page.locator('#stampa .p-gps').count(), 0);
    assert.doesNotMatch(await page.locator('#stampa').textContent(), /45\.05|GPS/);
    const qrNo = await page.evaluate(() => window.__qr);
    assert.ok(qrNo.length >= 2 && qrNo.every(t => t.endsWith('|no-gps')));
    await stampa('no', 'etichette');
    const qrEt = await page.evaluate(() => window.__qr);
    assert.ok(qrEt.length >= 2 && qrEt.every(t => t.endsWith('|no-gps')), 'anche le etichette QR');
    await stampa('dec', 'etichette');
    assert.ok((await page.evaluate(() => window.__qr)).some(t => t.endsWith('|45.053200,7.686800')));
    console.log('OK «Non stampare»: niente coordinate né posizione nel QR, anche sulle etichette');
    // Registro Excel con colonne UTM
    const leggi = async (formato) => {
      const download = page.waitForEvent('download');
      await page.evaluate((f) => esportaRegistroExcel([...S.schede].sort(perProg), new Set(['note']), f), formato);
      const bytes = fs.readFileSync(await (await download).path());
      return page.evaluate(async (b) => (await leggiRigheExcel(new File([new Uint8Array(b)], 'r.xlsx'))).righe, [...bytes]);
    };
    let righe = await leggi('utm');
    const testata = righe.find(r => r.includes('Nome esemplare'));
    const quercia = righe.find(r => r.includes('Quercus robur'));
    assert.deepEqual(testata.slice(3, 7).map(String), ['Zona UTM', 'Est UTM (m)', 'Nord UTM (m)', 'Quota (m s.l.m.)']);
    assert.deepEqual(quercia.slice(3, 7).map(String), ['32T', '396596', '4989699', '241']);
    righe = await leggi('dec');
    assert.deepEqual(righe.find(r => r.includes('Quercus robur')).slice(3, 5).map(Number), [45.0532, 7.6868]);
    righe = await leggi('no');
    assert.ok(!righe.find(r => r.includes('Nome esemplare')).some(c => /Latitudine|UTM|Quota/.test(String(c))));
    console.log('OK Registro Excel: colonne della posizione nel formato scelto');
    // Telefono: la scelta non allarga la finestra (nessuno scorrimento orizzontale)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); window.__st = apriStampa(); });
    await page.waitForSelector('#dlg-stampa[open]');
    await page.selectOption('#st-coord', 'utm');
    assert.equal(await page.evaluate(() => { const d = document.querySelector('#dlg-stampa'); return d.scrollWidth <= d.clientWidth + 1; }), true);
    await page.click('#dlg-stampa button[value=annulla]');
    console.log('OK Telefono 390 px: la finestra Stampa non scorre in orizzontale');
    assert.deepEqual(errori, []);
  } finally {
    await browser.close(); server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
