# Registro delle modifiche · Scheda Botanica PRO

Le versioni più recenti sono in alto.

## 3.41.1 · correzione: archivio non caricato dopo l'aggiornamento

- **Errore corretto**: con la 3.41.0, chi aveva integrazioni salvate nel catalogo delle 144 specie con le vecchie diciture (es. tipo di foglia «aghiforme» o «squamiforme», margine «lobato») vedeva «Avvio non riuscito: Scelta del catalogo non valida» e «Impossibile caricare l'archivio». Ora quei valori vengono accettati («squamiforme» del tipo di foglia diventa «a squame»), e nell'editor del catalogo restano visibili e selezionabili.
- Nessun dato era stato cancellato: le schede e le integrazioni erano intatte nel browser.

---

## 3.41.0 · foglie come nella tabella «Caratteristiche distintive»

- **Tipo di foglia**: semplice · composta · a squame. Gli aghi non sono più un tipo: sono una forma della lamina.
- **Foglia composta**: imparipennata · paripennata · bipennata.
- **Forma della lamina**: rotonda · lobata · ovata · obovata · ellittica · lanceolata · romboidale · palmata · palmato-lobata · flabello · aghiforme.
- **Margine**: intero · dentato · ondulato · seghettato · roncinato · crenato · dentato-spinoso.
- Non inseriti, come richiesto: inserzione, base, apice.
- Nuove icone e spiegazioni per tutti i valori. Con foglie «a squame» spariscono lamina e margine; con lamina «aghiforme» sparisce il margine.
- Le schede salvate prima si adeguano da sole (aghiforme → semplice + lamina aghiforme; squamiforme → a squame). I valori non più in elenco, come «digitata» o «lobato», restano come li avevi scritti.
- Catalogo delle 144 specie: i dati non sono stati toccati; ora trovano corrispondenza anche lobata, rotonda, romboidale, flabello e «spinoso» (= dentato-spinoso). Ricerca per caratteristiche e compilazione automatica usano i nuovi valori.

---

## 3.40.0 · testo «Altro» nella prima pagina della stampa

- Nella finestra di stampa delle schede c'è un nuovo campo di testo libero **«Altro»**: quello che scrivi viene stampato **solo nella prima pagina** (sotto il titolo della mappa), non nelle singole schede. La mappa si accorcia quanto serve per restare nella stessa pagina.
- Se la pagina con la mappa non è attiva, il testo compare in cima alla prima scheda.
- Il testo viene ricordato per la stampa successiva; svuotando la casella non si stampa nulla.

---

## 3.39.1 · data del rilevamento nei titoli

- Nella mappa stampata come prima pagina delle schede il titolo riporta la **data del rilevamento** delle schede, e non più la data di oggi: «Mappa delle schede rilevate il 03/10/2026», oppure «… dal 03/10/2026 al 05/10/2026» se le date sono più di una. La data di stampa resta nel sottotitolo.
- Stesso criterio per il titolo proposto in «Stampa mappa» e nella pagina HTML mappa + schede.

---

## 3.39.0 · stampa delle schede con la mappa in prima pagina

- Nella finestra **Stampa → Schede A4** c'è la nuova casella **«Prima pagina con la mappa e i numeri delle schede»**. La prima pagina mostra la mappa con i numeri delle schede stampate che hanno il GPS (verde: scheda; rosso: problemi segnalati), con scala e nord; seguono le schede, una per pagina.
- La mappa si adatta da sola alle schede scelte (selezionate, visibili o tutte); con una sola scheda il titolo diventa «Posizione della scheda N° …». Se nessuna scheda ha il GPS, l'app stampa senza mappa e lo segnala.
- La scelta viene ricordata. La «Stampa mappa» dalla vista Mappa usa ora la stessa funzione.

---

## 3.38.0 · indicatore dello spazio ed editor a due colonne

- **Indicatore dello spazio:** in *Backup e configurazione* una barra mostra lo spazio usato dall'app su quello concesso dal browser, con il dettaglio «Schede, foto e audio» e «Mappe offline, slide e app». La barra è verde fino al 70%, gialla fino al 90%, poi rossa, con un avviso.
- **Prima di scaricare una zona di mappa** la stessa barra mostra quanto spazio occuperà (parte tratteggiata). Oltre l'85% chiede conferma; oltre il 97% blocca lo scaricamento, così foto e schede hanno sempre posto.
- **Editor a due colonne:** con il tablet in orizzontale (schermo largo almeno 1000 px) i campi stanno a sinistra, mentre GPS, foto e note vocali stanno a destra e restano visibili mentre scorri. In verticale e sul telefono non cambia nulla. Si può tornare a una colonna da *Configurazione → Scheda in modifica*.
- Corretto: nella barra in alto dell'editor la scritta «Foto» era più grande delle altre.

---

## 3.37.0 · AI affidabile, correzioni dalla revisione del codice

**Assistente AI**
- **Gemini:** il modello predefinito diventa `gemini-3.5-flash`, perché Google non concede più Gemini 2.5 alle chiavi nuove. Se il modello non è concesso alla chiave (errore 400, 403 o 404, oppure quota gratuita 0) l'app sceglie da sola un altro Flash disponibile.
- **Groq:** le slide ora funzionano. Il modello con immagini (Qwen 3.8) rifiutava ogni richiesta (400) perché il ragionamento restava nel testo; ora viene nascosto. La ricerca testuale usa `llama-3.3-70b-versatile`, più preciso del precedente 8B.
- **Slide:** a Groq e OpenRouter le slide arrivano in JPEG, formato accettato da tutti i modelli. Gemini riceve ancora il WebP originale.
- **Risposte lette meglio:** il JSON viene trovato anche con ragionamento o testo attorno. Sono accettate le percentuali scritte come «70%» o 0,7, le chiavi in inglese, la motivazione mancante, gli ibridi («Platanus × hispanica») e le cultivar («Prunus cerasifera 'Pissardii'»). Le proposte dalla slide accettano maiuscole e accenti diversi.
- **Errori chiari:** ora l'errore riporta il motivo esatto dato dal servizio, con le chiavi oscurate.
- Nuovo pulsante **«🩺 Prova i servizi AI»** in Configurazione: per ogni chiave mostra quale modello risponde o perché fallisce.

**Correzioni**
- **Cestino:** ripristinare due volte la stessa scheda (doppio tocco, o «Annulla» subito dopo) la duplicava, e il backup successivo non era più ripristinabile.
- **Excel/CSV:** «Sostituisci» cancellava anche la traccia GPS e il catalogo delle specie identificate; ora restano. Il CSV esportato dall'app, reimportato, conserva le **coordinate GPS**.
- **Pulizia all'avvio:** la pulizia dei file senza scheda poteva cancellare una foto o un audio appena creati; ora i file degli ultimi 10 minuti non vengono toccati.
- **Mappa offline:** le tile della mappa offline erano salvate come risposte «opache», che contano circa 7 MB l'una sulla quota del browser e potevano riempirla, fino a impedire i salvataggi. Ora si salvano solo tile vere. Per questo la vecchia cache delle tile viene svuotata: le zone offline vanno riscaricate.
- **Etichetta QR:** se appartiene a una scheda nel cestino, l'app propone di ripristinarla invece di dare un messaggio incomprensibile.
- **Stampa:** non resta più su «Schede selezionate» quando non ci sono selezioni; con nessun campo spuntato avvisa, invece di stampare schede vuote.
- **Avvio:** un errore nell'import dalla versione precedente non blocca più l'avvio.
- **GBIF:** l'ID confermato da una ricerca non viene più sovrascritto dalla ricerca automatica.
- Codice ripetuto unificato (valori delle scelte) e icone aggiunte alla cache offline.

---

## 3.36.1 · pagina HTML: ogni scheda in una pagina propria

- **Corretto:** nella pagina HTML mappa + schede, toccando il numero 13 e «Vai alla scheda» si finiva sulla scheda 11: lo scorrimento lungo la pagina veniva falsato dalle foto che si caricavano nel frattempo.
- Ora «Apri la scheda →» (e un tocco sull'intestazione di una scheda nell'elenco) apre **solo quella scheda in una pagina propria**, in cima. In alto: **← Mappa**, **‹** precedente e **›** successiva, con la posizione (es. «N° 13 · 13 di 13»).
- Il tasto **Indietro** del telefono torna alla mappa, nello stesso punto di prima.
- «📍 Mostra sulla mappa» dentro la scheda chiude la pagina e centra la mappa sul punto.

---

## 3.36.0 · nome modificabile nel catalogo

