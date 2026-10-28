#!/usr/bin/env python3
"""Copia la Agenda, el coach (plan, asistente metiche, voz, conexiones, avisos) y el PIN dentro de index.html.

index.html debe seguir siendo un solo archivo que funcione sin internet, así que
el código fuente vive en planner/ y este script lo incrusta entre marcadores.
Se puede ejecutar las veces que haga falta: reemplaza lo que ya estaba.

    python3 planner/build.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
SRC = ROOT / 'planner'

BLOCKS = [
    # (archivo, marcador, texto ante el que se inserta la primera vez, envoltura)
    ('engine.js', 'PLANNER-ENGINE',
     '/* =====================================================================\n   APLICACIÓN\n===================================================================== */\n(() => {',
     None),
    ('agenda.js', 'AGENDA-UI',
     '  /* =====================================================================\n     ASISTENTE · utilidades comunes',
     None),
    ('agenda.css', 'AGENDA-CSS', '</head>', ('<style id="agenda-css">\n', '\n</style>\n')),
    ('coach.js', 'COACH',
     '  /* =====================================================================\n     INICIO\n',
     None),
    ('coach.css', 'COACH-CSS', '</head>', ('<style id="coach-css">\n', '\n</style>\n')),
    ('lock.js', 'LOCK', '<!-- ===================== SECUENCIA DE INICIO ===================== -->', ('<script id="lock-js">\n', '\n</script>\n')),
]


def block_of(text, marker):
    m = re.search(r'/\* %s:START \*/.*?/\* %s:END \*/' % (marker, marker), text, re.S)
    if not m:
        sys.exit(f'Falta el bloque {marker} en el archivo fuente')
    return m.group(0)


def main():
    html = INDEX.read_text(encoding='utf-8')
    for name, marker, anchor, wrap in BLOCKS:
        block = block_of((SRC / name).read_text(encoding='utf-8'), marker)
        if '</script' in block.lower() or '</style' in block.lower():
            sys.exit(f'{name} no puede contener etiquetas de cierre de HTML')
        pat = re.compile(r'/\* %s:START \*/.*?/\* %s:END \*/' % (marker, marker), re.S)
        if pat.search(html):
            html = pat.sub(lambda _: block, html, count=1)
        else:
            if html.count(anchor) != 1:
                sys.exit(f'No encuentro un único punto de inserción para {name}')
            pre, post = wrap if wrap else ('', '\n')
            html = html.replace(anchor, pre + block + post + anchor, 1)
        print(f'ok  {name}')
    INDEX.write_text(html, encoding='utf-8')


if __name__ == '__main__':
    main()
