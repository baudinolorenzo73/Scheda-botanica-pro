// Dati aperti (3.46): GBIF (IUCN, nomi comuni), quota del terreno, località, meteo e pollini.
// Nessun servizio reale viene contattato: tutte le risposte sono simulate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

// ---------- 1. Funzioni pure, in Node ----------
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'js/dati-aperti.js'), 'utf8').split('/* ---------- Nominatim')[0] + '\nglobalThis.DA = DatiAperti;', ctx);
const DA = ctx.DA;
assert.deepEqual({ ...DA.iucn({ code: 'LC', category: 'LEAST_CONCERN' }) }, { codice: 'LC', testo: 'Minor preoccupazione' });
assert.equal(DA.iucn({}).codice, 'NE');
assert.equal(DA.iucn({ code: 'xx' }).codice, 'NE');
assert.deepEqual([...DA.nomiItaliani({ results: [
  { language: 'ita', vernacularName: 'farnia' }, { language: 'eng', vernacularName: 'English oak' },
  { language: 'ita', vernacularName: 'Farnia' }, { language: 'ita', vernacularName: 'Quercia  comune' }] })], ['Farnia', 'Quercia comune']);
assert.equal(DA.quota({ elevation: [238.6] }), 239);
assert.equal(DA.quota({ elevation: [] }), null);
assert.equal(DA.localita({ name: 'Parco del Valentino', address: { road: 'Viale Virgilio', city: 'Torino', 'ISO3166-2-lvl6': 'IT-TO' } }), 'Parco del Valentino, Viale Virgilio, Torino (TO)');
assert.equal(DA.localita({ name: '', address: { hamlet: 'Pian della Mussa', village: 'Balme', 'ISO3166-2-lvl6': 'IT-TO' } }), 'Pian della Mussa, Balme (TO)');
assert.equal(DA.localita({ display_name: 'A, B, C, D' }), 'A, B, C');
assert.deepEqual([...DA.descriviMeteo(3)], ['☁️', 'Coperto']);
const pol = DA.pollini({ hourly: { time: ['2026-10-09T00:00', '2026-10-09T12:00', '2026-10-10T00:00'], birch_pollen: [1, 5, null], grass_pollen: [0, 0, 0] } });
assert.equal(pol.find(x => x.chiave === 'birch_pollen').massimo, 5);
assert.deepEqual([...pol.find(x => x.chiave === 'birch_pollen').perGiorno], [5, null]);
assert.equal(pol.find(x => x.chiave === 'grass_pollen').massimo, 0);
assert.ok(DA.url.localita(45.1234567, 7.1).includes('lat=45.12346&lon=7.10000') && DA.url.localita(1, 2).includes('accept-language=it'));
assert.ok(DA.url.quota(45, 7).startsWith('https://api.open-meteo.com/v1/elevation?'));
console.log('OK Lettura delle risposte: IUCN, nomi comuni, quota, località, meteo, pollini');

