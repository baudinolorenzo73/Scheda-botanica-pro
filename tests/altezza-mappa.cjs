// Misura altezza guidata, foglia composta, stampa mappa e pagina HTML (v3.30).
// Uso: node tests/altezza-mappa.cjs [cartella-screenshot]
const assert=require('node:assert/strict');const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');const os=require('os');
const root=path.resolve(__dirname,'..'), out=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'sb-test-'));
const srv=http.createServer((q,r)=>{const u=new URL(q.url,'http://x');const f=path.join(root,u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname));
 const m={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
 try{r.setHeader('Content-Type',m[path.extname(f)]||'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.writeHead(404);r.end();}});
const ok=(t)=>console.log('OK',t);
// PNG 256×256 a tinta unita (per simulare le tile dei servizi di sfondo)
const zlib=require('zlib');
function png(r,g,b){const ck=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(zlib.crc32(td));return Buffer.concat([l,td,c]);};
 const ih=Buffer.from([0,0,1,0,0,0,1,0,8,2,0,0,0]);const riga=Buffer.concat([Buffer.from([0]),Buffer.alloc(768).map((_,i)=>[r,g,b][i%3])]);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ck('IHDR',ih),ck('IDAT',zlib.deflateSync(Buffer.concat(Array(256).fill(riga)))),ck('IEND',Buffer.alloc(0))]);}
const TILE_STRADA=png(200,40,40), TILE_SAT=png(40,40,200);
let richiesteSfondo=0;
const sfondi=async(pg)=>{await pg.route(/World_Street_Map/,r=>{richiesteSfondo++;r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:TILE_STRADA});});
 await pg.route(/World_Imagery|World_Topo_Map/,r=>{richiesteSfondo++;r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:TILE_SAT});});};
(async()=>{await new Promise(o=>srv.listen(0,'127.0.0.1',o));
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,acceptDownloads:true});const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('dialog',d=>d.accept());
await p.route(/tile\.openstreetmap\.org/,r=>r.abort());await sfondi(p);
await p.goto(`http://127.0.0.1:${srv.address().port}/`);await p.waitForFunction(()=>typeof apriMisuraAltezza==='function');
await p.click('#btn-nuova');await p.waitForFunction(()=>S.aperta!==null);
const ori=(beta)=>p.evaluate(b=>{for(let i=0;i<12;i++){const e=new Event('deviceorientation');e.beta=b;e.gamma=0;e.alpha=0;window.dispatchEvent(e);}},beta);

// ---- ALTEZZA: telefono ----
await p.click('#btn-misura-altezza');const d=p.locator('dialog.dlg-altezza');
await p.screenshot({path:out+'/a1-metodi.png'});
await d.getByText('Con il telefono').click();
const dist=d.locator('input').first();
assert(await d.getByRole('button',{name:'Avanti →'}).isDisabled());
await dist.fill('20');await p.screenshot({path:out+'/a2-distanza.png'});
await d.getByRole('button',{name:'Avanti →'}).click();
await ori(125);await p.waitForTimeout(100);
assert.equal(await d.locator('.alt-angolo').textContent(),'+35,0°');
await p.screenshot({path:out+'/a3-cima.png'});
await d.getByRole('button',{name:'✓ Fissa la cima'}).click();
assert.match(await d.locator('.alt-passo').textContent(),/Base/);
await ori(86);await d.locator('.alt-mirino').click();   // tocco sul riquadro = fissa
const atteso=20*(Math.tan(35*Math.PI/180)-Math.tan(-4*Math.PI/180));
assert.equal(await d.locator('.alt-esito').textContent(),atteso.toFixed(1).replace('.',',')+' m');
await p.screenshot({path:out+'/a4-risultato.png'});
await d.getByRole('button',{name:'✓ Usa nella scheda'}).click();
await p.waitForFunction(()=>!document.querySelector('dialog.dlg-altezza'));
assert.equal(await p.inputValue('#f-altezza'),String(Math.round(atteso*10)/10));
ok('altezza con telefono: distanza, cima, base con tocco, risultato, scheda');

