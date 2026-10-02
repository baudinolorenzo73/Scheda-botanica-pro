# Revisione 3.27.5 · Apri scheda locale

Aggiunto il pulsante **Apri scheda locale** come prima voce del menu **Cerca** sotto Nome esemplare. Un nome esatto apre direttamente la scheda della specie o cultivar nel catalogo delle 144; un nome parziale mostra l’elenco filtrato; senza nome mostra tutto il catalogo. La scheda locale include slide, note, caratteristiche e integrazioni salvate. Non richiede API key né avvia richieste online. La disponibilità offline delle slide richiede che siano state scaricate dall’app.

Consultare e chiudere non modifica il rilievo. Il comando esistente **Usa questo nome nella scheda** resta esplicito e mantiene gli avvisi sui dati già compilati. Ricerca per caratteristiche e servizi online restano comandi distinti.

Aggiornati Aiuto e documentazione. Versione 3.27.5, cache offline v50, nessuna modifica allo schema del database.

## Verifiche

Controllata la sintassi JavaScript e i flussi locali per nome esatto, cultivar, nome parziale, nome vuoto con caratteristiche già presenti e nome fuori catalogo. Le prove verificano che non partano ricerche web e che i dati restino invariati. Superati anche i 32 gruppi già esistenti di test di ricerca con servizi simulati. I test Chromium non sono stati eseguiti in questo ambiente: il browser di test non è disponibile.

## Installazione

Pubblica lo ZIP completo da Drive con **pubblica → 1**. Dopo la pubblicazione su GitHub Pages, tocca la versione nell’app e aggiorna: deve apparire **v3.27.5**. Non cancellare i dati del sito. L’archivio con i soli file modificati va sovrapposto al progetto **3.27.4 completo**, conservando tutti i file non inclusi.