- Nel **Catalogo delle piante** (Configurazione → Completa catalogo) ogni pianta ha ora il campo **«Nome scientifico»** modificabile, per correggere nomi incompleti come «Platanus x» → «Platanus x acerifolia».
- Il nome corretto viene salvato come integrazione: compare ovunque (elenco, ricerche, suggerimenti), è incluso nei backup e nell'esportazione del catalogo. Svuotando il campo si torna al nome originale della guida.
- Per correggere il solo nome non serve indicare la fonte.

---

## 3.35.3 · margini di stampa

- **Tema scuro:** in stampa e in «Salva come PDF» i margini della pagina venivano neri, e il foglio sembrava senza margini. Ora la pagina è sempre bianca, margini compresi.
- **Margini più ampi:** passano da 12 a **15 mm** per schede A4, report singolo, stampa della mappa e pagina HTML. Il riquadro della mappa è stato ridotto di conseguenza.

---

## 3.35.2 · stima ambientale facoltativa

- Nuova casella **«Stima ambientale»** (volume chioma, ombra, CO₂) nella finestra **Stampa** delle schede A4, nella creazione della **pagina HTML mappa + schede** e nel **report singolo** di una scheda: spuntata la stima c'è, tolta la spunta no.
- La scelta è unica e viene ricordata per tutte e tre le funzioni.
- Nella pagina HTML la stima è ora indipendente da «scheda completa / solo campi compilati».

---

## 3.35.0 · rinumera le schede

- In **Configurazione e backup → Configurazione** c'è il nuovo pulsante **«Rinumera le schede»**: dopo aver cancellato delle schede riporta i N° progressivi in fila (1, 2, 3…), mantenendo l'ordine attuale (a parità di numero, per data di creazione).
- Chiede conferma spiegando che QR, etichette, stampe ed esportazioni già fatti restano con i vecchi numeri; subito dopo si può **annullare**.
- Le schede nel cestino non vengono toccate.

---

## 3.34.0 · pagina HTML con la scheda completa

- Nella pagina HTML mappa + schede ogni pianta mostra, insieme alle foto, la **scheda completa** come nella stampa: sezioni Osservazioni, Vegetazione, Pedologia, Fitopatologia e Note con tutti i campi (quelli vuoti con «—»), stima ambientale e date di creazione e ultima modifica.
- Nuova scelta **«Schede»** nella finestra di creazione: scheda completa (predefinita) oppure solo i campi compilati, come prima.
- La ricerca della pagina trova anche i valori di tutti i campi.

---

## 3.33.0 · pagina HTML più leggera

- Nuova scelta **«Dimensione delle foto»** nella creazione della pagina HTML: piccole (720 px, predefinita), medie (1080 px), grandi (1600 px).
- Foto e tile della mappa salvate in **WebP** quando il browser lo permette (altrimenti JPEG): a parità di aspetto pesano molto meno. Nelle prove una foto «piccola» pesa circa un terzo di prima, una «media» circa la metà.
- Alla fine il messaggio indica quanto pesano il file, le foto e la mappa offline, per capire cosa alleggerire.

---

## 3.32.2 · pagina HTML: sfondo stradale senza «API KEY REQUIRED»

- Il servizio CARTO usato dalla 3.32.0 per lo sfondo stradale ora chiede una chiave e manda tile con la scritta «API KEY REQUIRED» (finite anche nelle mappe salvate nel file). Lo stradale ora viene da **Esri World Street Map**, come il satellite: nessuna chiave, funziona aprendo il file dal telefono.
- Nuovo sfondo **Topografica** (Esri World Topo Map), da scegliere con il pulsante 🗺️ e salvabile nel file per l'uso offline.
- Le pagine create con la 3.32.0 vanno ricreate dall'app per avere lo sfondo corretto.

---

## 3.32.1 · «Altro notato» solo tue

- L'identificazione con PlantNet **non scrive più nulla** in «Altro notato»: le note sono solo quelle che scrivi tu.
- Le righe «Identificato con PlantNet: …» aggiunte dalle versioni precedenti vengono **tolte da sole** da tutte le schede all'apertura dell'app, e anche da backup, ZIP ed Excel importati. Il resto delle tue note resta identico.
- I dati dell'identificazione (specie, nome comune, percentuale, data) restano salvati a parte e si vedono accanto al collegamento «↗ Scheda PlantNet» (es. «· 7% il 03/10/2026»).

---

## 3.32.0 · pagina HTML della mappa: sfondo online e offline

- **Risolto lo sfondo bloccato («403 Access blocked»)**: aperta dal telefono come file, la pagina non può usare i server di OpenStreetMap (rifiutano le richieste senza indirizzo di provenienza). Ora usa lo sfondo **stradale** (dati OpenStreetMap, servizio CARTO) e il **satellite** (Esri), che si scelgono con il pulsante 🗺️.
- **Mappa anche senza Internet**: nella creazione della pagina la nuova opzione «Mappa senza Internet» salva dentro il file le tile della zona delle schede (stradale, satellite o entrambe), fino allo zoom più vicino possibile restando leggeri (circa 260 tile per sfondo). Senza rete la pagina usa quelle; oltre lo zoom salvato ingrandisce le tile già presenti invece di mostrare il grigio.
- Indicatore sulla mappa: «Online» oppure «Offline · sfondo salvato nel file»; tornata la rete, le zone mancanti si caricano da sole.
- Se la rete manca mentre crei la pagina, un avviso spiega che lo sfondo non è stato salvato.

---

## 3.31.0 · controllo dei layout di stampa

Verificate con PDF di prova (20 schede, nomi e note molto lunghi, foto di proporzioni diverse) tutte le stampe: schede, etichette QR, mappa, report singolo e pagina HTML mappa+schede.

- **Margini uniformi di 12 mm** su tutti i lati, in verticale e in orizzontale; il report singolo e la pagina HTML (prima stampati a filo del foglio, con margini 0–5 mm) ora hanno gli stessi margini.
- **Niente più pagine vuote o tagli**: la spaziatura sotto il corpo dell'app e lo zoom dell'interfaccia (110 %/125 %) non influiscono più sulla stampa. Prima aggiungevano una pagina vuota in coda alla mappa orizzontale e potevano spingere il contenuto oltre il foglio.
- **Foto**: mai più spezzate tra due pagine né ritagliate; vengono mostrate intere (senza tagli ai bordi) in righe che restano insieme.
- **Sezioni lunghe** (note, fitopatologia): scorrono sulla pagina successiva invece di lasciare mezza pagina bianca.
- **Tabelle giustificate**: schede, elenco della mappa, report e pagina HTML hanno colonne a larghezza fissa e testo giustificato con sillabazione; l'ultima riga di ogni cella resta allineata a sinistra per evitare spazi anomali. Elenco mappa con intestazione ripetuta se va su più pagine.
- **Etichette**: il nome lungo va a capo (massimo due righe) invece di essere troncato con «…».
- Mappa stampata: riquadro ridimensionato per stare sempre nell'area utile del foglio.

---

## 3.30.2 · classe di grandezza: anche «4ª grandezza»

Anche l’ultima voce perde la dicitura tra parentesi: ora le quattro classi sono «1ª grandezza», «2ª grandezza», «3ª grandezza», «4ª grandezza». I file, i backup e gli Excel esportati con le vecchie diciture («1ª grandezza (maggiore)», «4ª grandezza (minore)») si importano come prima. Nessuna modifica ai dati.

---

## 3.30.1 · classe di grandezza

La prima voce di «Classe di grandezza» è ora solo «1ª grandezza» (senza «(maggiore)»), sia nella scheda sia nella ricerca per caratteristiche. I file e i backup già esistenti con la vecchia dicitura si importano come prima. Nessuna modifica ai dati.

---

## 3.30.0 · misura altezza semplificata, foglia composta, stampa ed esportazione della mappa

**Misura altezza, più semplice.** La finestra è diventata una procedura guidata: prima si sceglie il metodo (telefono, foto, ombra), poi ogni schermata chiede una cosa sola con un disegno e istruzioni brevi.
- *Con il telefono*: distanza (o passi) → mira della cima → mira della base. Per fissare basta toccare l’immagine della fotocamera. La base si può saltare su terreno piano. Il risultato dice se la misura è nelle condizioni consigliate o suggerisce di avvicinarsi/allontanarsi. Taratura e altezza occhi sono in un riquadro a parte. Senza sensore compare l’inserimento a mano.
- *Da foto*: scelta del riferimento con un tocco (persona 1,70 m, bastone 1 m, stadia 2 m, altro) e 4 punti chiesti uno alla volta, con «Annulla punto» e ingrandimento.
- *Ombra*: tre misure in ordine.

