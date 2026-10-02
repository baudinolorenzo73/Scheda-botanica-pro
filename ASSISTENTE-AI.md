# Assistente AI facoltativo

La scheda botanica, l'archivio delle 144 piante, la ricerca locale e il backup funzionano senza chiavi API e anche offline. La ricerca AI e l'analisi AI delle slide richiedono rete e una chiave per Google Gemini, Groq oppure OpenRouter.

## Dove conservare `open.env`

Conserva il file sul tuo dispositivo, per esempio in **Download**, fuori dalla cartella Google Drive usata da `pubblica`. Non copiarlo nello ZIP, nel repository GitHub o nella cartella pubblicata. `.gitignore` ignora i file `.env` nuovi; il comando `pubblica` aggiornato controlla ZIP, file da Drive e file tracciati prima del push, bloccando la pubblicazione se trova un file `.env`. Il test GitHub Actions segnala un eventuale errore sfuggito, ma parte **dopo** il push e non può annullarlo.

Il browser richiede una selezione esplicita del file la prima volta. Se **Ricorda le chiavi su questo browser** è attivo, l'app ne salva una copia nel `localStorage` del browser del tablet e la ricarica alle visite successive sullo stesso indirizzo e nello stesso profilo. Non salva né riapre il percorso del file. Se disattivi l'opzione, le chiavi restano solo fino alla chiusura della pagina. **Dimentica chiavi** cancella la copia locale. Anche la cancellazione dei dati del sito può eliminarla. Non usare l'opzione su un dispositivo condiviso: qualunque script eseguito dal sito può leggere quelle chiavi.

## Come usarlo

1. Crea un file di testo chiamato `open.env` sul dispositivo. Inserisci almeno una tra `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` e `OPENROUTER_API_KEY`. Non pubblicare o inviare il file. Una chiave Google generica può non essere abilitata per la Gemini API.
2. Apri **Configurazione e backup → Assistente AI → Carica open.env** e seleziona il file. Lascia attivo **Ricorda le chiavi** per non doverlo scegliere alla prossima apertura.
3. Apri **Completa catalogo delle 144 piante**, scegli una pianta e il servizio con la relativa chiave, poi tocca **Proponi caratteristiche dalla slide**. Groq usa il modello Vision `qwen/qwen3.8-27b`; OpenRouter richiede l'ID di un modello che accetti immagini, scelto dal suo catalogo. Verifica disponibilità, condizioni e prezzo del modello nel tuo account **prima** di richiedere l'analisi. Non è previsto il passaggio automatico a un altro fornitore.
4. Confronta le proposte con la slide e la nota. Tocca **Usa proposta** per i campi vuoti, modifica il testo se serve e infine **Salva integrazioni**. Se un campo è già compilato, l'app mostra il conflitto e lascia la correzione manuale.

La richiesta invia al fornitore scelto la slide selezionata e la nota del corso. Non invia automaticamente foto delle schede, coordinate GPS o l'intero archivio. Le chiavi Cerebras, Together e OpenCode sono riconosciute nel file ma non vengono ancora usate per le slide; questo evita di inviare immagini a modelli senza verificarne prima le capacità.

Se la chiave è stata mostrata in uno screenshot o caricata in un luogo pubblico, rigenerala nel pannello del fornitore. Per un uso condiviso o continuo, le API devono passare da un servizio server con chiavi protette: una pagina statica non può tenere segrete le chiavi durante una richiesta effettuata dal browser.

## Ricerca AI nella scheda · versione 3.27.4

In **Configurazione → Assistente AI** scegli il servizio per la ricerca. «Automatico» usa il servizio selezionato per il catalogo quando ha una chiave, altrimenti la prima chiave disponibile (Gemini, Groq, OpenRouter). Scegliendo esplicitamente un servizio non viene usata la chiave di un altro provider se manca quella richiesta.

Sotto **Modelli AI · impostazioni avanzate** puoi specificare gli ID dei modelli. I valori vengono ricordati dal browser; lascia vuoto per i predefiniti. OpenRouter richiede sempre l'ID esatto di un modello scelto da te: non viene selezionato arbitrariamente un modello gratuito o a pagamento. Il campo OpenRouter del catalogo e quello di Configurazione sono sincronizzati.

**Cerca → Cerca con AI** invia il nome e i caratteri compilati: persistenza, chioma, rami, foglie, crescita, estensione, grandezza, altezza, circonferenza e terreno. Non invia coordinate, numero, data, note personali, problemi, foto o l'intero database. Richiede fino a quattro candidati e verifica il taxon su GBIF, regno Plantae: animali, funghi, corrispondenze incerte e risultati solo a livello di genere vengono esclusi. Nessun campo cambia finché non premi «Usa questo nome»; il nome attuale richiede conferma per essere sostituito e i caratteri già inseriti restano conservati. Una percentuale AI è una stima non calibrata, non una certezza botanica.

