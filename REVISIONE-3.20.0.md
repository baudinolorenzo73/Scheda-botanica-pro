# Revisione 3.20.0

## Miglioramenti inclusi

- Il menu mostra ora numero e dimensione delle foto e delle note vocali salvate in IndexedDB.
- Il riepilogo indica uso stimato, quota disponibile, percentuale occupata e stato di persistenza del deposito locale quando il browser espone queste API.
- I backup JSON e ZIP includono `schemaVersion: 1`.
- I backup legacy privi di `schemaVersion` restano importabili come schema 1.
- I backup con schema futuro non supportato vengono rifiutati prima di modificare l’archivio locale.
- Le esportazioni del catalogo includono a loro volta `schemaVersion`.
- Aggiunti test automatici per meta tag iOS/PWA, riepilogo media e compatibilità schema backup.
- Aggiunto workflow GitHub Actions per sintassi JavaScript e suite browser su ogni push e pull request.

## Verifica

Eseguire:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
```

La suite completa ha superato 20 verifiche, senza eccezioni JavaScript né risorse locali mancanti.

La chiave PlantNet non è stata modificata, come richiesto.
