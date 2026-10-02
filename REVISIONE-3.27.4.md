# Revisione 3.27.4 · ricerca per nome e indisponibilità AI

- Il nome inserito guida la ricerca locale: la specie esatta viene prima delle cultivar e dei refusi. Non viene esclusa dai primi otto risultati quando altre piante condividono più caratteri generici. Con un nome, le piante estranee non vengono aggiunte dalla sola somiglianza dei caratteri; AI e foto possono comunque proporre alternative con la fonte indicata.
- Possibili refusi in un binomio (un solo carattere errato) vengono segnalati come suggerimenti, senza modifiche automatiche. «rubinia pseudoacacia» propone Robinia pseudoacacia. I caratteri sono indicati come 2/2, senza un fuorviante 100%; pochi indizi vengono segnalati.
- Errori AI 502/503/504: massimo due riprove dopo circa 1 e 2 secondi, sullo stesso servizio e modello, con stato visibile. Nessun cambio automatico di provider. Chiudere la ricerca impedisce nuove riprove; una richiesta già inviata può terminare. Ogni tentativo ha un timeout di 60 secondi. Nessuna riprova automatica per 401/403, 429 o errori di formato.
- Un errore AI mostra «Ricerca AI non completata» e «Riprova AI», distinto dall’assenza di taxa verificabili. Nessuna modifica alla scheda o alle chiavi. Guida, Wikipedia e GBIF restano utilizzabili quando l’AI fallisce.
- Aiuto e ASSISTENTE-AI.md aggiornati; versione 3.27.4 e cache offline v49. Database invariato.

## Verifiche

32 gruppi di test con rete simulata superati, senza credenziali reali: includono Robinia esclusa da otto aceri, refuso rubinia, nome ignoto, ricerca senza nome, errore 503 transitorio e persistente, limite di tentativi, chiusura durante attesa e messaggio di errore nell’app. Verificata la sintassi JavaScript. Aggiunto un test browser sul catalogo reale per il refuso; i test Chromium non sono stati eseguiti in questo ambiente perché il browser non è installato e il suo download precedente è fallito. GitHub esegue la suite completa con il workflow esistente.

I test simulati verificano la gestione delle risposte, non la disponibilità dell’account Gemini dell’utente. Un 503 del servizio esterno può persistere anche con questa revisione.

## Installazione

Pubblica lo ZIP completo con pubblica → 1, dalla cartella Drive associata. Dopo il completamento di GitHub Pages, tocca la versione nell’app, accetta l’aggiornamento e verifica **v3.27.4**. Non cancellare i dati del sito. Lo ZIP dei soli file modificati va sovrapposto al progetto completo 3.27.3, senza eliminare gli altri file; non è un progetto completo. Le schede, le integrazioni delle 144 piante e le chiavi restano nel browser.