**Cerca intelligente** dà precedenza al nome: nella guida locale mostra corrispondenze del nome e possibili refusi, senza aggiungere piante estranee soltanto perché condividono caratteri generici. Un binomio con un solo carattere errato, per esempio «rubinia pseudoacacia», può suggerire **Robinia pseudoacacia**; il nome cambia solo quando lo confermi. Senza nome cerca invece per caratteristiche. Per una ricerca per caratteri anche quando il nome è compilato usa **Cerca → Cerca da caratteristiche**. Consulta anche Wikipedia e GBIF. Se c'è una foto salvata e la chiave PlantNet, invia la prima foto a PlantNet; se è configurato un servizio AI consulta anche quello. I fallimenti vengono mostrati senza nascondere i risultati delle altre fonti. Le percentuali di foto, AI e corrispondenza del nome restano separate.

I caratteri della guida sono indicati come **2/2 caratteri concordanti**, senza trasformarli in una probabilità. Due caratteri generici sono pochi indizi; anche una corrispondenza del nome su GBIF non identifica automaticamente la pianta osservata. Le proposte AI o da foto possono suggerire alternative e mantengono indicata la loro fonte.

## Errori e modelli

- **404 AI**: può indicare un ID modello errato, ritirato o non disponibile per quell'account; non dimostra da solo che la chiave sia sbagliata. Gemini/Groq controllano il catalogo ufficiale e riprovano una sola volta con un modello compatibile nello stesso servizio, ma soltanto quando stai usando i predefiniti. Per Gemini il recupero sceglie un modello Flash, non Pro; per Groq mantiene distinta la ricerca testuale dalle slide con immagini. Non è una garanzia di gratuità: verifica costi e quote nel tuo account.
- **Modello impostato da te / OpenRouter**: un 404 non modifica la tua scelta; il messaggio indica il servizio e l'ID da correggere.
- **401/403**: autenticazione o accesso al modello negato; controlla chiave e abilitazioni, senza inviare il file open.env a nessuno.
- **502/503/504 AI**: servizio temporaneamente indisponibile. L’app riprova al massimo due volte, dopo circa 1 e 2 secondi, nello stesso servizio e sullo stesso modello; mostra il tentativo in corso. Se fallisce ancora, puoi toccare **Riprova AI** o riprovare più tardi. L’errore non significa «nessuna pianta trovata» né, da solo, «chiave errata». Chiudendo la ricerca non partono altri tentativi; una richiesta già inviata può comunque terminare.
- **429**: quota o frequenza delle richieste superata. Non vengono usate automaticamente altre chiavi per aggirare il limite.
- **Rete, CORS o timeout**: il browser non ha ricevuto una risposta valida. Ogni tentativo AI e ogni richiesta fotografica hanno un limite di attesa di 60 secondi; le verifiche ordinarie 12 secondi.
- **AI ha risposto ma GBIF non risponde**: l'app distingue la verifica non disponibile da «nessuna pianta trovata» e non applica proposte non verificate.

## PlantNet: ricerca, foto e pagina della specie

La chiave PlantNet si inserisce in **Configurazione → Chiave PlantNet**: è distinta dalle chiavi AI di open.env. La verifica della chiave interroga il catalogo senza inviare una foto finta o dichiarare erroneamente valido un 404.

**Cerca su PlantNet** interroga `/v2/projects/k-world-flora/species` con un prefisso, lingua italiana e una pagina di massimo 20 risultati. Il nome della guida è usato senza la cultivar; un nome comune non trovato direttamente viene cercato su Wikipedia e verificato tramite GBIF. I risultati riportano nome scientifico, autore e nomi comuni disponibili, con un collegamento esplicito alla pagina della specie. Non sono identità certificate dell'esemplare né dati morfologici completi. L'app non chiede le immagini del catalogo, riservate al piano Pro. Una varietà coltivata non viene confermata dalla sola corrispondenza della specie.

**Cerca da foto** usa fotocamera, galleria o una foto della scheda, poi «Identifica» invia la foto a PlantNet. Un 404 di questa identificazione può significare nessuna pianta riconosciuta, diversamente dal 404 di un modello AI. Prova una singola foglia o un fiore a fuoco, scegliendo l'organo corretto.

**Caratteristiche · guida locale** e **Zona d'origine** interrogano la guida delle 144, non PlantNet. Per proporre taxa a partire da caratteristiche testuali usa l'AI; verifica sempre l'esemplare sul campo. I collegamenti **Scheda PlantNet** e **Apri la specie su GBIF** aprono siti esterni e non sono presentati come ricerche interne.

Riferimenti tecnici: [catalogo PlantNet](https://my.plantnet.org/doc/api/taxonomy), [identificazione PlantNet](https://my.plantnet.org/doc/api/identify), [modelli Gemini](https://ai.google.dev/api/models), [modelli Groq](https://console.groq.com/docs/models).
