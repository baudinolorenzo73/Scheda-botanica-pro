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
// margini di stampa: niente padding/zoom del corpo (pagine vuote o tagli), @page con margine 15 mm, nessuna pagina vuota in coda
for(const z of ['110','125']){await p.evaluate(v=>document.body.setAttribute('data-interfaccia',v),z);
 const m=await p.evaluate(()=>{const c=getComputedStyle(document.body);return [c.paddingBottom,c.zoom]});
 assert.deepEqual(m,['0px','1'],'in stampa il corpo non deve avere padding né zoom (interfaccia '+z+')');}
await p.evaluate(()=>document.body.removeAttribute('data-interfaccia'));
// tema scuro: in stampa la pagina (margini compresi) deve restare bianca, non nera
await p.evaluate(()=>document.documentElement.dataset.tema='scuro');
assert.deepEqual(await p.evaluate(()=>{const c=getComputedStyle(document.documentElement);return [c.colorScheme,c.backgroundColor]}),['light','rgb(255, 255, 255)'],'tema scuro: margini di stampa bianchi');
await p.evaluate(()=>delete document.documentElement.dataset.tema);
assert.match(await p.evaluate(()=>document.getElementById('stile-pagina-mappa').textContent),/margin:15mm/);
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
await p2.locator('.leaflet-marker-icon').first().click();
const numMarc=(await p2.locator('.leaflet-popup-content b').textContent()).split(' · ')[0];
await p2.getByRole('link',{name:'Apri la scheda →'}).click();
await p2.waitForTimeout(500);await p2.screenshot({path:out+'/d2-pagina-scheda.png'});
// la scheda si apre in una pagina propria: è proprio quella del numero toccato, le altre e la mappa sono nascoste
assert.equal(await p2.locator('article.scheda:visible').count(),1);
assert.equal((await p2.locator('article.scheda:visible .num').textContent()).trim(),numMarc);
assert.equal(await p2.locator('#mappa').isVisible(),false);
assert.equal(await p2.evaluate(()=>window.pageYOffset),0);
assert.match(await p2.locator('#b-titolo').textContent(),/di 4/);
await p2.click('#b-succ');await p2.waitForTimeout(200);
assert.equal(await p2.locator('article.scheda:visible').count(),1);
await p2.click('#b-mappa');await p2.waitForTimeout(400);
assert.equal(await p2.locator('#mappa').isVisible(),true);assert.equal(await p2.locator('article.scheda:visible').count(),4);
assert.equal(await p2.locator('.leaflet-marker-icon').count(),4);
await p2.locator('.leaflet-marker-icon').first().click();await p2.getByRole('link',{name:'Apri la scheda →'}).click();await p2.waitForTimeout(300);
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
// ---- rinumera le schede: buchi → 1..N, ordine mantenuto, cestino intatto, annulla
await p.evaluate(async()=>{for(const s of [...S.schede])await DB.cancella('schede',s.uid);S.schede=[];S.cestino=[];
 const mk=(uid,prog,creato)=>({...schedaVuota(),uid,prog,creato,bozzaVuota:false,nome:'Pianta '+uid});
 for(const r of [mk('r-a','7','2026-01-03'),mk('r-b','2','2026-01-02'),mk('r-c','2','2026-01-01'),mk('r-d','12','2026-01-04')]){await DB.scrivi('schede',r);S.schede.push(r);}
 const t={...mk('r-t','5','2026-01-05'),cancellata:new Date().toISOString()};await DB.scrivi('schede',t);S.cestino.push(t);});
