# Excel su richiesta — versione 3.23.0

Il progetto ora usa una sola libreria per leggere e generare fogli `.xlsx`: `lib/xlsx-populate.js`. La libreria viene eseguita soltanto quando si importa un `.xlsx` o si esporta il registro; le richieste contemporanee condividono lo stesso caricamento. Il service worker la conserva nella cache dell’app per l’uso offline, quindi il browser la scarica quando prepara la modalità offline, senza eseguirla all’avvio.

La libreria SheetJS (`lib/xlsx.js`) è stata rimossa. La lettura CSV è interna e gestisce BOM, separatori `;` e `,`, righe tra virgolette, doppi apici e ritorni a capo nei campi. La conversione delle date seriali Excel ora è indipendente dalla libreria e tiene conto dei calendari 1900 e 1904.

## Formati e compatibilità

- Importazione: `.xlsx`, `.csv`.
- Esportazione registro: `.xlsx` formattato.
- Il formato binario storico `.xls` non è compatibile con XlsxPopulate; occorre convertirlo in `.xlsx` o `.csv` prima dell’importazione. Il selettore non propone più `.xls` e l’errore indica come procedere.
- I backup ZIP e il database locale non cambiano.

La verifica automatica controlla il caricamento differito, la rilettura del registro esportato, la lettura CSV e il funzionamento offline. Non è un aggiornamento pubblicato: sostituire i file del sito con quelli del pacchetto completo per distribuirlo.