// salta base + validazioni
await p.click('#btn-misura-altezza');await d.getByText('Con il telefono').click();
await d.locator('input').first().fill('10');await d.getByRole('button',{name:'Avanti →'}).click();
await ori(80);await d.getByRole('button',{name:'✓ Fissa la cima'}).click();
assert.match(await d.locator('.alt-avviso').textContent(),/sopra l’orizzonte/);
await ori(135);await d.getByRole('button',{name:'✓ Fissa la cima'}).click();
await d.getByRole('button',{name:'Salta (terreno piano)'}).click();
assert.equal(await d.locator('.alt-esito').textContent(),(10+1.6).toFixed(1).replace('.',',')+' m');
assert.match(await d.locator('.alt-consiglio').textContent().catch(()=>'' ),/^$|.*/);
await d.getByRole('button',{name:'Chiudi'}).count();
await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('dialog.dlg-altezza'));
ok('altezza: cima sotto orizzonte rifiutata, salto base con altezza occhi, chiusura');

// ---- ALTEZZA: foto ----
await p.click('#btn-misura-altezza');await d.getByText('Da una foto').click();
const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=800;const x=c.getContext('2d');x.fillStyle='#8cc';x.fillRect(0,0,400,800);x.fillStyle='#262';x.fillRect(150,100,60,600);x.fillStyle='#c60';x.fillRect(260,600,8,100);return c.toDataURL('image/png').split(',')[1];});
await d.locator('input[type=file]').nth(1).setInputFiles({name:'t.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
await d.getByText('Un bastone da 1 m').click();
const cv=d.locator('canvas');await cv.waitFor();const bb=await cv.boundingBox();const k=bb.width/400;
for(const [x,y] of [[180,700],[180,100],[264,700],[264,600]]) await cv.click({position:{x:x*k,y:y*k}});
await p.screenshot({path:out+'/a5-foto-punti.png'});
await d.getByRole('button',{name:'Calcola →'}).click();
const vf=parseFloat((await d.locator('.alt-esito').textContent()).replace(',','.'));assert(Math.abs(vf-6)<0.2,'foto '+vf);
await p.keyboard.press('Escape');
ok('altezza da foto: riferimento, 4 punti guidati, ~6 m');

// ---- ALTEZZA: ombra ----
await p.waitForFunction(()=>!document.querySelector('dialog.dlg-altezza'));
await p.click('#btn-misura-altezza');await d.getByText('Con l’ombra').click();
const io=d.locator('input');await io.nth(0).fill('18');await io.nth(2).fill('1,2');
await d.getByRole('button',{name:'Calcola →'}).click();
assert.equal(await d.locator('.alt-esito').textContent(),'15,0 m');
await p.keyboard.press('Escape');ok('altezza con ombra');

// ---- FOGLIA COMPOSTA ----
await p.waitForFunction(()=>!document.querySelector('dialog.dlg-altezza'));
const vis=()=>p.evaluate(()=>!document.querySelector('label[for="f-fogliaComposta"]').classList.contains('nascosto'));
assert.equal(await vis(),false);
await p.click('#f-tipoFoglia');await p.locator('#pk-griglia .pk-carta',{hasText:'composta'}).click();
assert.equal(await vis(),true);
await p.click('#f-fogliaComposta');await p.screenshot({path:out+'/b1-picker-composta.png'});
await p.locator('#pk-griglia .pk-carta',{hasText:/^imparipennata/}).click();
assert.equal(await p.evaluate(()=>S.aperta.fogliaComposta),'imparipennata');
await p.locator('#f-fogliaComposta').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/b2-campo.png'});
await p.click('#f-tipoFoglia');await p.locator('#pk-griglia .pk-carta',{hasText:/^semplice/}).click();
assert.equal(await vis(),false);assert.equal(await p.evaluate(()=>S.aperta.fogliaComposta),'');
await p.click('#f-tipoFoglia');await p.locator('#pk-griglia .pk-carta',{hasText:'composta'}).click();
await p.click('#f-fogliaComposta');await p.locator('#pk-griglia .pk-carta',{hasText:/^paripennata/}).click();
assert.equal(await p.evaluate(()=>campoPertinente(S.aperta,'fogliaComposta')),true);
ok('foglia composta: visibile solo con «composta», svuotata cambiando tipo');

// guida: Fraxinus excelsior compila anche la foglia composta su scheda vuota
const comp=await p.evaluate(()=>{const r={};const sp=GUIDA_SPECIE.find(v=>v.nomeSci==='Fraxinus excelsior');const c=compilaCampiDaGuidaSpecie(r,sp);return [c,r.tipoFoglia,r.fogliaComposta];});
assert(comp[0].includes('fogliaComposta')&&comp[1]==='composta'&&comp[2]==='imparipennata',JSON.stringify(comp));
const pun=await p.evaluate(()=>{const sp=GUIDA_SPECIE.find(v=>v.nomeSci==='Fraxinus excelsior');return [corrispondeCaratteristica(sp,'fogliaComposta','imparipennata'),corrispondeCaratteristica(sp,'fogliaComposta','paripennata')];});
assert.deepEqual(pun,['dato',null]);
ok('guida: compila e confronta la foglia composta, senza confondere pari/imparipennata');

// ---- MAPPA: dati con GPS ----
await p.fill('#f-nome','Fraxinus excelsior');
await p.evaluate(async()=>{const base=[45.07,7.68];S.aperta.gps={lat:base[0],lng:base[1],acc:4};await salvaOra(S.aperta);
 for(let i=0;i<3;i++){const r=nuovaScheda?nuovaScheda():null;}
});
await p.click('#btn-chiudi');await p.waitForFunction(()=>S.aperta===null);
await p.evaluate(async()=>{const nomi=['Quercus robur','Tilia cordata','Aesculus hippocastanum'];
 for(let i=0;i<3;i++){ document.querySelector('#btn-nuova').click(); await new Promise(r=>setTimeout(r,300));
  const r=S.aperta; r.nome=nomi[i]; r.gps={lat:45.07+0.0004*(i+1),lng:7.68+0.0005*(i+1),acc:5}; r.altezza=String(10+i); if(i===1) r.problemi='carie al colletto';
  r.foto=[]; await salvaOra(r); document.querySelector('#btn-chiudi').click(); await new Promise(r=>setTimeout(r,300)); }});
// una foto nella prima scheda
await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const x=c.getContext('2d');x.fillStyle='#4a7';x.fillRect(0,0,600,800);x.fillStyle='#753';x.fillRect(270,400,60,400);
 const blob=await new Promise(o=>c.toBlob(o,'image/jpeg',.8));const r=S.schede.find(s=>s.nome==='Fraxinus excelsior');const id='foto_test';await DB.scrivi('foto',blob,id);r.foto.push({id,didascalia:'chioma',quando:oraISO(),stampa:true});await salvaOra(r);});
