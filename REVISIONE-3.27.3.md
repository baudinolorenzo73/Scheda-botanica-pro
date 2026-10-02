# Revisione 3.27.3 · ricerca botanica

## Modifiche

- Nessuna generazione di `Prova1`, `Prova2` ecc. Le vecchie etichette interne non sono più visualizzate o cercate; i veri nomi botanici e le osservazioni salvate non vengono modificati. Nuove schede: nome vuoto, data odierna e scarto della bozza con soli valori automatici.
- PlantNet per nome è ora una richiesta al catalogo ufficiale, con risultati dentro l'app, paginati (massimo 20), nome e autore. Il sito esterno è un link distinto, presente solo se è noto il riferimento della specie. Nessuna richiesta di immagini del piano Pro.
- GBIF: filtro Plantae, corrispondenza esatta, confidenza minima e rango verificati anche nella ricerca del link. Il comando di ricerca del nome comune prova Wikipedia e non applica corrispondenze incerte o generi come specie.
- AI: trasporto condiviso fra ricerca e slide, separazione dei modelli Groq per testo e immagini, recupero dai 404 dei modelli predefiniti tramite catalogo ufficiale e una sola riprova. Nessun cambio di provider né modello OpenRouter arbitrario. Servizio e modelli configurabili; messaggi distinti per accesso negato, quota, timeout e JSON invalido.
- Verifica delle proposte AI su GBIF: un problema di rete non viene confuso con l'assenza di candidati. Le richieste non inviano note personali, GPS, data, numeri o DB intero.
- Foto PlantNet: timeout di 60 secondi anche nella ricerca intelligente, 404 contestualizzato, risposte tardive ignorate dopo chiusura/cambio scheda. La verifica della chiave non invia più una foto finta.
- Guida per caratteristiche: azzeramento delle parole chiave rimaste dalla ricerca precedente. Wikipedia: scarto delle risposte diventate obsolete cambiando ricerca/modalità o chiudendo il modulo, con conferma prima di sostituire un nome già presente.
- Le percentuali restano separate per fonte e i campi già compilati non vengono sovrascritti. Anche le dipendenze del tipo di foglia non cancellano osservazioni durante il completamento dalla guida: un valore che le renderebbe non pertinenti viene lasciato non applicato e segnalato. Ogni dialogo spiega la ricerca effettivamente avviata.
- Nuovo modulo `js/ricerca-servizi.js` incluso nell'app shell offline; cache v48 e versione 3.27.3. Nessuna migrazione distruttiva del database.

## Verifiche

`npm run test:search` esegue 24 gruppi di prove senza rete o credenziali reali: richieste AI testo/immagine, recupero 404, errore del modello scelto, quota/accesso, JSON invalido, query PlantNet, filtro GBIF, timeout, nuove schede e vecchie etichette, flussi PlantNet/AI/GBIF, privacy, verifiche indisponibili, foto, risultati parziali della ricerca intelligente, risposte tardive e dipendenze dei campi nel completamento dalla guida. Aggiornati anche i test browser per etichette rimosse e ricerca PlantNet interna. `npm test` esegue prima queste prove e poi i test browser e di resilienza.

In questa revisione i test di logica simulata e sintassi sono stati eseguiti; i test Chromium non sono stati eseguiti nell'ambiente di preparazione perché il download del browser è fallito. Non sono state utilizzate API key dell'utente: disponibilità, CORS e quote del suo account vanno verificati sul tablet. GitHub può eseguire la suite completa installando Chromium dal workflow già presente.

## Installazione

Fai prima un backup dei rilievi. Pubblica lo ZIP completo per evitare file mancanti. Se usi i soli file modificati, devono essere sovrapposti al progetto **3.27.2 completo**, senza eliminare i file non inclusi. Il file `__patch_only__.txt` indica che l'archivio è un aggiornamento parziale: non usarlo come sostituzione completa.

Dopo la pubblicazione tocca la versione, accetta il download dell'aggiornamento e «Aggiorna ora». Deve apparire **v3.27.3**. Non cancellare i dati del sito o il database per aggiornare. Configura la chiave PlantNet separatamente da open.env e consulta **Aiuto** oppure `ASSISTENTE-AI.md` per tutte le voci di ricerca.
