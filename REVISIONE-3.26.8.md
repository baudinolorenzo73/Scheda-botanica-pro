# Revisione 3.26.8 — controllo di progetto e pubblicazione

## Correzioni nel progetto botanico

- **+ Nuova scheda nell'editor:** eliminato un riferimento a una variabile inesistente nel ripristino del pulsante. Il comando torna utilizzabile anche quando il salvataggio fallisce; la scheda corrente resta recuperabile.
- **Traccia GPS:** i fix validi già ricevuti restano nella coda di salvataggio anche premendo subito Pausa o Stop. La ripresa crea un segmento distinto anche se il database sta ancora scrivendo i punti precedenti. I callback arrivati dopo lo Stop vengono ignorati.
- **Backup JSON, ZIP e percorso GPX:** l'esportazione attende i punti GPS in coda. Anche l'importazione attende le scritture precedenti prima di sostituire l'archivio.
- **Backup malformati:** i campi schede, specie, guida e traccia devono essere elenchi; foto, audio e file devono essere indici. Un campo presente del tipo sbagliato viene rifiutato prima di modificare i dati, invece di essere interpretato come un elenco vuoto.
- **Aggiornamento dell'app:** impedito mentre ci sono integrazioni del catalogo da salvare o mentre è in corso la richiesta di accesso al microfono. Prima dell'attivazione vengono completate le scritture GPS in coda.
- **open.env:** supportati commenti dopo valori tra virgolette, righe export, BOM e terminatori Windows. Le righe con virgolette incomplete vengono ignorate. Le chiavi restano escluse dai backup botanici.
- **Richieste AI sovrapposte:** una risposta relativa a un'altra pianta non riattiva il pulsante di una richiesta nuova ancora in corso.
- Versione aggiornata a **3.26.8** e cache offline rinnovata. I test di aggiornamento simulano automaticamente la versione successiva.

## Script pubblica — versione 2026.10.02

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

## Verifiche effettuate

- **33 verifiche browser:** salvataggi, recupero dagli errori, catalogo 144, Excel, CSV, backup JSON/ZIP, ricerca, UI a 320/390/768/1440 px, PlantNet e filtro botanico Wikipedia, chiavi locali e flussi AI simulati, GPS e nuova scheda.
- **Audio:** permesso negato, registrazione simulata, salvataggio e backup.
- **Aggiornamento PWA:** protezione delle integrazioni non salvate, attivazione e conservazione della scheda anche offline.
- Nessuna eccezione JavaScript o risorsa locale mancante nei test browser. Controlli sintattici JavaScript e Bash superati.
- Pubblica verificato con ZIP completi, patch con cartella esterna, cartella src ambigua, rinomina Drive simulata, nomi repository non validi e blocco di open.env.
- Pubblicazione completa e patch provate con un repository Git locale: workflow incluso su scelta, submodule/configurazione conservati, rimozioni previste e blocco delle chiavi prima del commit/push.
- Guardia Python dei test GitHub verificata anche con open.env all'interno di uno ZIP.

## Come usare i file

1. Scarica il nuovo script ed esegui `bash pubblica-progetti.sh`; accetta l'aggiornamento del comando globale se richiesto.
2. Carica lo ZIP completo nella cartella sorgente scelta, su Drive o sul tablet. Non occorre estrarlo.
3. Avvia `pubblica`, scegli **1**, repository e cartella sorgente. Se ci sono più ZIP, scegli quello **3.26.8** dall'elenco.
4. Controlla l'anteprima. Se vuoi pubblicare anche il workflow incluso nello ZIP, rispondi sì alla relativa domanda usando una credenziale autorizzata.
5. Dopo il push e la pubblicazione Pages, nell'app apri Configurazione e controlla gli aggiornamenti. Il numero visibile deve diventare **3.26.8**.

## Limiti della verifica

Nessuna scrittura è stata eseguita sui repository o sulle cartelle Drive dell'utente. Le API AI e i servizi botanici nei test hanno risposte simulate, senza utilizzare chiavi personali. I test browser sono stati eseguiti con Chromium 141; il workflow GitHub installa il Chromium previsto dalla versione Playwright del progetto. La registrazione GPS a schermo spento dipende dalle limitazioni Android/browser e va verificata sul dispositivo: una pagina web non può garantire la continuità in background.
