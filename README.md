# 🌳 Scheda Botanica PRO

App **offline** per il rilievo botanico sul campo: schede per censire alberi con foto, GPS, note vocali, stima ambientale, stampa e backup, senza server e senza account.

**by Lollo ®2026 — versione 3.27.1**

[Editor e ricerca automatica](REVISIONE-3.25.md) · [Prima pagina e dimensione interfaccia](REVISIONE-3.24.md) · [Excel più leggero](REVISIONE-3.23.md) · [Unione con Drive Up](REVISIONE-3.22.md)

---

## 📱 Prova l'app

👉 **[Apri Scheda Botanica PRO](https://baudinolorenzo73.github.io/Scheda-botanica-pro/)** *(link attivo dopo aver pubblicato con GitHub Pages, vedi sotto)*

È una **PWA** (Progressive Web App): si può usare direttamente nel browser oppure installare sulla schermata home del telefono, e da quel momento funziona anche **senza connessione a internet**.

### Installarla sul telefono

- **Android (Chrome)** — apri il link, poi menu ⋮ → *Aggiungi a schermata Home* (o tocca il banner "Installa app" che compare da solo).
- **iPhone / iPad (Safari)** — apri il link, tocca l'icona di condivisione 􀈂, poi *Aggiungi a Home*.

Una volta installata si apre a schermo intero come un'app normale, con la sua icona.

---

## ✨ Funzionalità principali

- **Schede albero complete**: dati dendrometrici, botanici, pedologici e fitopatologici, con campi a scelta illustrata (icona + spiegazione per ogni valore) e campi che si adattano da soli — per esempio se scegli una foglia **aghiforme**, i campi lamina e margine non richiesti spariscono automaticamente.
- **Foto** (compresse in automatico) e **note vocali** direttamente sulla scheda.
- **GPS** con affinamento della precisione sotto la chioma.
- **Stima ambientale**: volume della chioma, ombra proiettata, CO₂ stoccata.
- **Riconoscimento specie** da foto con [PlantNet](https://plantnet.org) (chiave gratuita, opzionale).
- **Codice QR permanente** per ogni scheda, per ritrovarla senza ambiguità anche dopo l’apertura di un nuovo elenco.
- **Ricerca immediata del nome** nel catalogo locale delle specie e nei nomi già registrati, utilizzabile anche offline. Il nome può essere inserito liberamente.
- **Comandi di ricerca della specie** raccolti sotto «Cerca» nel campo nome: Wikipedia/Wikidata, PlantNet, GBIF, foto, caratteristiche e zona d’origine. La ricerca Wikipedia considera i primi cinque risultati e mostra solo nomi tassonomici strutturati su Wikidata che GBIF classifica nel regno Plantae; se GBIF non risponde, non propone nomi non verificati. «Cerca auto» combina la guida locale con la verifica del nome e, se c’è una foto e la chiave PlantNet, l’identificazione da foto; mostra la provenienza e il significato di ogni percentuale senza sintetizzarle in una probabilità fittizia. La provenienza d’origine non dimostra la presenza locale. I dati già osservati non vengono sovrascritti e le discordanze vengono evidenziate.
- **Aggiornamenti controllati:** toccando la versione in alto a destra l’app confronta la versione installata con `versione.json` pubblicato. Se trova una versione più recente mostra il numero e chiede conferma prima di scaricarla; quando è pronta compare «Aggiorna ora». Schede e dati locali non vengono cancellati.
- **Foto, GPS e nota vocale** sempre accessibili in alto nell’editor, anche mentre scorri la scheda.
- **Catalogo integrabile** in Configurazione: sfoglia le 144 pagine originali, aggiungi le caratteristiche mancanti e registra la fonte; le integrazioni hanno un editor viola distinto dalle schede di rilievo. Trasferisci solo le integrazioni o il catalogo completo delle 144 piante in JSON, oppure includi le integrazioni nel backup ZIP di schede, foto e audio.
- **Azioni in prima pagina**: «Nuova scheda» resta sempre visibile nella barra inferiore; avvio/pausa/stop della traccia GPS e «Nuovo elenco» sono nel riquadro «Sul campo»; «+ Opzioni» raccoglie meteo 3B Meteo, QR, stampa, backup, cestino, guida e tema. In Configurazione si può scegliere la dimensione dell’interfaccia.
- **Nuove schede già riconoscibili**: data odierna automatica e nome provvisorio sequenziale `Prova1`, `Prova2`… da sostituire con il nome botanico. Il menu «Apri scheda salvata…» mostra numero, nome e data e apre direttamente la scheda scelta.
- **Nuovo elenco** dalla prima schermata: scarica un backup delle schede correnti e le sposta nel cestino, poi riparte dalla scheda numero 1.
- **Mappa offline** e registrazione del percorso con filtro dei punti GPS imprecisi ed esportazione GPX.
- **Stampa** di una o più schede, anche solo come etichette QR.
- **Backup completo (.zip)** con ripristino protetto di schede, cestino, foto, audio, catalogo e traccia; import/export CSV, GeoJSON, KML e GPX. Nei browser che supportano File System Access puoi autorizzare Download e l’app crea/usa la sottocartella `Botanica`. Prima spiega lo scopo e chiede conferma; il permesso riguarda esclusivamente la cartella scelta. Negli altri browser usa il download normale.
- **100% offline-first**: tutti i dati restano sul dispositivo (IndexedDB), archivio locale; alcune funzioni consultano servizi esterni.

## 🖼️ Screenshot

| Elenco schede | Compilazione scheda |
|---|---|
| ![Elenco schede](screenshot/elenco.png) | ![Scheda compilata](screenshot/scheda.png) |

| Campo illustrato | Mappa |
|---|---|
| ![Campo illustrato](screenshot/campo-illustrato.png) | ![Mappa](screenshot/mappa.png) |

## 📖 Manuali

Nella cartella [`manuali/`](manuali/):

- **[Manuale utente completo](manuali/manuale-utente.pdf)** ([.docx](manuali/manuale-utente.docx)) — guida capitolo per capitolo, con screenshot, glossario e indice analitico.
- **[Guida rapida](manuali/guida-rapida.pdf)** ([.docx](manuali/guida-rapida.docx)) — riepilogo pratico in una sola pagina.

## 🗂️ Struttura del repository

```
├── index.html               Struttura della pagina
├── css/app.css              Stili e layout responsive
├── js/                      Configurazione, utilità e database
├── tests/                   Prove automatiche nel browser
├── .github/workflows/       Verifica automatica su GitHub
├── app.js                   Logica, archivio, GPS, backup e importazioni
├── icone.js                 Disegni dei campi botanici
├── data/                    Guida locale alle specie
├── lib/                     Librerie incluse per mappa, QR, ZIP ed Excel
├── manifest.json            Manifest PWA (nome, icone, colori)
├── service-worker.js        Cache offline dell'app shell
├── icons/                   Icone dell'app in varie dimensioni
├── manuali/                 Manuale utente e guida rapida (PDF + Word)
└── screenshot/               Immagini per questo README
```

## 🚀 Pubblicare / aggiornare su GitHub Pages

```bash
git add .
git commit -m "Aggiornamento app"
git push
```

Con **Settings → Pages → Deploy from branch → main / (root)** attivato, GitHub pubblica automaticamente il contenuto del repository all'indirizzo `https://<utente>.github.io/<nome-repo>/` a ogni push.

## 🔒 Privacy e dati

L'app non ha un server: i dati (schede, foto, audio) restano **solo sul dispositivo**, in un archivio locale del browser (IndexedDB). La mappa contatta OpenStreetMap; l’identificazione richiesta invia una foto a PlantNet. La ricerca web consulta Wikipedia/Wikidata. Il collegamento tassonomico può consultare GBIF automaticamente dopo l’inserimento o l’apertura del nome di una specie. Questi servizi richiedono internet; l’archivio locale resta utilizzabile offline.

## 🧑‍💻 Tecnologie

JavaScript nativo senza framework né build, [Leaflet](https://leafletjs.com) per la mappa, IndexedDB per il salvataggio, MediaRecorder per l'audio e Geolocation API per il GPS.

## ⚖️ Licenza

Progetto personale — **by Lollo ®2026**.

---

<sub>Manuali e struttura PWA generati con l'aiuto di Claude.</sub>