// ---------- 2. Nel browser, con risposte simulate ----------
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
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
const giorni = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'];
const ore = giorni.flatMap(g => ['00', '06', '12', '18'].map(h => `${g}T${h}:00`));
(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, geolocation: { latitude: 45.05, longitude: 7.68 }, permissions: ['geolocation'] });
  const richieste = [];
  await context.route(/https:\/\//, async (route) => {
    const u = new URL(route.request().url());
    richieste.push({ host: u.host, path: u.pathname, t: Date.now() });
    if (u.host === 'api.gbif.org' && u.pathname.endsWith('/iucnRedListCategory')) return json(route, { code: 'LC', category: 'LEAST_CONCERN' });
    if (u.host === 'api.gbif.org' && u.pathname.endsWith('/vernacularNames')) return json(route, { results: [{ language: 'ita', vernacularName: 'Farnia' }, { language: 'ita', vernacularName: 'Quercia comune' }, { language: 'deu', vernacularName: 'Stieleiche' }] });
    if (u.host === 'api.open-meteo.com' && u.pathname === '/v1/elevation') return json(route, { elevation: [241] });
    if (u.host === 'nominatim.openstreetmap.org') return json(route, { name: 'Parco del Valentino', address: { road: 'Viale Virgilio', city: 'Torino', 'ISO3166-2-lvl6': 'IT-TO' } });
    if (u.host === 'geocoding-api.open-meteo.com') return json(route, { results: [
      { name: 'Pinerolo', latitude: 44.88, longitude: 7.33, elevation: 376, admin2: 'Torino', country_code: 'IT' },
      { name: 'Pinerolo', latitude: 45.1, longitude: 9.0, elevation: 90, admin2: 'Pavia', country_code: 'IT' }] });
    if (u.host === 'api.open-meteo.com' && u.pathname === '/v1/forecast') return json(route, { elevation: 376,
      current: { temperature_2m: 14.2, apparent_temperature: 12.9, weather_code: 2, wind_speed_10m: 8, wind_gusts_10m: 20, precipitation: 0 },
      daily: { time: giorni, weather_code: [2, 61, 3, 0], temperature_2m_max: [18, 15, 16, 19], temperature_2m_min: [7, 9, 6, 5],
        precipitation_probability_max: [10, 80, 30, 0], precipitation_sum: [0, 6.4, 0.2, 0], wind_speed_10m_max: [12, 20, 10, 8], wind_gusts_10m_max: [25, 40, 22, 15],
        sunrise: giorni.map(g => g + 'T07:31'), sunset: giorni.map(g => g + 'T18:52') } });
    if (u.host === 'air-quality-api.open-meteo.com') return json(route, { hourly: { time: ore, birch_pollen: ore.map(() => null), grass_pollen: ore.map((_, i) => i % 4 === 2 ? 3 : 0), ragweed_pollen: ore.map((_, i) => i < 4 ? 1.4 : 0) } });
    return route.abort();
  });
  const page = await context.newPage();
  const errori = [];
  page.on('pageerror', e => errori.push(e.message));
  page.on('dialog', d => d.accept());
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(base);
    await page.waitForFunction(() => typeof DB !== 'undefined' && DB.db && typeof S !== 'undefined');
    await page.evaluate(() => localStorage.setItem('sb-backup-auto', '0'));
    const uid = await page.evaluate(async () => {
      const r = schedaVuota(); r.nome = 'Quercus robur'; r.gbifId = '2878688'; r.bozzaVuota = false;
      r.gps = { lat: 45.0532, lng: 7.6868, acc: 4, alt: 270, quando: new Date().toISOString(), online: true };
      S.schede.push(r); await salvaOra(r); disegnaElenco(); return r.uid;
    });
    await page.click(`#voce-${uid}`);
    await page.waitForSelector('#editor:not(.nascosto)');
    // GBIF
    await page.click('#gbif-info-carica');
    await page.waitForFunction(() => S.aperta.infoGbif?.iucn === 'LC');
    assert.deepEqual(await page.evaluate(() => S.aperta.infoGbif.nomi), ['Farnia', 'Quercia comune']);
    assert.match(await page.locator('#gbif-info').textContent(), /Minor preoccupazione.*Farnia, Quercia comune/);
    // Quota del terreno
    await page.click('#gps-quota-dem');
    await page.waitForFunction(() => S.aperta.gps.quotaTerreno === 241);
    assert.match(await page.locator('#gps-box').textContent(), /terreno 241 m s\.l\.m\. · Copernicus DEM, Open-Meteo/);
    // Località
    await page.click('#localita-da-gps');
    await page.waitForFunction(() => S.aperta.localita === 'Parco del Valentino, Viale Virgilio, Torino (TO)');
    assert.equal(await page.inputValue('#f-localita'), 'Parco del Valentino, Viale Virgilio, Torino (TO)');
    // Dopo il riavvio i dati restano
    await page.waitForTimeout(700);
    await page.click('#btn-chiudi'); await page.waitForTimeout(300);
    await page.goto(base); await page.waitForFunction(() => typeof DB !== 'undefined' && DB.db && S.schede.length);
    const salvati = await page.evaluate((u) => { const r = S.schede.find(s => s.uid === u); return [r.infoGbif?.iucn, r.gps?.quotaTerreno, r.localita]; }, uid);
    assert.deepEqual(salvati, ['LC', 241, 'Parco del Valentino, Viale Virgilio, Torino (TO)']);
    console.log('OK Scheda: Lista rossa IUCN, nomi comuni, quota del terreno e località salvati');
    // Nominatim: richieste distanziate di almeno 1,1 s, cache per le stesse coordinate
    const prima = richieste.filter(x => x.host === 'nominatim.openstreetmap.org').length;
    await page.evaluate(() => Promise.all([richiestaNominatim(44.1, 7.1), richiestaNominatim(44.2, 7.2), richiestaNominatim(44.1, 7.1)]));
    const nom = richieste.filter(x => x.host === 'nominatim.openstreetmap.org').slice(prima);
    assert.equal(nom.length, 2, 'coordinate già chieste: dalla cache');
    assert.ok(nom[1].t - nom[0].t >= 1000, `intervallo ${nom[1].t - nom[0].t} ms`);
    console.log('OK Nominatim: una richiesta al secondo, cache per le stesse coordinate');
    // Scheda bloccata: i pulsanti non chiedono nulla
    await page.click(`#voce-${uid}`);
    await page.waitForSelector('#editor:not(.nascosto)');
    await page.click('#btn-blocca');
    await page.waitForFunction(() => S.aperta.bloccata === true);
    for (const sel of ['#gbif-info-carica', '#gps-quota-dem', '#localita-da-gps']) assert.ok(await page.locator(sel).isDisabled(), sel);
    await page.click('#btn-chiudi'); await page.waitForTimeout(300);
    // Meteo
    await page.evaluate(() => document.querySelector('#home-meteo').click());
    await page.fill('#meteo-om-luogo', 'Pinerolo');
    await page.click('#meteo-om-cerca');
    await page.waitForSelector('.meteo-scelta');
    assert.equal(await page.locator('.meteo-scelta').count(), 2);
    await page.locator('.meteo-scelta').first().click();
    await page.waitForSelector('.meteo-giorno');
    assert.equal(await page.locator('.meteo-giorno').count(), 4);
    const testo = await page.locator('#meteo-risultato').textContent();
    assert.match(testo, /Pinerolo · 376 m/);
    assert.match(testo, /14 °C · Parzialmente nuvoloso/);
    assert.match(testo, /Pioggia debole/);
    assert.match(testo, /07:31 – 18:52/);
    const righePollini = await page.$$eval('.meteo-pollini tbody tr', r => r.map(x => x.cells[0].textContent));
    assert.deepEqual(righePollini, ['Graminacee', 'Ambrosia'], 'solo i pollini presenti');
    assert.ok(await page.locator('#meteo-ultimo').isVisible());
    await page.click('#meteo-qui');
    await page.waitForFunction(() => /La tua posizione/.test(document.querySelector('#meteo-risultato').textContent));
    console.log('OK Meteo: ricerca località, 4 giorni, alba e tramonto, pollini, posizione');
    // Servizio non raggiungibile: messaggio chiaro, nessun errore JS
    await context.unroute(/https:\/\//);
    await context.route(/https:\/\//, r => r.abort());
    await page.fill('#meteo-om-luogo', 'Balme');
    await page.click('#meteo-om-cerca');
    await page.waitForSelector('#meteo-risultato .avviso-rosso');
    console.log('OK Meteo senza rete: messaggio di errore');
    assert.deepEqual(errori, [], errori.join('; '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FALLITO', e); process.exit(1); });
