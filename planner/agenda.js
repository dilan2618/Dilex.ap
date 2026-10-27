/* AGENDA-UI:START */
  /* =====================================================================
     AGENDA INTELIGENTE: calendario, motor de reglas y conflictos
     Fuente: planner/agenda.js (planner/build.py lo copia a index.html).
     El motor (PLANNER_ENGINE) decide; esta parte solo muestra, pide
     autorización (R10), ejecuta lo aceptado y lo deja registrado.
  ===================================================================== */
  var agReady = false;
  var AG_AREAS = { estudio: ['Estudio', '--h-files'], trabajo: ['Trabajo', '--h-tasks'], ejercicio: ['Ejercicio', '--h-focus'], social: ['Social', '--h-habits'], hogar: ['Hogar', '--h-plan'], personal: ['Personal', '--h-stats'] };
  var AG_COSTS = { ninguno: 'Ninguno', bajo: 'Bajo', alto: 'Alto', critico: 'Crítico' };
  var AG_IMPS = { 1: 'Baja', 2: 'Media', 3: 'Alta' };
  const PE = PLANNER_ENGINE();
  Object.assign(KEYS, { events: 'dilex.events', dayProfile: 'dilex.dayProfile', recs: 'dilex.recs', changelog: 'dilex.changelog', prules: 'dilex.prules' });

  /* ---------- Datos ---------- */
  const cleanEvent = (e) => ({
    id: e.id || uid(), title: String(e.title || '').trim().slice(0, 80), area: AG_AREAS[e.area] ? e.area : 'personal',
    date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : todayKey(), start: PE.toMin(e.start) != null ? PE.hm(PE.toMin(e.start)) : '09:00',
    end: PE.toMin(e.end) != null ? PE.hm(PE.toMin(e.end)) : '10:00', fixed: !!e.fixed, confirmed: !!e.confirmed,
    costo: AG_COSTS[e.costo] ? e.costo : undefined, taskId: e.taskId || null, createdAt: e.createdAt || new Date().toISOString(),
  });
  let events = arr(store.get(KEYS.events, [])).filter(e => e && e.title).map(cleanEvent);
  let dayProfile = Object.assign({ start: '08:00', end: '23:00', margin: 10 }, isObj(store.get(KEYS.dayProfile, null)) ? store.get(KEYS.dayProfile, {}) : {});
  let recs = arr(store.get(KEYS.recs, []));
  let changelog = arr(store.get(KEYS.changelog, []));
  let prules = arr(store.get(KEYS.prules, []));
  let agDay = todayKey(), agTab = 'day', agProps = [], agEditing = null, agTaskEditing = null;
  const saveEvents = () => store.set(KEYS.events, events);
  const saveProfile2 = () => store.set(KEYS.dayProfile, dayProfile);
  const saveRecs = () => { recs = recs.slice(0, 200); store.set(KEYS.recs, recs); };
  const savePrules = () => store.set(KEYS.prules, prules);
  function logChange(entity, ref, title, before, after, reason, by = 'usuario') {
    changelog.unshift({ id: uid(), at: new Date().toISOString(), entity, ref, title, before, after, by, reason });
    changelog = changelog.slice(0, 300);
    store.set(KEYS.changelog, changelog);
  }

  /* Campos de planificación de una tarea (los usa también "Tareas"). */
  function cleanPlanFields(x) {
    const o = {};
    if (!x) return o;
    if (+x.durMin > 0) { o.durMin = Math.min(1440, Math.round(+x.durMin)); o.durSrc = x.durSrc === 'estimada' ? 'estimada' : 'usuario'; }
    if (['estudio', 'trabajo', 'ejercicio', 'social', 'hogar', 'personal'].includes(x.area)) o.area = x.area;
    if (['ninguno', 'bajo', 'alto', 'critico'].includes(x.costo)) o.costo = x.costo;
    if ([1, 2, 3].includes(+x.importancia)) o.importancia = +x.importancia;
    return o;
  }
  function planChips(t) {
    if (t.done) return '';
    return [
      t.durMin ? `<span class="chip">${ic('clock')}${PE.dur(t.durMin)}${t.durSrc === 'estimada' ? ' aprox.' : ''}</span>` : '',
      t.area && AG_AREAS[t.area] ? agAreaChip(t.area) : '',
      t.costo === 'critico' || t.costo === 'alto' ? `<span class="chip chip-amber">Aplazar: ${AG_COSTS[t.costo].toLowerCase()}</span>` : '',
    ].join('');
  }
  function taskPlanForm() {
    return cleanPlanFields({ durMin: $('#taskDur')?.value, durSrc: 'usuario', area: $('#taskArea')?.value, costo: $('#taskCost')?.value, importancia: $('#taskImp')?.value });
  }
  function taskPlanFormReset() { ['#taskDur', '#taskArea', '#taskCost', '#taskImp'].forEach(s => { const el = $(s); if (el) el.value = ''; }); }

  /* ---------- Utilidades de vista ---------- */
  const agAreaChip = (a) => (AG_AREAS[a] ? `<span class="chip" style="background: rgb(var(${AG_AREAS[a][1]}) / .12); color: rgb(var(${AG_AREAS[a][1]}))">${AG_AREAS[a][0]}</span>` : '');
  const ruleName = (r) => (PE.RULES.find(x => x.id === r) || {}).name || r;
  const ruleChip = (r) => `<span class="ag-rule" title="${esc(r + ' · ' + ruleName(r))}">${esc(r)}</span>`;
  const dayWord = (k) => {
    const d = daysBetween(todayKey(), k);
    if (d === 0) return 'hoy';
    if (d === 1) return 'mañana';
    if (d === -1) return 'ayer';
    return keyToDate(k).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  };
  const dayTitle = (k) => {
    const d = daysBetween(todayKey(), k);
    const long = keyToDate(k).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return d === 0 ? `Hoy, ${long}` : d === 1 ? `Mañana, ${long}` : d === -1 ? `Ayer, ${long}` : long;
  };
  function engineInput(day) {
    const now = new Date();
    return { day, today: todayKey(), nowMin: day === todayKey() ? now.getHours() * 60 + now.getMinutes() : null, profile: dayProfile, events, tasks, personalRules: prules };
  }
  const isRejected = (p, day) => recs.some(r => r.sig === p.id && r.day === day && r.estado === 'rechazada');
  function changeText(c, day) {
    const t = `"${esc(c.title)}"`;
    switch (c.type) {
      case 'moveTask': return `Pasar ${t} a ${dayWord(c.toDay)}`;
      case 'moveEvent': return c.toDay === day ? `Mover ${t} a las ${c.start}–${c.end}` : `Pasar ${t} a ${dayWord(c.toDay)}`;
      case 'shorten': return `Recortar ${t} de ${PE.dur(c.from)} a ${PE.dur(c.newDur)}`;
      case 'split': return `Dejar ${PE.dur(c.todayDur)} de ${t} para ${dayWord(day)} y crear la parte 2 (${PE.dur(c.restDur)}) para ${dayWord(c.restDay)}`;
      case 'schedule': return `${c.start}–${c.end} · ${esc(c.title)}`;
      case 'block': return `${dayWord(c.date)}, ${c.start}–${c.end} · ${esc(c.title)}`;
      default: return esc(c.title || '');
    }
  }

  /* ---------- Ejecutar lo aceptado (R10) ---------- */
  function applyChanges(changes, reason) {
    for (const c of changes) {
      if (c.type === 'moveTask') {
        const t = tasks.find(x => x.id === c.id); if (!t) continue;
        logChange('tarea', t.id, t.text, { due: t.due }, { due: c.toDay }, reason, 'sistema');
        t.due = c.toDay;
      } else if (c.type === 'moveEvent') {
        const e = events.find(x => x.id === c.id); if (!e) continue;
        const before = { date: e.date, start: e.start, end: e.end };
        e.date = c.toDay || e.date;
        if (c.start && c.end) { e.start = c.start; e.end = c.end; }
        logChange('compromiso', e.id, e.title, before, { date: e.date, start: e.start, end: e.end }, reason, 'sistema');
      } else if (c.type === 'shorten') {
        if (c.kind === 'event') {
          const e = events.find(x => x.id === c.id); if (!e) continue;
          const before = { end: e.end };
          e.end = PE.hm(PE.toMin(e.start) + c.newDur);
          logChange('compromiso', e.id, e.title, before, { end: e.end }, reason, 'sistema');
        } else {
          const t = tasks.find(x => x.id === c.id); if (!t) continue;
          logChange('tarea', t.id, t.text, { durMin: t.durMin || null }, { durMin: c.newDur }, reason, 'sistema');
          t.durMin = c.newDur; t.durSrc = t.durSrc || 'usuario';
        }
      } else if (c.type === 'split') {
        const t = tasks.find(x => x.id === c.id); if (!t) continue;
        logChange('tarea', t.id, t.text, { durMin: t.durMin || null }, { durMin: c.todayDur }, reason, 'sistema');
        t.durMin = c.todayDur;
        const part = addTask({ text: `${t.text} (parte 2)`.slice(0, 160), priority: t.priority, due: c.restDay, tag: t.tag, durMin: c.restDur, durSrc: t.durSrc, area: t.area, costo: t.costo, importancia: t.importancia });
        logChange('tarea', part.id, part.text, null, { due: c.restDay, durMin: c.restDur }, reason, 'sistema');
      } else if (c.type === 'schedule' || c.type === 'block') {
        const id = c.type === 'block' ? c.taskId : c.id;
        const t = tasks.find(x => x.id === id);
        const e = cleanEvent({ title: c.type === 'block' ? `Bloque: ${c.title}` : c.title, area: (t && t.area) || c.area, date: c.date, start: c.start, end: c.end, fixed: false, taskId: id, costo: t && t.costo });
        events.push(e);
        logChange('compromiso', e.id, e.title, null, { date: e.date, start: e.start, end: e.end }, reason, 'sistema');
      }
    }
    saveTasks(); saveEvents();
  }
  function snapshotOf(p, day) {
    const a = PE.analyzeDay(engineInput(day));
    return { libre_min: a.freeMin, necesario_min: a.needMin, cabe: a.fits, compromisos_fijos: a.fixedCount, actividades: a.itemCount, conflictos: a.conflicts.map(c => c.title), incertidumbres: p.uncertain || [] };
  }
  function recordRec(p, day, estado) {
    let r = recs.find(x => x.sig === p.id && x.day === day && x.estado === 'generada');
    if (!r) { r = { id: uid(), sig: p.id, day, at: new Date().toISOString(), title: p.title, kind: p.kind, rules: p.rules, changes: p.changes, situacion: snapshotOf(p, day), estado: 'generada', resultado: null }; recs.unshift(r); }
    r.estado = estado; r.decidedAt = new Date().toISOString();
    saveRecs();
    return r;
  }
  function acceptProposal(p, day) {
    const snap = { tasks: JSON.parse(JSON.stringify(tasks)), events: JSON.parse(JSON.stringify(events)) };
    const rec = recordRec(p, day, 'aceptada');
    applyChanges(p.changes, `Propuesta aceptada: ${p.title}`);
    rec.estado = 'ejecutada'; saveRecs();
    onTasksChanged();
    toast('Hecho: apliqué la propuesta.', 'ok', { label: 'Deshacer', fn: () => {
      tasks = snap.tasks; events = snap.events; saveTasks(); saveEvents();
      rec.estado = 'deshecha'; saveRecs();
      logChange('propuesta', rec.id, p.title, null, null, 'Deshecha por ti', 'usuario');
      onTasksChanged();
    } });
  }
  function rejectProposal(p, day) {
    recordRec(p, day, 'rechazada');
    renderAgenda();
    toast('Descartada. No cambié nada.');
  }

  /* ---------- Vista: día ---------- */
  function propCard(p, idx, day, primary) {
    const rules = (p.rules || []).map(ruleChip).join('');
    return `<div class="ag-card ${primary ? 'ag-prop' : ''}">
      <div class="flex items-start gap-2.5">
        <span class="ag-ico" style="--h: var(--accent)">${ic(p.kind === 'blocks' ? 'calendar' : 'sparkle')}</span>
        <div class="flex-1 min-w-0">
          <p class="font-semibold leading-snug">${esc(p.title)}</p>
          <p class="text-xs text-neutral-500 mt-0.5 flex flex-wrap items-center gap-1">${p.optional ? 'Opcional' : 'Propuesta'} · ${rules}</p>
        </div>
      </div>
      <ul class="ag-changes">${p.changes.map(c => `<li>${changeText(c, day)}</li>`).join('')}</ul>
      <details class="ag-why"><summary>¿Por qué?</summary>
        <div class="ag-why-body">
          <p class="ag-why-h">Motivos</p><ul>${(p.why || []).map(w => `<li>${esc(w)}</li>`).join('')}</ul>
          <p class="ag-why-h">Datos usados</p><ul>${(p.data || []).map(w => `<li>${esc(w)}</li>`).join('') || '<li>Los compromisos y tareas de este día</li>'}</ul>
          <p class="ag-why-h">Incertidumbres</p><ul>${(p.uncertain || []).length ? p.uncertain.map(w => `<li>${esc(w)}</li>`).join('') : '<li>Ninguna: todos los datos los indicaste tú.</li>'}</ul>
          <p class="ag-why-h">Reglas aplicadas</p><ul>${(p.rules || []).map(r => `<li><b>${esc(r)}</b> ${esc(ruleName(r))}</li>`).join('')}</ul>
        </div>
      </details>
      <div class="flex flex-wrap gap-2 mt-3">
        <button class="btn btn-accent btn-sm" data-ag-accept="${idx}">${ic('check')}Aceptar</button>
        <button class="btn btn-sm" data-ag-reject="${idx}">Rechazar</button>
      </div>
    </div>`;
  }
  function renderAgDay(a) {
    const day = agDay, tk = todayKey();
    const inp = engineInput(day);
    const warnings = day === tk ? PE.deadlineWarnings(inp) : [];
    const splits = day === tk ? PE.splitSuggestions(inp) : [];
    const props = [...a.proposals, ...splits].filter(p => !isRejected(p, day));
    agProps = props;
    const pct = a.freeMin ? Math.min(100, Math.round(a.needMin / a.freeMin * 100)) : (a.needMin ? 100 : 0);
    const status = !a.itemCount && !a.fixedCount ? ['Día libre', ''] : a.fits && !a.conflicts.length ? ['Todo cabe', 'ag-ok'] : a.fits ? ['Revisa los avisos', 'chip-amber'] : [`Faltan ${PE.dur(Math.max(a.deficit, 5))}`, 'chip-red'];
    const primary = props.filter(p => p.primary && !p.optional && p.kind !== 'blocks');
    const others = props.filter(p => !primary.includes(p));
    const missing = a.uncertain.filter(u => u.rule === 'R8');
    const rows = a.schedule.map(s => {
      const area = AG_AREAS[s.area] ? s.area : 'personal';
      const tags = [
        s.kind === 'event' && s.fixed ? `<span class="chip">${ic('lock')}Fijo</span>` : '',
        s.kind === 'event' && !s.fixed && !s.proposed ? '<span class="chip">Flexible</span>' : '',
        s.proposed ? `<span class="chip ag-chip-prop">${s.kind === 'task' ? 'Tarea · hueco sugerido' : 'Nuevo horario sugerido'}</span>` : '',
        s.est ? '<span class="chip">Duración estimada</span>' : '',
        agAreaChip(area),
      ].join('');
      const ref = s.kind === 'event' ? `data-ag-ev="${esc(s.id)}"` : `data-ag-task="${esc(s.id)}"`;
      return `<li><button class="ag-row ${s.proposed ? 'ag-proposed' : ''}" ${ref}>
        <span class="ag-time digits">${esc(s.start)}<span>${esc(s.end)}</span></span>
        <span class="ag-bar" style="--h: var(${AG_AREAS[area][1]})"></span>
        <span class="flex-1 min-w-0 text-left"><span class="block font-medium truncate">${esc(s.title)}</span><span class="flex flex-wrap gap-1.5 mt-1">${tags}</span></span>
      </button></li>`;
    }).join('');
    const over = a.overflow.map(o => `<li><button class="ag-row ag-over" ${o.kind === 'event' ? `data-ag-ev="${esc(o.id)}"` : `data-ag-task="${esc(o.id)}"`}>
        <span class="ag-time">—<span>${PE.dur(o.dur)}</span></span><span class="ag-bar" style="--h: 239 68 68"></span>
        <span class="flex-1 min-w-0 text-left"><span class="block font-medium truncate">${esc(o.title)}</span><span class="flex flex-wrap gap-1.5 mt-1"><span class="chip chip-red">No cabe</span>${agAreaChip(o.area)}</span></span></button></li>`).join('');
    $('#agDay').innerHTML = `
      <div class="ag-daynav">
        <button class="icon-btn" data-ag-step="-1" aria-label="Día anterior">${ic('chevron', 'ag-rot90')}</button>
        <div class="flex-1 min-w-0 text-center">
          <p class="font-bold first-letter:uppercase leading-snug">${esc(dayTitle(day))}</p>
          <p class="text-xs text-neutral-500">Tu día de ${esc(a.window.start)} a ${esc(dayProfile.end)} · ${a.margin} min entre actividades</p>
        </div>
        <button class="icon-btn" data-ag-step="1" aria-label="Día siguiente">${ic('chevron', 'ag-rot-90')}</button>
      </div>
      ${day !== tk ? '<div class="text-center mt-1"><button class="btn btn-ghost btn-sm" data-ag-step="0">Volver a hoy</button></div>' : ''}
      <div class="ag-stats mt-4">
        <div><p class="ag-k">Tiempo libre</p><p class="ag-v digits">${PE.dur(a.freeMin)}</p></div>
        <div><p class="ag-k">Necesitas</p><p class="ag-v digits">${PE.dur(a.needMin)}</p></div>
        <div><p class="ag-k">Estado</p><p class="mt-1"><span class="chip ${status[1]}">${esc(status[0])}</span></p></div>
      </div>
      <div class="ag-cap mt-3 ${!a.fits ? 'ag-cap-bad' : pct >= 85 ? 'ag-cap-warn' : ''}" role="img" aria-label="Ocupación del tiempo libre: ${pct}%"><span style="width:${pct}%"></span></div>
      ${a.conflicts.length || warnings.length ? `<div class="space-y-2 mt-4">${[...a.conflicts, ...warnings].map(c => `
        <div class="ag-alert ${c.severity === 'high' ? 'ag-alert-high' : ''}">
          <span class="ag-ico" style="--h: ${c.severity === 'high' ? '239 68 68' : 'var(--h-goals)'}">${ic('alert')}</span>
          <div class="flex-1 min-w-0"><p class="font-semibold text-sm flex flex-wrap items-center gap-1.5">${esc(c.title)} ${[].concat(c.rule).map(ruleChip).join('')}</p><p class="text-sm text-neutral-600 mt-0.5 leading-relaxed">${esc(c.msg)}</p>
          ${c.taskId ? `<button class="btn btn-ghost btn-sm mt-1 !px-0 text-accent" data-ag-task="${esc(c.taskId)}">Ajustar la tarea</button>` : ''}</div>
        </div>`).join('')}</div>` : ''}
      ${missing.length ? `<div class="ag-alert mt-3"><span class="ag-ico" style="--h: var(--h-stats)">${ic('clock')}</span><div class="flex-1 min-w-0">
        <p class="font-semibold text-sm flex items-center gap-1.5">Faltan duraciones ${ruleChip('R8')}</p>
        <p class="text-sm text-neutral-600 mt-0.5">Uso 30 min de estimación. Dime cuánto dura para afinar el plan:</p>
        <div class="flex flex-wrap gap-1.5 mt-2">${missing.map(u => `<button class="btn btn-sm" data-ag-task="${esc(u.id)}">${ic('clock')}${esc(u.title)}</button>`).join('')}</div></div></div>` : ''}
      ${primary.length ? `<div class="space-y-3 mt-4">${primary.map(p => propCard(p, props.indexOf(p), day, true)).join('')}</div>` : ''}
      ${others.length ? `<details class="mt-3 ag-more" ${primary.length ? '' : 'open'}><summary>${primary.length ? `Otras opciones (${others.length})` : `Sugerencias (${others.length})`}</summary><div class="space-y-3 mt-3">${others.map(p => propCard(p, props.indexOf(p), day, false)).join('')}</div></details>` : ''}
      <div class="flex items-center justify-between gap-2 mt-6 mb-2">
        <p class="field-label !mb-0">Tu día</p>
        <div class="flex gap-1.5">
          <button class="btn btn-sm" data-ag-new-event>${ic('plus')}Compromiso</button>
          <button class="btn btn-sm" data-ag-new-task>${ic('plus')}Tarea</button>
        </div>
      </div>
      ${rows || over ? `<ul class="ag-list">${rows}${over}</ul>` : `<div class="text-center py-8 rounded-app border-2 border-dashed border-neutral-200">
        <p class="font-semibold">Nada planificado para ${esc(dayWord(day))}</p>
        <p class="hint mt-1 max-w-sm mx-auto px-4">Añade tus compromisos (clases, turnos, reuniones, planes) y tareas con fecha. Yo compruebo si todo cabe y te propongo cómo ordenarlo.</p></div>`}
      <p class="text-xs text-neutral-500 mt-3">Lo sugerido no se guarda en tu calendario hasta que aceptes una propuesta.</p>`;
  }

  /* ---------- Vista: semana ---------- */
  function renderAgWeek() {
    const start = agDay;
    const w = PE.weekLoad(engineInput(start), start, 7);
    $('#agWeek').innerHTML = `<p class="hint mb-3">Siete días desde ${esc(dayWord(start))}. Toca un día para revisarlo.</p>
      <ul class="space-y-2">${w.map(d => {
        const pct = d.freeMin ? Math.min(100, Math.round(d.needMin / d.freeMin * 100)) : (d.needMin ? 100 : 0);
        const st = !d.items && !d.fixed ? '<span class="chip">Libre</span>' : !d.fits ? '<span class="chip chip-red">No cabe</span>' : d.conflicts ? `<span class="chip chip-amber">${plural(d.conflicts, 'aviso', 'avisos')}</span>` : '<span class="chip ag-ok">Cabe</span>';
        return `<li><button class="ag-week" data-ag-goto="${d.day}">
          <span class="w-24 shrink-0 text-left"><span class="block font-semibold text-sm first-letter:uppercase">${esc(keyToDate(d.day).toLocaleDateString('es-ES', { weekday: 'long' }))}</span><span class="block text-xs text-neutral-500">${esc(shortDate(d.day))}</span></span>
          <span class="flex-1 min-w-0"><span class="ag-cap ${!d.fits ? 'ag-cap-bad' : pct >= 85 ? 'ag-cap-warn' : ''}"><span style="width:${pct}%"></span></span>
          <span class="block text-xs text-neutral-500 mt-1 text-left">${PE.dur(d.needMin)} de ${PE.dur(d.freeMin)} libres · ${plural(d.fixed, 'fijo', 'fijos')}</span></span>
          <span class="shrink-0">${st}</span></button></li>`;
      }).join('')}</ul>`;
  }

  /* ---------- Vista: reglas ---------- */
  function renderAgRules() {
    const areaOpts = (sel) => `<option value="any" ${sel === 'any' ? 'selected' : ''}>cualquier cosa</option>` + Object.entries(AG_AREAS).map(([k, [n]]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${n.toLowerCase()}</option>`).join('');
    $('#agRules').innerHTML = `
      <div class="rounded-app p-4 bg-neutral-50 border border-neutral-200/70">
        <p class="font-bold">Tu día</p>
        <p class="hint mb-3">Entre qué horas planifico y cuánto margen dejo entre actividades (traslados, pausas).</p>
        <form id="agProfileForm" class="grid grid-cols-2 gap-2">
          <label><span class="field-label">Empieza</span><input id="agpStart" type="time" class="input input-sm w-full" value="${esc(dayProfile.start)}" required /></label>
          <label><span class="field-label">Termina</span><input id="agpEnd" type="time" class="input input-sm w-full" value="${esc(dayProfile.end)}" required /></label>
          <label class="col-span-2"><span class="field-label">Margen entre actividades (min)</span><input id="agpMargin" type="number" min="0" max="60" step="5" class="input input-sm w-full" value="${esc(dayProfile.margin)}" /></label>
          <button class="btn btn-sm btn-accent col-span-2 mt-1" type="submit">Guardar</button>
        </form>
      </div>
      <div class="rounded-app p-4 bg-neutral-50 border border-neutral-200/70 mt-4">
        <p class="font-bold">Tus reglas personales</p>
        <p class="hint mb-3">Límites que el motor respeta siempre.</p>
        <ul class="space-y-1.5 mb-3">${prules.length ? prules.map(r => `<li class="flex items-center gap-2.5 text-sm">
          <input type="checkbox" class="chk" data-ag-prule-toggle="${esc(r.id)}" ${r.active !== false ? 'checked' : ''} aria-label="Activar regla" />
          <span class="flex-1 ${r.active === false ? 'text-neutral-400 line-through' : ''}">No programar ${r.area && r.area !== 'any' ? esc(AG_AREAS[r.area][0].toLowerCase()) : 'nada'} después de las ${esc(r.after)}</span>
          <button class="icon-btn danger" data-ag-prule-del="${esc(r.id)}" aria-label="Borrar regla">${ic('trash')}</button></li>`).join('') : '<li class="text-sm text-neutral-500">Aún no tienes reglas personales.</li>'}</ul>
        <form id="agPruleForm" class="grid grid-cols-2 gap-2">
          <label><span class="field-label">No programar</span><select id="agprArea" class="input input-sm w-full">${areaOpts('any')}</select></label>
          <label><span class="field-label">después de</span><input id="agprAfter" type="time" class="input input-sm w-full" value="22:00" required /></label>
          <button class="btn btn-sm col-span-2" type="submit">${ic('plus')}Añadir</button>
        </form>
      </div>
      <div class="mt-4">
        <p class="font-bold mb-2">Reglas del motor</p>
        <ul class="space-y-2">${PE.RULES.map(r => `<li class="ag-card"><p class="text-sm"><span class="ag-rule mr-1">${r.id}</span> <b>${esc(r.name)}</b></p><p class="text-sm text-neutral-600 mt-1"><span class="text-neutral-500">Cuándo:</span> ${esc(r.cond)}.</p><p class="text-sm text-neutral-600"><span class="text-neutral-500">Qué hace:</span> ${esc(r.action)}.</p></li>`).join('')}</ul>
      </div>`;
  }

  /* ---------- Vista: historial ---------- */
  const REC_STATE = { generada: ['Generada', ''], aceptada: ['Aceptada', ''], ejecutada: ['Aplicada', 'ag-ok'], rechazada: ['Rechazada', ''], deshecha: ['Deshecha', 'chip-amber'] };
  const REC_RESULT = { '': 'Sin evaluar', exitosa: 'Funcionó', parcial: 'Ayudó en parte', fallida: 'No funcionó', no_evaluable: 'No se puede evaluar' };
  function renderAgHistory() {
    const done = recs.filter(r => r.estado === 'ejecutada');
    const ok = done.filter(r => r.resultado === 'exitosa').length;
    $('#agHistory').innerHTML = `
      <p class="hint mb-3">Cada propuesta que aceptas o rechazas queda aquí, con los datos que tenía el motor. Aceptar no significa que funcionó: márcalo después para que el sistema aprenda con evidencia.</p>
      ${done.length ? `<p class="text-sm mb-3"><b>${ok}</b> de ${plural(done.length, 'propuesta aplicada', 'propuestas aplicadas')} marcadas como "funcionó".</p>` : ''}
      <ul class="space-y-2">${recs.slice(0, 40).map(r => `<li class="ag-card">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0"><p class="font-semibold text-sm leading-snug">${esc(r.title)}</p>
          <p class="text-xs text-neutral-500 mt-0.5">${esc(new Date(r.decidedAt || r.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · para ${esc(dayWord(r.day))} · ${(r.rules || []).map(ruleChip).join(' ')}</p></div>
          <span class="chip ${REC_STATE[r.estado]?.[1] || ''} shrink-0">${esc(REC_STATE[r.estado]?.[0] || r.estado)}</span>
        </div>
        ${r.situacion ? `<p class="text-xs text-neutral-500 mt-2">Situación: ${PE.dur(r.situacion.necesario_min || 0)} necesarios, ${PE.dur(r.situacion.libre_min || 0)} libres${r.situacion.incertidumbres?.length ? `, ${plural(r.situacion.incertidumbres.length, 'incertidumbre', 'incertidumbres')}` : ''}.</p>` : ''}
        ${r.estado === 'ejecutada' ? `<label class="flex items-center gap-2 mt-2 text-sm"><span class="text-neutral-500">Resultado</span><select class="input input-sm" data-ag-result="${esc(r.id)}">${Object.entries(REC_RESULT).map(([k, v]) => `<option value="${k}" ${(r.resultado || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      </li>`).join('') || '<li class="text-sm text-neutral-500">Todavía no has aceptado ni rechazado propuestas.</li>'}</ul>
      <details class="mt-5 ag-more"><summary>Registro de cambios (${changelog.length})</summary>
        <ul class="mt-2 divide-y divide-neutral-100 text-sm">${changelog.slice(0, 60).map(c => `<li class="py-2">
          <p><span class="font-semibold">${esc(c.title || c.entity)}</span> <span class="text-neutral-500">· ${c.by === 'sistema' ? 'el motor, con tu permiso' : 'tú'}</span></p>
          <p class="text-xs text-neutral-500">${esc(new Date(c.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} · ${esc(c.reason || '')}${c.before || c.after ? ` · ${esc(diffText(c.before, c.after))}` : ''}</p></li>`).join('') || '<li class="py-2 text-neutral-500">Sin cambios todavía.</li>'}</ul>
      </details>`;
  }
  function diffText(b, a) {
    const L = { due: 'fecha', durMin: 'duración', date: 'día', start: 'inicio', end: 'fin', fixed: 'fijo', title: 'título', area: 'área' };
    const v = (k, x) => (x == null ? '—' : k === 'durMin' ? `${x} min` : typeof x === 'boolean' ? (x ? 'sí' : 'no') : String(x));
    if (!b) return 'creado';
    if (!a) return 'borrado';
    return Object.keys(a).filter(k => String(b[k]) !== String(a[k])).map(k => `${L[k] || k}: ${v(k, b[k])} → ${v(k, a[k])}`).join(', ') || 'sin cambios';
  }

  /* ---------- Tarjeta en Inicio (centro de control) ---------- */
  function renderAgStrip() {
    const el = $('#agendaStrip');
    if (!el) return;
    const tk = todayKey();
    const a = PE.analyzeDay(engineInput(tk));
    const warns = PE.deadlineWarnings(engineInput(tk));
    if (!a.itemCount && !a.fixedCount && !warns.length && !events.length) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const next = a.schedule.filter(s => !s.proposed && PE.toMin(s.end) > nowMin)[0];
    const n = a.conflicts.length + warns.length;
    const st = !a.fits ? `<span class="chip chip-red">${ic('alert')}No cabe todo</span>` : n ? `<span class="chip chip-amber">${ic('alert')}${plural(n, 'aviso', 'avisos')}</span>` : `<span class="chip ag-ok">${ic('check')}Todo cabe</span>`;
    el.innerHTML = `<div class="flex flex-wrap items-center gap-3">
      <span class="tile" style="--h: var(--h-plan)">${ic('calendar')}</span>
      <div class="flex-1 min-w-[12rem]">
        <p class="font-bold flex flex-wrap items-center gap-2">Agenda de hoy ${st}</p>
        <p class="hint">${PE.dur(a.freeMin)} libres · necesitas ${PE.dur(a.needMin)}${next ? ` · Próximo: ${esc(next.start)} ${esc(next.title)}` : ''}</p>
      </div>
      <a href="#agenda" class="btn btn-sm ${n || !a.fits ? 'btn-accent' : ''}" data-ag-open-today>${n || !a.fits ? 'Resolver' : 'Ver agenda'}</a>
    </div>`;
  }

  /* ---------- Render general ---------- */
  function renderAgenda() {
    if (!agReady) return;
    try {
      if (agTab === 'day') renderAgDay(PE.analyzeDay(engineInput(agDay)));
      else if (agTab === 'week') renderAgWeek();
      else if (agTab === 'rules') renderAgRules();
      else renderAgHistory();
      renderAgStrip();
    } catch (err) { console.error('Agenda', err); }
  }
  function scrollToAgenda(day) {
    if (day) agDay = day;
    agTab = 'day'; activateTab('agenda', 'day'); renderAgenda();
    document.getElementById('agenda')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- Hoja: compromiso ---------- */
  function openEventSheet(id, preset = {}) {
    const e = id ? events.find(x => x.id === id) : null;
    agEditing = e ? e.id : null;
    const v = e || Object.assign({ title: '', date: agDay, start: '18:00', end: '19:00', area: 'personal', fixed: true, confirmed: false }, preset);
    $('#evSheetTitle').textContent = e ? 'Editar compromiso' : 'Nuevo compromiso';
    $('#evTitle').value = v.title; $('#evDate').value = v.date; $('#evStart').value = v.start; $('#evEnd').value = v.end;
    $('#evArea').value = v.area || 'personal'; $('#evFixed').value = v.fixed ? 'fixed' : 'flexible'; $('#evConfirmed').checked = !!v.confirmed;
    $('#evCost').value = v.costo || '';
    $('#evDelete').classList.toggle('hidden', !e);
    $('#evTaskNote').classList.toggle('hidden', !(e && e.taskId));
    syncEventSheet();
    openSheet('eventSheet');
    setTimeout(() => { if (!e) $('#evTitle').focus(); }, 300);
  }
  function syncEventSheet() {
    const flex = $('#evFixed').value === 'flexible';
    $('#evCostWrap').classList.toggle('hidden', !flex);
    $('#evConfirmedWrap').classList.toggle('hidden', $('#evArea').value !== 'social');
  }
  function saveEventFromSheet(ev) {
    ev.preventDefault();
    const title = $('#evTitle').value.trim();
    if (!title) { $('#evTitle').focus(); return; }
    const s = PE.toMin($('#evStart').value), en = PE.toMin($('#evEnd').value);
    if (s == null || en == null || en <= s) { toast('La hora de fin debe ser posterior a la de inicio.', 'warn'); return; }
    const data = cleanEvent({ title, date: $('#evDate').value || agDay, start: $('#evStart').value, end: $('#evEnd').value, area: $('#evArea').value, fixed: $('#evFixed').value === 'fixed', confirmed: $('#evArea').value === 'social' && $('#evConfirmed').checked, costo: $('#evFixed').value === 'flexible' ? ($('#evCost').value || undefined) : undefined });
    const e = agEditing ? events.find(x => x.id === agEditing) : null;
    if (e) {
      const before = { title: e.title, date: e.date, start: e.start, end: e.end, fixed: e.fixed, area: e.area };
      Object.assign(e, data, { id: e.id, taskId: e.taskId, createdAt: e.createdAt });
      logChange('compromiso', e.id, e.title, before, { title: e.title, date: e.date, start: e.start, end: e.end, fixed: e.fixed, area: e.area }, 'Editado por ti');
    } else {
      events.push(data);
      logChange('compromiso', data.id, data.title, null, { date: data.date, start: data.start, end: data.end, fixed: data.fixed }, 'Creado por ti');
    }
    saveEvents(); closeSheets();
    agDay = data.date;
    const a = PE.analyzeDay(engineInput(agDay));
    renderAgenda();
    if (a.conflicts.length) toast(`Guardado. Ojo: ${a.conflicts[0].title.toLowerCase()} ese día.`, 'warn', { label: 'Ver', fn: () => scrollToAgenda(agDay) });
    else toast('Compromiso guardado', 'ok');
  }
  function deleteEvent(id) {
    const i = events.findIndex(x => x.id === id);
    if (i < 0) return;
    const e = events[i];
    if (e.fixed && !confirm(`"${e.title}" es un compromiso fijo. ¿Seguro que quieres borrarlo?`)) return;
    events.splice(i, 1); saveEvents();
    logChange('compromiso', e.id, e.title, { date: e.date, start: e.start, end: e.end }, null, 'Borrado por ti');
    closeSheets(); renderAgenda();
    toast('Compromiso borrado', 'info', { label: 'Deshacer', fn: () => { events.splice(Math.min(i, events.length), 0, e); saveEvents(); logChange('compromiso', e.id, e.title, null, { date: e.date, start: e.start, end: e.end }, 'Restaurado por ti'); renderAgenda(); } });
  }

  /* ---------- Hoja: planificar una tarea ---------- */
  function openTaskPlan(id, presetDue) {
    const t = id ? tasks.find(x => x.id === id) : null;
    agTaskEditing = t ? t.id : null;
    $('#tpSheetTitle').textContent = t ? 'Planificar tarea' : 'Nueva tarea';
    $('#tpText').value = t ? t.text : '';
    $('#tpDue').value = t ? (t.due || '') : (presetDue || agDay);
    $('#tpDur').value = t && t.durMin ? t.durMin : '';
    $('#tpSrc').value = t && t.durSrc === 'estimada' ? 'estimada' : 'usuario';
    $('#tpArea').value = (t && t.area) || '';
    $('#tpCost').value = (t && t.costo) || '';
    $('#tpImp').value = (t && t.importancia) || '';
    openSheet('taskPlanSheet');
    setTimeout(() => (t ? $('#tpDur') : $('#tpText')).focus(), 300);
  }
  function saveTaskPlan(ev) {
    ev.preventDefault();
    const text = $('#tpText').value.trim();
    if (!text) { $('#tpText').focus(); return; }
    const fields = cleanPlanFields({ durMin: $('#tpDur').value, durSrc: $('#tpSrc').value, area: $('#tpArea').value, costo: $('#tpCost').value, importancia: $('#tpImp').value });
    const due = $('#tpDue').value || null;
    const t = agTaskEditing ? tasks.find(x => x.id === agTaskEditing) : null;
    if (t) {
      const before = { title: t.text, due: t.due, durMin: t.durMin || null, area: t.area || null };
      t.text = text.slice(0, 160); t.due = due;
      ['durMin', 'durSrc', 'area', 'costo', 'importancia'].forEach(k => { delete t[k]; });
      Object.assign(t, fields);
      logChange('tarea', t.id, t.text, before, { title: t.text, due: t.due, durMin: t.durMin || null, area: t.area || null }, 'Editada por ti');
      saveTasks();
    } else {
      const nt = addTask(Object.assign({ text, due }, fields));
      logChange('tarea', nt.id, nt.text, null, { due, durMin: nt.durMin || null }, 'Creada por ti');
      saveTasks();
    }
    closeSheets(); onTasksChanged(!t);
    toast(t ? 'Tarea actualizada' : 'Tarea añadida', 'ok');
  }

  /* ---------- Eventos de la interfaz ---------- */
  $$('[data-tabs="agenda"] [data-tab]').forEach(b => b.addEventListener('click', () => { agTab = b.dataset.tab; renderAgenda(); }));
  document.addEventListener('click', (e) => {
    const t = e.target;
    let el;
    if ((el = t.closest('[data-ag-step]'))) { const n = +el.dataset.agStep; agDay = n === 0 ? todayKey() : PE.keyAdd(agDay, n); renderAgenda(); return; }
    if ((el = t.closest('[data-ag-goto]'))) { scrollToAgenda(el.dataset.agGoto); return; }
    if ((el = t.closest('[data-ag-open-today]'))) { e.preventDefault(); scrollToAgenda(todayKey()); return; }
    if ((el = t.closest('[data-ag-accept]'))) { const p = agProps[+el.dataset.agAccept]; if (p) acceptProposal(p, agDay); return; }
    if ((el = t.closest('[data-ag-reject]'))) { const p = agProps[+el.dataset.agReject]; if (p) rejectProposal(p, agDay); return; }
    if ((el = t.closest('[data-ag-ev]'))) { openEventSheet(el.dataset.agEv); return; }
    if ((el = t.closest('[data-ag-task]'))) { openTaskPlan(el.dataset.agTask); return; }
    if (t.closest('[data-ag-new-event]')) { openEventSheet(null, { date: agDay }); return; }
    if (t.closest('[data-ag-new-task]')) { openTaskPlan(null, agDay); return; }
    if ((el = t.closest('[data-ag-prule-del]'))) {
      const r = prules.find(x => x.id === el.dataset.agPruleDel);
      prules = prules.filter(x => x !== r); savePrules();
      logChange('regla personal', r.id, `Después de las ${r.after}`, { activa: r.active !== false }, null, 'Borrada por ti');
      renderAgenda(); return;
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ag-prule-toggle]')) {
      const r = prules.find(x => x.id === t.dataset.agPruleToggle); if (!r) return;
      r.active = t.checked; savePrules();
      logChange('regla personal', r.id, `Después de las ${r.after}`, { activa: !t.checked }, { activa: t.checked }, 'Cambiada por ti');
      renderAgenda();
    } else if (t.matches('[data-ag-result]')) {
      const r = recs.find(x => x.id === t.dataset.agResult); if (!r) return;
      r.resultado = t.value || null; r.evaluatedAt = new Date().toISOString(); saveRecs();
      renderAgenda();
      toast('Resultado guardado', 'ok');
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'agProfileForm') {
      e.preventDefault();
      const s = $('#agpStart').value, en = $('#agpEnd').value;
      if (PE.toMin(en) <= PE.toMin(s)) { toast('La hora de fin debe ser posterior a la de inicio.', 'warn'); return; }
      const before = { ...dayProfile };
      dayProfile = { start: s, end: en, margin: Math.max(0, Math.min(60, Math.round(+$('#agpMargin').value || 0))) };
      saveProfile2();
      logChange('perfil del día', 'perfil', 'Tu día', before, { ...dayProfile }, 'Cambiado por ti');
      renderAgenda(); toast('Guardado', 'ok');
    } else if (e.target.id === 'agPruleForm') {
      e.preventDefault();
      const r = { id: uid(), area: $('#agprArea').value, after: $('#agprAfter').value, active: true };
      if (PE.toMin(r.after) == null) return;
      prules.push(r); savePrules();
      logChange('regla personal', r.id, `Después de las ${r.after}`, null, { area: r.area, after: r.after }, 'Creada por ti');
      renderAgenda(); toast('Regla añadida', 'ok');
    }
  });
  $('#eventForm').addEventListener('submit', saveEventFromSheet);
  $('#evFixed').addEventListener('change', syncEventSheet);
  $('#evArea').addEventListener('change', syncEventSheet);
  $('#evDelete').addEventListener('click', () => { if (agEditing) deleteEvent(agEditing); });
  $('#taskPlanForm').addEventListener('submit', saveTaskPlan);
  $('#agAddEventBtn').addEventListener('click', () => openEventSheet(null, { date: agDay }));
  setInterval(() => { if (document.visibilityState === 'visible') renderAgenda(); }, 60000);

  /* ---------- Para el asistente ---------- */
  function agendaReply(day = todayKey()) {
    const inp = engineInput(day);
    const a = PE.analyzeDay(inp);
    const w = day === todayKey() ? PE.deadlineWarnings(inp) : [];
    const p = a.proposals.find(x => x.primary && !x.optional && !isRejected(x, day));
    const when = dayWord(day);
    let text;
    if (!a.itemCount && !a.fixedCount) text = `Para ${when} no tienes compromisos ni tareas con fecha. Si me cuentas qué tienes, compruebo si todo cabe.`;
    else if (a.fits && !a.conflicts.length) text = `Todo cabe ${when}: necesitas ${PE.dur(a.needMin)} y tienes ${PE.dur(a.freeMin)} libres.`;
    else text = a.conflicts.map(c => c.msg).join(' ');
    if (p) text += ` Mi propuesta: ${p.title.charAt(0).toLowerCase() + p.title.slice(1)}. No cambio nada hasta que la aceptes.`;
    if (w.length) text += ' ' + w[0].msg;
    const actions = [];
    if (p) actions.push({ label: 'Aceptar propuesta', fn: () => { acceptProposal(p, day); reply('Hecho, apliqué la propuesta. Puedes deshacerlo desde el aviso.'); } });
    actions.push({ label: 'Ver agenda', fn: () => { closeSheets(); scrollToAgenda(day); } });
    return { text, actions };
  }
  function agendaAiState() {
    const tk = todayKey();
    const a = PE.analyzeDay(engineInput(tk));
    return {
      perfil: dayProfile, libre_min: a.freeMin, necesario_min: a.needMin, cabe_todo: a.fits,
      compromisos_hoy: events.filter(e => e.date === tk).map(e => ({ id: sid(e), titulo: e.title, inicio: e.start, fin: e.end, fijo: e.fixed || e.confirmed, area: e.area })),
      proximos_compromisos: events.filter(e => e.date > tk && e.date <= PE.keyAdd(tk, 7)).slice(0, 20).map(e => ({ id: sid(e), titulo: e.title, fecha: e.date, inicio: e.start, fin: e.end, fijo: e.fixed || e.confirmed })),
      conflictos: a.conflicts.map(c => c.msg),
    };
  }
  function agendaAnalysisForAi(day) {
    const inp = engineInput(day);
    const a = PE.analyzeDay(inp);
    return {
      dia: day, libre_min: a.freeMin, necesario_min: a.needMin, cabe_todo: a.fits,
      conflictos: a.conflicts.map(c => ({ reglas: c.rule, mensaje: c.msg })),
      avisos_fecha_limite: day === todayKey() ? PE.deadlineWarnings(inp).map(w => ({ regla: w.rule, mensaje: w.msg })) : [],
      propuestas: a.proposals.map(p => ({ titulo: p.title, principal: !!p.primary, opcional: !!p.optional, reglas: p.rules, motivos: p.why, incertidumbres: p.uncertain })),
      nota: 'Las propuestas solo se aplican cuando la persona pulsa Aceptar en la Agenda.',
    };
  }
  function addEventFromAi(i) {
    const s = PE.toMin(i.start), en = PE.toMin(i.end);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(i.date || '')) || s == null || en == null || en <= s) return { error: 'Faltan fecha (AAAA-MM-DD) u horas válidas (HH:MM, fin después de inicio)' };
    const e = cleanEvent({ title: i.title, date: i.date, start: i.start, end: i.end, area: i.area, fixed: i.fixed !== false, confirmed: i.area === 'social' && i.fixed !== false });
    if (!e.title) return { error: 'Falta el título' };
    events.push(e); saveEvents();
    logChange('compromiso', e.id, e.title, null, { date: e.date, start: e.start, end: e.end, fixed: e.fixed }, 'Creado por el asistente a petición tuya', 'asistente');
    agDay = e.date; renderAgenda();
    pushUndo(`añadir el compromiso "${e.title}"`, () => { events = events.filter(x => x !== e); saveEvents(); renderAgenda(); });
    const a = PE.analyzeDay(engineInput(e.date));
    return { ok: true, id: sid(e), conflictos_ese_dia: a.conflicts.map(c => c.msg) };
  }

  agReady = true;
/* AGENDA-UI:END */
