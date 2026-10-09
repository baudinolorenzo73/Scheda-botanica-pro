'use strict';
/* =====================================================================
   DATI APERTI (3.46) — servizi gratuiti e senza chiave, chiamati solo su
   richiesta dell'utente:
   · GBIF: categoria della Lista rossa IUCN e nomi comuni italiani
   · Open-Meteo: quota del terreno (Copernicus DEM GLO-90), previsioni,
     alba/tramonto, pollini (CAMS Europa), ricerca delle località
   · Nominatim (OpenStreetMap): località dalle coordinate, max 1 richiesta/s
   La parte «DatiAperti» è pura (URL e lettura delle risposte) e si prova in Node.
   ===================================================================== */
const DatiAperti = (() => {
  const IUCN = {
    EX: 'Estinta', EW: 'Estinta in natura', RE: 'Estinta nella regione', CR: 'In pericolo critico', EN: 'In pericolo',
    VU: 'Vulnerabile', NT: 'Quasi minacciata', LC: 'Minor preoccupazione', DD: 'Carente di dati', NE: 'Non valutata',
  };
  // Codici meteo WMO usati da Open-Meteo.
  const METEO = {
    0: ['☀️', 'Sereno'], 1: ['🌤️', 'Poco nuvoloso'], 2: ['⛅', 'Parzialmente nuvoloso'], 3: ['☁️', 'Coperto'],
    45: ['🌫️', 'Nebbia'], 48: ['🌫️', 'Nebbia con brina'],
    51: ['🌦️', 'Pioviggine debole'], 53: ['🌦️', 'Pioviggine'], 55: ['🌧️', 'Pioviggine intensa'],
    56: ['🌧️', 'Pioviggine gelata'], 57: ['🌧️', 'Pioviggine gelata intensa'],
    61: ['🌦️', 'Pioggia debole'], 63: ['🌧️', 'Pioggia'], 65: ['🌧️', 'Pioggia forte'],
    66: ['🌧️', 'Pioggia gelata'], 67: ['🌧️', 'Pioggia gelata forte'],
    71: ['🌨️', 'Neve debole'], 73: ['🌨️', 'Neve'], 75: ['❄️', 'Neve forte'], 77: ['🌨️', 'Neve granulosa'],
    80: ['🌦️', 'Rovesci deboli'], 81: ['🌧️', 'Rovesci'], 82: ['⛈️', 'Rovesci violenti'],
    85: ['🌨️', 'Rovesci di neve'], 86: ['❄️', 'Rovesci di neve forti'],
    95: ['⛈️', 'Temporale'], 96: ['⛈️', 'Temporale con grandine'], 99: ['⛈️', 'Temporale con grandine forte'],
  };
  const POLLINI = [
    ['alder_pollen', 'Ontano'], ['birch_pollen', 'Betulla'], ['grass_pollen', 'Graminacee'],
    ['mugwort_pollen', 'Artemisia'], ['olive_pollen', 'Olivo'], ['ragweed_pollen', 'Ambrosia'],
  ];
  const c6 = (n) => Number(n).toFixed(5);   // ~1 m: basta per servizi e cache

  const url = {
    iucn: (id) => `https://api.gbif.org/v1/species/${encodeURIComponent(id)}/iucnRedListCategory`,
    nomi: (id) => `https://api.gbif.org/v1/species/${encodeURIComponent(id)}/vernacularNames?limit=300`,
    quota: (lat, lng) => `https://api.open-meteo.com/v1/elevation?latitude=${c6(lat)}&longitude=${c6(lng)}`,
    localita: (lat, lng) => `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${c6(lat)}&lon=${c6(lng)}&zoom=18&addressdetails=1&accept-language=it`,
    meteo: (lat, lng) => `https://api.open-meteo.com/v1/forecast?latitude=${c6(lat)}&longitude=${c6(lng)}` +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset' +
      '&timezone=auto&forecast_days=4',
    pollini: (lat, lng) => `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c6(lat)}&longitude=${c6(lng)}` +
      `&hourly=${POLLINI.map(([k]) => k).join(',')}&timezone=auto&forecast_days=4`,
    cercaLuogo: (nome) => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=6&language=it&format=json`,
  };

  // {code:'LC', category:'LEAST_CONCERN'} → {codice, testo}. Senza valutazione: NE.
  function iucn(dati) {
    const codice = String(dati?.code || '').toUpperCase();
    return IUCN[codice] ? { codice, testo: IUCN[codice] } : { codice: 'NE', testo: IUCN.NE };
  }
  // Nomi italiani distinti, nell'ordine in cui GBIF li elenca (al massimo 6).
  function nomiItaliani(dati) {
    const visti = new Map();
    for (const v of dati?.results || []) {
      if (v?.language !== 'ita') continue;
      const nome = String(v.vernacularName || '').trim().replace(/\s+/g, ' ');
      if (!nome || nome.length > 60) continue;
      const k = nome.toLocaleLowerCase('it');
      if (!visti.has(k)) visti.set(k, nome[0].toLocaleUpperCase('it') + nome.slice(1));
    }
    return [...visti.values()].slice(0, 6);
  }
  function quota(dati) {
    const m = Array.isArray(dati?.elevation) ? dati.elevation[0] : null;
    return Number.isFinite(m) ? Math.round(m) : null;
  }
  // «Parco del Valentino, Viale Virgilio, Torino (TO)»
  function localita(dati) {
    const a = dati?.address || {};
    const luogo = a.village || a.town || a.city || a.municipality || a.hamlet || '';
    const frazione = [a.hamlet, a.suburb, a.quarter].find((x) => x && x !== luogo) || '';
    const prov = /^[A-Z]{2}-([A-Z]{2})$/.exec(a['ISO3166-2-lvl6'] || '')?.[1] || '';
    const via = a.road ? a.road + (a.house_number ? ' ' + a.house_number : '') : '';
    const nome = dati?.name && ![via, a.road, luogo].includes(dati.name) ? dati.name : '';
    const parti = [nome, via, frazione && !via ? frazione : '', luogo ? luogo + (prov ? ` (${prov})` : '') : ''].filter(Boolean);
    const testo = parti.join(', ') || String(dati?.display_name || '').split(',').slice(0, 3).join(',').trim();
    return testo.slice(0, 140);
  }
  function descriviMeteo(codice) {
    return METEO[codice] || ['🌡️', 'Condizioni non classificate'];
  }
  // Massimo giornaliero di ogni polline (granuli/m³) per i giorni della previsione.
  function pollini(dati) {
    const ore = dati?.hourly?.time || [];
    const giorni = [...new Set(ore.map((t) => String(t).slice(0, 10)))];
    return POLLINI.map(([k, nome]) => {
      const valori = dati?.hourly?.[k] || [];
      const perGiorno = giorni.map((g) => {
        const v = ore.map((t, i) => (String(t).startsWith(g) ? valori[i] : null)).filter(Number.isFinite);
        return v.length ? Math.max(...v) : null;
      });
      return { chiave: k, nome, giorni, perGiorno, massimo: Math.max(0, ...perGiorno.filter(Number.isFinite)) };
    });
  }
  function luoghi(dati) {
    return (dati?.results || []).filter((l) => Number.isFinite(l?.latitude) && Number.isFinite(l?.longitude)).map((l) => ({
      nome: l.name, lat: l.latitude, lng: l.longitude, quota: Number.isFinite(l.elevation) ? Math.round(l.elevation) : null,
      dove: [l.admin3 && l.admin3 !== l.name ? l.admin3 : '', l.admin2, l.country_code === 'IT' ? '' : l.country].filter(Boolean).join(', '),
    }));
  }
  return { IUCN, url, iucn, nomiItaliani, quota, localita, descriviMeteo, pollini, luoghi };
})();

/* ---------- Nominatim: una richiesta alla volta, almeno 1,1 s tra due ---------- */
const NOMINATIM = { ultima: 0, coda: Promise.resolve(), cache: new Map() };
function richiestaNominatim(lat, lng) {
  const chiave = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  // Si conserva la promessa: due richieste uguali, anche contemporanee, partono una volta sola.
  if (NOMINATIM.cache.has(chiave)) return NOMINATIM.cache.get(chiave);
  const turno = NOMINATIM.coda.then(async () => {
    const attesa = NOMINATIM.ultima + 1100 - Date.now();
    if (attesa > 0) await new Promise((ok) => setTimeout(ok, attesa));
    NOMINATIM.ultima = Date.now();
    return ServiziRicerca.json(DatiAperti.url.localita(lat, lng), { headers: { Accept: 'application/json' } }, 12000, 'OpenStreetMap Nominatim');
  });
  NOMINATIM.cache.set(chiave, turno);
  turno.catch(() => NOMINATIM.cache.delete(chiave));   // un errore non resta in cache
  NOMINATIM.coda = turno.catch(() => {});
  return turno;
}

/* ---------- GBIF: Lista rossa IUCN e nomi comuni (salvati nella scheda) ---------- */
function disegnaInfoGbif() {
  const box = $('#gbif-info');
  const r = S.aperta;
  if (!box || !r) return;
  const valido = r.gbifId && r.infoGbif?.gbifId === r.gbifId;
  const righe = [];
  if (valido) {
    const i = r.infoGbif;
    righe.push(el('span', { class: `iucn iucn-${i.iucn.toLowerCase()}`, title: `Lista rossa IUCN: ${DatiAperti.IUCN[i.iucn] || ''}` }, i.iucn),
      el('span', {}, el('b', {}, 'Lista rossa IUCN: '), DatiAperti.IUCN[i.iucn] || 'Non valutata'),
      i.nomi?.length ? el('span', {}, el('b', {}, 'Nomi comuni: '), i.nomi.join(', ')) : el('span', { class: 'testo-tenue' }, 'Nessun nome comune italiano su GBIF'),
      el('small', { class: 'testo-tenue' }, `fonte GBIF · ${dataBreveIT(String(i.quando).slice(0, 10))}`));
  }
  const bottone = el('button', { type: 'button', class: 'btn', id: 'gbif-info-carica', disabled: !r.gbifId || schedaBloccata(r),
    title: r.gbifId ? 'Chiede a GBIF categoria IUCN e nomi comuni italiani' : 'Serve prima il riferimento GBIF della specie (Cerca → GBIF)',
    onclick: caricaInfoGbif }, valido ? '↻ Aggiorna da GBIF' : '🌍 Stato IUCN e nomi comuni');
  const nota = r.gbifId ? null : el('small', { class: 'testo-tenue' }, r.nome?.trim()
    ? 'Serve il riferimento GBIF della specie: si trova da solo con il nome scientifico, oppure da Cerca → GBIF.'
    : 'Scrivi il nome scientifico: con il riferimento GBIF potrai chiedere stato IUCN e nomi comuni.');
  box.replaceChildren(...righe, bottone, ...(nota ? [nota] : []));
  box.classList.toggle('gbif-info-piena', valido);
}

async function caricaInfoGbif() {
  const r = S.aperta;
  if (!r || avvisaBloccata(r) || !r.gbifId) return;
  const id = r.gbifId;
  const btn = $('#gbif-info-carica');
  btn.disabled = true; btn.textContent = 'Chiedo a GBIF…';
  try {
    const [categoria, nomi] = await Promise.all([
      ServiziRicerca.json(DatiAperti.url.iucn(id), {}, 12000, 'GBIF').catch((e) => (e.status === 404 ? {} : Promise.reject(e))),
      ServiziRicerca.json(DatiAperti.url.nomi(id), {}, 12000, 'GBIF'),
    ]);
    if (S.aperta !== r || r.gbifId !== id) return;
    r.infoGbif = { gbifId: id, iucn: DatiAperti.iucn(categoria).codice, nomi: DatiAperti.nomiItaliani(nomi), quando: oraISO() };
    salvaPresto(r);
    stato(`GBIF: Lista rossa ${r.infoGbif.iucn}, ${r.infoGbif.nomi.length} nomi comuni italiani`);
  } catch (e) {
    stato(e.message, true);
  } finally {
    if (S.aperta === r) disegnaInfoGbif();
  }
}

/* ---------- Quota del terreno (Open-Meteo, Copernicus DEM GLO-90) ---------- */
async function calcolaQuotaTerreno() {
  const r = S.aperta;
  if (!r?.gps || avvisaBloccata(r)) return;
  const g = r.gps;
  const btn = $('#gps-quota-dem');
  if (btn) { btn.disabled = true; btn.textContent = 'Calcolo la quota…'; }
  try {
    const m = DatiAperti.quota(await ServiziRicerca.json(DatiAperti.url.quota(g.lat, g.lng), {}, 12000, 'Open-Meteo'));
    if (m == null) throw new Error('Open-Meteo: quota non disponibile per questo punto');
    if (S.aperta !== r || r.gps !== g) return;   // posizione cambiata nel frattempo
    g.quotaTerreno = m;
    salvaPresto(r);
    stato(`Quota del terreno: ${m} m s.l.m.`);
  } catch (e) {
    stato(e.message, true);
  } finally {
    if (S.aperta === r) disegnaGPS();
  }
}

/* ---------- Località dalle coordinate (Nominatim) ---------- */
async function compilaLocalitaDaGPS() {
  const r = S.aperta;
  if (!r || avvisaBloccata(r)) return;
  if (!r.gps) { stato('Serve prima la posizione GPS della scheda', true); return; }
  const btn = $('#localita-da-gps');
  btn.disabled = true; btn.textContent = 'Cerco la località…';
  try {
    const testo = DatiAperti.localita(await richiestaNominatim(r.gps.lat, r.gps.lng));
    if (!testo) throw new Error('OpenStreetMap: nessuna località per questo punto');
    if (S.aperta !== r) return;
    const attuale = String(r.localita || '').trim();
    if (attuale && attuale !== testo && !confirm(`Sostituire la località\n«${attuale}»\ncon\n«${testo}»?`)) return;
    r.localita = testo;
    $('#f-localita').value = testo;
    salvaPresto(r);
    stato('Località compilata da OpenStreetMap: puoi correggerla a mano');
  } catch (e) {
    stato(e.message, true);
  } finally {
    btn.disabled = schedaBloccata(r); btn.textContent = '📍 Dalle coordinate GPS';
  }
}

/* ---------- Meteo e pollini (Open-Meteo) ---------- */
const METEO_PREF = 'sb-meteo-ultimo';
function ultimoLuogoMeteo() {
  try { const v = JSON.parse(leggiPref(METEO_PREF) || 'null'); return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null; } catch { return null; }
}
function aggiornaUltimoMeteo() {
  const u = ultimoLuogoMeteo();
  const b = $('#meteo-ultimo');
  b.classList.toggle('nascosto', !u);
  if (u) b.textContent = `↻ ${u.nome}`;
}
function meteoQui() {
  if (!navigator.geolocation) { $('#meteo-risultato').textContent = 'Posizione non disponibile su questo dispositivo: cerca la località per nome.'; return; }
  $('#meteo-risultato').replaceChildren(el('p', { class: 'testo-tenue' }, '📍 Cerco la posizione…'));
  navigator.geolocation.getCurrentPosition(
    (p) => mostraMeteo({ lat: p.coords.latitude, lng: p.coords.longitude, nome: 'La tua posizione' }),
    () => { $('#meteo-risultato').replaceChildren(el('p', { class: 'avviso-rosso' }, 'Posizione non concessa o non trovata: cerca la località per nome.')); },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
}
async function cercaLuogoMeteo(e) {
  e?.preventDefault();
  const nome = $('#meteo-om-luogo').value.trim();
  const out = $('#meteo-risultato');
  if (nome.length < 2) { $('#meteo-om-luogo').focus(); return; }
  out.replaceChildren(el('p', { class: 'testo-tenue' }, 'Cerco la località…'));
  try {
    const lista = DatiAperti.luoghi(await ServiziRicerca.json(DatiAperti.url.cercaLuogo(nome), {}, 12000, 'Open-Meteo'));
    if (!lista.length) { out.replaceChildren(el('p', {}, `Nessuna località trovata per «${nome}».`)); return; }
    if (lista.length === 1) { mostraMeteo(lista[0]); return; }
    out.replaceChildren(el('p', { class: 'testo-tenue' }, 'Scegli la località:'),
      ...lista.map((l) => el('button', { type: 'button', class: 'btn meteo-scelta', onclick: () => mostraMeteo(l) },
        el('b', {}, l.nome), l.dove ? ` · ${l.dove}` : '', l.quota != null ? ` · ${l.quota} m` : '')));
  } catch (err) { out.replaceChildren(el('p', { class: 'avviso-rosso' }, err.message)); }
}
async function mostraMeteo(luogo) {
  const out = $('#meteo-risultato');
  out.replaceChildren(el('p', { class: 'testo-tenue' }, `Chiedo la previsione per ${luogo.nome}…`));
  try {
    const [m, p] = await Promise.all([
      ServiziRicerca.json(DatiAperti.url.meteo(luogo.lat, luogo.lng), {}, 15000, 'Open-Meteo'),
      ServiziRicerca.json(DatiAperti.url.pollini(luogo.lat, luogo.lng), {}, 15000, 'Open-Meteo pollini').catch(() => null),
    ]);
    scriviPref(METEO_PREF, JSON.stringify({ nome: luogo.nome, lat: luogo.lat, lng: luogo.lng }));
    aggiornaUltimoMeteo();
    out.replaceChildren(...schedaMeteo(luogo, m, p));
  } catch (err) { out.replaceChildren(el('p', { class: 'avviso-rosso' }, err.message)); }
}
function schedaMeteo(luogo, m, p) {
  const ora = (t) => String(t || '').slice(11, 16);
  const giorno = (d, i) => i === 0 ? 'Oggi' : i === 1 ? 'Domani' : new Date(d + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' });
  const cur = m.current || {};
  const [icona, testo] = DatiAperti.descriviMeteo(cur.weather_code);
  const d = m.daily || {};
  const quota = Number.isFinite(m.elevation) ? ` · ${Math.round(m.elevation)} m` : '';
  const out = [
    el('h3', { class: 'meteo-luogo' }, `${luogo.nome}${quota}`),
    el('p', { class: 'meteo-adesso' }, el('span', { class: 'meteo-icona-grande', 'aria-hidden': 'true' }, icona),
      el('span', {}, el('b', {}, `${Math.round(cur.temperature_2m)} °C`), ` · ${testo}`,
        el('br'), `percepita ${Math.round(cur.apparent_temperature)} °C · vento ${Math.round(cur.wind_speed_10m)} km/h, raffiche ${Math.round(cur.wind_gusts_10m)} km/h`)),
    el('div', { class: 'meteo-giorni' }, ...(d.time || []).map((t, i) => {
      const [ic, de] = DatiAperti.descriviMeteo(d.weather_code?.[i]);
      return el('div', { class: 'meteo-giorno' },
        el('b', { class: 'meteo-giorno-nome' }, giorno(t, i)),
        el('span', { class: 'meteo-icona', title: de, 'aria-label': de }, ic),
        el('span', { class: 'meteo-temp' }, el('span', { class: 'meteo-min' }, `${Math.round(d.temperature_2m_min[i])}°`), ' / ', el('b', {}, `${Math.round(d.temperature_2m_max[i])}°`)),
        el('span', { class: 'meteo-desc' }, de),
        el('span', {}, `💧 ${d.precipitation_probability_max?.[i] ?? '–'}% · ${(+d.precipitation_sum?.[i] || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 })} mm`),
        el('span', {}, `💨 ${Math.round(d.wind_speed_10m_max?.[i])} km/h · raffiche ${Math.round(d.wind_gusts_10m_max?.[i])}`),
        el('span', { class: 'testo-tenue' }, `☀ ${ora(d.sunrise?.[i])} – ${ora(d.sunset?.[i])}`));
    })),
  ];
  const pol = p ? DatiAperti.pollini(p).filter((x) => x.massimo > 0) : null;
  out.push(el('h3', { class: 'meteo-sotto' }, '🌾 Pollini'));
  if (!p) out.push(el('p', { class: 'testo-tenue' }, 'Previsione dei pollini non disponibile in questo momento.'));
  else if (!pol.length) out.push(el('p', { class: 'testo-tenue' }, 'Nessun polline delle sei specie monitorate previsto nei prossimi giorni.'));
  else out.push(el('table', { class: 'meteo-pollini' },
    el('thead', {}, el('tr', {}, el('th', {}, 'granuli/m³'), ...pol[0].giorni.map((g, i) => el('th', {}, i === 0 ? 'Oggi' : new Date(g + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short' }))))),
    el('tbody', {}, ...pol.map((x) => el('tr', {}, el('td', {}, x.nome), ...x.perGiorno.map((v) => el('td', {}, v == null ? '–' : String(Math.round(v)))))))));
  out.push(el('p', { class: 'meteo-fonte' }, 'Dati: Open-Meteo (modelli meteorologici), pollini CAMS Copernicus solo per l’Europa: ontano, betulla, graminacee, artemisia, olivo, ambrosia. In montagna confronta sempre più fonti.'));
  return out;
}
