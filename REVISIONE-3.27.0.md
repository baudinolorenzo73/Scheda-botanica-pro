# Revisione 3.27.0

## Aggiornamenti dell’app

- Il pulsante della versione in alto a destra controlla sempre `versione.json` senza cache.
- Se la versione pubblicata è più recente, mostra il numero e chiede conferma prima di scaricarla.
- Dopo il download compare **Aggiorna ora**; prima del riavvio vengono salvate le modifiche in sospeso.
- Schede, foto, audio, tracce e catalogo restano nell’archivio locale durante l’aggiornamento.

## Nuove schede

- La data viene impostata automaticamente al giorno corrente.
- Il nome iniziale segue il progressivo: `Prova1`, `Prova2`, `Prova3`…
- Il nome è provvisorio e può essere sostituito immediatamente con quello botanico.
- Dopo **Nuovo elenco**, progressivo e nome ripartono da 1.

## Apertura rapida

- In prima pagina compare **Apri scheda salvata…**.
- Ogni voce mostra numero progressivo, nome e data.
- La scelta apre direttamente l’editor senza modificare o filtrare l’archivio.

## Cartella Download/Botanica

- In **Backup e configurazione → Cartella dei salvataggi** si può collegare una cartella nei browser compatibili.
- Selezionando Download, l’app crea o usa la sottocartella `Botanica`.
- Backup ZIP, QR, report, CSV, GeoJSON, KML, GPX, Excel e cataloghi passano tutti dalla stessa funzione di salvataggio.
- Se un nome esiste già, viene creata una copia numerata invece di sovrascrivere il salvataggio precedente.
- La cartella autorizzata viene ricordata localmente in IndexedDB. I file non vengono inviati a server esterni.
- Se il permesso scade, l’app chiede di riautorizzare; se la funzione non è supportata usa il normale download del browser.
- Android e iOS possono limitare la scelta delle cartelle: una PWA non può aggirare i permessi del sistema operativo.

## Sicurezza

- La cartella non viene mai cancellata o svuotata dall’app.
- Un file con lo stesso nome può essere sostituito solo nella cartella esplicitamente autorizzata.
- `open.env` e le chiavi API non entrano nei backup o nella cartella dei salvataggi.
