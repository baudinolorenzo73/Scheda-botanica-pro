#!/usr/bin/env python3
"""Imposta la versione dell'app in tutti i file che la contengono.

Uso (da Termux, dentro la cartella del progetto):
    python scripts/versione.py 3.28.1     # imposta la versione indicata
    python scripts/versione.py            # mostra la versione attuale in ogni file

Aggiorna: js/config.js, versione.json, package.json, la riga della versione
nel README e il numero della cache del service worker (che deve cambiare a
ogni pubblicazione, altrimenti i telefoni non scaricano i file nuovi).
"""
import json
import re
import sys
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent


def leggi(nome):
    return (RADICE / nome).read_text(encoding="utf-8")


def scrivi(nome, testo):
    (RADICE / nome).write_text(testo, encoding="utf-8")


def versioni_attuali():
    config = re.search(r"APP_VERSIONE = '([^']+)'", leggi("js/config.js")).group(1)
    pubblicata = json.loads(leggi("versione.json"))["versione"]
    pacchetto = json.loads(leggi("package.json"))["version"]
    cache = re.search(r"scheda-botanica-app-v(\d+)-", leggi("service-worker.js")).group(1)
    return {"js/config.js": config, "versione.json": pubblicata, "package.json": pacchetto, "cache service worker": "v" + cache}


def imposta(nuova):
    if not re.fullmatch(r"\d+\.\d+\.\d+", nuova):
        sys.exit(f"Versione non valida: «{nuova}». Usa il formato 3.28.1")

    testo = leggi("js/config.js")
    scrivi("js/config.js", re.sub(r"APP_VERSIONE = '[^']+'", f"APP_VERSIONE = '{nuova}'", testo, count=1))

    scrivi("versione.json", json.dumps({"versione": nuova}) + "\n")

    pacchetto = json.loads(leggi("package.json"))
    pacchetto["version"] = nuova
    scrivi("package.json", json.dumps(pacchetto, indent=2, ensure_ascii=False) + "\n")

    testo = leggi("README.md")
    scrivi("README.md", re.sub(r"(\*\*by Lollo ®2026 — versione )[\d.]+(\*\*)", rf"\g<1>{nuova}\g<2>", testo, count=1))

    testo = leggi("service-worker.js")
    numero = int(re.search(r"scheda-botanica-app-v(\d+)-", testo).group(1)) + 1
    scrivi("service-worker.js", re.sub(r"scheda-botanica-app-v\d+-", f"scheda-botanica-app-v{numero}-", testo, count=1))

    print(f"Versione impostata a {nuova}; cache del service worker portata a v{numero}.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        imposta(sys.argv[1])
    for file, valore in versioni_attuali().items():
        print(f"  {file:22} {valore}")