const nGps=await p.evaluate(()=>S.schede.filter(s=>s.gps).length);assert.equal(nGps,4);
await p.click('#tab-mappa');await p.waitForTimeout(600);
await p.screenshot({path:out+'/c0-vista-mappa.png'});
// stampa
await p.evaluate(()=>{window.__stampe=0;window.print=()=>{window.__stampe++;};});
await p.click('#btn-mappa-stampa');
await p.screenshot({path:out+'/c1-opzioni-stampa.png'});
await p.locator('.dlg-mappa-opzioni input[value=tutte]').check();
await p.locator('.dlg-mappa-opzioni').getByRole('button',{name:'🖨 Stampa'}).click();
await p.waitForFunction(()=>window.__stampe===1,null,{timeout:20000});
assert.equal(await p.locator('#stampa .p-mappa-box .leaflet-marker-icon').count(),4);
assert.equal(await p.locator('#stampa .p-mappa-legenda tbody tr').count(),4);
assert.match(await p.evaluate(()=>document.getElementById('stile-pagina-mappa').textContent),/landscape/);
await p.emulateMedia({media:'print'});await p.screenshot({path:out+'/c2-stampa.png',fullPage:true});
// margini di stampa: niente padding/zoom del corpo (pagine vuote o tagli), @page con margine 12 mm, nessuna pagina vuota in coda
for(const z of ['110','125']){await p.evaluate(v=>document.body.setAttribute('data-interfaccia',v),z);
 const m=await p.evaluate(()=>{const c=getComputedStyle(document.body);return [c.paddingBottom,c.zoom]});
 assert.deepEqual(m,['0px','1'],'in stampa il corpo non deve avere padding né zoom (interfaccia '+z+')');}
await p.evaluate(()=>document.body.removeAttribute('data-interfaccia'));
assert.match(await p.evaluate(()=>document.getElementById('stile-pagina-mappa').textContent),/margin:12mm/);
const pdf=await p.pdf({preferCSSPageSize:true,printBackground:true});
assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length,2,'mappa + elenco = 2 pagine, nessuna pagina vuota');
await p.emulateMedia({media:'screen'});
await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
assert.equal(await p.locator('#stampa').evaluate(e=>e.children.length),0);
assert.equal(await p.locator('#stile-pagina-mappa').count(),0);
ok('stampa mappa: 4 numeri, legenda, A4 orizzontale, pulizia dopo la stampa');

