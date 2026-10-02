# Revisione 3.13.0 — Scheda Botanica PRO

Revisione del progetto ZIP fornito, 23 settembre 2026. Il pacchetto contiene il progetto completo aggiornato, senza dati personali di prova. Nessuna pubblicazione su GitHub è stata eseguita.

## Bug corretti

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

## Struttura e grafica

- `css/app.css`: stili separati dalla pagina HTML.
- `js/config.js`: campi, versioni e configurazione.
- `js/utils.js`: funzioni comuni e conversione delle date.
- `js/database.js`: accesso al database e transazioni.
- `app.js`: flussi applicativi e interfaccia. Rimane il file principale: la separazione è incrementale, non una riscrittura integrale.
- Nessun framework e nessuna compilazione richiesti per pubblicare.
- Riepilogo di schede, nomi rilevati, schede con GPS e fotografie.
- Navigazione rapida alle sezioni, schede più leggibili, controlli più grandi, adattamento a piccoli schermi e contrasto migliorato in modalità scura.
- Stato dei filtri e delle viste esposto anche alle tecnologie assistive; rispetto della preferenza per animazioni ridotte.

## Verifiche eseguite

Suite `tests/browser.cjs`: 12 gruppi di prove superati su Chromium headless, con IndexedDB e service worker reali. Controllati avvio, salvataggio e ricaricamento, normalizzazione, rollback, backup incompleti, unione con foto, Excel, backup ZIP di andata/ritorno, ricerca/selezione/cestino, errore simulato di spazio, riapertura offline.

Layout verificato a 320, 390, 768 e 1440 pixel, senza overflow orizzontale nell’elenco o nell’editor. Ispezionate anche le anteprime in tema chiaro e scuro. Nessuna eccezione JavaScript o risorsa locale mancante durante la suite. I servizi esterni sono stati bloccati nei test; i dati usati sono fittizi.

## Limiti e comportamento da conoscere

- Non sono stati provati su un telefono reale GPS, fotocamera, microfono, lettura QR, installazione Android/iOS e condivisione nativa. Le relative correzioni sono basate sull’analisi del codice.
- Non sono state validate risposte reali di PlantNet, GBIF, Wikipedia/Wikidata o il download delle mappe. Le mappe di zone non memorizzate richiedono internet; le immagini della guida vengono memorizzate quando richieste, non tutte al primo avvio.
- La PWA non garantisce la registrazione GPS a schermo spento. Il sistema operativo può sospenderla.
- Un download avviato non prova che l’utente abbia conservato il file: verificare il backup nella cartella download. Il promemoria registra la preparazione/esportazione, non una verifica fisica del file.
- “Unisci” mantiene la traccia GPS corrente; “Sostituisci tutto” ripristina anche quella del backup. Questa distinzione è esplicitata nella finestra d’importazione.
- Nessuna revisione scientifica delle 144 schede botaniche o delle formule di stima ambientale: rimangono indicative.
- I manuali PDF/Word e gli screenshot originali sono conservati, ma non aggiornati alla nuova grafica. Questo documento descrive le differenze.
- Più finestre possono ancora modificare la stessa scheda: non è stata aggiunta una gestione dei conflitti tra editor simultanei.

## Aggiornamento del sito

1. Esportare un backup dei rilievi dall’app e verificare che il file esista.
2. Estrarre questo ZIP e aggiornare il repository con tutti i file, incluse le nuove cartelle `css/` e `js/`.
3. Pubblicare sullo stesso indirizzo GitHub Pages. Nome e versione del database IndexedDB non sono cambiati; i rilievi restano associati allo stesso browser e alla stessa origine.
4. Chiudere tutte le finestre dell’app, inclusa la PWA installata, e riaprirla. Se il primo accesso mostra ancora la vecchia versione, lasciare completare il download dell’aggiornamento, chiudere e riaprire ancora.
5. Controllare nella guida la versione **3.13.0** e verificare la riapertura offline. Non cancellare i dati del sito per forzare l’aggiornamento.

Per sviluppatori: `npm install`, `npx playwright install chromium`, `npm test`. Le dipendenze npm servono esclusivamente alle prove; non occorre caricare `node_modules` su GitHub Pages.