**Tipo di foglia composta.** Nuovo campo illustrato (imparipennata, paripennata, bipennata, digitata) che compare solo con Tipo di foglia = composta e si svuota cambiando tipo. Le regole di `DIPENDENZE_CAMPI` accettano ora anche `tranne` («mostra solo per questo valore»). Il campo è usato dalla guida delle 144 (compilazione, confronto, ricerca per caratteristiche), dall’importazione Excel, da stampa, CSV e backup. Stampa e report saltano i campi non pertinenti invece di mostrare un trattino.

**Mappa.** Due pulsanti nella vista Mappa:
- *🖨 Stampa mappa*: area visibile o tutte le schede con GPS, A4 orizzontale/verticale, numeri colorati, scala, nord, traccia facoltativa ed elenco delle schede su una pagina a parte. Funziona anche come «Salva come PDF».
- *⭳ Pagina HTML mappa + schede*: un unico file .html con mappa interattiva (Leaflet incluso), schede con caratteristiche, foto ridotte (una, tutte o nessuna) e ricerca. Si apre ovunque senza installare nulla.

Nuovo file `js/mappa-export.js`, nella cache offline. Nessuna migrazione del database.

---

## 3.29.0 · misura dell’altezza

Sotto il campo **Altezza** c’è il pulsante **📐 Misura**, che apre una finestra con tre metodi, tutti offline:

- **Clinometro**: fotocamera con croce di mira e sensore di orientamento del telefono. Si fissano l’angolo della cima e quello della base; con la distanza orizzontale l’app calcola H = D × (tan α cima − tan α base), valido anche in pendenza. Senza angolo base usa l’altezza degli occhi. La distanza si può ricavare dai passi. «Tara 0°» corregge l’errore del sensore e resta salvata sul dispositivo.
- **Da foto**: si scatta una foto, se ne sceglie una dalla galleria o si usa una foto già salvata nella scheda; si segnano base e cima dell’albero e di un oggetto di altezza nota. Zoom e frecce per posizionare i punti con precisione.
- **Ombra**: rapporto tra l’ombra dell’albero e quella di un bastone.

Il valore entra nella scheda solo con **Usa nella scheda**; se l’altezza è già compilata chiede conferma prima di sostituirla. La stima di volume e CO₂ si aggiorna subito. Le foto scelte nella finestra non vengono salvate nella scheda. La fotocamera si spegne alla chiusura.

Nuovo file `js/altezza.js`, aggiunto alla cache del service worker. Aiuto aggiornato. Nessuna modifica al database né ai campi esportati.

---

## 3.28.0 · unione backup sicura, slide offline, pulizie

**Correzioni**
- **Unione backup campo per campo.** Prima, in «unisci», vinceva l’intera scheda modificata più di recente: le foto aggiunte su un telefono sparivano se il collega aveva modificato la stessa scheda dopo. Ora i campi vuoti si completano a vicenda, i valori diversi si scelgono in una finestra (preselezionata la versione più recente; per «Altro notato» e «Problemi» anche «Entrambe»), il GPS resta un blocco unico e foto/audio si sommano sempre. Reimportare lo stesso backup non duplica più nulla.
- **File orfani.** Le foto delle schede sostituite durante le vecchie unioni restavano nel database occupando spazio. Ora vengono eliminate all’avvio e dopo ogni importazione.
- **Slide offline.** Le 144 slide del corso si scaricano da sole alla prima apertura online (~9 MB) in una cache che sopravvive agli aggiornamenti. In Configurazione c’è il pulsante «Scarica slide per uso offline» con il conteggio; l’indicatore in alto mostra «offline parziale» finché mancano.
- **Avviso iPhone/iPad.** Non veniva mai mostrato. Ora compare al massimo ogni 30 giorni, con lo spazio reale usato e, se l’app non è installata, l’avviso che Safari può cancellare i dati dopo 7 giorni senza visite.
- **Editor.** Il menu «Cerca» non resta aperto passando da una scheda all’altra; aprire una scheda da un’altra non aggiunge voci al tasto «indietro»; un doppio tocco su «Nuova scheda» non crea due schede.

**Pulizie**
- Rimossi il vecchio backup JSON (non più raggiungibile dal menu; i vecchi file .json si ripristinano ancora), una funzione di unione del catalogo mai usata e la diagnostica del service worker che leggeva un dato mai scritto.
- Le preferenze in `localStorage` passano da `leggiPref`/`scriviPref`: in navigazione privata o con memoria piena l’app non si blocca.
- Backup ZIP più veloce: foto e audio, già compressi, vengono archiviati senza ricomprimerli.
- `scripts/versione.py` imposta la versione in tutti i file e alza la cache del service worker; `tests/versione.cjs` controlla che coincidano.
- Le revisioni separate sono riunite in questo file.
- `app.js` (5.300 righe) diviso in moduli dentro `js/`: `guida.js`, `mappa.js`, `stampa-qr.js`, `backup.js`; restano in `app.js` stato, editor, elenco, foto, audio e avvio. Il service worker mette in cache anche i nuovi file.
- Gli stili ripetuti nel codice JS sono diventati classi in `app.css`.

**Test** – Suite aggiornate alle funzioni recenti (attese, conferma aggiornamento, maiuscola automatica). Verificati 41 controlli Chromium, 2 di resilienza, 32 gruppi di ricerca e la coerenza della versione. Nessuna migrazione del database: i dati esistenti restano invariati.

---

## 3.27.6 · miniatura della slide

Sotto il campo Data del rilievo compare una miniatura della pagina del corso quando il nome coincide con una specie o cultivar delle 144 piante. Tocca la miniatura per aprire la slide ingrandita nel visualizzatore già presente; Chiudi torna alla scheda. La miniatura si aggiorna quando apri un rilievo o cambi il nome, anche tramite un risultato di ricerca.

Non vengono scelte slide per somiglianza o per un nome parziale. Un nome non presente, vuoto o scritto con un refuso non mostra la miniatura. Se l’immagine non è disponibile, il riquadro viene nascosto; la disponibilità offline dipende dal precedente download della slide. Nessuna API key, modifica del rilievo o migrazione del database. La miniatura è un pulsante accessibile anche con tastiera, separato dall’etichetta della data.

Versione 3.27.6 e cache offline v51; Aiuto aggiornato. Verificati sintassi JavaScript, 32 gruppi di test di ricerca simulati e comportamento della miniatura su specie, cultivar, apertura, cambio nome, assenza di corrispondenza, immagine mancante e errore tardivo di un’immagine precedente. Test Chromium non eseguiti in questo ambiente: browser di test non disponibile.

Pubblica lo ZIP completo da Drive con pubblica → 1, poi aggiorna dall’app e verifica v3.27.6. L’archivio dei soli file modificati va sovrapposto al progetto 3.27.5 completo, senza cancellare gli altri file. Non cancellare i dati del sito.

---

## 3.27.5 · Apri scheda locale

Aggiunto il pulsante **Apri scheda locale** come prima voce del menu **Cerca** sotto Nome esemplare. Un nome esatto apre direttamente la scheda della specie o cultivar nel catalogo delle 144; un nome parziale mostra l’elenco filtrato; senza nome mostra tutto il catalogo. La scheda locale include slide, note, caratteristiche e integrazioni salvate. Non richiede API key né avvia richieste online. La disponibilità offline delle slide richiede che siano state scaricate dall’app.

Consultare e chiudere non modifica il rilievo. Il comando esistente **Usa questo nome nella scheda** resta esplicito e mantiene gli avvisi sui dati già compilati. Ricerca per caratteristiche e servizi online restano comandi distinti.

Aggiornati Aiuto e documentazione. Versione 3.27.5, cache offline v50, nessuna modifica allo schema del database.

### Verifiche

Controllata la sintassi JavaScript e i flussi locali per nome esatto, cultivar, nome parziale, nome vuoto con caratteristiche già presenti e nome fuori catalogo. Le prove verificano che non partano ricerche web e che i dati restino invariati. Superati anche i 32 gruppi già esistenti di test di ricerca con servizi simulati. I test Chromium non sono stati eseguiti in questo ambiente: il browser di test non è disponibile.

### Installazione

Pubblica lo ZIP completo da Drive con **pubblica → 1**. Dopo la pubblicazione su GitHub Pages, tocca la versione nell’app e aggiorna: deve apparire **v3.27.5**. Non cancellare i dati del sito. L’archivio con i soli file modificati va sovrapposto al progetto **3.27.4 completo**, conservando tutti i file non inclusi.

---

## 3.27.4 · ricerca per nome e indisponibilità AI

