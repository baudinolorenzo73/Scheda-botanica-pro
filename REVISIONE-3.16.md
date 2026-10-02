# Scheda Botanica PRO — versione 3.16.0

## Nome esemplare e identificazione

Tre pulsanti chiari sotto il nome:

- **Cerca per nome** interroga Wikipedia e usa il nome scientifico solo se è disponibile come dato strutturato su Wikidata. Nello stesso pannello resta disponibile la guida locale, anche offline. I campi botanici possono essere completati solo dai dati strutturati della guida locale, mai dall'estratto testuale di Wikipedia.
- **Caratteristiche** confronta le osservazioni già inserite con le 144 specie e varietà della guida del corso. Mostra candidate e numero di corrispondenze, non una identificazione certa. PlantNet non offre l'identificazione tramite soli campi descrittivi.
- **Cerca con foto** permette fotocamera, galleria e foto già presenti nella scheda. Mostra i risultati restituiti da PlantNet anche per specie assenti dalla guida locale, con percentuale di confidenza. Richiede connessione e chiave PlantNet; l'invio avviene solo toccando «Identifica».

Due collegamenti meno prominenti aprono **PlantNet** e **GBIF**. La scheda di dettaglio PlantNet viene collegata quando il servizio ha restituito il nome completo; negli altri casi si apre il sito per effettuare la ricerca. GBIF usa l'identificativo verificato, quando disponibile, altrimenti propone una ricerca per nome.

Quando un risultato della guida locale può riempire campi ancora vuoti, lascia intatte le osservazioni già inserite. Eventuali valori diversi da quelli della guida vengono segnalati sotto il campo nome. I risultati da foto vanno sempre verificati sul posto.

## Aggiornamento

Conserva prima un backup. Estrai lo ZIP e carica tutti i file nel repository mantenendo le cartelle. Chiudi l'app installata prima di riaprirla; la nuova cache offline potrebbe richiedere una seconda apertura. Controlla la versione **3.16.0** in Aiuto. Non cancellare i dati del sito.

## Verifica

17 verifiche automatiche nel browser: percorsi dei pulsanti, avvisi sui dati discordanti, foto già salvate, risultati PlantNet simulati anche fuori dalla guida, backup, riapertura offline e layout. Nessuna chiamata reale a servizi esterni nei test.
