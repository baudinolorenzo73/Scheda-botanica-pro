// Blocco della scheda (3.45): consultabile, non modificabile né eliminabile; sblocco con conferma.
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
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.route(/https:\/\//, r => r.abort());
  const page = await ctx.newPage();
  const errori = [];
  page.on('pageerror', e => errori.push(e.message));
  let accettaConferma = false;
  page.on('dialog', d => (d.type() === 'confirm' && accettaConferma) ? d.accept() : d.dismiss());
  const base = `http://127.0.0.1:${server.address().port}`;
  const pronta = () => page.waitForFunction(() => typeof DB !== 'undefined' && DB.db && typeof S !== 'undefined');
  try {
    await page.goto(base); await pronta();
    await page.evaluate(() => localStorage.setItem('sb-backup-auto', '0'));
    // Una scheda con nome, altezza e GPS
    const uid = await page.evaluate(async () => {
      const r = schedaVuota(); r.nome = 'Larix decidua'; r.altezza = '18'; r.bozzaVuota = false;
      r.gps = { lat: 45.05, lng: 7.68, acc: 4, alt: 240, quando: new Date().toISOString(), online: true };
      S.schede.push(r); await salvaOra(r); disegnaElenco(); return r.uid;
    });
    await page.click(`#voce-${uid}`);
    await page.waitForSelector('#editor:not(.nascosto)');
    assert.equal(await page.locator('#btn-blocca').getAttribute('aria-pressed'), 'false');
    assert.ok(await page.locator('#avviso-blocco').isHidden());
    // Blocca
    await page.click('#btn-blocca');
    await page.waitForFunction(() => S.aperta.bloccata === true && document.querySelector('#btn-blocca').getAttribute('aria-pressed') === 'true');
    assert.ok(await page.locator('#avviso-blocco').isVisible());
    for (const sel of ['#f-nome', '#f-altezza', '#f-formaChioma', '#btn-misura-altezza', '#ar-foto', '#ar-gps', '#ar-audio', '#btn-scatta', '#btn-galleria', '#btn-audio-rec', '#btn-elimina'])
      assert.ok(await page.locator(sel).isDisabled(), sel + ' dovrebbe essere disattivato');
    assert.ok(await page.locator('#gps-box button').first().isDisabled());
    assert.ok(await page.locator('#ar-nuova').isEnabled(), 'Nuova scheda resta attiva');
    assert.ok(await page.locator('#btn-stampa-una').isEnabled(), 'la stampa resta attiva');
    assert.ok(await page.locator('#btn-report').isEnabled(), 'il report resta attivo');
    // Anche chiamate dirette non cambiano nulla
    const dopo = await page.evaluate(async () => {
      const r = S.aperta; const prima = r.modificato;
      sceglIllustrata('formaChioma', 'a cono');
      rilevaGPS(); await eliminaScheda(); apriMisuraAltezza();
      return { forma: r.formaChioma, mod: r.modificato === prima, aperta: !!S.aperta, gps: GPSR.watch, dlgAltezza: !!document.querySelector('dialog[open]') };
    });
    assert.deepEqual(dopo, { forma: '', mod: true, aperta: true, gps: null, dlgAltezza: false });
    // Il blocco resta dopo il riavvio; nell'elenco compare il lucchetto e il cestino è spento
    await page.click('#btn-chiudi');
    await page.waitForSelector('#editor.nascosto', { state: 'attached' });
    await page.waitForTimeout(300);
    await page.goto(base); await pronta();
    await page.waitForSelector(`#voce-${uid} .lucchetto`);
    assert.ok(await page.locator(`#voce-${uid} .btn-elimina-riga`).isDisabled());
    await page.evaluate((u) => eliminaSchedaDaElenco(u), uid);
    assert.equal(await page.evaluate((u) => S.schede.some(s => s.uid === u && !s.cancellata), uid), true, 'la scheda bloccata non va nel cestino');
    // Sblocco: senza conferma non succede nulla, con conferma sì
    await page.click(`#voce-${uid}`);
    await page.waitForSelector('#editor:not(.nascosto)');
    assert.ok(await page.locator('#f-nome').isDisabled());
    await page.click('#btn-sblocca');
    assert.equal(await page.evaluate(() => S.aperta.bloccata), true);
    accettaConferma = true;
    await page.click('#btn-sblocca');
    await page.waitForFunction(() => S.aperta.bloccata === false && document.querySelector('#btn-blocca').getAttribute('aria-pressed') === 'false');
    assert.ok(await page.locator('#f-nome').isEnabled());
    assert.ok(await page.locator('#btn-elimina').isEnabled());
    assert.ok(await page.locator('#avviso-blocco').isHidden());
    await page.fill('#f-altezza', '19');
    await page.waitForFunction(() => S.aperta.altezza === '19');
    console.log('OK Blocco: campi e comandi spenti, consultazione e stampa attive');
    console.log('OK Blocco: resiste al riavvio, impedisce l’eliminazione, sblocco solo con conferma');
    // Unione dei backup: il solo cambio di blocco è una differenza
    assert.equal(await page.evaluate(() => { const a = structuredClone(S.aperta), b = structuredClone(S.aperta); b.bloccata = true; return schedeEquivalenti(a, b); }), false);
    // Importazione con «Unisci»: una scheda bloccata sul dispositivo resta com'era
    await page.click('#btn-blocca');
    await page.waitForFunction(() => S.aperta.bloccata === true);
    await page.click('#btn-chiudi');
    await page.waitForTimeout(300);
    const esito = await page.evaluate(async (u) => {
      const r = S.schede.find(s => s.uid === u);
      const arrivata = { ...structuredClone(r), bloccata: false, altezza: '30', note: 'modifica arrivata', modificato: new Date(Date.now() + 60000).toISOString() };
      await importaDati([{ record: arrivata }], 'unisci');
      const dopo = S.schede.find(s => s.uid === u);
      const testo = document.querySelector('dialog[open]')?.textContent || '';
      document.querySelector('dialog[open]')?.close();
      return { altezza: dopo.altezza, bloccata: dopo.bloccata, avviso: /scheda bloccata è rimasta/.test(testo) };
    }, uid);
    assert.deepEqual(esito, { altezza: '19', bloccata: true, avviso: true });
    console.log('OK Unione: il blocco viaggia con il backup');
    assert.deepEqual(errori, [], errori.join('; '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FALLITO', e); process.exit(1); });