- Il nome inserito guida la ricerca locale: la specie esatta viene prima delle cultivar e dei refusi. Non viene esclusa dai primi otto risultati quando altre piante condividono più caratteri generici. Con un nome, le piante estranee non vengono aggiunte dalla sola somiglianza dei caratteri; AI e foto possono comunque proporre alternative con la fonte indicata.
- Possibili refusi in un binomio (un solo carattere errato) vengono segnalati come suggerimenti, senza modifiche automatiche. «rubinia pseudoacacia» propone Robinia pseudoacacia. I caratteri sono indicati come 2/2, senza un fuorviante 100%; pochi indizi vengono segnalati.
- Errori AI 502/503/504: massimo due riprove dopo circa 1 e 2 secondi, sullo stesso servizio e modello, con stato visibile. Nessun cambio automatico di provider. Chiudere la ricerca impedisce nuove riprove; una richiesta già inviata può terminare. Ogni tentativo ha un timeout di 60 secondi. Nessuna riprova automatica per 401/403, 429 o errori di formato.
- Un errore AI mostra «Ricerca AI non completata» e «Riprova AI», distinto dall’assenza di taxa verificabili. Nessuna modifica alla scheda o alle chiavi. Guida, Wikipedia e GBIF restano utilizzabili quando l’AI fallisce.
- Aiuto e ASSISTENTE-AI.md aggiornati; versione 3.27.4 e cache offline v49. Database invariato.

### Verifiche

32 gruppi di test con rete simulata superati, senza credenziali reali: includono Robinia esclusa da otto aceri, refuso rubinia, nome ignoto, ricerca senza nome, errore 503 transitorio e persistente, limite di tentativi, chiusura durante attesa e messaggio di errore nell’app. Verificata la sintassi JavaScript. Aggiunto un test browser sul catalogo reale per il refuso; i test Chromium non sono stati eseguiti in questo ambiente perché il browser non è installato e il suo download precedente è fallito. GitHub esegue la suite completa con il workflow esistente.

I test simulati verificano la gestione delle risposte, non la disponibilità dell’account Gemini dell’utente. Un 503 del servizio esterno può persistere anche con questa revisione.

### Installazione

Pubblica lo ZIP completo con pubblica → 1, dalla cartella Drive associata. Dopo il completamento di GitHub Pages, tocca la versione nell’app, accetta l’aggiornamento e verifica **v3.27.4**. Non cancellare i dati del sito. Lo ZIP dei soli file modificati va sovrapposto al progetto completo 3.27.3, senza eliminare gli altri file; non è un progetto completo. Le schede, le integrazioni delle 144 piante e le chiavi restano nel browser.

---

## 3.27.3 · ricerca botanica

### Modifiche

- Nessuna generazione di `Prova1`, `Prova2` ecc. Le vecchie etichette interne non sono più visualizzate o cercate; i veri nomi botanici e le osservazioni salvate non vengono modificati. Nuove schede: nome vuoto, data odierna e scarto della bozza con soli valori automatici.
- PlantNet per nome è ora una richiesta al catalogo ufficiale, con risultati dentro l'app, paginati (massimo 20), nome e autore. Il sito esterno è un link distinto, presente solo se è noto il riferimento della specie. Nessuna richiesta di immagini del piano Pro.
- GBIF: filtro Plantae, corrispondenza esatta, confidenza minima e rango verificati anche nella ricerca del link. Il comando di ricerca del nome comune prova Wikipedia e non applica corrispondenze incerte o generi come specie.
- AI: trasporto condiviso fra ricerca e slide, separazione dei modelli Groq per testo e immagini, recupero dai 404 dei modelli predefiniti tramite catalogo ufficiale e una sola riprova. Nessun cambio di provider né modello OpenRouter arbitrario. Servizio e modelli configurabili; messaggi distinti per accesso negato, quota, timeout e JSON invalido.
- Verifica delle proposte AI su GBIF: un problema di rete non viene confuso con l'assenza di candidati. Le richieste non inviano note personali, GPS, data, numeri o DB intero.
- Foto PlantNet: timeout di 60 secondi anche nella ricerca intelligente, 404 contestualizzato, risposte tardive ignorate dopo chiusura/cambio scheda. La verifica della chiave non invia più una foto finta.
- Guida per caratteristiche: azzeramento delle parole chiave rimaste dalla ricerca precedente. Wikipedia: scarto delle risposte diventate obsolete cambiando ricerca/modalità o chiudendo il modulo, con conferma prima di sostituire un nome già presente.
- Le percentuali restano separate per fonte e i campi già compilati non vengono sovrascritti. Anche le dipendenze del tipo di foglia non cancellano osservazioni durante il completamento dalla guida: un valore che le renderebbe non pertinenti viene lasciato non applicato e segnalato. Ogni dialogo spiega la ricerca effettivamente avviata.
- Nuovo modulo `js/ricerca-servizi.js` incluso nell'app shell offline; cache v48 e versione 3.27.3. Nessuna migrazione distruttiva del database.

### Verifiche

`npm run test:search` esegue 24 gruppi di prove senza rete o credenziali reali: richieste AI testo/immagine, recupero 404, errore del modello scelto, quota/accesso, JSON invalido, query PlantNet, filtro GBIF, timeout, nuove schede e vecchie etichette, flussi PlantNet/AI/GBIF, privacy, verifiche indisponibili, foto, risultati parziali della ricerca intelligente, risposte tardive e dipendenze dei campi nel completamento dalla guida. Aggiornati anche i test browser per etichette rimosse e ricerca PlantNet interna. `npm test` esegue prima queste prove e poi i test browser e di resilienza.

In questa revisione i test di logica simulata e sintassi sono stati eseguiti; i test Chromium non sono stati eseguiti nell'ambiente di preparazione perché il download del browser è fallito. Non sono state utilizzate API key dell'utente: disponibilità, CORS e quote del suo account vanno verificati sul tablet. GitHub può eseguire la suite completa installando Chromium dal workflow già presente.

### Installazione

Fai prima un backup dei rilievi. Pubblica lo ZIP completo per evitare file mancanti. Se usi i soli file modificati, devono essere sovrapposti al progetto **3.27.2 completo**, senza eliminare i file non inclusi. Il file `__patch_only__.txt` indica che l'archivio è un aggiornamento parziale: non usarlo come sostituzione completa.

Dopo la pubblicazione tocca la versione, accetta il download dell'aggiornamento e «Aggiorna ora». Deve apparire **v3.27.3**. Non cancellare i dati del sito o il database per aggiornare. Configura la chiave PlantNet separatamente da open.env e consulta **Aiuto** oppure `ASSISTENTE-AI.md` per tutte le voci di ricerca.

---

## 3.27.2

- `Prova1`, `Prova2` e successivi sono ora etichette interne delle schede e non nomi botanici.
- Il campo «Nome esemplare» di una nuova scheda resta vuoto.
- L’etichetta interna compare nell’elenco, nel menu «Apri scheda salvata» e nei risultati della ricerca.
- La data odierna, il progressivo, il numero nel giorno e il valore predefinito degli esemplari non bastano a salvare una scheda.
- Uscendo da una scheda senza dati reali, foto, GPS o nota vocale, la bozza viene eliminata automaticamente.
- Anche le bozze vuote rimaste dopo una chiusura improvvisa del browser vengono eliminate al successivo avvio.
- Se si chiude la scheda mentre termina una nota vocale, l’app attende il salvataggio dell’audio prima di decidere se conservare la scheda.

---

## 3.27.1

- Prima di aprire il selettore di cartelle, l’app spiega perché richiede l’autorizzazione.
- L’utente deve confermare esplicitamente prima che venga mostrata la richiesta del browser.
- Il messaggio chiarisce che il permesso riguarda soltanto la cartella scelta.
- L’app non cancella file, non accede alle altre cartelle e non invia online i salvataggi.
- Se l’utente rifiuta, non cambia nulla: i file continuano nei Download normali.
- La stessa spiegazione viene mostrata quando il browser richiede di riautorizzare una cartella ricordata.

---

## 3.27.0

### Aggiornamenti dell’app

- Il pulsante della versione in alto a destra controlla sempre `versione.json` senza cache.
- Se la versione pubblicata è più recente, mostra il numero e chiede conferma prima di scaricarla.
- Dopo il download compare **Aggiorna ora**; prima del riavvio vengono salvate le modifiche in sospeso.
- Schede, foto, audio, tracce e catalogo restano nell’archivio locale durante l’aggiornamento.

### Nuove schede

- La data viene impostata automaticamente al giorno corrente.
- Il nome iniziale segue il progressivo: `Prova1`, `Prova2`, `Prova3`…
- Il nome è provvisorio e può essere sostituito immediatamente con quello botanico.
- Dopo **Nuovo elenco**, progressivo e nome ripartono da 1.

### Apertura rapida

- In prima pagina compare **Apri scheda salvata…**.
- Ogni voce mostra numero progressivo, nome e data.
- La scelta apre direttamente l’editor senza modificare o filtrare l’archivio.

### Cartella Download/Botanica