await p.evaluate(()=>document.querySelector('#btn-rinumera').click());await p.waitForTimeout(400);
let ord=await p.evaluate(()=>S.schede.map(s=>s.uid+':'+s.prog).sort().join(','));
assert.equal(ord,'r-a:3,r-b:2,r-c:1,r-d:4');
assert.equal(await p.evaluate(()=>S.cestino[0].prog),'5');
assert.equal(await p.evaluate(async()=>(await DB.leggi('schede','r-d')).prog),'4','salvato nell\'archivio');
await p.evaluate(()=>document.querySelector('.toast button').click());await p.waitForTimeout(400);
assert.equal(await p.evaluate(()=>S.schede.map(s=>s.uid+':'+s.prog).sort().join(',')),'r-a:7,r-b:2,r-c:2,r-d:12');
ok('rinumera: 7,2,2,12 → 3,2,1,4 con ordine mantenuto, cestino intatto, annulla ripristina');
// ---- stampa: la stima ambientale si può escludere
const stimaStampa=await p.evaluate(async()=>{const r={...schedaVuota(),uid:'st-1',prog:'1',nome:'Test',altezza:'12',grandezza:'3',circonferenza:'120'};
 const base={qr:false,foto:false,colonne:2,fotoMax:0,campi:null};
 const con=await paginaScheda(r,{...base,stima:true}),senza=await paginaScheda(r,{...base,stima:false});
 return {con:/Stima ambientale/.test(con.textContent),senza:/Stima ambientale/.test(senza.textContent),casella:document.querySelector('#st-stima')?.checked};});
assert.deepEqual(stimaStampa,{con:true,senza:false,casella:true});
ok('stampa: la stima ambientale compare solo se la casella è spuntata');
// ---- stima ambientale facoltativa anche in pagina HTML e report singolo
const sz=await p.evaluate(()=>{const r={...schedaVuota(),uid:'st-2',nome:'T',altezza:'12',grandezza:'3',circonferenza:'120'};
 const ha=(l)=>l.some(x=>x.titolo.startsWith('Stima ambientale'));
 return {c:ha(sezioniScheda(r,'completa',true)),n:ha(sezioniScheda(r,'completa',false)),cc:ha(sezioniScheda(r,'compilati',true)),cn:ha(sezioniScheda(r,'compilati',false))};});
assert.deepEqual(sz,{c:true,n:false,cc:true,cn:false});
const rep=await p.evaluate(async()=>{const r={...schedaVuota(),uid:'st-3',nome:'Rep',altezza:'12',grandezza:'3',circonferenza:'120',foto:[]};S.schede.push(r);
 window.__txt=[];const orig=URL.createObjectURL;URL.createObjectURL=(b)=>{window.__blob=b;return orig(b);};
 const dai=async(spunta)=>{const pr=scaricaReportSingolo(r);await new Promise(o=>setTimeout(o,100));const d=document.querySelector('dialog.dlg-mappa-opzioni');
  d.querySelector('input[type=checkbox]').checked=spunta;d.querySelector('button[value=ok]').click();await pr;return await window.__blob.text();};
 const con=await dai(true),senza=await dai(false);return {con:/Stima ambientale/.test(con),senza:/Stima ambientale/.test(senza)};});
