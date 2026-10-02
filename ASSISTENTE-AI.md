# Assistente AI facoltativo

La scheda botanica, l'archivio delle 144 piante, la ricerca locale e il backup funzionano senza chiavi API e anche offline. L'analisi AI delle slide richiede rete e una chiave per Google Gemini, Groq oppure OpenRouter.

## Dove conservare `open.env`

Conserva il file sul tuo dispositivo, per esempio in **Download**, fuori dalla cartella Google Drive usata da `pubblica`. Non copiarlo nello ZIP, nel repository GitHub o nella cartella pubblicata. `.gitignore` ignora i file `.env` nuovi; il comando `pubblica` aggiornato controlla ZIP, file da Drive e file tracciati prima del push, bloccando la pubblicazione se trova un file `.env`. Il test GitHub Actions segnala un eventuale errore sfuggito, ma parte **dopo** il push e non può annullarlo.

Il browser richiede una selezione esplicita del file la prima volta. Se **Ricorda le chiavi su questo browser** è attivo, l'app ne salva una copia nel `localStorage` del browser del tablet e la ricarica alle visite successive sullo stesso indirizzo e nello stesso profilo. Non salva né riapre il percorso del file. Se disattivi l'opzione, le chiavi restano solo fino alla chiusura della pagina. **Dimentica chiavi** cancella la copia locale. Anche la cancellazione dei dati del sito può eliminarla. Non usare l'opzione su un dispositivo condiviso: qualunque script eseguito dal sito può leggere quelle chiavi.

## Come usarlo

1. Crea un file di testo chiamato `open.env` sul dispositivo. Inserisci almeno una tra `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY` e `OPENROUTER_API_KEY`. Non pubblicare o inviare il file. Una chiave Google generica può non essere abilitata per la Gemini API.
2. Apri **Configurazione e backup → Assistente AI → Carica open.env** e seleziona il file. Lascia attivo **Ricorda le chiavi** per non doverlo scegliere alla prossima apertura.
3. Apri **Completa catalogo delle 144 piante**, scegli una pianta e il servizio con la relativa chiave, poi tocca **Proponi caratteristiche dalla slide**. Groq usa il modello Vision `qwen/qwen3.8-27b`; OpenRouter richiede l'ID di un modello che accetti immagini, scelto dal suo catalogo. Verifica disponibilità, condizioni e prezzo del modello nel tuo account **prima** di richiedere l'analisi. Non è previsto il passaggio automatico a un altro fornitore.
4. Confronta le proposte con la slide e la nota. Tocca **Usa proposta** per i campi vuoti, modifica il testo se serve e infine **Salva integrazioni**. Se un campo è già compilato, l'app mostra il conflitto e lascia la correzione manuale.

La richiesta invia al fornitore scelto la slide selezionata e la nota del corso. Non invia automaticamente foto delle schede, coordinate GPS o l'intero archivio. Le chiavi Cerebras, Together e OpenCode sono riconosciute nel file ma non vengono ancora usate per le slide; questo evita di inviare immagini a modelli senza verificarne prima le capacità.

Se la chiave è stata mostrata in uno screenshot o caricata in un luogo pubblico, rigenerala nel pannello del fornitore. Per un uso condiviso o continuo, le API devono passare da un servizio server con chiavi protette: una pagina statica non può tenere segrete le chiavi durante una richiesta effettuata dal browser.
