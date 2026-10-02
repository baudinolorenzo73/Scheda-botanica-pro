
/* Icone botaniche e relative spiegazioni, disegnate per questa app */
const ICONE = {};

// ---------- helpers ----------
const T = '<line x1="30" y1="44" x2="30" y2="55" stroke-width="3"/>'; // tronco per le chiome

function foglia(cx, cy, lung, larg, punta = true, riempi = false) {
  const yA = cy - lung / 2, yB = cy + lung / 2;
  const base = punta ? `${cx} ${yB}` : `${cx - larg * 0.25} ${yB} L ${cx + larg * 0.25} ${yB} L ${cx} ${yB}`;
  const d = `M ${cx} ${yA}
    C ${cx + larg} ${yA + lung * 0.15} ${cx + larg} ${yB - lung * 0.35} ${base}
    C ${cx - larg} ${yB - lung * 0.35} ${cx - larg} ${yA + lung * 0.15} ${cx} ${yA} Z`;
  return `<path d="${d}" stroke-width="2.5" ${riempi ? 'fill="currentColor" fill-opacity=".18"' : ''}/>` +
    `<line x1="${cx}" y1="${yA + 2}" x2="${cx}" y2="${yB - 1}" stroke-width="1.3"/>`;
}

// ================= FORMA CHIOMA =================
ICONE.formaChioma = {
  piramidale: T + '<path d="M30 6 L44 24 L40 24 L48 40 L12 40 L20 24 L16 24 Z" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/>',
  'a cono': T + '<path d="M30 5 L44 40 L16 40 Z" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/>',
  espansa: T + '<ellipse cx="30" cy="26" rx="22" ry="13" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/>',
  globosa: T + '<circle cx="30" cy="23" r="18" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/>',
  colonnare: '<line x1="30" y1="46" x2="30" y2="55" stroke-width="3"/><rect x="19" y="6" width="22" height="40" rx="11" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/>',
  'a ombrello': '<line x1="30" y1="26" x2="30" y2="55" stroke-width="3"/><path d="M7 24 Q30 6 53 24 L53 28 Q30 13 7 28 Z" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/>',
  piangente: T.replace('44', '30') + '<circle cx="30" cy="18" r="13" stroke-width="2.5" fill="currentColor" fill-opacity=".15"/>' +
    '<path d="M20 24 Q16 38 19 50 M25 27 Q22 42 24 52 M35 27 Q38 42 36 52 M40 24 Q44 38 41 50" stroke-width="1.6" fill="none"/>',
};

// ================= PERSISTENZA FOGLIE =================
function ramoscello(pieno1, pieno2, pieno3) {
  const f = (x, y, p) => foglia(x, y, 16, 7, true, p);
  return '<line x1="8" y1="50" x2="52" y2="14" stroke-width="2.5"/>' +
    f(18, 42, pieno1) + f(32, 31, pieno2) + f(46, 20, pieno3);
}
ICONE.persistenza = {
  sempreverde: ramoscello(true, true, true),
  caduca: ramoscello(false, false, false) + '<path d="M46 34 q4 6 1 12" stroke-width="1.3" stroke-dasharray="2 2"/>',
  semisempreverde: ramoscello(true, true, false),
  semicaduca: ramoscello(true, false, false),
};

// ================= RAMI SECONDARI =================
ICONE.rami = {
  opposti: '<line x1="30" y1="8" x2="30" y2="54" stroke-width="3"/>' +
    '<line x1="30" y1="20" x2="12" y2="10" stroke-width="2.5"/><line x1="30" y1="20" x2="48" y2="10" stroke-width="2.5"/>' +
    '<line x1="30" y1="38" x2="12" y2="28" stroke-width="2.5"/><line x1="30" y1="38" x2="48" y2="28" stroke-width="2.5"/>',
  alterni: '<line x1="30" y1="8" x2="30" y2="54" stroke-width="3"/>' +
    '<line x1="30" y1="16" x2="12" y2="8" stroke-width="2.5"/>' +
    '<line x1="30" y1="28" x2="49" y2="22" stroke-width="2.5"/>' +
    '<line x1="30" y1="40" x2="12" y2="34" stroke-width="2.5"/>',
  verticillati: '<line x1="30" y1="8" x2="30" y2="54" stroke-width="3"/>' +
    '<line x1="30" y1="28" x2="10" y2="16" stroke-width="2.5"/><line x1="30" y1="28" x2="50" y2="16" stroke-width="2.5"/>' +
    '<line x1="30" y1="28" x2="30" y2="6" stroke-width="2.5"/><line x1="30" y1="28" x2="12" y2="40" stroke-width="2.5"/><line x1="30" y1="28" x2="48" y2="40" stroke-width="2.5"/>',
};