assert.deepEqual(rep,{con:true,senza:false});
ok('stima ambientale facoltativa: stampa, pagina HTML e report singolo');
// ---- catalogo: nome scientifico modificabile (e ripristinabile)
const idPl=await p.evaluate(()=>GUIDA_SPECIE.find(v=>v.nomeSci==='Platanus x').id);
await p.evaluate(()=>{apriCompletaGuida();});
await p.evaluate(id=>apriPiantaCatalogo(id),idPl);
assert.equal(await p.inputValue('#cg-form [name=nomeSci]'),'Platanus x');
await p.fill('#cg-form [name=nomeSci]','Platanus x acerifolia');
await p.evaluate(()=>salvaIntegrazioneGuida());await p.waitForFunction(()=>/completato/.test($('#cg-stato').textContent));
assert.equal(await p.evaluate(id=>GUIDA_SPECIE.find(v=>v.id===id).nomeSci,idPl),'Platanus x acerifolia');
assert.equal(await p.textContent('#cg-nome'),'Platanus x acerifolia');
assert.equal(await p.evaluate(async id=>(await DB.leggi('guida',id)).campi.nomeSci,idPl),'Platanus x acerifolia');
assert.equal(await p.evaluate(()=>trovaSpecieGuida('Platanus x acerifolia')?.pagina>0),true);
// l'esportazione completa resta valida con il nome corretto
assert.equal(await p.evaluate(()=>{const piante=GUIDA_SPECIE.map(v=>({...v}));validaCatalogoCompleto({tipo:'scheda-botanica-catalogo-completo',versione:1,piante,integrazioni:S.guida});return true;}),true);
await p.reload();await p.waitForFunction(()=>typeof GUIDA_SPECIE!=='undefined'&&S.guida&&S.guida.length>0);
assert.equal(await p.evaluate(id=>GUIDA_SPECIE.find(v=>v.id===id).nomeSci,idPl),'Platanus x acerifolia','il nome corretto resta dopo il riavvio');
// svuotando il campo si torna al nome originale
await p.evaluate(()=>apriCompletaGuida());await p.evaluate(id=>apriPiantaCatalogo(id),idPl);
await p.fill('#cg-form [name=nomeSci]','');
await p.evaluate(()=>salvaIntegrazioneGuida());await p.waitForFunction(()=>/rimosse|completato/.test($('#cg-stato').textContent));
assert.equal(await p.evaluate(id=>GUIDA_SPECIE.find(v=>v.id===id).nomeSci,idPl),'Platanus x');
assert.equal(await p.evaluate(async id=>await DB.leggi('guida',id),idPl)==null,true);
ok('catalogo: nome scientifico modificabile, salvato, valido in esportazione, ripristinabile');
// ---- AI: lettura tollerante delle risposte e prova dei servizi
const aiv=await p.evaluate(()=>{
 const c=candidatiAIValidi({candidates:[{name:'Platanus × hispanica',percentuale:'70%'},{nomeScientifico:"Prunus cerasifera 'Pissardii'",confidence:0.6,motivazione:'Foglie rosse'},{nome:'Fagus',percentuale:50},{nome:'Canis lupus'}]});
 const sp=GUIDA_SPECIE.find(v=>!GUIDA_ORIGINALE.get(v.id).fogliaMargine&&!GUIDA_ORIGINALE.get(v.id).frutto);
 const pr=normalizzaProposteAI({proposte:[{campo:'Margine fogliare',valore:'Seghettato'},{campo:'frutto',valore:'Samara'}]},sp);
 return {c:c.map(x=>[x.nome,x.percentuale,x.motivazione]),pr:pr.map(x=>[x.campo,x.valore,x.evidenza])};});
assert.deepEqual(aiv.c,[['Platanus × hispanica',70,'Nessuna motivazione fornita.'],["Prunus cerasifera 'Pissardii'",60,'Foglie rosse'],['Canis lupus',null,'Nessuna motivazione fornita.']]);
assert.deepEqual(aiv.pr,[['fogliaMargine','seghettato',''],['frutto','Samara','']]);
await p.route('https://generativelanguage.googleapis.com/**',r=>{const u=r.request().url();
 if(u.includes('gemini-3.5-flash:'))return r.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{message:'models/gemini-3.5-flash is not found'}})});
 if(u.includes('/models?'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]})});
 return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{text:'{"ok":true}'}]}}]})});});
