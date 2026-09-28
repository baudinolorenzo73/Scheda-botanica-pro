# Versione 3.26.3 — integrazione progressiva delle 144 piante

- L'importazione delle integrazioni aggiunge solo i campi ancora vuoti anche quando la pianta ha già dati personali. I valori già salvati non vengono sovrascritti.
- Le fonti dei nuovi campi possono essere distinte da quelle dei campi già presenti nella stessa pianta. L'editor mostra la provenienza e permette di correggere e salvare i dati importati.
- File di integrazione separato: `integrazioni-guida-144-da-slide.json`, con 146 campi esplicitati nelle slide per 97 piante (55 corteccia, 47 frutto/strobili, 40 fiore, 4 habitat). Non sono state dedotte caratteristiche dalle sole fotografie.
- Importa il JSON da **⋮ → Completa catalogo delle 144 piante → Importa integrazioni**. La pubblicazione dei file dell'app non importa automaticamente dati nel catalogo locale del dispositivo.
- I dati originali delle slide restano in sola lettura. Le schede di rilievo, le foto e la traccia non sono toccate dall'importazione del catalogo.