// ================= TIPOLOGIA DI CRESCITA =================
ICONE.crescita = {
  monopodiale: '<line x1="30" y1="6" x2="30" y2="54" stroke-width="3.5"/>' +
    '<line x1="30" y1="18" x2="16" y2="10" stroke-width="2"/><line x1="30" y1="18" x2="44" y2="10" stroke-width="2"/>' +
    '<line x1="30" y1="34" x2="16" y2="26" stroke-width="2"/><line x1="30" y1="34" x2="44" y2="26" stroke-width="2"/>' +
    '<circle cx="30" cy="6" r="2.5" fill="currentColor"/>',
  simpodiale: '<path d="M30 54 L26 36 L34 24 L24 12" stroke-width="3.5" fill="none"/>' +
    '<circle cx="30" cy="54" r="0" /><circle cx="26" cy="36" r="2.2" fill="currentColor"/><circle cx="34" cy="24" r="2.2" fill="currentColor"/>' +
    '<line x1="26" y1="36" x2="42" y2="30" stroke-width="2"/><line x1="34" y1="24" x2="46" y2="20" stroke-width="2"/>',
};

// ================= TIPO DI FOGLIA =================
ICONE.tipoFoglia = {
  aghiforme: '<line x1="16" y1="46" x2="44" y2="14" stroke-width="2.2"/><line x1="22" y1="46" x2="50" y2="14" stroke-width="2.2"/><line x1="10" y1="46" x2="38" y2="14" stroke-width="2.2"/>',
  semplice: foglia(30, 28, 34, 15, true, true) + '<line x1="30" y1="45" x2="30" y2="54" stroke-width="2"/>',
  composta: '<line x1="12" y1="50" x2="48" y2="12" stroke-width="2.2"/>' +
    [ [16,44],[24,36],[32,28],[40,20] ].map(([x,y],i)=>`<g transform="rotate(${i%2?18:-18} ${x} ${y})">${foglia(x,y,13,6,true,true)}</g>`).join(''),
  squamiforme: '<line x1="30" y1="10" x2="30" y2="54" stroke-width="2.5"/>' +
    [14,22,30,38].map((y,i)=>`<path d="M${16-(i%2?3:0)} ${y} L30 ${y-7} L${44-(i%2?0:3)} ${y} L30 ${y+7} Z" stroke-width="1.6" fill="currentColor" fill-opacity=".15"/>`).join(''),
};

// ================= FORMA DELLA LAMINA =================
ICONE.lamina = {
  ovata: foglia(30, 30, 38, 16, true, true),
  lanceolata: foglia(30, 30, 44, 8, true, true),
  ellittica: '<path d="M30 6 C46 6 46 54 30 54 C14 54 14 6 30 6 Z" stroke-width="2.5" fill="currentColor" fill-opacity=".18"/><line x1="30" y1="8" x2="30" y2="52" stroke-width="1.3"/>',
  aghiforme: ICONE.tipoFoglia.aghiforme,
  squamiforme: ICONE.tipoFoglia.squamiforme,
  palmata: '<line x1="30" y1="30" x2="30" y2="54" stroke-width="2"/>' +
    [ [30,-90],[15,-45],[45,45],[0,-20],[60,20] ].map(([ang])=>'').join('') +
    [-70,-35,0,35,70].map((ang)=>{
      const rad = ang*Math.PI/180, x2=30+Math.sin(rad)*24, y2=30-Math.cos(rad)*24-6;
      return `<g><path d="M30 30 Q${30+Math.sin(rad)*10} ${30-Math.cos(rad)*10-3} ${x2} ${y2} Q${30+Math.sin(rad)*10} ${30-Math.cos(rad)*10+3} 30 30 Z" stroke-width="1.6" fill="currentColor" fill-opacity=".18"/></g>`;
    }).join(''),
};

