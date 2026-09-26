# Scheda Botanica PRO 3.18 — salvataggio e trasferimento del catalogo

## Cosa contiene ciascun file

| Azione | Dati inclusi |
| --- | --- |
| **Esporta solo integrazioni** (Catalogo delle piante) | Tutte le caratteristiche e note **salvate** e aggiunte dall'utente alle 144 piante, anche in sessioni precedenti. File JSON; esclude campi ancora non salvati, pagine originali e schede di rilievo. |
| **Importa integrazioni** (Catalogo delle piante) | Ripristina il JSON esportato dal catalogo; aggiunge le piante mancanti e conserva le integrazioni già presenti per la stessa pianta. Non modifica le schede di rilievo. |
| **Backup completo, con foto e audio** (menu ⋮) | Schede di rilievo, fotografie, registrazioni, catalogo integrato e traccia. File ZIP ripristinabile con **Ripristina backup**. |

Le 144 pagine e i dati originali sono file dell'applicazione e rimangono disponibili dopo la pubblicazione del progetto. Il file delle sole integrazioni conserva le aggiunte fatte dall'utente sul dispositivo, non le pagine originali.

Il pulsante di salvataggio ora richiede una fonte quando sono stati aggiunti dati; in sua assenza mostra **«Salvataggio non eseguito»**. Dopo che la scrittura nel database termina mostra **«Salvataggio completato»**. L'avviso di uscita si basa sui campi effettivamente cambiati rispetto all'ultima versione salvata.

Per aggiornare un progetto esistente, copia i file di questo aggiornamento nelle medesime cartelle del repository, mantenendo i percorsi. Le integrazioni già salvate sul dispositivo restano archiviate nel browser; prima di cambiare dispositivo esportale dal catalogo o esegui un backup completo.
