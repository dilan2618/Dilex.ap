/* PLANNER-ENGINE:START */
/* =====================================================================
   MOTOR DE REGLAS DE LA AGENDA (R1–R10)
   Funciones puras: reciben tareas, compromisos y perfil del día, y
   devuelven conflictos y propuestas con los IDs de las reglas usadas.
   No guardan nada ni tocan la pantalla, así se pueden probar con casos fijos.
   Fuente única: planner/engine.js (planner/build.py lo copia a index.html).
===================================================================== */
function PLANNER_ENGINE() {
  'use strict';

  const RULES = [
    { id: 'R1', name: 'Capacidad', cond: 'La suma de duraciones y márgenes supera el tiempo libre del día', action: 'Marca el plan como inviable; nunca lo acepta así' },
    { id: 'R2', name: 'Solape', cond: 'Dos compromisos se cruzan en el tiempo', action: 'Crea un conflicto con ambos' },
    { id: 'R3', name: 'Fijos intocables', cond: 'Un compromiso es fijo o un plan social confirmado', action: 'Nunca lo mueve sin tu autorización; solo avisa' },
    { id: 'R4', name: 'Urgencia', cond: 'El tiempo libre antes de la fecha límite es menor que la duración × 1,5', action: 'Marca la tarea como urgente' },
    { id: 'R5', name: 'Imposible a tiempo', cond: 'El tiempo libre antes de la fecha límite es menor que la duración', action: 'Avisa y propone dividir, recortar o renegociar la fecha' },
    { id: 'R6', name: 'Orden contextual', cond: 'Hay que elegir qué colocar primero', action: 'Ordena por costo de aplazar, luego urgencia, luego importancia, luego antigüedad' },
    { id: 'R7', name: 'Vida social', cond: 'Una alternativa implicaría cancelar o mover un plan social', action: 'Nunca lo propone por defecto; solo si tú lo pides' },
    { id: 'R8', name: 'Dato faltante', cond: 'Una tarea sin duración entra en el análisis', action: 'Usa 30 min como estimación, lo declara como incertidumbre y te pide el dato' },
    { id: 'R9', name: 'División', cond: 'Una tarea de más de 90 min vence en 2 días o más', action: 'Propone repartirla en bloques en varios días' },
    { id: 'R10', name: 'Autorización', cond: 'Cualquier propuesta del motor', action: 'Queda como "generada" hasta que la aceptes; luego se ejecuta y se registra' },
  ];
  const CFG = { defaultEst: 30, urgencyFactor: 1.5, splitMin: 90, blockMin: 60, minShortenPct: 0.6, minDur: 15, horizonDays: 14 };
  const COST = { critico: 3, alto: 2, bajo: 1, ninguno: 0 };
  const COST_TXT = { critico: 'crítico', alto: 'alto', bajo: 'bajo', ninguno: 'ninguno' };

  /* ---------- Utilidades de tiempo ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim()); return m ? Math.min(1440, +m[1] * 60 + +m[2]) : null; };
  const hm = (min) => { min = Math.max(0, Math.round(min)); return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; };
  const keyAdd = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const daysDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const isFixed = (e) => !!(e.fixed || e.confirmed);
  const listJoin = (xs) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
  const q = (s) => `"${s}"`;
  const dur = (m) => (m >= 60 && m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  const sigOf = (kind, changes) => kind + ':' + changes.map(c => [c.type, c.id || c.taskId, c.toDay || '', c.newDur || '', c.date || '', c.start || ''].join('|')).join(';');

  function taskDur(t) {
    if (+t.durMin > 0) return { dur: Math.round(+t.durMin), est: t.durSrc === 'estimada', missing: false };
    return { dur: CFG.defaultEst, est: true, missing: true };
  }
  function windowOf(day, inp) {
    const p = inp.profile || {};
    const s0 = toMin(p.start) ?? 480;
    let e = toMin(p.end) ?? 1380;
    const personal = [];
    for (const r of inp.personalRules || []) {
      if (r.active === false || (r.area || 'any') !== 'any') continue;
      const a = toMin(r.after);
      if (a != null && a < e) { e = a; personal.push(r.id); }
    }
    let s = s0;
    if (day === inp.today && inp.nowMin != null) s = Math.max(s0, Math.ceil(inp.nowMin / 5) * 5);
    return { s, e: Math.max(s, e), personal };
  }
  function areaLimits(inp) {
    const out = {};
    for (const r of inp.personalRules || []) {
      if (r.active === false || !r.area || r.area === 'any') continue;
      const a = toMin(r.after);
      if (a != null) out[r.area] = Math.min(out[r.area] ?? 1440, a);
    }
    return out;
  }
  function freeSegments(win, busy, margin) {
    const blocks = busy.map(b => [b.s - margin, b.e + margin]).sort((a, b) => a[0] - b[0]);
    const out = [];
    let cur = win.s;
    for (const [bs, be] of blocks) {
      if (be <= cur) continue;
      if (bs > cur) out.push({ s: cur, e: Math.min(bs, win.e) });
      cur = Math.max(cur, be);
      if (cur >= win.e) break;
    }
    if (cur < win.e) out.push({ s: cur, e: win.e });
    return out.filter(x => x.e - x.s > 0);
  }
  function pack(items, segs, margin, limits) {
    const cur = segs.map(x => ({ s: x.s, e: x.e, c: x.s, last: null }));
    const placed = [], over = [];
    for (const it of items) {
      const lim = limits[it.area] ?? 1440;
      const g = cur.find(x => x.c + it.dur <= Math.min(x.e, lim));
      if (!g) { over.push(it); continue; }
      placed.push(Object.assign({}, it, { start: g.c, end: g.c + it.dur }));
      g.last = g.c + it.dur;
      g.c = g.last + margin;
    }
    const slack = cur.reduce((a, x) => a + Math.max(0, x.e - (x.last == null ? x.s : x.last + margin)), 0);
    return { placed, over, slack };
  }
  const rankOf = (a, b) =>
    (COST[b.costo] ?? 1) - (COST[a.costo] ?? 1)
    || (a.dueDiff - (a.urgent ? 0.5 : 0)) - (b.dueDiff - (b.urgent ? 0.5 : 0))
    || b.imp - a.imp
    || String(a.created).localeCompare(String(b.created));

  /* ---------- Tiempo libre de un día, sin contar tareas ---------- */
  function freeOfDay(day, inp) {
    const margin = Math.max(0, +(inp.profile?.margin ?? 10));
    const win = windowOf(day, inp);
    const busy = (inp.events || []).filter(e => e.date === day && toMin(e.start) != null && toMin(e.end) > toMin(e.start)).map(e => ({ s: toMin(e.start), e: toMin(e.end) }));
    return freeSegments(win, busy, margin);
  }

  /* ---------- Análisis de un día ---------- */
  function analyzeDay(inp) {
    const day = inp.day;
    const margin = Math.max(0, +(inp.profile?.margin ?? 10));
    const used = new Set(['R1', 'R6']);
    const win = windowOf(day, inp);
    const limits = areaLimits(inp);
    const evs = (inp.events || [])
      .filter(e => e.date === day && toMin(e.start) != null && toMin(e.end) > toMin(e.start))
      .map(e => Object.assign({}, e, { es: toMin(e.start), ee: toMin(e.end) }))
      .sort((a, b) => a.es - b.es);

    // R2 / R3: compromisos que se cruzan
    const conflicts = [];
    const movable = new Set();
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i], b = evs[j];
        if (!(a.es < b.ee && b.es < a.ee)) continue;
        if (movable.has(a.id) || movable.has(b.id)) continue;
        used.add('R2');
        if (isFixed(a) && isFixed(b)) {
          used.add('R3');
          conflicts.push({ rule: ['R2', 'R3'], kind: 'overlap-fixed', severity: 'high', ids: [a.id, b.id],
            title: 'Dos compromisos fijos se cruzan',
            msg: `${q(a.title)} (${a.start}–${a.end}) y ${q(b.title)} (${b.start}–${b.end}) se cruzan. Los dos son fijos, así que no muevo ninguno: decide tú cuál cambiar.` });
        } else {
          const f = isFixed(a) ? b : isFixed(b) ? a : (b.area === 'social' && a.area !== 'social' ? a : b);
          movable.add(f.id);
          conflicts.push({ rule: ['R2'], kind: 'overlap', severity: 'medium', ids: [a.id, b.id], movable: f.id,
            title: 'Dos compromisos se cruzan',
            msg: `${q(a.title)} (${a.start}–${a.end}) y ${q(b.title)} (${b.start}–${b.end}) se cruzan. ${q(f.title)} es flexible: propongo moverlo a un hueco libre.` });
        }
      }
    }

    // Qué hay que colocar
    const blockTasks = new Set(evs.filter(e => e.taskId).map(e => e.taskId));
    const dayTasks = (inp.tasks || []).filter(t => !t.done && t.due && (t.due === day || (day === inp.today && t.due < day)) && !blockTasks.has(t.id));
    const items = [
      ...evs.filter(e => movable.has(e.id)).map(e => ({
        kind: 'event', id: e.id, title: e.title, area: e.area || 'personal', dur: e.ee - e.es, est: false, missing: false,
        costo: e.costo || 'bajo', costoKnown: !!e.costo, imp: 2, dueDiff: 0, urgent: false, created: e.createdAt || '', origStart: e.start, origEnd: e.end,
      })),
      ...dayTasks.map(t => {
        const d = taskDur(t);
        return {
          kind: 'task', id: t.id, title: t.text, area: t.area || 'personal', dur: d.dur, est: d.est, missing: d.missing,
          costo: COST[t.costo] != null ? t.costo : (t.priority === 'urgent' ? 'alto' : 'bajo'), costoKnown: COST[t.costo] != null,
          imp: +t.importancia || 2, dueDiff: daysDiff(day, t.due), urgent: t.priority === 'urgent', created: t.createdAt || '',
        };
      }),
    ].sort(rankOf);

    const uncertain = [];
    for (const it of items) {
      if (it.missing) { used.add('R8'); uncertain.push({ rule: 'R8', id: it.id, title: it.title, msg: `${q(it.title)} no tiene duración: uso ${CFG.defaultEst} min como estimación.` }); }
      else if (it.est) uncertain.push({ rule: null, id: it.id, title: it.title, msg: `La duración de ${q(it.title)} (${dur(it.dur)}) es una estimación tuya.` });
    }
    if (win.personal.length) used.add('personal');

    const busy = evs.filter(e => !movable.has(e.id)).map(e => ({ s: e.es, e: e.ee, id: e.id }));
    const segs = freeSegments(win, busy, margin);
    const freeMin = segs.reduce((a, g) => a + g.e - g.s, 0);
    const needMin = items.length ? items.reduce((a, i) => a + i.dur, 0) + margin * (items.length - 1) : 0;
    const base = pack(items, segs, margin, limits);
    const fits = base.over.length === 0;
    const deficit = Math.max(0, needMin - freeMin);
    const hasSocial = items.some(i => i.area === 'social') || evs.some(e => e.area === 'social');
    const tomorrow = keyAdd(day, 1);

    const data = [
      `Tiempo libre: ${dur(freeMin)} entre ${hm(win.s)} y ${hm(win.e)}, con ${margin} min de margen entre actividades`,
      `Tiempo necesario: ${dur(needMin)} para ${items.length} ${items.length === 1 ? 'actividad' : 'actividades'}`,
      `Compromisos fijos: ${evs.filter(isFixed).length}`,
    ];
    const proposals = [];
    const relocations = (placed) => placed.filter(p => p.kind === 'event').map(p => ({ type: 'moveEvent', id: p.id, title: p.title, toDay: day, start: hm(p.start), end: hm(p.end) }));

    if (!fits) {
      conflicts.unshift({ rule: ['R1'], kind: 'capacity', severity: 'high', ids: base.over.map(i => i.id),
        title: 'No cabe todo',
        msg: deficit > 0
          ? `Las actividades necesitan ${dur(needMin)} y tienes ${dur(freeMin)} libres: faltan ${dur(deficit)}. Podemos mover algo flexible, recortarlo o repartirlo entre varios días.`
          : `El tiempo total alcanza, pero los huecos libres son demasiado cortos para ${listJoin(base.over.map(i => q(i.title)))}.` });

      const alts = [];
      const candidates = items.filter(i => i.area !== 'social' && i.costo !== 'critico').slice().reverse();
      if (hasSocial) used.add('R7');
      // a) aplazar: primero una sola cosa, luego varias
      let moved = null, res = null;
      for (const c of candidates) {
        const r = pack(items.filter(i => i !== c), segs, margin, limits);
        if (!r.over.length) { moved = [c]; res = r; break; }
      }
      if (!moved) {
        const acc = [];
        for (const c of candidates) {
          acc.push(c);
          const r = pack(items.filter(i => !acc.includes(i)), segs, margin, limits);
          if (!r.over.length) { moved = acc.slice(); res = r; break; }
        }
        // Devuelve al día lo que no hacía falta mover
        if (moved) {
          for (const c of moved.slice()) {
            const keep = moved.filter(x => x !== c);
            const r = pack(items.filter(i => !keep.includes(i)), segs, margin, limits);
            if (!r.over.length) { moved = keep; res = r; }
          }
        }
      }
      if (moved) {
        alts.push({ kind: 'postpone', res, changes: [
          ...moved.map(i => ({ type: i.kind === 'task' ? 'moveTask' : 'moveEvent', id: i.id, title: i.title, toDay: tomorrow, start: i.origStart, end: i.origEnd })),
          ...relocations(res.placed),
        ], title: `Aplazar ${listJoin(moved.map(i => q(i.title)))} al día siguiente`,
        why: [`Se elige lo que tiene menor costo de aplazar (${listJoin(moved.map(i => COST_TXT[i.costo] + (i.costoKnown ? '' : ', sin dato')))}) según el orden de R6.`, 'No toca compromisos fijos (R3).'] });
      }
      // b) recortar
      for (const c of candidates) {
        if (c.dur < 45) continue;
        const floor = Math.max(CFG.minDur, Math.ceil(c.dur * CFG.minShortenPct));
        let ok = null;
        for (let nd = c.dur - 5; nd >= floor; nd -= 5) {
          const r = pack(items.map(i => (i === c ? Object.assign({}, i, { dur: nd }) : i)), segs, margin, limits);
          if (!r.over.length) { ok = { nd, r }; break; }
        }
        if (ok) {
          alts.push({ kind: 'shorten', res: ok.r, changes: [{ type: 'shorten', id: c.id, kind: c.kind, title: c.title, from: c.dur, newDur: ok.nd }, ...relocations(ok.r.placed)],
            title: `Recortar ${q(c.title)} a ${dur(ok.nd)}`, why: [`Recortar ${dur(c.dur - ok.nd)} basta para que todo quepa.`, `Es de las actividades con menor prioridad según R6.`] });
          break;
        }
      }
      // c) dividir entre hoy y mañana (solo tareas que no vencen hoy)
      for (const c of base.over) {
        if (c.kind !== 'task' || c.dueDiff < 1 || c.dur < 60) continue;
        let ok = null;
        for (let part = c.dur - 15; part >= 30; part -= 5) {
          const r = pack(items.map(i => (i === c ? Object.assign({}, i, { dur: part }) : i)), segs, margin, limits);
          if (!r.over.length) { ok = { part, r }; break; }
        }
        if (ok) {
          used.add('R9');
          alts.push({ kind: 'split', res: ok.r, changes: [{ type: 'split', id: c.id, title: c.title, todayDur: ok.part, restDur: c.dur - ok.part, restDay: tomorrow }, ...relocations(ok.r.placed)],
            title: `Dividir ${q(c.title)}: ${dur(ok.part)} este día y ${dur(c.dur - ok.part)} el siguiente`, why: ['Vence después de hoy, así que se puede repartir (R9).'] });
          break;
        }
      }
      const real = (a) => a.changes.filter(c => c.type !== 'moveEvent' || c.toDay !== day).length;
      alts.sort((a, b) => real(a) - real(b) || b.res.slack - a.res.slack);
      alts.forEach((a, i) => {
        const rules = ['R1', 'R6', 'R10'];
        if (a.kind === 'postpone') rules.push('R3');
        if (a.kind === 'split') rules.push('R9');
        if (hasSocial) rules.push('R7');
        if (uncertain.some(u => u.rule === 'R8')) rules.push('R8');
        if (a.changes.some(c => c.type === 'moveEvent' && c.toDay === day)) rules.push('R2');
        proposals.push({
          id: sigOf(a.kind, a.changes), kind: a.kind, primary: i === 0, title: a.title, rules,
          changes: a.changes, schedule: a.res.placed.map(p => ({ kind: p.kind, id: p.id, title: p.title, area: p.area, start: hm(p.start), end: hm(p.end), est: p.est })),
          slack: a.res.slack,
          why: [...a.why, `Comprobado: con este cambio todo cabe y te quedan ${dur(a.res.slack)} libres.`, ...(hasSocial ? ['Cancelar o mover planes sociales no se propone; solo si tú lo pides (R7).'] : [])],
          data, uncertain: uncertain.map(u => u.msg),
        });
      });
      if (!alts.length) {
        conflicts[0].msg += ' No encontré una alternativa que quepa sin tocar compromisos fijos: puedes cambiar uno tú, pedir más tiempo o repartir el trabajo en otro día.';
      }
    } else if (items.some(i => i.kind === 'event')) {
      const changes = relocations(base.placed);
      used.add('R2');
      proposals.push({
        id: sigOf('relocate', changes), kind: 'relocate', primary: true, title: changes.length === 1 ? `Mover ${q(changes[0].title)} a las ${changes[0].start}` : 'Reubicar los compromisos flexibles que se cruzan',
        rules: ['R2', 'R3', 'R6', 'R10'], changes,
        schedule: base.placed.map(p => ({ kind: p.kind, id: p.id, title: p.title, area: p.area, start: hm(p.start), end: hm(p.end), est: p.est })),
        slack: base.slack, why: ['Se mueve solo lo flexible; lo fijo se queda donde está (R3).', `Comprobado: todo cabe y te quedan ${dur(base.slack)} libres.`], data, uncertain: uncertain.map(u => u.msg),
      });
    }
    if (fits && base.placed.some(p => p.kind === 'task')) {
      const changes = base.placed.filter(p => p.kind === 'task').map(p => ({ type: 'schedule', id: p.id, title: p.title, area: p.area, date: day, start: hm(p.start), end: hm(p.end) }));
      proposals.push({
        id: sigOf('schedule', changes), kind: 'schedule', primary: !proposals.length, optional: true, title: 'Reservar horario para tus tareas',
        rules: ['R1', 'R6', 'R10'], changes,
        schedule: base.placed.map(p => ({ kind: p.kind, id: p.id, title: p.title, area: p.area, start: hm(p.start), end: hm(p.end), est: p.est })),
        slack: base.slack, why: ['Todo cabe en tu día. Si quieres, reservo estos bloques en tu calendario en el orden de R6.', `Te quedan ${dur(base.slack)} libres.`],
        data, uncertain: uncertain.map(u => u.msg),
      });
    }

    const schedule = [
      ...evs.filter(e => !movable.has(e.id)).map(e => ({ kind: 'event', id: e.id, title: e.title, area: e.area || 'personal', start: e.start, end: e.end, fixed: isFixed(e), taskId: e.taskId || null })),
      ...base.placed.map(p => ({ kind: p.kind, id: p.id, title: p.title, area: p.area, start: hm(p.start), end: hm(p.end), est: p.est, proposed: true })),
    ].sort((a, b) => toMin(a.start) - toMin(b.start));

    return {
      day, window: { start: hm(win.s), end: hm(win.e) }, margin, freeMin, needMin, deficit, fits,
      schedule, overflow: base.over.map(i => ({ kind: i.kind, id: i.id, title: i.title, area: i.area, dur: i.dur, est: i.est })),
      conflicts, proposals, uncertain, rulesUsed: [...used].filter(r => /^R\d+$/.test(r)).sort((a, b) => +a.slice(1) - +b.slice(1)),
      personalRules: win.personal, itemCount: items.length, fixedCount: evs.filter(isFixed).length,
    };
  }

  /* ---------- R4 / R5: fechas límite ---------- */
  function deadlineWarnings(inp) {
    const out = [];
    const today = inp.today;
    for (const t of inp.tasks || []) {
      if (t.done || !t.due || !(+t.durMin > 0)) continue;
      const dd = daysDiff(today, t.due);
      if (dd < 0 || dd > CFG.horizonDays) continue;
      const booked = (inp.events || []).filter(e => e.taskId === t.id && e.date >= today).reduce((a, e) => a + Math.max(0, toMin(e.end) - toMin(e.start)), 0);
      const need = +t.durMin - booked;
      if (need <= 0) continue;
      let free = 0;
      for (let k = 0; k <= dd; k++) free += freeOfDay(keyAdd(today, k), inp).reduce((a, g) => a + g.e - g.s, 0);
      if (free < need) out.push({ rule: 'R5', taskId: t.id, severity: 'high', title: 'No da tiempo antes de la fecha límite',
        msg: `${q(t.text)} necesita ${dur(need)} y solo tienes ${dur(free)} libres hasta el ${t.due}, sin contar otras tareas. Opciones: dividirla, recortarla o renegociar la fecha.` });
      else if (free < need * CFG.urgencyFactor) out.push({ rule: 'R4', taskId: t.id, severity: 'medium', title: 'Tarea urgente',
        msg: `${q(t.text)} necesita ${dur(need)} y tienes ${dur(free)} libres hasta el ${t.due}: hay poco margen, conviene empezar pronto.` });
    }
    return out;
  }

  /* ---------- R9: repartir tareas largas en bloques ---------- */
  function splitSuggestions(inp, max = 3) {
    const out = [];
    const today = inp.today;
    const margin = Math.max(0, +(inp.profile?.margin ?? 10));
    const extra = [];
    for (const t of inp.tasks || []) {
      if (out.length >= max) break;
      if (t.done || !t.due || !(+t.durMin > CFG.splitMin)) continue;
      const dd = daysDiff(today, t.due);
      if (dd < 2 || dd > CFG.horizonDays) continue;
      if ((inp.events || []).some(e => e.taskId === t.id)) continue;
      let left = Math.round(+t.durMin);
      const blocks = [];
      for (let k = 0; k < dd && left > 0; k++) {
        const day = keyAdd(today, k);
        const win = windowOf(day, inp);
        const busy = [...(inp.events || []), ...extra].filter(e => e.date === day && toMin(e.start) != null).map(e => ({ s: toMin(e.start), e: toMin(e.end) }));
        const len = Math.min(CFG.blockMin, left);
        const lim = areaLimits(inp)[t.area] ?? 1440;
        const g = freeSegments(win, busy, margin).find(x => x.s + len <= Math.min(x.e, lim));
        if (!g) continue;
        const b = { type: 'block', taskId: t.id, title: t.text, area: t.area || 'personal', date: day, start: hm(g.s), end: hm(g.s + len) };
        blocks.push(b); extra.push(b); left -= len;
      }
      if (!blocks.length) continue;
      out.push({
        id: sigOf('blocks', blocks), kind: 'blocks', title: `Repartir ${q(t.text)} en ${blocks.length} ${blocks.length === 1 ? 'bloque' : 'bloques'}`,
        rules: ['R9', 'R10'], changes: blocks, taskId: t.id,
        why: [`Dura ${dur(+t.durMin)} y vence el ${t.due}: repartirla reduce el riesgo de dejarla para el final (R9).`,
          left > 0 ? `Solo encontré hueco para ${dur(+t.durMin - left)}; faltarían ${dur(left)}.` : 'Cada bloque está en un hueco libre comprobado.'],
        data: [`Bloques de hasta ${CFG.blockMin} min entre hoy y el día antes de la fecha límite`], uncertain: t.durSrc === 'estimada' ? ['La duración total es una estimación tuya.'] : [],
      });
    }
    return out;
  }

  function weekLoad(inp, startDay, n = 7) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const day = keyAdd(startDay, k);
      const a = analyzeDay(Object.assign({}, inp, { day }));
      out.push({ day, freeMin: a.freeMin, needMin: a.needMin, fits: a.fits, conflicts: a.conflicts.length, items: a.itemCount, fixed: a.fixedCount });
    }
    return out;
  }

  return { RULES, CFG, analyzeDay, deadlineWarnings, splitSuggestions, weekLoad, freeOfDay, toMin, hm, keyAdd, daysDiff, dur };
}
/* PLANNER-ENGINE:END */
if (typeof module !== 'undefined' && module.exports) module.exports = PLANNER_ENGINE;