- In **Backup e configurazione → Cartella dei salvataggi** si può collegare una cartella nei browser compatibili.
- Selezionando Download, l’app crea o usa la sottocartella `Botanica`.
- Backup ZIP, QR, report, CSV, GeoJSON, KML, GPX, Excel e cataloghi passano tutti dalla stessa funzione di salvataggio.
- Se un nome esiste già, viene creata una copia numerata invece di sovrascrivere il salvataggio precedente.
- La cartella autorizzata viene ricordata localmente in IndexedDB. I file non vengono inviati a server esterni.
- Se il permesso scade, l’app chiede di riautorizzare; se la funzione non è supportata usa il normale download del browser.
- Android e iOS possono limitare la scelta delle cartelle: una PWA non può aggirare i permessi del sistema operativo.

### Sicurezza

- La cartella non viene mai cancellata o svuotata dall’app.
- Un file con lo stesso nome può essere sostituito solo nella cartella esplicitamente autorizzata.
- `open.env` e le chiavi API non entrano nei backup o nella cartella dei salvataggi.

---

## 3.26.9

- «Nuovo elenco» è ora un’azione primaria della sezione **Sul campo**, accanto ad «Avvia traccia».
- I comandi di ricerca del nome hanno una gerarchia più compatta: **Cerca** apre le singole fonti e **Cerca intelligente** combina quelle disponibili.
- Aggiunta **Cerca con AI** per interpretare il nome e le caratteristiche botaniche già compilate.
- Le proposte AI sono sempre facoltative, mostrano percentuale e motivazione e non modificano la scheda senza conferma.
- Ogni taxon proposto dall’AI viene accettato solo dopo una corrispondenza esatta nel regno Plantae su GBIF.
- L’app continua a funzionare senza chiavi AI; foto, note, GPS e altri dati personali non vengono inviati dalla ricerca AI.
- Aggiunti test automatici per posizione dei pulsanti, filtro botanico AI e assenza di compilazione automatica.

---

## 3.26.8 · controllo di progetto e pubblicazione

### Correzioni nel progetto botanico

- **+ Nuova scheda nell'editor:** eliminato un riferimento a una variabile inesistente nel ripristino del pulsante. Il comando torna utilizzabile anche quando il salvataggio fallisce; la scheda corrente resta recuperabile.
- **Traccia GPS:** i fix validi già ricevuti restano nella coda di salvataggio anche premendo subito Pausa o Stop. La ripresa crea un segmento distinto anche se il database sta ancora scrivendo i punti precedenti. I callback arrivati dopo lo Stop vengono ignorati.
- **Backup JSON, ZIP e percorso GPX:** l'esportazione attende i punti GPS in coda. Anche l'importazione attende le scritture precedenti prima di sostituire l'archivio.
- **Backup malformati:** i campi schede, specie, guida e traccia devono essere elenchi; foto, audio e file devono essere indici. Un campo presente del tipo sbagliato viene rifiutato prima di modificare i dati, invece di essere interpretato come un elenco vuoto.
- **Aggiornamento dell'app:** impedito mentre ci sono integrazioni del catalogo da salvare o mentre è in corso la richiesta di accesso al microfono. Prima dell'attivazione vengono completate le scritture GPS in coda.
- **open.env:** supportati commenti dopo valori tra virgolette, righe export, BOM e terminatori Windows. Le righe con virgolette incomplete vengono ignorate. Le chiavi restano escluse dai backup botanici.
- **Richieste AI sovrapposte:** una risposta relativa a un'altra pianta non riattiva il pulsante di una richiesta nuova ancora in corso.
- Versione aggiornata a **3.26.8** e cache offline rinnovata. I test di aggiornamento simulano automaticamente la versione successiva.

### Script pubblica — versione 2026.10.02

Lo script aggiornato viene fornito separatamente dal progetto.

- ZIP con cartella esterna riconosciuti prima di stabilire se sono completi o patch. Il marcatore `__patch_only__.txt` viene riconosciuto anche dentro tale cartella e non viene pubblicato.
- Una cartella esterna ambigua, ad esempio un archivio contenente soltanto `src`, richiede di scegliere se usare il suo contenuto come radice.
- Le cartelle Drive associate mostrano il nome attuale quando compare nell'elenco della radice; non restano bloccate al vecchio nome «Scheda Botanica PRO» dopo una rinomina in «piante».
- Un errore nell'elenco Drive viene segnalato; restano utilizzabili le associazioni salvate e l'inserimento manuale del link/ID.
- Workflow GitHub aggiunti, modificati o rimossi: è possibile includerli esplicitamente. La scelta predefinita conserva quelli pubblicati. Per includerli serve una credenziale Git con i permessi necessari; un eventuale rifiuto conserva il commit locale, recuperabile con la scelta **6**.
- Quando vengono conservati i submodule, resta anche la loro configurazione `.gitmodules`.
- Corretto il messaggio dei commit non pubblicati: indica **6**, non 4. Il ripristino indica il ramo effettivo.
- Migliorate le verifiche sui nomi dei repository e sui percorsi negli ZIP. Protetto il percorso completo dello script anche se eseguito da una sottocartella del repository.
- Le scelte **1, 4 e 9** continuano a mostrare il link di apertura e il link ZIP, copiando negli appunti il link di apertura. **SVUOTA** resta la parola richiesta dalla scelta 8.

### Verifiche effettuate

- **33 verifiche browser:** salvataggi, recupero dagli errori, catalogo 144, Excel, CSV, backup JSON/ZIP, ricerca, UI a 320/390/768/1440 px, PlantNet e filtro botanico Wikipedia, chiavi locali e flussi AI simulati, GPS e nuova scheda.
- **Audio:** permesso negato, registrazione simulata, salvataggio e backup.
- **Aggiornamento PWA:** protezione delle integrazioni non salvate, attivazione e conservazione della scheda anche offline.
- Nessuna eccezione JavaScript o risorsa locale mancante nei test browser. Controlli sintattici JavaScript e Bash superati.
- Pubblica verificato con ZIP completi, patch con cartella esterna, cartella src ambigua, rinomina Drive simulata, nomi repository non validi e blocco di open.env.
- Pubblicazione completa e patch provate con un repository Git locale: workflow incluso su scelta, submodule/configurazione conservati, rimozioni previste e blocco delle chiavi prima del commit/push.
- Guardia Python dei test GitHub verificata anche con open.env all'interno di uno ZIP.

### Come usare i file

1. Scarica il nuovo script ed esegui `bash pubblica-progetti.sh`; accetta l'aggiornamento del comando globale se richiesto.
2. Carica lo ZIP completo nella cartella sorgente scelta, su Drive o sul tablet. Non occorre estrarlo.
3. Avvia `pubblica`, scegli **1**, repository e cartella sorgente. Se ci sono più ZIP, scegli quello **3.26.8** dall'elenco.
4. Controlla l'anteprima. Se vuoi pubblicare anche il workflow incluso nello ZIP, rispondi sì alla relativa domanda usando una credenziale autorizzata.
5. Dopo il push e la pubblicazione Pages, nell'app apri Configurazione e controlla gli aggiornamenti. Il numero visibile deve diventare **3.26.8**.

### Limiti della verifica

Nessuna scrittura è stata eseguita sui repository o sulle cartelle Drive dell'utente. Le API AI e i servizi botanici nei test hanno risposte simulate, senza utilizzare chiavi personali. I test browser sono stati eseguiti con Chromium 141; il workflow GitHub installa il Chromium previsto dalla versione Playwright del progetto. La registrazione GPS a schermo spento dipende dalle limitazioni Android/browser e va verificata sul dispositivo: una pagina web non può garantire la continuità in background.

---

## 3.26.3 · integrazione progressiva delle 144 piante

- L'importazione delle integrazioni aggiunge solo i campi ancora vuoti anche quando la pianta ha già dati personali. I valori già salvati non vengono sovrascritti.
- Le fonti dei nuovi campi possono essere distinte da quelle dei campi già presenti nella stessa pianta. L'editor mostra la provenienza e permette di correggere e salvare i dati importati.
- File di integrazione separato: `integrazioni-guida-144-da-slide.json`, con 146 campi esplicitati nelle slide per 97 piante (55 corteccia, 47 frutto/strobili, 40 fiore, 4 habitat). Non sono state dedotte caratteristiche dalle sole fotografie.
- Importa il JSON da **⋮ → Completa catalogo delle 144 piante → Importa integrazioni**. La pubblicazione dei file dell'app non importa automaticamente dati nel catalogo locale del dispositivo.
- I dati originali delle slide restano in sola lettura. Le schede di rilievo, le foto e la traccia non sono toccate dall'importazione del catalogo.

---

## 3.25.0 · Editor e ricerca della specie

### Uso sul campo

