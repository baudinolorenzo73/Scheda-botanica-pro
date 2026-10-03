// Verifica che il numero di versione coincida in tutti i file (vedi scripts/versione.py).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const config = leggi('js/config.js').match(/APP_VERSIONE = '([^']+)'/)[1];
assert.equal(JSON.parse(leggi('versione.json')).versione, config, 'versione.json diverso da js/config.js');
assert.equal(JSON.parse(leggi('package.json')).version, config, 'package.json diverso da js/config.js');
assert.match(leggi('README.md'), new RegExp(`versione ${config.replace(/\./g, '\\.')}\\*\\*`), 'README con versione diversa');
console.log(`OK Versione ${config} coerente in config.js, versione.json, package.json e README`);