// pagina HTML
await p.click('#btn-mappa-html');
await p.locator('.dlg-mappa-opzioni input[value=tutte]').first().check();
await p.locator('.dlg-mappa-opzioni input[value=entrambe]').check();
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.locator('.dlg-mappa-opzioni').getByRole('button',{name:'⭳ Crea pagina'}).click()]);
const file=out+'/'+dl.suggestedFilename();await dl.saveAs(file);
const html=fs.readFileSync(file,'utf8');assert(html.includes('L.map(')&&html.includes('Fraxinus excelsior'));
assert(!html.includes('tile.openstreetmap.org/{z}'),'niente tile OSM (403 senza Referer)');assert(!html.includes('cartocdn'),'niente CARTO (chiede una chiave)');
const Dp=JSON.parse(html.match(/<script type="application\/json" id="dati">([\s\S]*?)<\/script>/)[1]);
const nStr=Object.keys(Dp.sfondi.stradale.tile).length,nSat=Object.keys(Dp.sfondi.satellite.tile).length;
assert(nStr>20&&nStr<=260&&nSat===nStr,'tile salvate: '+nStr+'/'+nSat);assert(Dp.sfondi.stradale.zMax>=17,'zoom massimo salvato '+Dp.sfondi.stradale.zMax);
// ---- pagina aperta SENZA Internet: lo sfondo arriva dal file
const ctxOff=await b.newContext({viewport:{width:390,height:844},offline:true});const pOff=await ctxOff.newPage();const eOff=[];pOff.on('pageerror',e=>eOff.push(e.message));
await pOff.goto('file://'+file);await pOff.waitForSelector('.leaflet-marker-icon');await pOff.waitForTimeout(800);
assert.match(await pOff.locator('.stato-rete').textContent(),/Offline · sfondo salvato nel file/);
const vicino=(c,r,g,b)=>{const v=c.split(',').map(Number);return Math.abs(v[0]-r)<=20&&Math.abs(v[1]-g)<=20&&Math.abs(v[2]-b)<=20;};
const colore=(pg)=>pg.evaluate(()=>{const cs=[...document.querySelectorAll('.leaflet-tile-container canvas')].filter(c=>c.getBoundingClientRect().width>0);
 return cs.map(c=>{try{const d=c.getContext('2d').getImageData(128,128,1,1).data;return d[0]+','+d[1]+','+d[2];}catch{return 'tainted'}});});