La barra Foto, GPS e Nota vocale è nella parte alta della scheda, subito dopo l’intestazione. Resta visibile in alto mentre si scorre il modulo e non si trova sotto la tastiera del telefono. Le sezioni, l’elenco e i salvataggi restano gli stessi.

Sotto «Nome esemplare» ci sono due scelte: «Cerca» apre Wikipedia/Wikidata, collegamenti PlantNet e GBIF, identificazione da foto, confronto per caratteristiche e filtro per zona d’origine; «Cerca auto» produce un elenco di possibili nomi senza scriverli nella scheda.

### Come funziona «Cerca auto»

1. Confronta i caratteri inseriti con le 144 piante della guida locale, anche offline. Mostra il numero di caratteri concordanti e una percentuale di compatibilità solo se ne sono stati inseriti almeno due.
2. Se c’è un nome e la rete funziona, chiede a Wikipedia/Wikidata un nome tassonomico strutturato (P225). Verifica su GBIF fino a due nomi scientifici promettenti. La percentuale GBIF riguarda il confronto tassonomico del **nome**, non l’identificazione dell’esemplare.
3. Se esistono una foto salvata e una chiave PlantNet, invia la prima foto a PlantNet quando si preme «Cerca auto». Le proposte portano la confidenza percentuale restituita dal modello per quella foto. Senza foto o chiave la prova fotografica viene saltata.
4. Risultati e fonti sono distinti: non viene calcolata una percentuale unica sommando misure incompatibili. La selezione di un nome è manuale. Prima di sostituire un nome diverso viene richiesta conferma; i campi osservati restano conservati e gli eventuali conflitti sono mostrati.

Le richieste online hanno un limite di attesa e i risultati locali restano disponibili quando un servizio non risponde. Nessun nuovo formato del database o del backup è necessario.

---

## 3.24.0 · Prima pagina

La schermata principale non mostra più i quattro contatori di schede, nomi, GPS e fotografie. Ricerca, filtri ed elenco conservano il loro funzionamento. Il pulsante «+ Nuova scheda» resta sempre visibile nella barra inferiore, anche quando si guarda la Mappa.

Il pannello «Sul campo» presenta i comandi della traccia (Avvia/Riprendi, Pausa e Stop secondo lo stato) e un gruppo richiudibile «+ Opzioni». Questo contiene un solo comando per QR, meteo, stampa, nuovo elenco, backup e configurazione, cestino, guida e tema. I comandi di avvio/pausa/stop duplicati nella Mappa sono stati rimossi; l’esportazione GPX e la cancellazione della traccia restano nella Mappa.

In «Backup e configurazione → Configurazione» la nuova voce «Dimensione interfaccia» offre Adatta allo schermo, 110% e 125%. La scelta si applica subito e rimane su questo dispositivo. Il comportamento è stato verificato nel browser automatico alle larghezze 390 e 768 px, inclusa la persistenza dopo ricaricamento. La configurazione non modifica le schede o il database.

---

## 3.23.0 · Excel su richiesta

Il progetto ora usa una sola libreria per leggere e generare fogli `.xlsx`: `lib/xlsx-populate.js`. La libreria viene eseguita soltanto quando si importa un `.xlsx` o si esporta il registro; le richieste contemporanee condividono lo stesso caricamento. Il service worker la conserva nella cache dell’app per l’uso offline, quindi il browser la scarica quando prepara la modalità offline, senza eseguirla all’avvio.

La libreria SheetJS (`lib/xlsx.js`) è stata rimossa. La lettura CSV è interna e gestisce BOM, separatori `;` e `,`, righe tra virgolette, doppi apici e ritorni a capo nei campi. La conversione delle date seriali Excel ora è indipendente dalla libreria e tiene conto dei calendari 1900 e 1904.

### Formati e compatibilità

- Importazione: `.xlsx`, `.csv`.
- Esportazione registro: `.xlsx` formattato.
- Il formato binario storico `.xls` non è compatibile con XlsxPopulate; occorre convertirlo in `.xlsx` o `.csv` prima dell’importazione. Il selettore non propone più `.xls` e l’errore indica come procedere.
- I backup ZIP e il database locale non cambiano.

La verifica automatica controlla il caricamento differito, la rilettura del registro esportato, la lettura CSV e il funzionamento offline. Non è un aggiornamento pubblicato: sostituire i file del sito con quelli del pacchetto completo per distribuirlo.

---

## 3.22.0 · Unione del progetto

La cartella Drive «Up» contiene una versione 3.15.0 con file monolitici, mentre il progetto aggiornato qui era alla versione 3.21.0. La versione unificata conserva la struttura modulare, la traccia GPS migliorata, il catalogo integrabile, i comandi della home e le esportazioni complete. Non sovrascrive i dati locali del browser né modifica il formato del database.

### Funzione ripresa da Drive Up

- Ricerca delle 144 piante per provenienza o zona d’origine, con suggerimenti e dettagli del catalogo.
- Collegamento alla ricerca della specie su GBIF per verificare separatamente la distribuzione attuale. Provenienza del materiale didattico e presenza sul territorio hanno significati differenti.
- La selezione di una specie dalla ricerca per zona compila la scheda aperta con le stesse regole di controllo e conflitto della guida.

### Progetto e prove

Il pulsante «Zona d’origine» si trova nel gruppo delle ricerche sotto «Nome esemplare». Su telefono i quattro comandi sono disposti su due righe. È stato incluso il workflow GitHub Actions presente su Drive Up, con un file lock per installazioni riproducibili. Il pacchetto ZIP comprende tutti i file necessari per pubblicare il sito statico dalla radice del repository.

Per eseguire i test: `npm ci`, `npx playwright install chromium`, `npm test`. Le verifiche non consultano servizi botanici esterni.

---

## 3.21 · diagnosi traccia GPS

La prima schermata e la Mappa mostrano se il GPS è in ascolto, se un fix è stato scartato per precisione peggiore di 50 m, quando è stato salvato l'ultimo punto e quando il segnale non arriva più. Un contatore di punti da solo non indica che il GPS continui a funzionare: ora lo stato lo chiarisce.

Quando torni all'app dopo averla messa in background, l'ascolto GPS viene riattivato. Se manca un intervallo significativo, la traccia prosegue in un nuovo tratto, senza disegnare una linea artificiale tra due posizioni lontane nel tempo. I fix ricevuti vengono scritti in sequenza nel database; la cancellazione attende eventuali scritture già avviate prima di svuotare la traccia.

**Limite del browser:** Android Chrome può sospendere l'accesso alla geolocalizzazione appena la pagina passa in background, incluso lo schermo spento. La PWA non può garantire una traccia continua in queste condizioni. Per una registrazione affidabile con schermo spento serve un'app Android nativa con servizio di posizione in primo piano; se usi questa PWA, mantienila visibile durante il rilievo e verifica i punti nella Mappa prima di esportare il GPX.

---

## 3.20 · azioni in prima pagina

Nella prima schermata trovi **Nuova scheda botanica**, **Avvia traccia**, **Pausa**, **Stop** e **Meteo · 3B Meteo**. L'editor salva automaticamente le modifiche e offre anche un pulsante ✓ per forzare il salvataggio e visualizzare l'esito; tornando all'elenco, verifica e salva di nuovo.

La traccia GPS viene conservata nel database del dispositivo. **Pausa** interrompe la registrazione e mantiene i punti già acquisiti; **Riprendi** avvia un nuovo tratto, senza disegnare una linea attraverso la pausa. **Stop** termina la registrazione mantenendo i punti per l'esportazione GPX dalla Mappa. Dopo una pausa, lo stato resta visibile anche al riavvio dell'app.

Il comando Meteo consente di cercare una località e apre la relativa pagina di 3B Meteo. Il pulsante GPS apre il loro sito: occorre consentire la posizione anche su 3B Meteo e verificare la località suggerita, soprattutto in montagna. Non c'è una trasmissione automatica delle coordinate dal database dell'app a 3B Meteo. Questa funzione necessita di connessione Internet.

---

## 3.19 · esportazione delle 144 piante

In **Configurazione → Catalogo delle piante** sono disponibili due coppie di pulsanti:

| Esportazione | Contenuto | Importazione |
| --- | --- | --- |
| Solo integrazioni | Tutti i campi aggiunti e salvati dall'utente, anche nelle sessioni precedenti | Aggiunge le integrazioni mancanti; conserva quelle già presenti. |
| Catalogo completo | Dati originali delle 144 piante più tutte le integrazioni salvate | Controlla completezza e coerenza delle 144 voci, chiede conferma e sostituisce solo le integrazioni del catalogo. |
| Backup completo nel menu ⋮ | Schede di rilievo, foto, audio, traccia e integrazioni | Il comando «Ripristina backup» gestisce il file ZIP. |

