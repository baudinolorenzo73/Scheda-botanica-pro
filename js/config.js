
'use strict';

/* =====================================================================
   1. CONFIGURAZIONE CAMPI
   Per aggiungere un campo basta una riga qui: editor, stampa, CSV,
   GeoJSON e ricerca leggono tutti da questa tabella.
   ===================================================================== */
const SEZIONI = [
  { id: 'oss', titolo: 'Osservazioni' },
  { id: 'veg', titolo: 'Vegetazione' },
  { id: 'ped', titolo: 'Pedologia' },
  { id: 'fit', titolo: 'Fitopatologia' },
  { id: 'not', titolo: 'Note' },
];

// tipo: testo | numero | scelta (select chiusa) | lista (testo libero con suggerimenti)
//       | illustrata (scelta guidata con icona + spiegazione, vedi ICONE/DEFINIZIONI) | area
const CAMPI = [
  { k: 'prog',          sez: 'oss', label: 'N° progressivo',              tipo: 'numero', passo: 1, min: 1, intero: true,
    aiuto: 'Numero della scheda nell’elenco corrente. Può ripartire da 1 quando crei un nuovo elenco; il QR usa un identificativo interno permanente.' },
  { k: 'data',          sez: 'oss', label: 'Data',                       tipo: 'data' },
  { k: 'numeroZona',    sez: 'oss', label: 'N° nel giorno',              tipo: 'numero', passo: 1, min: 1, intero: true, etichettaStampa: 'N° nel giorno',
    aiuto: 'Numerazione che riparte da 1 a ogni nuova data: si calcola da sola quando scegli la Data qui sopra. Utile per contare gli alberi rilevati in una stessa giornata.' },
  { k: 'nome',          sez: 'oss', label: 'Nome esemplare (genere, specie, varietà)', tipo: 'lista', largo: true },
  { k: 'numero',        sez: 'oss', label: 'N° medesimo esemplare',         tipo: 'numero', passo: 1, min: 1, intero: true, etichettaStampa: 'Esemplari vicini',
    aiuto: 'Quanti alberi uguali a questo si trovano nelle vicinanze (per esempio un filare). Di default è 1, cioè "esemplare isolato, nessun altro uguale intorno".' },
  { k: 'grandezza',     sez: 'oss', label: 'Classe di grandezza',         tipo: 'scelta', etichettaStampa: 'Grandezza',
    valori: [['', '—'], ['1', '1ª grandezza'], ['2', '2ª grandezza'], ['3', '3ª grandezza'], ['4', '4ª grandezza']],
    // Diciture usate in file ed Excel esportati da versioni precedenti: si importano come prima.
    vecchieEtichette: { '1ª grandezza (maggiore)': '1', '4ª grandezza (minore)': '4' } },
  { k: 'altezza',       sez: 'oss', label: 'Altezza (m)',                 tipo: 'numero', passo: 0.5, min: 0, max: 150 },
  { k: 'circonferenza', sez: 'oss', label: 'Circonferenza a 1,30 m (cm)', tipo: 'numero', passo: 1, min: 0, max: 5000, etichettaStampa: 'Circonferenza (cm)' },
  { k: 'persistenza',   sez: 'oss', label: 'Persistenza foglie',          tipo: 'illustrata', valori: ['sempreverde', 'caduca', 'semisempreverde', 'semicaduca'] },
  { k: 'formaChioma',   sez: 'oss', label: 'Forma della chioma',          tipo: 'illustrata', etichettaStampa: 'Forma chioma', valori: ['piramidale', 'a cono', 'espansa', 'globosa', 'colonnare', 'a ombrello', 'piangente'] },
  { k: 'rami',          sez: 'oss', label: 'Rami secondari',              tipo: 'illustrata', valori: ['opposti', 'alterni', 'verticillati'] },
  { k: 'crescita',      sez: 'oss', label: 'Tipo di crescita',            tipo: 'illustrata', valori: ['monopodiale', 'simpodiale'] },
  { k: 'estensione',    sez: 'oss', label: 'Tipologia di estensione (gemme)', tipo: 'illustrata', etichettaStampa: 'Estensione (gemme)', valori: ['1 – monociclica', '2 – policiclica (olmo)', '3 – continua'] },
  { k: 'tipoFoglia',    sez: 'veg', label: 'Tipo di foglia',              tipo: 'illustrata', valori: ['aghiforme', 'semplice', 'composta', 'squamiforme'] },
  { k: 'fogliaComposta', sez: 'veg', label: 'Tipo di foglia composta',     tipo: 'illustrata', etichettaStampa: 'Foglia composta', valori: ['imparipennata', 'paripennata', 'bipennata', 'digitata'],
    aiuto: 'Compare solo se il tipo di foglia è «composta». Conta le foglioline: c’è una fogliolina singola in punta (imparipennata) oppure solo coppie (paripennata)?' },
  { k: 'lamina',        sez: 'veg', label: 'Forma della lamina',          tipo: 'illustrata', etichettaStampa: 'Forma lamina', valori: ['ovata', 'lanceolata', 'ellittica', 'aghiforme', 'squamiforme', 'palmata'] },
  { k: 'margine',       sez: 'veg', label: 'Margine fogliare',            tipo: 'illustrata', valori: ['intero', 'seghettato', 'dentato', 'lobato', 'ondulato'] },
  { k: 'terreno',       sez: 'ped', label: 'Condizioni del terreno',      tipo: 'lista', largo: true, etichettaStampa: 'Terreno', valori: ['prato coltivato', 'prato non concimato', 'aiuola', 'terreno compatto', 'terreno drenato', 'pacciamato'] },
  { k: 'problemi',      sez: 'fit', label: 'Problemi tronco / foglie',    tipo: 'area', largo: true, etichettaStampa: 'Problemi' },
  { k: 'note',          sez: 'not', label: 'Altro notato',                tipo: 'area', largo: true, etichettaStampa: 'Note' },
];

// Dipendenze tra campi: se il campo "se" ha valore "valore", i campi
// elencati in "nascondi" non sono pertinenti e vengono nascosti + svuotati.
// Per aggiungere altre regole basta una riga qui.
// Con "tranne" la regola vale per tutti i valori diversi da quello indicato
// (anche il campo vuoto): il campo compare SOLO per quel valore.
const DIPENDENZE_CAMPI = [
  { se: 'tipoFoglia', valore: 'aghiforme', nascondi: ['lamina', 'margine'] },
  { se: 'tipoFoglia', tranne: 'composta', nascondi: ['fogliaComposta'] },
];

// true se, con il valore "v" del campo che governa, la regola nasconde i suoi campi.
function dipendenzaAttiva(dip, v) {
  v = v || '';
  return dip.tranne != null ? v !== dip.tranne : v === dip.valore;
}

// false se il campo "k" non è pertinente per la scheda "r" (es. lamina di un ago):
// stampa ed esportazioni lo saltano invece di mostrare un trattino.
function campoPertinente(r, k) {
  return !DIPENDENZE_CAMPI.some((d) => d.nascondi.includes(k) && dipendenzaAttiva(d, r[d.se]));
}

const DB_NOME = 'scheda-botanica';
const APP_VERSIONE = '3.33.0';
const DB_VERSIONE = 5;        // v5: integrazioni personali della guida specie
const FOTO_LATO_MAX = 1600;   // px, lato lungo
const FOTO_QUALITA = 0.82;    // qualità JPEG