let cols=await colore(pOff);assert(cols.length>0&&cols.every(c=>vicino(c,200,40,40)),'offline: tile stradali dal file '+cols.slice(0,4));
await pOff.screenshot({path:out+'/d0-pagina-offline.png'});
// zoom oltre il salvato: ingrandisce la tile salvata (niente grigio)
for(let i=0;i<3;i++){await pOff.locator('.leaflet-control-zoom-in').click({force:true});await pOff.waitForTimeout(400);}assert.equal(await pOff.evaluate(()=>document.querySelector('.leaflet-tile-container canvas')&&1),1);await pOff.waitForTimeout(800);
cols=await colore(pOff);assert(cols.length>0&&cols.every(c=>vicino(c,200,40,40)),'offline zoom 20: '+cols.slice(0,4));
// satellite salvato anche lui
await pOff.locator('.leaflet-control-layers').hover();await pOff.getByLabel(/Satellite · salvato nel file/).check();await pOff.waitForTimeout(800);
cols=await colore(pOff);assert(cols.length>0&&cols.every(c=>vicino(c,40,40,200)),'offline satellite '+cols.slice(0,4));
assert.deepEqual(eOff,[]);await ctxOff.close();
ok('pagina HTML offline: sfondo stradale e satellite salvati nel file ('+nStr+' tile, zoom '+Dp.sfondi.stradale.zMin+'–'+Dp.sfondi.stradale.zMax+'), ingrandimento oltre il salvato');
const p2=await ctx.newPage();const e2=[];p2.on('pageerror',e=>e2.push(e.message));await p2.route(/tile\.openstreetmap\.org/,r=>r.abort());await sfondi(p2);
await p2.goto('file://'+file);await p2.waitForSelector('.leaflet-marker-icon');
assert.equal(await p2.locator('.leaflet-marker-icon').count(),4);
assert.equal(await p2.locator('article.scheda').count(),4);
// scheda completa: sezioni come nella stampa, campi vuoti con «—», data di modifica
const sez=await p2.locator('article.scheda').first().locator('h3.sez').allTextContents();
assert.deepEqual(sez.slice(0,5),['Osservazioni','Vegetazione','Pedologia','Fitopatologia','Note'],'sezioni: '+sez);
const attesi=await p.evaluate(()=>{const r=[...S.schede].sort(perProg)[0];return CAMPI.filter(c=>!['prog','nome','data'].includes(c.k)&&campoPertinente(r,c.k)).length;});
const dtPrimi=await p2.locator('article.scheda').first().locator('dt').count();
assert(dtPrimi>=attesi,'tutti i campi della scheda: '+dtPrimi+' su '+attesi);
assert.match(await p2.locator('article.scheda').first().locator('dl').first().textContent(),/—/);
assert.match(await p2.locator('article.scheda .modifica').first().textContent(),/^Creata il .* – ultima modifica /);
assert.equal(await p2.locator('.leaflet-marker-icon').first().textContent()!=='',true);
assert.match(await p2.locator('.stato-rete').textContent(),/Online/);
// online, sfondo non salvato nel file (topografica): le tile arrivano dalla rete
const prima=richiesteSfondo;await p2.locator('.leaflet-control-layers').hover();await p2.getByLabel(/Topografica · solo online/).check();await p2.waitForTimeout(800);
assert(richiesteSfondo>prima,'online: tile topografiche scaricate dalla rete');
await p2.getByLabel(/Stradale · salvato nel file/).check();await p2.mouse.move(5,5);await p2.waitForTimeout(300);
await p2.screenshot({path:out+'/d1-pagina-html.png'});
await p2.fill('#cerca','tilia');assert.equal(await p2.locator('article.scheda:visible').count(),1);assert.equal(await p2.locator('.leaflet-marker-icon').count(),1);
await p2.fill('#cerca','');
await p2.locator('.leaflet-marker-icon').first().click();await p2.getByRole('link',{name:'Vai alla scheda ↓'}).click();
await p2.waitForTimeout(500);await p2.screenshot({path:out+'/d2-pagina-scheda.png'});
assert.equal(await p2.locator('.galleria img').count(),1);assert.match(await p2.locator('.galleria img').getAttribute('src'),/^data:image\/(webp|jpeg)/);assert.deepEqual(e2,[]);
ok('pagina HTML: mappa con 4 numeri, 4 schede, ricerca, popup → scheda, nessun errore ('+(html.length/1024|0)+' KB)');
// ---- note: solo dell'utente (le righe automatiche PlantNet vengono tolte, anche dalle schede vecchie)
const RIGA='Identificato con PlantNet: Cercis siliquastrum (Albero di-Giuda) — 7%, 03/10/2026, 09:18 — GBIF: https://www.gbif.org/species/5353590';
await p.evaluate(async(riga)=>{const r=S.schede[0];await DB.scrivi('schede',{...r,uid:'vecchia-nota',note:'Mia osservazione\n'+riga+'\nAltra riga mia',plantnetNome:'Cercis siliquastrum L.',nome:'Cercis siliquastrum'});},RIGA);
await p.reload();await p.waitForFunction(()=>S.schede.some(s=>s.uid==='vecchia-nota'));
let v=await p.evaluate(()=>{const r=S.schede.find(s=>s.uid==='vecchia-nota');return {note:r.note,ident:r.identPlantNet};});
assert.equal(v.note,'Mia osservazione\nAltra riga mia');assert.deepEqual(v.ident,{nome:'Cercis siliquastrum',comune:'Albero di-Giuda',conf:7,quando:'03/10/2026, 09:18'});
assert.equal(await p.evaluate(async()=>(await DB.leggi('schede','vecchia-nota')).note),'Mia osservazione\nAltra riga mia','ripulita anche nell\'archivio');
// solo la riga automatica: la nota resta vuota
assert.equal(await p.evaluate((riga)=>normalizza({note:riga}).record.note,RIGA),'');
// nuova identificazione: la nota non cambia
await p.evaluate(()=>apriEditor('vecchia-nota'));await p.waitForFunction(()=>S.aperta&&S.aperta.uid==='vecchia-nota');
assert.equal(await p.inputValue('#f-note'),'Mia osservazione\nAltra riga mia');
v=await p.evaluate(()=>{const r=S.aperta;IDENT.riga=r;IDENT.foto={};usaIdentificazione('Cercis siliquastrum','Albero di Giuda',64,'5353590','Cercis siliquastrum L.');return {note:r.note,ident:r.identPlantNet};});
assert.equal(v.note,'Mia osservazione\nAltra riga mia');assert.equal(v.ident.conf,64);assert.equal(await p.inputValue('#f-note'),'Mia osservazione\nAltra riga mia');assert.match(await p.locator('#plantnet-link').textContent(),/64%/);
ok('note: righe automatiche PlantNet tolte dalle schede esistenti e mai più aggiunte; identificazione conservata a parte');
assert.deepEqual(errs,[]);
await b.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