I file JSON del catalogo non contengono le immagini delle pagine originali, già incluse nel progetto. Prima di importare un catalogo completo, l'app verifica che i dati originali coincidano con la versione installata: se sono diversi, non modifica nulla. Anche in caso di errore durante la scrittura, le integrazioni precedenti restano conservate. Schede, fotografie e audio non vengono modificati dall'importazione del catalogo.

Per applicare questo aggiornamento copia i file modificati nelle stesse cartelle del progetto, conservando i percorsi dello ZIP.

---

## 3.18 · salvataggio e trasferimento del catalogo

### Cosa contiene ciascun file

| Azione | Dati inclusi |
| --- | --- |
| **Esporta solo integrazioni** (Catalogo delle piante) | Tutte le caratteristiche e note **salvate** e aggiunte dall'utente alle 144 piante, anche in sessioni precedenti. File JSON; esclude campi ancora non salvati, pagine originali e schede di rilievo. |
| **Importa integrazioni** (Catalogo delle piante) | Ripristina il JSON esportato dal catalogo; aggiunge le piante mancanti e conserva le integrazioni già presenti per la stessa pianta. Non modifica le schede di rilievo. |
| **Backup completo, con foto e audio** (menu ⋮) | Schede di rilievo, fotografie, registrazioni, catalogo integrato e traccia. File ZIP ripristinabile con **Ripristina backup**. |

Le 144 pagine e i dati originali sono file dell'applicazione e rimangono disponibili dopo la pubblicazione del progetto. Il file delle sole integrazioni conserva le aggiunte fatte dall'utente sul dispositivo, non le pagine originali.

Il pulsante di salvataggio ora richiede una fonte quando sono stati aggiunti dati; in sua assenza mostra **«Salvataggio non eseguito»**. Dopo che la scrittura nel database termina mostra **«Salvataggio completato»**. L'avviso di uscita si basa sui campi effettivamente cambiati rispetto all'ultima versione salvata.

Per aggiornare un progetto esistente, copia i file di questo aggiornamento nelle medesime cartelle del repository, mantenendo i percorsi. Le integrazioni già salvate sul dispositivo restano archiviate nel browser; prima di cambiare dispositivo esportale dal catalogo o esegui un backup completo.

---

## 3.17.0

### Completa il catalogo delle 144 piante

Apri **⋮ → Configurazione → Completa catalogo delle 144 piante**. Cerca per nome o famiglia, scegli una pianta e consulta la pagina originale del materiale del corso. Tocca la pagina per ingrandirla. Puoi scorrere le piante con **Precedente** e **Successiva**.

I campi già presenti nel catalogo distribuito sono mostrati in grigio e non sono modificabili. I campi mancanti si compilano con lo stesso vocabolario dei rilievi quando disponibile (chioma, inserzione rami, foglie, crescita ed estensione). Per gli altri caratteri, come corteccia, gemme, fiori e frutti, puoi inserire testo. La nota originale rimane in sola lettura; un'ulteriore nota può essere aggiunta separatamente.

Se inserisci nuovi dati, seleziona la **fonte** prima di salvare: pagina del corso, osservazione personale oppure altra fonte verificata. Le integrazioni salvate diventano viola. Le modifiche entrano nei suggerimenti della guida; i campi osservati nelle schede già compilate non vengono sovrascritti.

Le integrazioni sono salvate nell'archivio locale del dispositivo e nei backup ZIP/JSON. Il file originale con le 144 voci rimane intatto. Ripristinare un backup vecchio con **Sostituisci** elimina le integrazioni attuali; l'app lo segnala nella conferma. L'importazione Excel conserva le integrazioni locali.

Questa funzione consente di **completare manualmente** il catalogo pagina per pagina; non attribuisce automaticamente a una pianta un carattere che nella pagina non è documentato.

### Aggiornamento e verifica

Prima fai un backup. Carica tutti i file estratti dallo ZIP nel repository, mantenendo le cartelle `slides/`, `data/`, `css/` e `js/`. Chiudi e riapri l'app installata; la nuova cache offline potrebbe richiedere una seconda apertura. Controlla **3.17.0** in Aiuto. Non cancellare i dati del sito.

18 verifiche automatiche nel browser, incluse la persistenza dopo il riavvio, la protezione dei dati originali, il backup e il ripristino delle integrazioni.

---

## 3.16.0

### Nome esemplare e identificazione

Tre pulsanti chiari sotto il nome:

- **Cerca per nome** interroga Wikipedia e usa il nome scientifico solo se è disponibile come dato strutturato su Wikidata. Nello stesso pannello resta disponibile la guida locale, anche offline. I campi botanici possono essere completati solo dai dati strutturati della guida locale, mai dall'estratto testuale di Wikipedia.
- **Caratteristiche** confronta le osservazioni già inserite con le 144 specie e varietà della guida del corso. Mostra candidate e numero di corrispondenze, non una identificazione certa. PlantNet non offre l'identificazione tramite soli campi descrittivi.
- **Cerca con foto** permette fotocamera, galleria e foto già presenti nella scheda. Mostra i risultati restituiti da PlantNet anche per specie assenti dalla guida locale, con percentuale di confidenza. Richiede connessione e chiave PlantNet; l'invio avviene solo toccando «Identifica».

Due collegamenti meno prominenti aprono **PlantNet** e **GBIF**. La scheda di dettaglio PlantNet viene collegata quando il servizio ha restituito il nome completo; negli altri casi si apre il sito per effettuare la ricerca. GBIF usa l'identificativo verificato, quando disponibile, altrimenti propone una ricerca per nome.

Quando un risultato della guida locale può riempire campi ancora vuoti, lascia intatte le osservazioni già inserite. Eventuali valori diversi da quelli della guida vengono segnalati sotto il campo nome. I risultati da foto vanno sempre verificati sul posto.

### Aggiornamento

Conserva prima un backup. Estrai lo ZIP e carica tutti i file nel repository mantenendo le cartelle. Chiudi l'app installata prima di riaprirla; la nuova cache offline potrebbe richiedere una seconda apertura. Controlla la versione **3.16.0** in Aiuto. Non cancellare i dati del sito.

### Verifica

17 verifiche automatiche nel browser: percorsi dei pulsanti, avvisi sui dati discordanti, foto già salvate, risultati PlantNet simulati anche fuori dalla guida, backup, riapertura offline e layout. Nessuna chiamata reale a servizi esterni nei test.

---

## 3.15.0

### Cosa cambia

- Il pulsante **Nuovo elenco** è visibile nella schermata iniziale dell’elenco schede. Prima scarica un backup ZIP delle schede attive, poi le sposta nel cestino e azzera la numerazione dell’elenco corrente. Se il backup o l’archiviazione non riescono, l’operazione viene interrotta.
- Quando si scrive **Nome esemplare**, compaiono subito i risultati della guida specie inclusa nell’app, del catalogo delle specie identificate e delle schede già registrate. La ricerca è locale e funziona offline. Si può toccare un suggerimento o usare frecce e Invio; il nome resta sempre inseribile a mano.
- I suggerimenti si aprono vicino al campo e tengono conto dello spazio visibile sopra la tastiera del telefono. Il nome parziale della scheda che si sta modificando non compare come suggerimento.

### Aggiornamento

Fai un backup preventivo dei dati sul dispositivo. Carica **tutti** i file estratti dallo ZIP nel repository che ospita l’app, mantenendo la struttura delle cartelle. Chiudi le schede e l’app installata prima di riaprirla; l’aggiornamento della cache offline può richiedere una seconda apertura. In **Aiuto** controlla che la versione sia **3.15.0**. Non cancellare i dati del sito: le schede sono salvate nell’archivio locale del browser.

### Verifica

Sono state superate 15 verifiche automatiche nel browser, comprese quelle per ricerca locale e tastiera, esportazione ZIP, archiviazione delle schede, ripartenza del progressivo, layout mobile e riapertura offline.

---

## 3.14.0

### Cosa cambia

- Su telefono la barra inferiore riunisce **Schede**, **Mappa** e **Nuova scheda**. Il pulsante per creare una scheda resta disponibile anche dalla mappa.
- I pulsanti più usati hanno un’area di tocco di almeno 44 × 44 pixel. Le icone principali sono SVG locali, leggibili anche se il dispositivo non dispone di un font emoji.
- Ricerca, filtro per data, QR e stampa sono disposti in righe distinte sul telefono. Sul desktop restano vicini in una sola barra.
- Il riepilogo e le schede dell’elenco occupano meno spazio in altezza su telefono; il nome della specie, la selezione e l’eliminazione restano distinguibili.
- In una scheda aperta, Foto, GPS e Nota vocale restano sempre raggiungibili nella barra inferiore. Nell’editor i collegamenti alle sezioni e i pulsanti foto hanno etichette esplicite.
- Il cestino mostra un badge numerico senza sostituire l’icona e aggiorna anche il nome accessibile. Il menu backup usa etichette brevi e pulsanti larghi.
- Tema chiaro e scuro ricevono la stessa gerarchia di colori e bordi. Gli stili di stampa restano separati dall’interfaccia.

