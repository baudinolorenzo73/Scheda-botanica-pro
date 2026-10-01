# Generatore Turni Cucina/Servizio

App web installabile (PWA) per generare i turni **cucina** e **servizio** del mese per un gruppo o una comunità.
Funziona **interamente offline**: nessun server, nessun account, nessun dato inviato in rete.
I dati restano solo sul dispositivo di chi la usa.

*by Lollo ®2026*

## Cosa fa

- Elenco persone con ruoli consentiti (cucina, servizio o entrambi) e profilo individuale.
- Generazione automatica del piano mensile, con possibilità di chiedere una variante.
- **Turni fissi**: un giorno/ruolo assegnato a una persona precisa, sempre rispettato.
- **Indisponibilità** per persona e giorno.
- **Affiancamenti programmati**: scegli tu giorno, ruolo e persona; restano anche rigenerando il piano e contano nella soglia di affiancamento richiesta dal profilo.
- **Giorni speciali** a squadra.
- Regole di equilibrio (riposo, weekend equi, evita lo stesso giorno della settimana come preferenza, ecc.) e regole personalizzate.
- Modifiche manuali dal calendario, con avviso se violano una regola obbligatoria.
- Riepilogo per persona (totale, cucina, servizio, weekend, supporto).
- Esportazione in **Word, Excel e PDF**, stampa, salvataggio e backup dei dati.

## Uso online (già pubblicata)

Apri l'indirizzo della pagina nel browser. Per installarla come app:

- **Android (Chrome)**: menu ⋮ → *Installa app* (oppure *Aggiungi a schermata Home*).
- **iPhone/iPad (Safari)**: tasto Condividi → *Aggiungi a schermata Home*.
- **Computer (Chrome/Edge)**: icona di installazione nella barra dell'indirizzo.

Dopo il primo caricamento l'app si apre anche senza connessione.

## Pubblicare su GitHub Pages (passo per passo)

Prerequisito: un account GitHub e `git` installato (su Termux: `pkg install git`).

1. **Crea un repository** su GitHub, ad esempio `generatore-turni`, pubblico e **vuoto** (senza README, senza licenza).
2. **Entra nella cartella** che contiene questi file (quella dove c'è `index.html`):
   ```bash
   cd percorso/della/cartella
   ```
3. **Inizializza git e fai il primo commit**:
   ```bash
   git init
   git add .
   git commit -m "Prima pubblicazione PWA"
   git branch -M main
   ```
4. **Collega il repository** (sostituisci `baudinolorenzo73` e il nome se diverso):
   ```bash
   git remote add origin https://github.com/baudinolorenzo73/generatore-turni.git
   ```
5. **Invia i file** a GitHub (ti chiederà utente e token di accesso personale al posto della password):
   ```bash
   git push -u origin main
   ```
6. **Attiva Pages**: sul repository vai in *Settings* → *Pages* → in *Build and deployment* scegli *Deploy from a branch*, branch `main`, cartella `/ (root)` → *Save*.
7. Dopo uno o due minuti l'app è online a:
   ```
   https://baudinolorenzo73.github.io/generatore-turni/
   ```

I percorsi nei file sono tutti relativi, quindi funziona senza modifiche anche in una sottocartella come questa.

## Pubblicare un aggiornamento

1. Modifica `index.html`.
2. In `sw.js` cambia la riga `const VERSIONE = "turni-v1";` con un numero nuovo (`turni-v2`, `turni-v3`, …). Senza questo passaggio chi ha già installato l'app può continuare a vedere la versione vecchia.
3. Pubblica:
   ```bash
   git add .
   git commit -m "Aggiornamento"
   git push
   ```

Chi ha l'app installata riceve la nuova versione alla successiva apertura con connessione (a volte serve chiuderla e riaprirla una volta).

## Contenuto della cartella

| File | A cosa serve |
|---|---|
| `index.html` | L'app completa (HTML, CSS e JavaScript in un unico file) |
| `manifest.webmanifest` | Nome, colori e icone: rende la pagina installabile |
| `sw.js` | Service worker: salva i file per l'uso offline |
| `icons/` | Icone dell'app (normali, maskable per Android, Apple touch, favicon) |
| `.nojekyll` | Dice a GitHub Pages di servire i file così come sono |

## Provarla in locale

Il service worker funziona solo su `https` o su `localhost` (non aprendo il file con doppio clic). Dalla cartella dell'app:

```bash
python3 -m http.server 8000
```

poi apri `http://localhost:8000` nel browser.

## Privacy

Tutto avviene nel browser. I nomi e i piani restano nella memoria locale del dispositivo; per spostarli su un altro dispositivo usa il salvataggio/backup dell'app. Cancellando i dati del sito dal browser, i dati locali vengono cancellati.

---

© by Lollo ®2026