await p.route('https://api.groq.com/**',r=>r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{message:'reasoning_format must be parsed or hidden'}})}));
await p.evaluate(()=>{chiaviAI={GOOGLE_API_KEY:'k-finta',GROQ_API_KEY:'g-finta'};ServiziRicerca.svuotaCache();});
await p.evaluate(()=>provaServiziAI());
const esitoAI=await p.textContent('#ai-prova-esito');
assert.match(esitoAI,/✓ Gemini: risponde con gemini-3\.8-flash/);
assert.match(esitoAI,/✗ Groq: Groq · llama-3\.3-70b-versatile: richiesta rifiutata dal servizio \(400\) – reasoning_format/);
assert.match(esitoAI,/✗ Groq · slide:/);
await p.evaluate(()=>{chiaviAI={};ServiziRicerca.svuotaCache();});
ok('AI: risposte in formato libero accettate, modello alternativo, prova servizi con errore esatto');
// ---- correzioni dalla revisione: ripristino doppio, pulizia media recenti
const rip=await p.evaluate(async()=>{
 const r=S.schede[0];await spostaNelCestino(r);
 await Promise.all([ripristinaDalCestino(r),ripristinaDalCestino(r)]);await ripristinaDalCestino(r);
 return S.schede.filter(s=>s.uid===r.uid).length+'/'+S.cestino.filter(s=>s.uid===r.uid).length;});
assert.equal(rip,'1/0','una sola copia dopo ripristini ripetuti');
const orf=await p.evaluate(async()=>{
 const nuovo=nuovoId('f'), vecchio='f_'+(Date.now()-3600e3).toString(36)+'_zzzzz';
 await DB.scrivi('foto',new Blob(['x'],{type:'image/jpeg'}),nuovo);await DB.scrivi('foto',new Blob(['y'],{type:'image/jpeg'}),vecchio);
 await pulisciMediaOrfani();const k=await DB.chiavi('foto');return [k.includes(nuovo),k.includes(vecchio)];});
assert.deepEqual(orf,[true,false],'file appena scritto conservato, orfano vecchio eliminato');
ok('revisione: ripristino doppio senza duplicati, pulizia media non tocca i file appena creati');
// ---- CSV dell'app reimportato: le coordinate GPS non si perdono più
await p.evaluate(async()=>{const r=S.schede[0];r.gps={lat:45.123456,lng:7.654321,acc:4,alt:300,quando:new Date().toISOString(),manuale:false};await salvaOra(r);
 const f=new File([testoCSV()],'schede.csv',{type:'text/csv'});window.__imp=importaExcelDaFile(f);});
