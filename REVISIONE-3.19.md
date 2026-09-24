# Scheda Botanica PRO 3.19 — esportazione delle 144 piante

In **Configurazione → Catalogo delle piante** sono disponibili due coppie di pulsanti:

| Esportazione | Contenuto | Importazione |
| --- | --- | --- |
| Solo integrazioni | Tutti i campi aggiunti e salvati dall'utente, anche nelle sessioni precedenti | Aggiunge le integrazioni mancanti; conserva quelle già presenti. |
| Catalogo completo | Dati originali delle 144 piante più tutte le integrazioni salvate | Controlla completezza e coerenza delle 144 voci, chiede conferma e sostituisce solo le integrazioni del catalogo. |
| Backup completo nel menu ⋮ | Schede di rilievo, foto, audio, traccia e integrazioni | Il comando «Ripristina backup» gestisce il file ZIP. |

I file JSON del catalogo non contengono le immagini delle pagine originali, già incluse nel progetto. Prima di importare un catalogo completo, l'app verifica che i dati originali coincidano con la versione installata: se sono diversi, non modifica nulla. Anche in caso di errore durante la scrittura, le integrazioni precedenti restano conservate. Schede, fotografie e audio non vengono modificati dall'importazione del catalogo.

Per applicare questo aggiornamento copia i file modificati nelle stesse cartelle del progetto, conservando i percorsi dello ZIP.
