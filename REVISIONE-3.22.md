# Unione del progetto — versione 3.22.0

La cartella Drive «Up» contiene una versione 3.15.0 con file monolitici, mentre il progetto aggiornato qui era alla versione 3.21.0. La versione unificata conserva la struttura modulare, la traccia GPS migliorata, il catalogo integrabile, i comandi della home e le esportazioni complete. Non sovrascrive i dati locali del browser né modifica il formato del database.

## Funzione ripresa da Drive Up

- Ricerca delle 144 piante per provenienza o zona d’origine, con suggerimenti e dettagli del catalogo.
- Collegamento alla ricerca della specie su GBIF per verificare separatamente la distribuzione attuale. Provenienza del materiale didattico e presenza sul territorio hanno significati differenti.
- La selezione di una specie dalla ricerca per zona compila la scheda aperta con le stesse regole di controllo e conflitto della guida.

## Progetto e prove

Il pulsante «Zona d’origine» si trova nel gruppo delle ricerche sotto «Nome esemplare». Su telefono i quattro comandi sono disposti su due righe. È stato incluso il workflow GitHub Actions presente su Drive Up, con un file lock per installazioni riproducibili. Il pacchetto ZIP comprende tutti i file necessari per pubblicare il sito statico dalla radice del repository.

Per eseguire i test: `npm ci`, `npx playwright install chromium`, `npm test`. Le verifiche non consultano servizi botanici esterni.