await p.waitForSelector('#dlg-import[open]');
assert.match(await p.textContent('#import-info'),/Coordinate GPS lette per \d+ righe/);
await p.click('#dlg-import button[value=annulla]');await p.evaluate(()=>window.__imp);
ok('CSV: coordinate GPS lette in importazione');
// ---- 3.39: stampa schede con la mappa come prima pagina
await p.evaluate(async()=>{S.schede[0].altro='Accesso dal cancello nord';await salvaOra(S.schede[0]);});
await p.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());S.selezionate.clear();window.__stampe=0;window.print=()=>{window.__stampe++;};window.__st=apriStampa();});
await p.waitForSelector('#dlg-stampa[open]');
await p.check('#dlg-stampa input[value=tutte]');await p.check('#st-mappa');await p.uncheck('#st-foto');
await p.click('#st-btn-conferma');
await p.waitForFunction(()=>window.__stampe===1,null,{timeout:20000});
const nGpsM=await p.evaluate(()=>S.schede.filter(r=>r.gps).length), nSchedeM=await p.evaluate(()=>S.schede.length);
assert.equal(await p.evaluate(()=>document.querySelector('#stampa').firstElementChild.classList.contains('p-mappa-prima')),true,'la mappa è la prima pagina');
assert.equal(await p.locator('#stampa .p-mappa-box .leaflet-marker-icon').count(),nGpsM);
assert.equal(await p.locator('#stampa .p-scheda').count(),nSchedeM);
assert.equal(await p.locator('#stampa .p-altro').count(),1,'«Altro» stampato solo dove compilato');
assert.match(await p.textContent('#stampa .p-altro'),/Accesso dal cancello nord/);
assert.equal(await p.evaluate(()=>!!document.querySelector('#st-campi input[value=altro]')),false,'«Altro» non è tra i campi selezionabili: è sempre stampato');
const attese=await p.evaluate(()=>{const d=[...new Set(S.schede.map(r=>r.data))].sort();return d.length===1?'il '+dataBreveIT(d[0]):'dal '+dataBreveIT(d[0])+' al '+dataBreveIT(d[d.length-1]);});
assert.equal(await p.textContent('#stampa .p-mappa-prima h2'),'Mappa delle schede rilevate '+attese,'titolo con la data del rilevamento, non di oggi');
await p.emulateMedia({media:'print'});
const pdfM=await p.pdf({preferCSSPageSize:true,printBackground:true});
await p.emulateMedia({media:'screen'});
fs.writeFileSync(out+'/stampa-mappa-schede.pdf',pdfM);const pagineM=(pdfM.toString('latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length;
assert(pagineM>=nSchedeM+1,'mappa + schede: '+pagineM+' pagine');
await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
assert.equal(await p.locator('#stampa .p-mappa').count(),0,'mappa temporanea rimossa dopo la stampa');
assert.equal(await p.evaluate(()=>leggiPref('sb-stampa-mappa')),'1','scelta ricordata');
await p.evaluate(()=>scriviPref('sb-stampa-mappa','0'));
ok('stampa schede: prima pagina con mappa e numeri, poi le schede ('+pagineM+' pagine)');
// ---- 3.38: indicatore dello spazio e controllo prima di scaricare la mappa
const barra=await p.evaluate(()=>{const e=barraSpazio({usato:60*1048576,quota:100*1048576,dettagli:{indexedDB:50*1048576,caches:10*1048576}},20*1048576);
 return {cls:e.className,testo:e.textContent,larg:e.querySelector('.spazio-usato').style.width,agg:e.querySelector('.spazio-aggiunta').style.width};});
assert.match(barra.cls,/livello-attenzione/);assert.match(barra.testo,/60 MB su 100 MB \(60%\).*dopo lo scaricamento \(\+20 MB\): 80%/);assert.match(barra.testo,/Schede, foto e audio: 50 MB/);
assert.equal(barra.larg,'60%');assert.equal(barra.agg,'20%');
await p.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());cambiaVista('mappa');});await p.waitForFunction(()=>typeof mappa!=='undefined'&&mappa);
const blocco=await p.evaluate(async()=>{const vero=statoSpazio;let msg='';const a=window.alert;window.alert=m=>{msg=m;};
 statoSpazio=async()=>({usato:99*1048576,quota:100*1048576});await avviaScaricamentoAreaMappa();statoSpazio=vero;window.alert=a;return msg;});
assert.match(blocco,/Spazio insufficiente/);
await p.evaluate(()=>cambiaVista('schede'));
ok('spazio: barra con previsione, scaricamento mappa bloccato se lo spazio non basta');
// ---- 3.38: editor a due colonne in orizzontale, una colonna se scelto
await p.setViewportSize({width:1340,height:860});
await p.evaluate(()=>apriEditor(S.schede[0].uid));await p.waitForTimeout(300);
let col=await p.evaluate(()=>{const m=document.querySelector('.ed-media').getBoundingClientRect(),z=document.querySelector('#sezioni').getBoundingClientRect();return [m.left>z.right,m.top<z.bottom];});
assert.deepEqual(col,[true,true],'foto e GPS a destra dei campi');
await p.evaluate(()=>{document.body.dataset.editor='una';});await p.waitForTimeout(100);
col=await p.evaluate(()=>{const m=document.querySelector('.ed-media').getBoundingClientRect(),z=document.querySelector('#sezioni').getBoundingClientRect();return m.top>=z.bottom;});
assert.equal(col,true,'una colonna: foto sotto i campi');
await p.evaluate(()=>{document.body.dataset.editor='auto';chiudiEditor&&chiudiEditor();});
await p.setViewportSize({width:390,height:844});
ok('editor: due colonne in orizzontale, una colonna su richiesta');
assert.deepEqual(errs,[]);
await b.close();srv.close();})().catch(e=>{console.error(e);process.exit(1);});
