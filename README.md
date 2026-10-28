# Dilex.ap
Mio la app 

## Cómo está hecha
`index.html` es un solo archivo que funciona sin internet. El código nuevo vive en `planner/`
y se copia dentro de `index.html` con:

    python3 planner/build.py

| Archivo | Qué hace |
|---|---|
| `planner/engine.js`, `agenda.js`, `agenda.css` | Agenda inteligente: motor de reglas R1–R10 y conflictos (`node planner/engine.test.js`) |
| `planner/coach.js`, `coach.css` | Vistas Hoy · Plan · Progreso · Más, diagnóstico inicial, plan del día/mes/año, asistente "metiche", preguntas de la mañana y cierre del día, dictado por voz, recordatorios, tareas que se repiten, conexiones con permisos y avisos con la app cerrada |
| `planner/lock.js` | Perfiles con PIN (pantalla de bloqueo) |
| `sw.js` | Modo sin internet y notificaciones push (botones "Ya la hice" / "15 min") |

## Avisos con la app cerrada (Supabase)
- Proyecto Supabase: `dilex` (`jgqmdqzptlbjuzufdtrr`).
- Tablas: `supabase/migrations/` · Función: `supabase/functions/dilex-push/` · Envío cada minuto: `supabase/cron.sql`.
- La app sube solo la hora y el texto de los próximos avisos. Las tablas tienen RLS sin políticas: la clave pública no puede leerlas.
