'use strict';
/* =====================================================================
   3. DATABASE (IndexedDB)
   store "schede": record senza immagini (chiave uid)
   store "foto":   Blob JPEG compressi (chiave = id foto)
   Niente più localStorage da 5 MB: lo spazio è quello del dispositivo.
   ===================================================================== */
const DB = {
  db: null,
  apri() {
    return new Promise((ok, ko) => {
      const r = indexedDB.open(DB_NOME, DB_VERSIONE);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('schede')) d.createObjectStore('schede', { keyPath: 'uid' });
        if (!d.objectStoreNames.contains('foto')) d.createObjectStore('foto');
        if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio');
        if (!d.objectStoreNames.contains('traccia')) d.createObjectStore('traccia', { autoIncrement: true });
        if (!d.objectStoreNames.contains('specie')) d.createObjectStore('specie', { keyPath: 'nomeSci' });
        if (!d.objectStoreNames.contains('guida')) d.createObjectStore('guida', { keyPath: 'id' });
      };
      r.onblocked = () => stato('Chiudi le altre schede dell’app per aggiornare l’archivio.', true);
      r.onsuccess = () => {
        this.db = r.result;
        this.db.onversionchange = () => { this.db.close(); stato('Archivio aggiornato in un’altra finestra: ricarica l’app.', true); };
        ok();
      };
      r.onerror = () => ko(r.error);
    });
  },
  // Risolve solo quando la transazione è davvero scritta su disco
  tx(store, modo, fn) {
    return new Promise((ok, ko) => {
      const t = this.db.transaction(store, modo);
      let esito;
      const rq = fn(t.objectStore(store));
      if (rq) rq.onsuccess = () => { esito = rq.result; };
      t.oncomplete = () => ok(esito);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error || new Error('Scrittura annullata (spazio esaurito?)'));
    });
  },
  tutte: (store) => DB.tx(store, 'readonly', (s) => s.getAll()),
  leggi: (store, k) => DB.tx(store, 'readonly', (s) => s.get(k)),
  scrivi: (store, v, k) => DB.tx(store, 'readwrite', (s) => (k === undefined ? s.put(v) : s.put(v, k))),
  cancella: (store, k) => DB.tx(store, 'readwrite', (s) => s.delete(k)),
  svuota: (store) => DB.tx(store, 'readwrite', (s) => s.clear()),
  sostituisciGuida(voci) {
    return new Promise((ok, ko) => {
      const t = this.db.transaction('guida', 'readwrite');
      const store = t.objectStore('guida');
      t.oncomplete = () => ok();
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error || new Error('Importazione annullata: catalogo precedente conservato'));
      try {
        store.clear();
        for (const voce of voci) store.put(voce);
      } catch (e) { t.abort(); ko(e); }
    });
  },
  // Sostituisce l'intero archivio con una sola transazione: se una scrittura
  // fallisce, IndexedDB annulla anche le cancellazioni iniziali.
  sostituisciArchivio({ schede, foto, audio, specie, traccia, guida = [] }, sostituisci = true) {
    return new Promise((ok, ko) => {
      const nomi = ['schede', 'foto', 'audio', 'specie', 'traccia', 'guida'];
      const t = this.db.transaction(nomi, 'readwrite');
      let errore;
      t.oncomplete = () => ok();
      t.onerror = () => ko(errore || t.error);
      t.onabort = () => ko(errore || t.error || new Error('Operazione annullata: archivio precedente conservato'));
      try {
        if (sostituisci) for (const nome of nomi) t.objectStore(nome).clear();
        for (const r of schede) t.objectStore('schede').put(r);
        for (const f of foto) t.objectStore('foto').put(f.blob, f.id);
        for (const a of audio) t.objectStore('audio').put(a.blob, a.id);
        for (const s of specie) t.objectStore('specie').put(s);
        for (const voce of guida) t.objectStore('guida').put(voce);
        for (const pt of traccia) t.objectStore('traccia').add(pt);
      } catch (e) {
        errore = e;
        t.abort(); // Anche gli errori sincroni devono annullare i clear già accodati.
      }
    });
  },
};
