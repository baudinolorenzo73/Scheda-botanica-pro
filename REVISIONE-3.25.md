# Editor e ricerca della specie — versione 3.25.0

## Uso sul campo

La barra Foto, GPS e Nota vocale è nella parte alta della scheda, subito dopo l’intestazione. Resta visibile in alto mentre si scorre il modulo e non si trova sotto la tastiera del telefono. Le sezioni, l’elenco e i salvataggi restano gli stessi.

Sotto «Nome esemplare» ci sono due scelte: «Cerca» apre Wikipedia/Wikidata, collegamenti PlantNet e GBIF, identificazione da foto, confronto per caratteristiche e filtro per zona d’origine; «Cerca auto» produce un elenco di possibili nomi senza scriverli nella scheda.

## Come funziona «Cerca auto»

1. Confronta i caratteri inseriti con le 144 piante della guida locale, anche offline. Mostra il numero di caratteri concordanti e una percentuale di compatibilità solo se ne sono stati inseriti almeno due.
2. Se c’è un nome e la rete funziona, chiede a Wikipedia/Wikidata un nome tassonomico strutturato (P225). Verifica su GBIF fino a due nomi scientifici promettenti. La percentuale GBIF riguarda il confronto tassonomico del **nome**, non l’identificazione dell’esemplare.
3. Se esistono una foto salvata e una chiave PlantNet, invia la prima foto a PlantNet quando si preme «Cerca auto». Le proposte portano la confidenza percentuale restituita dal modello per quella foto. Senza foto o chiave la prova fotografica viene saltata.
4. Risultati e fonti sono distinti: non viene calcolata una percentuale unica sommando misure incompatibili. La selezione di un nome è manuale. Prima di sostituire un nome diverso viene richiesta conferma; i campi osservati restano conservati e gli eventuali conflitti sono mostrati.

Le richieste online hanno un limite di attesa e i risultati locali restano disponibili quando un servizio non risponde. Nessun nuovo formato del database o del backup è necessario.
