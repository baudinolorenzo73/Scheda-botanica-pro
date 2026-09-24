# Revisione 3.19.1

## Correzioni

- Aggiornata la versione della PWA a `3.19.1`.
- Resa esplicita e incrementabile la versione della cache dell’app-shell nel service worker.
- Implementata la diagnostica `__sw-diagnostica__` per identificare gli asset offline mancanti senza nascondere l’errore dietro a `cache.addAll()`.
- Aggiunto lo script `npm run test:setup` per installare dipendenze e browser Chromium necessari ai test.
- Aggiunto `package-lock.json` per rendere riproducibile l’installazione delle dipendenze.
- Documentato il rischio di considerare segreta la chiave PlantNet in una PWA distribuita pubblicamente.

## Verifica

La suite browser è stata eseguita con successo: 19 verifiche superate, nessuna eccezione JavaScript e nessuna risorsa locale mancante.

## Passo successivo consigliato

A ogni release che modifica un file della modalità offline, incrementare `APP_SHELL_VERSION` in `service-worker.js`.

Per una distribuzione multiutente, valutare un proxy server-side per PlantNet con rate limiting e chiave conservata in un secret.