// ================= MARGINE FOGLIARE =================
function bordo(genera) {
  return `<path d="M6 40 Q30 44 54 40" stroke-width="2" fill="none" stroke-dasharray="0"/>` +
    `<path d="${genera()}" stroke-width="2.3" fill="none"/>`;
}
ICONE.margine = {
  intero: bordo(() => 'M6 24 Q30 12 54 24'),
  seghettato: bordo(() => {
    let d = 'M6 26'; for (let x = 6; x < 54; x += 8) d += ` L${x+4} 14 L${x+8} 26`; return d;
  }),
  dentato: bordo(() => {
    let d = 'M6 26'; for (let x = 6; x < 54; x += 10) d += ` L${x+5} 15 L${x+10} 26`; return d;
  }),
  lobato: bordo(() => 'M6 26 Q11 10 18 26 Q23 10 30 26 Q37 10 42 26 Q49 10 54 24'),
  ondulato: bordo(() => 'M6 22 Q14 14 22 22 Q30 30 38 22 Q46 14 54 22'),
};

/* =====================================================================
   DEFINIZIONI — spiegazione discorsiva per ciascun valore, mostrata
   nel selettore illustrato insieme all'icona.
   ===================================================================== */
const DEFINIZIONI = {
  estensione: {
    '1 – monociclica': 'Il ramo si allunga una sola volta all’anno: la gemma contiene già tutto il germoglio formato l’anno prima, poi in primavera si distende e si ferma per il resto della stagione. Tipica di quasi tutte le conifere e di molte latifoglie del Piemonte (faggio, farnia, rovere, frassino maggiore, abete bianco, abete rosso).',
    '2 – policiclica (olmo)': 'Cresce a ondate: una prima spinta preformata in primavera, poi una seconda (a volte una terza) con foglie più piccole se c’è acqua e caldo. Il ramo risulta a zig-zag, con internodi lunghi-corti-lunghi. Esempio classico: l’olmo (Ulmus).',
    '3 – continua': 'Non ha una vera gemma invernale chiusa: produce foglie sempre nuove e si allunga finché il clima lo permette, anche per tutta la stagione. Rami con midollo grosso e internodi molto lunghi, apice che dissecca in inverno. Tipica di specie invasive a crescita rapida come robinia, ailanto e paulownia — dopo una potatura drastica ricaccia con grande vigore.',
  },
  persistenza: {
    sempreverde: 'La chioma non resta mai spoglia: le foglie vecchie cadono un po’ alla volta, sostituite subito da quelle nuove.',
    caduca: 'Perde tutte le foglie in una stagione (di solito l’autunno) e resta spoglia fino alla ripresa vegetativa.',
    semisempreverde: 'In inverni miti trattiene gran parte delle foglie; con freddo intenso può perderle quasi del tutto.',
    semicaduca: 'Perde la maggior parte delle foglie in inverno, ma alcune restano sui rami fino alla primavera.',
  },
  formaChioma: {
    piramidale: 'Sagoma a più livelli che si restringe verso la cima, tipica di molte conifere (es. abete).',
    'a cono': 'Un unico cono continuo dalla base alla punta, più stretto della piramidale (es. cipresso, alcuni abeti).',
    espansa: 'Più larga che alta, con rami che si allargano lateralmente (es. querce mature, platano).',
    globosa: 'Tondeggiante su tutti i lati, come una sfera appoggiata sul tronco (es. tiglio potato, acero campestre).',
    colonnare: 'Stretta e alta, quasi verticale, con pochissima estensione laterale (es. cipresso colonnare).',
    'a ombrello': 'Chioma appiattita in alto, spesso su tronco alto e spoglio nella parte bassa (es. pino domestico).',
    piangente: 'Rami principali eretti o orizzontali, ma i rametti terminali ricadono verso il basso (es. salice piangente).',
  },
  rami: {
    opposti: 'Due rami nascono alla stessa altezza, uno di fronte all’altro sul fusto (es. acero, frassino, olmo NO-alterno).',
    alterni: 'I rami nascono uno alla volta, a altezze diverse e su lati alterni del fusto (es. quercia, betulla, la maggioranza degli alberi).',
    verticillati: 'Tre o più rami nascono tutti dallo stesso punto del fusto, come i raggi di una ruota (es. pino, oleandro).',
  },
  crescita: {
    monopodiale: 'Un solo asse centrale domina e cresce dritto verso l’alto per tutta la vita; i rami laterali restano secondari (es. abete, conifere).',
    simpodiale: 'L’apice si ferma o si danneggia e un ramo laterale ne prende il posto, ripetutamente: il fusto risulta come una serie di segmenti (es. tiglio, molte latifoglie).',
  },
  tipoFoglia: {
    aghiforme: 'Sottile e allungata come un ago, tipica delle conifere (es. pino, abete).',
    semplice: 'Un’unica lamina intera attaccata al rametto da un solo picciolo (es. faggio, magnolia).',
    composta: 'La foglia è divisa in più foglioline (foglioline) disposte lungo un asse centrale comune (es. frassino, robinia, noce).',
    squamiforme: 'Ridotta a piccole squame embricate che avvolgono il rametto, quasi senza lamina visibile (es. cipresso, tuia).',
  },
  lamina: {
    ovata: 'A forma di uovo, più larga verso la base e ristretta verso la punta (es. pero, tiglio).',
    lanceolata: 'Lunga e stretta, appuntita a entrambe le estremità come la punta di una lancia (es. salice, oleandro).',
    ellittica: 'Simmetrica, più larga esattamente al centro e ristretta in modo uguale ai due estremi (es. carpino).',
    aghiforme: 'Sottile e allungata come un ago, tipica delle conifere (es. pino, abete).',
    squamiforme: 'Ridotta a piccole squame che avvolgono il rametto (es. cipresso, tuia).',
    palmata: 'Diversi lobi appuntiti si irradiano da un unico punto, come le dita di una mano (es. acero, platano).',
  },
  margine: {
    intero: 'Bordo liscio e continuo, senza denti né incisioni (es. alloro, magnolia).',
    seghettato: 'Denti piccoli e appuntiti, tutti inclinati nella stessa direzione come i denti di una sega (es. ciliegio).',
    dentato: 'Denti appuntiti ma simmetrici, senza inclinazione verso un lato (es. castagno).',
    lobato: 'Il bordo forma grandi rientranze arrotondate o appuntite, i lobi (es. quercia, acero).',
    ondulato: 'Il bordo ondeggia dolcemente in su e in giù, senza denti veri e propri (es. faggio giovane, leccio).',
  },
};
ICONE.estensione = {
  '1 – monociclica':
    '<line x1="30" y1="53" x2="30" y2="16" stroke-width="3"/>' +
    '<path d="M23 33 L30 27 L37 33" stroke-width="2.2" fill="none"/>' +
    '<ellipse cx="30" cy="11" rx="4.5" ry="6.5" stroke-width="2" fill="currentColor" fill-opacity=".25"/>',
  '2 – policiclica (olmo)':
    '<path d="M31 54 L21 39 L27 27 L16 9" stroke-width="3" fill="none"/>' +
    '<path d="M16 45 L21 39 L26 43" stroke-width="1.8" fill="none"/>' +
    '<path d="M21 32 L27 27 L32 31" stroke-width="1.8" fill="none"/>' +
    '<ellipse cx="16" cy="9" rx="4" ry="5.5" stroke-width="2" fill="currentColor" fill-opacity=".25" transform="rotate(-25 16 9)"/>',
  '3 – continua':
    '<path d="M30 54 C 25 42 35 30 29 18 C 27 14 26 11 25 8" stroke-width="3" fill="none"/>' +
    '<path d="M20 7 l3 -3 l3 3.4 l3 -3.4 l3 3" stroke-width="1.6" fill="none"/>',
};

