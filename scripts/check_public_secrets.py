"""Fail CI if a tracked file or tracked ZIP contains a .env credentials file.

This runs after GitHub receives a push; pubblica.sh performs the pre-push guard.
"""
import pathlib
import subprocess
import sys
import zipfile


def secret_name(path):
    name = pathlib.PurePosixPath(path.replace('\\', '/')).name.lower()
    return name.startswith('.env') or name.endswith('.env')


def check(paths):
    bad = []
    for path in paths:
        if secret_name(path):
            bad.append(path)
        if path.lower().endswith('.zip'):
            try:
                with zipfile.ZipFile(path) as archive:
                    bad.extend(f'{path}: {name}' for name in archive.namelist() if secret_name(name))
            except (OSError, zipfile.BadZipFile):
                bad.append(f'{path}: ZIP non leggibile')
    return bad


if __name__ == '__main__':
    tracked = subprocess.check_output(['git', 'ls-files', '-z']).decode('utf-8', 'surrogateescape').split('\0')
    violations = check([p for p in tracked if p])
    if violations:
        print('ERRORE: file di credenziali tra i file pubblicati:', file=sys.stderr)
        for violation in violations:
            print(f'  {violation}', file=sys.stderr)
        print('Rimuovi i file dal repository e rigenera le chiavi esposte.', file=sys.stderr)
        sys.exit(1)
    print('Nessun file .env tracciato nel repository o negli ZIP.')
