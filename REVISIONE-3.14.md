# Scheda Botanica PRO — revisione dell’interfaccia 3.14.0

## Cosa cambia

- Su telefono la barra inferiore riunisce **Schede**, **Mappa** e **Nuova scheda**. Il pulsante per creare una scheda resta disponibile anche dalla mappa.
- I pulsanti più usati hanno un’area di tocco di almeno 44 × 44 pixel. Le icone principali sono SVG locali, leggibili anche se il dispositivo non dispone di un font emoji.
- Ricerca, filtro per data, QR e stampa sono disposti in righe distinte sul telefono. Sul desktop restano vicini in una sola barra.
- Il riepilogo e le schede dell’elenco occupano meno spazio in altezza su telefono; il nome della specie, la selezione e l’eliminazione restano distinguibili.
- In una scheda aperta, Foto, GPS e Nota vocale restano sempre raggiungibili nella barra inferiore. Nell’editor i collegamenti alle sezioni e i pulsanti foto hanno etichette esplicite.
- Il cestino mostra un badge numerico senza sostituire l’icona e aggiorna anche il nome accessibile. Il menu backup usa etichette brevi e pulsanti larghi.
- Tema chiaro e scuro ricevono la stessa gerarchia di colori e bordi. Gli stili di stampa restano separati dall’interfaccia.

## Verifiche

**13 gruppi di prove passati** su Chromium headless: oltre alle prove precedenti sono stati toccati nel browser filtri, menu, stampa, navigazione mobile, Nuova scheda dalla mappa e cambio tema. Dimensioni controllate a 320, 390, 768 e 1440 pixel senza scorrimento orizzontale. Backup ZIP, Excel, archivio locale e riapertura offline superano ancora le prove. Nessuna risorsa locale mancante o eccezione JavaScript nella suite.

Le anteprime usano dati di esempio creati solo nella sessione di prova. I manuali Word/PDF originali e gli screenshot originali del repository non sono stati rigenerati. GPS, fotocamera, microfono e leggibilità all’aperto richiedono ancora una prova sul telefono effettivo.

## Per aggiornare il sito

Esegui prima un backup e verifica il file scaricato. Carica **tutti** i file estratti dallo ZIP nel repository GitHub Pages, mantenendo le cartelle `css/` e `js/`. Quando il sito è aggiornato, chiudi tutte le finestre e l’app installata, quindi riaprila. La nuova cache si attiva dopo la chiusura della versione precedente; per questo può essere necessaria una seconda riapertura. Controlla nella guida la versione **3.14.0**. I dati del browser restano nello stesso archivio IndexedDB: non cancellare i dati del sito per forzare l’aggiornamento.
