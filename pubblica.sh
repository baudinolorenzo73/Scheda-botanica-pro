#!/data/data/com.termux/files/usr/bin/bash
set -e

# Cartella del progetto: lo script si sposta sempre qui da solo,
# non importa da dove lo lanci.
PROGETTO="/storage/emulated/0/Download/progetto/botanica/scheda-botanica-pro"
cd "$PROGETTO"

# ID della cartella Google Drive dove va sempre tutto
# (preso dall'indirizzo: drive.google.com/drive/folders/QUESTO-QUI)
CARTELLA_ID="1OBREImkczxWuqURqvaff13Opeo2gN4ng"

DATAORA=$(date '+%d/%m/%Y %H:%M')

echo "Cosa hai cambiato? (scrivi una nota breve, poi premi Invio)"
echo "Se non scrivi nulla e premi solo Invio, va bene lo stesso."
read -p "Nota: " NOTA

if [ -z "$NOTA" ]; then
  MESSAGGIO="Aggiornamento del $DATAORA"
else
  MESSAGGIO="$DATAORA - $NOTA"
fi

echo ""
echo "== GitHub =="
git add .
git commit -m "$MESSAGGIO" || echo "Niente di nuovo da salvare su git."
git push

echo ""
echo "== Google Drive (backup nella tua cartella) =="
rclone sync . "gdrive,root_folder_id=${CARTELLA_ID}:" --exclude ".git/**"

echo ""
echo "Fatto: \"$MESSAGGIO\""