### Verifiche

**13 gruppi di prove passati** su Chromium headless: oltre alle prove precedenti sono stati toccati nel browser filtri, menu, stampa, navigazione mobile, Nuova scheda dalla mappa e cambio tema. Dimensioni controllate a 320, 390, 768 e 1440 pixel senza scorrimento orizzontale. Backup ZIP, Excel, archivio locale e riapertura offline superano ancora le prove. Nessuna risorsa locale mancante o eccezione JavaScript nella suite.

Le anteprime usano dati di esempio creati solo nella sessione di prova. I manuali Word/PDF originali e gli screenshot originali del repository non sono stati rigenerati. GPS, fotocamera, microfono e leggibilità all’aperto richiedono ancora una prova sul telefono effettivo.

### Per aggiornare il sito

Esegui prima un backup e verifica il file scaricato. Carica **tutti** i file estratti dallo ZIP nel repository GitHub Pages, mantenendo le cartelle `css/` e `js/`. Quando il sito è aggiornato, chiudi tutte le finestre e l’app installata, quindi riaprila. La nuova cache si attiva dopo la chiusura della versione precedente; per questo può essere necessaria una seconda riapertura. Controlla nella guida la versione **3.14.0**. I dati del browser restano nello stesso archivio IndexedDB: non cancellare i dati del sito per forzare l’aggiornamento.

---

## 3.13.0 · revisione generale

Revisione del progetto ZIP fornito, 23 settembre 2026. Il pacchetto contiene il progetto completo aggiornato, senza dati personali di prova. Nessuna pubblicazione su GitHub è stata eseguita.

### Bug corretti

| Area | Problema riscontrato | Correzione |
| --- | --- | --- |
| Excel | `xlsx-populate.js` era nella radice, mentre pagina e service worker lo cercavano in `lib/` | Libreria collocata nel percorso corretto; esportazione verificata rileggendo il file prodotto |
| Ripristino | Un errore sincrono dopo i `clear()` poteva far completare una cancellazione parziale | Gestione dell’errore e annullamento esplicito della transazione |
| Unione backup | Schede e allegati erano scritti separatamente; errori media venivano ignorati | Validazione prima delle scritture, transazione unica e nuovi identificativi media per evitare collisioni |
| File incompleti | ZIP non valido poteva essere interpretato come archivio vuoto; JSON poteva omettere allegati assenti | Controllo formato ZIP e segnalazione allegati mancanti; blocco prima della sostituzione |
| Coordinate | Valori GPS nulli/vuoti diventavano coordinate zero | Distinzione tra zero valido e dato assente; verifica intervalli e date della traccia |
| Misure | Passi numerici HTML rifiutavano misure come 12,3 m | Decimali liberi per le misure; valori interi per le numerazioni, con limiti conservati |
| Date Excel | Le date italiane e i seriali Excel non tornavano correttamente nel campo data | Conversione a YYYY-MM-DD, calendario Excel 1900/1904 e controllo date impossibili |
| Scelte Excel | Le etichette esportate non coincidevano con i codici delle opzioni | Riconversione delle etichette ai valori interni |
| Salvataggio | La scheda si chiudeva anche dopo un errore di scrittura | Editor mantenuto aperto, modifiche non salvate tenute in sospeso e nuovo tentativo prima dell’importazione |
| Ricerca | Un caricamento foto lento poteva sovrascrivere risultati più recenti | Identificativo di revisione per impedire aggiornamenti fuori ordine |
| Tastiera | Spazio su una casella di selezione apriva anche la scheda | Apertura da tastiera limitata al contenitore; aggiornamento del pulsante di selezione |
| Mappa | Il punto trascinabile dipendeva da immagini Leaflet assenti | Indicatore disegnato in CSS, disponibile anche offline |
| GPS traccia | Ripartenza confrontata con l’ultimo tratto; punti aggiunti prima del salvataggio | Filtro applicato al tratto corrente, scrittura prima dell’inserimento in memoria e gestione errori |
| Camera/audio | Chiusura durante la richiesta del permesso poteva lasciare attivo il dispositivo | Rilascio dello stream se la schermata è stata chiusa; blocco richieste audio simultanee |
| Offline | Installazione accettava file mancanti; risposte HTTP di errore venivano conservate | Tutti i file essenziali richiesti; cache delle sole risposte riuscite e fallback esplicito |
| Aggiornamenti | Attivazione immediata poteva mescolare versioni durante l’uso | Aggiornamento in attesa della chiusura delle finestre; avviso all’utente |
| Report | ID GBIF importato veniva inserito direttamente nei collegamenti HTML | Accettati soltanto identificativi numerici |

### Struttura e grafica

- `css/app.css`: stili separati dalla pagina HTML.
- `js/config.js`: campi, versioni e configurazione.
- `js/utils.js`: funzioni comuni e conversione delle date.
- `js/database.js`: accesso al database e transazioni.
- `app.js`: flussi applicativi e interfaccia. Rimane il file principale: la separazione è incrementale, non una riscrittura integrale.
- Nessun framework e nessuna compilazione richiesti per pubblicare.
- Riepilogo di schede, nomi rilevati, schede con GPS e fotografie.
- Navigazione rapida alle sezioni, schede più leggibili, controlli più grandi, adattamento a piccoli schermi e contrasto migliorato in modalità scura.
- Stato dei filtri e delle viste esposto anche alle tecnologie assistive; rispetto della preferenza per animazioni ridotte.

### Verifiche eseguite

Suite `tests/browser.cjs`: 12 gruppi di prove superati su Chromium headless, con IndexedDB e service worker reali. Controllati avvio, salvataggio e ricaricamento, normalizzazione, rollback, backup incompleti, unione con foto, Excel, backup ZIP di andata/ritorno, ricerca/selezione/cestino, errore simulato di spazio, riapertura offline.

Layout verificato a 320, 390, 768 e 1440 pixel, senza overflow orizzontale nell’elenco o nell’editor. Ispezionate anche le anteprime in tema chiaro e scuro. Nessuna eccezione JavaScript o risorsa locale mancante durante la suite. I servizi esterni sono stati bloccati nei test; i dati usati sono fittizi.

### Limiti e comportamento da conoscere

- Non sono stati provati su un telefono reale GPS, fotocamera, microfono, lettura QR, installazione Android/iOS e condivisione nativa. Le relative correzioni sono basate sull’analisi del codice.
- Non sono state validate risposte reali di PlantNet, GBIF, Wikipedia/Wikidata o il download delle mappe. Le mappe di zone non memorizzate richiedono internet; le immagini della guida vengono memorizzate quando richieste, non tutte al primo avvio.
- La PWA non garantisce la registrazione GPS a schermo spento. Il sistema operativo può sospenderla.
- Un download avviato non prova che l’utente abbia conservato il file: verificare il backup nella cartella download. Il promemoria registra la preparazione/esportazione, non una verifica fisica del file.
- “Unisci” mantiene la traccia GPS corrente; “Sostituisci tutto” ripristina anche quella del backup. Questa distinzione è esplicitata nella finestra d’importazione.
- Nessuna revisione scientifica delle 144 schede botaniche o delle formule di stima ambientale: rimangono indicative.
- I manuali PDF/Word e gli screenshot originali sono conservati, ma non aggiornati alla nuova grafica. Questo documento descrive le differenze.
- Più finestre possono ancora modificare la stessa scheda: non è stata aggiunta una gestione dei conflitti tra editor simultanei.

### Aggiornamento del sito

1. Esportare un backup dei rilievi dall’app e verificare che il file esista.
2. Estrarre questo ZIP e aggiornare il repository con tutti i file, incluse le nuove cartelle `css/` e `js/`.
3. Pubblicare sullo stesso indirizzo GitHub Pages. Nome e versione del database IndexedDB non sono cambiati; i rilievi restano associati allo stesso browser e alla stessa origine.
4. Chiudere tutte le finestre dell’app, inclusa la PWA installata, e riaprirla. Se il primo accesso mostra ancora la vecchia versione, lasciare completare il download dell’aggiornamento, chiudere e riaprire ancora.
5. Controllare nella guida la versione **3.13.0** e verificare la riapertura offline. Non cancellare i dati del sito per forzare l’aggiornamento.

Per sviluppatori: `npm install`, `npx playwright install chromium`, `npm test`. Le dipendenze npm servono esclusivamente alle prove; non occorre caricare `node_modules` su GitHub Pages.
