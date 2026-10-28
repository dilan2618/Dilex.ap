/* COACH:START */
  /* =====================================================================
     COACH: vistas, diagnóstico, plan, asistente metiche, voz,
     recordatorios, conexiones y notificaciones con la app cerrada.
     Fuente: planner/coach.js (planner/build.py lo copia a index.html).
  ===================================================================== */
  Object.assign(ICONS, {
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/>',
    plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 01-12 0V7zM12 17v5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    wand: '<path d="M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/>',
    logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    chat: '<path d="M4 20l1.5-4A8 8 0 1112 20a8 8 0 01-4-1z"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  });
  document.querySelectorAll('[data-icon]').forEach(el => { if (!el.firstChild) el.innerHTML = ic(el.dataset.icon); });

  /* ---------- Datos del coach ---------- */
  KEYS.coach = 'dilex.coach';
  const COACH_DEF = () => ({
    wizardDone: false, wizardAt: null, answers: {}, diagnosis: null, yearGoal: '', monthFocus: '', areas: [],
    plan: null, checkins: {}, quizzes: {}, log: [], voiceAnswers: false, plugins: {}, lastSync: null,
    params: {
      wake: '07:00', sleep: '23:00', workStart: '09:00', workEnd: '18:00', workDays: [1, 2, 3, 4, 5], peak: 'manana',
      nosy: 'normal', closeTime: '21:00', quietStart: '22:30', quietEnd: '07:00', startAlert: true,
      simple: true, autoReslot: true, autoTomorrow: true, autoRepeatSuggest: true, autoMoveOverdue: true, autoPlan: true, autoSchedule: true, morningQuiz: true, eveningQuiz: true, discreet: false, askBeforePlugins: true,
    },
  });
  let coach = (() => {
    const d = COACH_DEF(), s = store.get(KEYS.coach, {});
    const c = Object.assign(d, isObj(s) ? s : {});
    c.params = Object.assign(COACH_DEF().params, isObj(s && s.params) ? s.params : {});
    ['checkins', 'quizzes', 'plugins', 'answers'].forEach(k => { if (!isObj(c[k])) c[k] = {}; });
    if (!Array.isArray(c.log)) c.log = [];
    return c;
  })();
  function saveCoach() {
    const keep = Object.keys(coach.quizzes).sort().slice(-45);
    coach.quizzes = Object.fromEntries(keep.map(k => [k, coach.quizzes[k]]));
    const ck = Object.entries(coach.checkins).filter(([, v]) => v && v.day >= addDaysKey(-10));
    coach.checkins = Object.fromEntries(ck);
    coach.log = coach.log.slice(-400);
    store.set(KEYS.coach, coach);
  }
  const P = () => coach.params;
  const logC = (kind, data) => { coach.log.push(Object.assign({ at: new Date().toISOString(), kind }, data)); };

  /* ---------- Horas ---------- */
  const tMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const tHM = (min) => { min = ((Math.round(min) % 1440) + 1440) % 1440; return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`; };
  const nowM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const atOf = (dk, hmStr) => { const d = keyToDate(dk); const m = tMin(hmStr) || 0; d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d.getTime(); };
  const hm12 = (s) => { const m = tMin(s); if (m == null) return s; const d = new Date(); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' }); };
  function inQuiet(ts) {
    const d = new Date(ts), m = d.getHours() * 60 + d.getMinutes();
    const a = tMin(P().quietStart), b = tMin(P().quietEnd);
    if (a == null || b == null || a === b) return false;
    return a < b ? (m >= a && m < b) : (m >= a || m < b);
  }
  const isWorkDay = (dk) => P().workDays.includes(keyToDate(dk).getDay());
  const shuffle1 = (arr2) => arr2[Math.floor(Math.random() * arr2.length)];
  const firstName = () => (uName() || '').split(/\s+/)[0];
  const coma = () => (firstName() ? `, ${firstName()}` : '');

  /* =====================================================================
     VISTAS tipo programa: cada sección es una pantalla fija con sus
     propias pestañas (paneles). La página no se desliza: solo el panel
     activo tiene su contenido, y si es largo se desplaza por dentro.
  ===================================================================== */
  const VIEW_DEF = {
    hoy: { title: 'Hoy', icon: 'home', panels: [['resumen', 'Resumen', 'sun'], ['midia', 'Mi día', 'clock'], ['tareas', 'Tareas', 'tasks'], ['prioridades', 'Prioridades', 'target'], ['enfoque', 'Enfoque', 'timer']] },
    plan: { title: 'Plan', icon: 'compass', panels: [['miplan', 'Mi plan', 'compass'], ['agenda', 'Agenda', 'calendar'], ['habitos', 'Hábitos', 'repeat'], ['metas', 'Metas', 'flag']] },
    progreso: { title: 'Progreso', icon: 'chart', panels: [['semana', 'Mi semana', 'flame'], ['graficas', 'Gráficas', 'chart']] },
    mas: { title: 'Más', icon: 'grid', panels: [['hub', 'Secciones', 'grid'], ['perfil', 'Perfil y PIN', 'user']] },
    notas: { title: 'Notas', icon: 'note', parent: 'mas', hue: '--h-notes', desc: 'Ideas, listas y apuntes' },
    recordatorios: { title: 'Recordatorios', icon: 'bell', parent: 'mas', hue: '--h-goals', desc: 'Avisos, repeticiones y lo que Dilex te preguntará' },
    conexiones: { title: 'Conexiones', icon: 'plug', parent: 'mas', hue: '--h-files', desc: 'Calendario, correo, WhatsApp, IA y avisos' },
    analizador: { title: 'Analizador', icon: 'search', parent: 'mas', hue: '--h-stats', desc: 'Revisa archivos y datos' },
    descargas: { title: 'Descargas', icon: 'download', parent: 'mas', hue: '--h-dl', desc: 'PDF, imágenes y Excel' },
  };
  // Dónde vive cada bloque: [vista, panel]
  const SECTION_AT = { resumen: ['hoy', 'resumen'], cxAskCard: ['hoy', 'resumen'], cxDayCard: ['hoy', 'midia'], tareas: ['hoy', 'tareas'], planCard: ['hoy', 'prioridades'], enfoque: ['hoy', 'enfoque'],
    coachPlan: ['plan', 'miplan'], agenda: ['plan', 'agenda'], habitos: ['plan', 'habitos'], metas: ['plan', 'metas'], cxWeek: ['progreso', 'semana'], stats: ['progreso', 'semana'], progreso: ['progreso', 'graficas'],
    cxHub: ['mas', 'hub'], cxAccount: ['mas', 'perfil'], notas: ['notas', 'main'], recordatorios: ['recordatorios', 'main'], conexiones: ['conexiones', 'main'], analizador: ['analizador', 'main'], descargas: ['descargas', 'main'] };
  let curView = 'hoy';
  const curPanel = {};
  const viewEl = (v) => document.querySelector(`.cx-view[data-view="${v}"]`);
  const panelsOf = (v) => VIEW_DEF[v].panels || [['main', VIEW_DEF[v].title, VIEW_DEF[v].icon]];

  /* Vista simple (por defecto): menos pantallas y menos botones; DLX hace el resto. */
  const SIMPLE = !!P().simple;
  const SIMPLE_ALIAS = { 'hoy/resumen': 'hoy/inicio', 'hoy/midia': 'hoy/inicio', 'hoy/prioridades': 'hoy/inicio', 'hoy/tareas': 'plan/tareas', 'hoy/enfoque': 'enfoque/main', 'plan/metas': 'plan/habitos', 'mas/perfil': 'mas/hub' };
  if (SIMPLE) {
    VIEW_DEF.hoy.panels = [['inicio', 'Hoy', 'home']];
    VIEW_DEF.plan.panels = [['agenda', 'Calendario', 'calendar'], ['tareas', 'Tareas', 'tasks'], ['habitos', 'Hábitos y metas', 'repeat'], ['mesano', 'Mes y año', 'compass'], ['reglas', 'Reglas', 'wand']];
    VIEW_DEF.mas.panels = [['hub', 'Más', 'grid']];
    VIEW_DEF.enfoque = { title: 'Enfoque', icon: 'timer', parent: 'mas', hue: '--h-focus', desc: 'Temporizador para concentrarte' };
    Object.assign(SECTION_AT, { coachPlan: ['plan', 'mesano'], cxPlanMY: ['plan', 'mesano'], cxPlanRules: ['plan', 'reglas'], resumen: null, cxAskCard: ['hoy', 'inicio'], cxSimple: ['hoy', 'inicio'], tareas: ['plan', 'tareas'], enfoque: ['enfoque', 'main'], metas: ['plan', 'habitos'], cxAccount: ['mas', 'hub'] });
  }
  function buildViews() {
    const main = $('main');
    if (!main || viewEl('hoy')) return;
    document.documentElement.classList.add('cx-app');
    document.documentElement.classList.toggle('cx-simple', SIMPLE);
    const footer = main.querySelector(':scope > footer');
    const panels = {};
    Object.keys(VIEW_DEF).forEach(v => {
      const d = VIEW_DEF[v], list = panelsOf(v);
      const el = document.createElement('div');
      el.className = 'cx-view'; el.dataset.view = v; el.hidden = v !== 'hoy';
      const back = d.parent ? `<button type="button" class="cx-back" data-view-go="${d.parent}" aria-label="Volver a Más">${ic('chevron')}</button>` : '';
      el.innerHTML = `<div class="cx-vhead">${back}<h1 class="cx-vh1">${esc(d.title)}</h1>${list.length > 1 ? `<div class="cx-ptabs" role="tablist">${list.map(([p, t, i]) => `<button type="button" role="tab" data-panel-go="${v}/${p}">${ic(i)}<span>${esc(t)}</span></button>`).join('')}</div>` : ''}</div><div class="cx-vbody"></div>`;
      main.insertBefore(el, footer);
      const body = el.querySelector('.cx-vbody');
      list.forEach(([p]) => { const pe = document.createElement('div'); pe.className = 'cx-panel'; pe.dataset.panel = p; pe.hidden = p !== list[0][0]; body.appendChild(pe); panels[`${v}/${p}`] = pe; });
      curPanel[v] = (ui.cxPanels && ui.cxPanels[v] && list.some(x => x[0] === ui.cxPanels[v])) ? ui.cxPanels[v] : list[0][0];
    });
    const put = (el, where) => { if (el && panels[where]) panels[where].appendChild(el); return el; };
    const $id = (id) => document.getElementById(id);
    const res = $id('resumen');
    const planGrid = $id('planCard') && $id('planCard').parentElement;
    const tasksGrid = $id('tareas') && $id('tareas').parentElement;
    const hmGrid = $id('habitos') && $id('habitos').parentElement;
    if (SIMPLE) {
      // Lo que no se ve en la vista simple sigue existiendo (y funcionando) aquí, oculto.
      const stash = document.createElement('div'); stash.id = 'cxStash'; stash.hidden = true; document.body.appendChild(stash);
      const hold = (el) => { if (el) stash.appendChild(el); };
      const simple = document.createElement('section'); simple.id = 'cxSimple'; simple.className = 'cxs';
      simple.innerHTML = '<div id="cxsTop"></div><form id="cxsCap" class="cxs-cap" autocomplete="off"></form><div id="cxsBanner"></div><div id="cxsAskSlot"></div><div id="cxsNow"></div><div id="cxsList"></div><div id="cxsHabits"></div>';
      put(simple, 'hoy/inicio');
      const ask = document.createElement('section'); ask.id = 'cxAskCard'; ask.className = 'card cx-pad cx-ask hidden';
      simple.querySelector('#cxsAskSlot').appendChild(ask);
      hold(res); if (planGrid) hold(planGrid);
      put($id('tareas'), 'plan/tareas');
      const ab = document.createElement('section'); ab.id = 'cxAutoBar'; ab.className = 'cxp-auto'; put(ab, 'plan/agenda');
      put($id('agenda'), 'plan/agenda');
      const my = document.createElement('section'); my.id = 'cxPlanMY'; my.className = 'card cx-pad cxp'; put(my, 'plan/mesano');
      const rl = document.createElement('section'); rl.id = 'cxPlanRules'; rl.className = 'card cx-pad cxp'; put(rl, 'plan/reglas');
      put($id('habitos'), 'plan/habitos');
      put($id('metas'), 'plan/habitos');
      put($id('stats'), 'progreso/semana');
      const wk = document.createElement('section'); wk.id = 'cxWeek'; wk.className = 'card cx-pad'; put(wk, 'progreso/semana');
      put($id('progreso'), 'progreso/graficas');
      panels['mas/hub'].innerHTML = '<div id="cxHub"></div>';
      put($id('enfoque'), 'enfoque/main');
      ['notas', 'analizador', 'descargas'].forEach(v => put($id(v), `${v}/main`));
      ['recordatorios', 'conexiones'].forEach(v => { const s2 = document.createElement('section'); s2.id = v; s2.className = 'card cx-pad'; put(s2, `${v}/main`); });
      [tasksGrid, hmGrid].forEach(g => { if (g && !g.children.length) g.remove(); });
      $$('.cx-panel > .card, .cx-panel > section').forEach(c => c.classList.add('cx-fill'));
      buildNav(); renderHub(); initSwipe(); buildSimpleCapture();
      return;
    }
    // Hoy
    put(res, 'hoy/resumen');
    const ask = document.createElement('section'); ask.id = 'cxAskCard'; ask.className = 'card cx-pad cx-ask hidden';
    const hero = res && res.firstElementChild;
    if (hero) hero.after(ask); else put(ask, 'hoy/resumen');
    const day = document.createElement('section'); day.id = 'cxDayCard'; day.className = 'card cx-pad'; put(day, 'hoy/midia');
    put($id('tareas'), 'hoy/tareas');
    if (planGrid) { planGrid.classList.add('cx-stack'); put(planGrid, 'hoy/prioridades'); }
    put($id('enfoque'), 'hoy/enfoque');
    // Plan
    const cp = document.createElement('section'); cp.id = 'coachPlan'; cp.className = 'card cx-pad'; put(cp, 'plan/miplan');
    put($id('agenda'), 'plan/agenda');
    put($id('habitos'), 'plan/habitos');
    put($id('metas'), 'plan/metas');
    // Progreso
    put($id('stats'), 'progreso/semana');
    const wk = document.createElement('section'); wk.id = 'cxWeek'; wk.className = 'card cx-pad'; put(wk, 'progreso/semana');
    put($id('progreso'), 'progreso/graficas');
    // Más
    panels['mas/hub'].innerHTML = '<div class="cx-hub" id="cxHub"></div>';
    panels['mas/perfil'].innerHTML = '<div id="cxAccount"></div>';
    ['notas', 'analizador', 'descargas'].forEach(v => put($id(v), `${v}/main`));
    ['recordatorios', 'conexiones'].forEach(v => { const s = document.createElement('section'); s.id = v; s.className = 'card cx-pad'; put(s, `${v}/main`); });
    [tasksGrid, hmGrid].forEach(g => { if (g && !g.children.length) g.remove(); });
    // Cada panel ocupa la pantalla: los títulos internos sobran
    $$('.cx-panel > .card, .cx-panel > section').forEach(c => c.classList.add('cx-fill'));
    buildNav();
    renderHub();
    initSwipe();
  }

  function buildNav() {
    const b = $('.bnav');
    if (b) {
      b.innerHTML = `<div class="cx-nav5">
        <a href="#hoy" data-view-go="hoy">${ic('home')}Hoy</a>
        <a href="#plan" data-view-go="plan">${ic('compass')}Plan</a>
        <div class="flex justify-center"><button class="fab" data-cx-act="voice" aria-label="Comando de voz" title="Comando de voz"><canvas class="orb" data-orb="mini"></canvas></button></div>
        <a href="#progreso" data-view-go="progreso">${ic('chart')}Progreso</a>
        <a href="#mas" data-view-go="mas" id="cxNavMore">${ic('grid')}Más</a></div>`;
    }
    const top = $('#topNav');
    if (top) top.innerHTML = (SIMPLE ? ['hoy', 'plan', 'progreso', 'mas'] : ['hoy', 'plan', 'progreso', 'notas', 'recordatorios', 'conexiones', 'analizador', 'descargas'])
      .map(v => `<a class="navlink" href="#${v}" data-view-go="${v}">${ic(VIEW_DEF[v].icon)}${VIEW_DEF[v].title}</a>`).join('')
      + `<button type="button" class="navlink cx-voicelink" data-cx-act="voice">${ic('mic')}Voz</button>`;
    const brand = $('header a[href="#resumen"]'); if (brand) { brand.setAttribute('href', '#hoy'); brand.dataset.viewGo = 'hoy'; }
    const fab = $('.ai-fab'); if (fab) { fab.removeAttribute('data-open-sheet'); fab.dataset.cxAct = 'voice'; fab.title = 'Comando de voz'; fab.setAttribute('aria-label', 'Comando de voz'); }
  }

  function renderHub() {
    const hub = $('#cxHub'); if (!hub) return;
    if (SIMPLE) return renderSimpleHub(hub);
    const pend = reminders.filter(r => !r.done).length;
    const plugs = Object.values(coach.plugins).filter(p => p && p.on).length;
    const tiles = [
      ...['notas', 'recordatorios', 'conexiones', 'analizador', 'descargas'].map(v => ({ go: v, icon: VIEW_DEF[v].icon, hue: VIEW_DEF[v].hue, t: VIEW_DEF[v].title, d: VIEW_DEF[v].desc, badge: v === 'recordatorios' && pend ? pend : v === 'conexiones' && plugs ? `${plugs} activas` : '' })),
      { act: 'voiceHelp', icon: 'mic', hue: '--accent', t: 'Comandos de voz', d: 'Todo lo que puedes pedirme hablando' },
      { sheet: 'aiSheet', icon: 'chat', hue: '--h-tasks', t: 'Chat con Dilex', d: 'Escríbeme o conversa por voz' },
      { sheet: 'themeSheet', icon: 'sliders', hue: '--accent', t: 'Ajustes', d: 'Asistente, voz y colores' },
      { act: 'params', icon: 'wand', hue: '--h-plan', t: 'Mis reglas', d: 'Horario, nivel de metiche y automatización' },
      { sheet: 'backupSheet', icon: 'shield', hue: '--h-dl', t: 'Respaldo', d: 'Guarda o restaura tus datos' },
      { sheet: 'installSheet', icon: 'phone', hue: '--accent', t: 'Instalar', d: 'Como app y sin internet' },
      { act: 'wizard', icon: 'question', hue: '--h-focus', t: 'Repetir diagnóstico', d: 'Vuelve a hacer el test inicial' },
    ];
    hub.innerHTML = tiles.map(x => `<button type="button" class="card cx-hubtile" ${x.go ? `data-view-go="${x.go}"` : x.sheet ? `data-open-sheet="${x.sheet}"` : `data-cx-act="${x.act}"`}>
      <span class="cx-row" style="justify-content:space-between;width:100%"><span class="tile tile-sm" style="--h: var(${x.hue})">${ic(x.icon)}</span>${x.badge ? `<span class="chip">${esc(String(x.badge))}</span>` : ''}</span>
      <span><b>${esc(x.t)}</b><small>${esc(x.d)}</small></span></button>`).join('');
  }

  /* =====================================================================
     VISTA SIMPLE: una pantalla "Hoy" limpia
     escribir/decir → DLX organiza → "Ahora toca" → lista del día.
  ===================================================================== */
  function buildSimpleCapture() {
    const f = $('#cxsCap'); if (!f) return;
    f.innerHTML = `<input id="cxsInput" class="cxs-input" maxlength="600" placeholder="¿Qué tienes que hacer?" aria-label="Qué tienes que hacer" enterkeyhint="done" />
      ${SR ? `<button type="button" class="cxs-mic" id="cxsMic" aria-label="Decirlo por voz">${ic('mic')}</button>` : ''}<button class="cxs-go" aria-label="Añadir">${ic('send')}</button>`;
    const inp = f.querySelector('#cxsInput');
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = inp.value.trim(); if (!v) { inp.focus(); return; }
      inp.value = '';
      const r = smartAdd(v, { defaultDue: todayKey() });
      if (!r.results.length) { toast('No entendí qué añadir. Prueba con otras palabras.', 'warn'); return; }
      const res = r.results;
      toast(res.length > 1 ? r.say : r.text, 'ok', { label: res.length > 1 ? 'Ver' : 'Cambiar', fn: () => showRouted(res) });
      if (settings.voice) speak(r.say);
      renderSimpleHoy();
    };
    const mic = f.querySelector('#cxsMic');
    if (mic) mic.onclick = () => quickListen((txt) => { inp.value = txt; f.requestSubmit(); }, mic, null);
  }

  function simpleItems(dk) {
    const items = [];
    eventsOn(dk).forEach(e => { if (!e.taskId) items.push({ kind: 'event', id: e.id, title: e.title, s: tMin(e.start), e: tMin(e.end), done: dk === todayKey() && tMin(e.end) <= nowM(), ev: e }); });
    tasksOn(dk).forEach(t => items.push({ kind: 'task', id: t.id, title: t.text, s: t.time ? tMin(t.time) : null, e: t.time ? tMin(t.time) + estDur(t) : null, done: !!t.done, t }));
    return items;
  }
  function renderSimpleHoy() {
    const top = $('#cxsTop'); if (!top) return;
    const tk = todayKey(), nm = nowM();
    const items = simpleItems(tk);
    const tasksT = items.filter(x => x.kind === 'task');
    const doneN = tasksT.filter(x => x.done).length;
    const pri = new Set(todayPlan().map(p => fold(p.text.trim())).filter(Boolean));
    const nm1 = firstName();
    top.innerHTML = `<p class="cxs-date">${esc(new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      <h2 class="cxs-hello">${esc(greetWord())}${nm1 ? `, ${esc(nm1)}` : ''}</h2>
      <p class="cxs-sum">${tasksT.length ? `${doneN} de ${tasksT.length} ${tasksT.length === 1 ? 'cosa hecha' : 'cosas hechas'} hoy` : 'Tu día está libre'}${tasksT.length ? `<span class="cxs-bar"><i style="width:${Math.round((doneN / tasksT.length) * 100)}%"></i></span>` : ''}</p>`;
    // Un solo aviso a la vez
    const ban = $('#cxsBanner');
    let b = '';
    if (!coach.wizardDone) b = `<button type="button" class="cxs-banner" data-cx-act="wizard"><span>✨</span><span><b>Conozcámonos (3 min)</b><small>Así organizo tu día a tu medida</small></span>${ic('chevron')}</button>`;
    else if (morningDue()) b = `<button type="button" class="cxs-banner" data-cx-act="morning"><span>☀️</span><span><b>Empecemos el día</b><small>3 preguntas rápidas</small></span>${ic('chevron')}</button>`;
    else if (eveningDue()) b = `<button type="button" class="cxs-banner" data-cx-act="evening"><span>🌙</span><span><b>Cierre del día</b><small>Cuéntame cómo te fue</small></span>${ic('chevron')}</button>`;
    ban.innerHTML = b;
    // Ahora toca
    const pend = items.filter(x => !x.done);
    const cur = pend.filter(x => x.s != null && x.s <= nm && x.e > nm).sort((a, c) => a.s - c.s)[0];
    const next = pend.filter(x => x.s != null && x.s > nm).sort((a, c) => a.s - c.s)[0];
    const loose = pend.filter(x => x.kind === 'task' && x.s == null).sort((a, c) => taskScore(c.t) - taskScore(a.t))[0];
    const focus = cur || next || loose;
    const now = $('#cxsNow');
    if (!focus) {
      now.innerHTML = tasksT.length ? `<div class="cxs-now done"><p class="cxs-k">¡Todo listo por hoy! 🎉</p><p class="cxs-nt">Terminaste lo de hoy. Descansa o adelanta algo de mañana.</p></div>`
        : `<div class="cxs-now empty"><p class="cxs-k">Empieza aquí</p><p class="cxs-nt">Escribe o di lo que tienes que hacer: "llamar al banco a las 3", "reunión mañana de 10 a 11", "gimnasio todos los días"… Yo lo pongo en su sitio.</p></div>`;
    } else {
      const label = focus === cur ? 'Ahora' : focus === next ? `A las ${hm12(tHM(focus.s))}` : 'Lo siguiente';
      const left = focus === cur ? `Quedan ${Math.max(1, focus.e - nm)} min` : focus === next ? `En ${focus.s - nm < 60 ? `${focus.s - nm} min` : `${Math.round((focus.s - nm) / 6) / 10} h`}` : (focus.t && focus.t.durMin ? `${focus.t.durMin} min` : '');
      now.innerHTML = `<div class="cxs-now"><div class="cx-row" style="justify-content:space-between"><p class="cxs-k">${esc(label)}</p><span class="cxs-left">${esc(left)}</span></div>
        <p class="cxs-nt">${focus.kind === 'event' ? '📅 ' : ''}${esc(focus.title)}</p>
        ${focus.kind === 'task' ? `<div class="cxs-acts"><button type="button" class="btn cx-yes" data-sn="done">${ic('check')}Hecho</button><button type="button" class="btn" data-sn="focus">${ic('play')}Empezar</button></div>` : ''}</div>`;
      now.querySelector('[data-sn="done"]')?.addEventListener('click', () => { A.completeTask(focus.t, true); toast(shuffle1(['¡Bien hecho!', '¡Una menos!', '¡Eso es!']), 'ok', undoAction()); });
      now.querySelector('[data-sn="focus"]')?.addEventListener('click', () => { const m = A.startFocus(Math.min(60, estDur(focus.t)), focus.t); toast(`Concentración: ${m} min en "${focus.title}". Te aviso al terminar.`, 'ok', { label: 'Ver', fn: () => showView('enfoque') }); });
    }
    // Lista del día
    const rows = items.filter(x => !x.done || x.kind === 'event').filter(x => x !== focus).sort((a, c) => (a.s ?? 9999) - (c.s ?? 9999));
    const doneRows = items.filter(x => x.done && x.kind === 'task');
    const row = (x) => `<div class="cxs-row ${x.done ? 'is-done' : ''}" data-sid="${x.kind}:${x.id}">
      ${x.kind === 'task' ? `<input type="checkbox" class="chk" data-task-chk="${x.id}" ${x.done ? 'checked' : ''} aria-label="Hecha: ${esc(x.title)}">` : `<span class="cxs-ev">${ic('calendar')}</span>`}
      <span class="cxs-rt">${esc(x.title)}${x.kind === 'task' && pri.has(fold(x.title)) ? ' <span class="cxs-star" title="Prioridad">★</span>' : ''}</span>
      <span class="cxs-time">${x.s != null ? esc(tHM(x.s)) : ''}</span></div>`;
    const list = $('#cxsList');
    list.innerHTML = (rows.length ? `<p class="cxs-h">Tu día</p><div class="cxs-rows">${rows.map(row).join('')}</div>` : '')
      + (doneRows.length ? `<details class="cxs-done"><summary>${ic('check')} ${plural(doneRows.length, 'hecha', 'hechas')}</summary><div class="cxs-rows">${doneRows.map(row).join('')}</div></details>` : '');
    list.querySelectorAll('.cxs-row').forEach(r => r.addEventListener('click', (e) => {
      if (e.target.closest('input')) return;
      const [k, id] = r.dataset.sid.split(':');
      if (k === 'task') openTaskPlan(id); else openEventSheet(id);
    }));
    // Un vistazo a mañana
    const tmk = addDaysKey(1);
    const tom = simpleItems(tmk).filter(x => !x.done).sort((a, c) => (a.s ?? 9999) - (c.s ?? 9999)).slice(0, 3);
    if (tom.length) list.innerHTML += `<p class="cxs-h" style="margin-top:1rem">Mañana</p><div class="cxs-rows cxs-tom">${tom.map(row).join('')}</div>`;
    list.querySelectorAll('.cxs-tom .cxs-row').forEach(r => r.addEventListener('click', (e) => { if (e.target.closest('input')) return; const [k, id] = r.dataset.sid.split(':'); if (k === 'task') openTaskPlan(id); else openEventSheet(id); }));
    // Hábitos de hoy, en una línea
    const hb = $('#cxsHabits');
    hb.innerHTML = habits.length ? `<p class="cxs-h">Hábitos</p><div class="cx-wrap">${habits.map(h => `<button type="button" class="cxs-habit ${h.days[tk] ? 'on' : ''}" data-hid="${h.id}">${h.days[tk] ? '✓ ' : ''}${esc(h.name)}${streak(h) > 1 ? ` · 🔥${streak(h)}` : ''}</button>`).join('')}</div>` : '';
    hb.querySelectorAll('[data-hid]').forEach(bt => bt.onclick = () => { toggleHabit(bt.dataset.hid, tk); renderSimpleHoy(); });
  }

  function renderSimpleHub(hub) {
    const pend = reminders.filter(r => !r.done).length;
    const plugs = Object.values(coach.plugins).filter(p => p && p.on).length + (pushState().on ? 1 : 0);
    const item = (x) => `<button type="button" class="cxs-item" ${x.go ? `data-view-go="${x.go}"` : x.sheet ? `data-open-sheet="${x.sheet}"` : `data-cx-act="${x.act}"`}><span class="tile tile-sm" style="--h: var(${x.hue})">${ic(x.icon)}</span><span class="grow"><b>${esc(x.t)}</b>${x.d ? `<small>${esc(x.d)}</small>` : ''}</span>${x.badge ? `<span class="chip">${esc(String(x.badge))}</span>` : ''}${ic('chevron')}</button>`;
    const group = (title, list) => `<p class="cxs-h">${esc(title)}</p><div class="cxs-group">${list.map(item).join('')}</div>`;
    hub.innerHTML = group('Herramientas', [
      { go: 'notas', icon: 'note', hue: '--h-notes', t: 'Notas' },
      { go: 'recordatorios', icon: 'bell', hue: '--h-goals', t: 'Recordatorios', badge: pend || '' },
      { go: 'enfoque', icon: 'timer', hue: '--h-focus', t: 'Enfoque', d: 'Temporizador para concentrarte' },
      { sheet: 'aiSheet', icon: 'chat', hue: '--h-tasks', t: 'Chat con Dilex' },
    ]) + group('Conectar', [
      { go: 'conexiones', icon: 'plug', hue: '--h-files', t: 'Conexiones y avisos', d: 'Calendario, correo, WhatsApp y notificaciones', badge: plugs ? `${plugs} activas` : '' },
    ]) + group('Ajustes', [
      { act: 'params', icon: 'wand', hue: '--h-plan', t: 'Mis reglas', d: 'Horario y qué tanto insisto' },
      { sheet: 'themeSheet', icon: 'sliders', hue: '--accent', t: 'Ajustes', d: 'Voz, colores, perfil y PIN' },
      { sheet: 'backupSheet', icon: 'shield', hue: '--h-dl', t: 'Respaldo' },
    ]) + `<details class="cxs-more"><summary>Más opciones</summary><div class="cxs-group">${[
      { go: 'analizador', icon: 'search', hue: '--h-stats', t: 'Analizador de archivos' },
      { go: 'descargas', icon: 'download', hue: '--h-dl', t: 'Descargas (PDF, Excel)' },
      { act: 'voiceHelp', icon: 'mic', hue: '--accent', t: 'Comandos de voz' },
      { sheet: 'installSheet', icon: 'phone', hue: '--accent', t: 'Instalar' },
      { act: 'wizard', icon: 'question', hue: '--h-focus', t: 'Repetir diagnóstico' },
      { act: 'fullMode', icon: 'layers', hue: '--n500', t: 'Vista completa', d: 'Todas las secciones y botones' },
    ].map(item).join('')}</div></details>`;
  }

  /* =====================================================================
     PILOTO AUTOMÁTICO: cada 20 minutos (y al abrir) DLX revisa tu día
     sin que se lo pidas: reacomoda lo que se pasó, ordena lo nuevo,
     prepara mañana en la noche y detecta lo que repites.
  ===================================================================== */
  const AUTO_EVERY = 20 * 60000;
  let lastAuto = 0;
  function autoLog(text) {
    if (!Array.isArray(coach.autoLog)) coach.autoLog = [];
    coach.autoLog.unshift({ at: new Date().toISOString(), text });
    coach.autoLog = coach.autoLog.slice(0, 20);
  }
  function autoOrganize(force, quiet) {
    if (!P().autoSchedule || flow.alive || (window.DilexLock && DilexLock.isLocked())) return;
    if (!force && Date.now() - lastAuto < AUTO_EVERY) return;
    lastAuto = Date.now(); coach.lastAuto = lastAuto;
    const tk = todayKey(), nm = nowM();
    const did = [];
    try {
      // 1) Lo que se pasó y no hiciste: le busco otro hueco hoy
      let moved = 0;
      if (P().autoReslot) tasksOn(tk).forEach(t => {
        if (t.done || !t.time || !t.timeAuto) return;
        if (tMin(t.time) + estDur(t) + 30 > nm) return;
        const ck = coach.checkins[`t:${t.id}:${tk}`];
        if (ck && ck.state === 'answered') return;
        delete t.time; delete t.timeAuto; delete coach.checkins[`t:${t.id}:${tk}`];
        moved++;
      });
      // 2) Ordeno el día si hay algo sin hora o atrasado
      const need = moved || tasksOn(tk).some(t => !t.done && !t.time) || (P().autoMoveOverdue && tasks.some(isOverdue));
      if (need) {
        const r = organizeDay({ silent: true });
        if (moved) did.push(`Reacomodé ${plural(moved, 'tarea que se pasó', 'tareas que se pasaron')}`);
        if (r.moved) did.push(`pasé ${plural(r.moved, 'atrasada', 'atrasadas')} a hoy`);
        const nueva = r.scheduled.length - moved;
        if (nueva > 0) did.push(`le puse hora a ${plural(nueva, 'tarea nueva', 'tareas nuevas')}`);
      }
      // 3) En la noche dejo listo mañana
      const tmk = addDaysKey(1);
      if (P().autoTomorrow && nm >= (tMin(P().closeTime) ?? 1260) && coach.tomorrowReady !== tmk && tasksOn(tmk).some(t => !t.done && !t.time)) {
        const r2 = organizeDay({ day: tmk, moveOverdue: false, plan: false });
        coach.tomorrowReady = tmk;
        if (r2.scheduled.length) {
          const first = r2.scheduled.slice().sort((a, b) => tMin(a.time) - tMin(b.time))[0];
          did.push(`preparé mañana: empiezas con "${first.text}" a las ${hm12(first.time)}`);
        }
      }
      // 4) Lo que repites
      if (P().autoRepeatSuggest && !did.length) suggestRepeats();
    } catch (e) { console.warn('auto', e); }
    if (did.length) {
      const txt = cap(listJoin(did)) + '.';
      autoLog(txt);
      if (!quiet && !document.hidden && !$$('.sheet.open').length) toast(`🤖 ${txt}`, 'info', undoAction());
    }
    saveCoach();
    if (SIMPLE) renderAutoBar();
  }
  function suggestRepeats() {
    if (!isObj(coach.repeatAsked)) coach.repeatAsked = {};
    const since = Date.now() - 21 * 86400000, groups = {};
    tasks.forEach(t => {
      if (t.repeat || t.repeatOf || Date.parse(t.createdAt) < since) return;
      const k = fold(t.text).replace(/[^a-z0-9ñ ]/g, '').trim();
      if (k.length < 3) return;
      (groups[k] = groups[k] || []).push(t);
    });
    const hit = Object.entries(groups).find(([k, l]) => l.length >= 3 && !coach.repeatAsked[k] && new Set(l.map(t => t.due || dayKey(t.createdAt))).size >= 3);
    if (!hit) return;
    const [k, list] = hit;
    coach.repeatAsked[k] = todayKey();
    const days = new Set(list.map(t => keyToDate(t.due || dayKey(t.createdAt)).getDay()));
    const kind = days.size <= 1 ? 'weekly' : [...days].every(d => d >= 1 && d <= 5) ? 'weekdays' : 'daily';
    const latest = list.filter(t => !t.done).sort((a, b) => (a.due || '').localeCompare(b.due || ''))[0] || list[0];
    autoLog(`Noté que añades "${latest.text}" seguido; te propuse repetirla ${REPEAT[kind].toLowerCase()}.`);
    toast(`Añades "${latest.text}" seguido. ¿La hago automática (${REPEAT[kind].toLowerCase()})?`, 'info', { label: 'Sí', fn: () => {
      let t = latest;
      if (t.done) { t = A.addTask({ text: t.text, due: nextRepeatDate(Object.assign({}, t, { repeat: kind })), priority: t.priority, durMin: t.durMin, area: t.area }); }
      t.repeat = kind; saveTasks(); onTasksChanged(); schedulePushSync();
      autoLog(`"${t.text}" ahora se repite ${REPEAT[kind].toLowerCase()}.`); saveCoach();
      toast('Listo. Ya no tienes que añadirla cada vez.', 'ok');
    } });
  }
  const agoText = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
  function renderAutoBar() {
    const box = $('#cxAutoBar'); if (!box) return;
    const on = !!P().autoSchedule;
    const last = coach.lastAuto || lastAuto;
    const nextIn = last ? Math.max(1, Math.round((last + AUTO_EVERY - Date.now()) / 60000)) : null;
    const log = Array.isArray(coach.autoLog) ? coach.autoLog : [];
    const openLog = box.querySelector('details[data-k="log"]')?.open, openDay = box.querySelector('details[data-k="day"]')?.open;
    const dk = planDay, rel = daysBetween(todayKey(), dk);
    box.innerHTML = `<div class="cxp-autohead"><span class="cxp-bot ${on ? 'on' : ''}">🤖</span>
        <div class="flex-1 min-w-0"><p class="cx-b">Piloto automático ${on ? '<span class="cx-on">activo</span>' : '<span class="cx-muted cx-small">pausado</span>'}</p>
        <p class="cx-small cx-muted">${on ? `Reviso tu día cada 20 min${last ? ` · última vez ${agoText(Date.now() - last)} · próxima en ${nextIn} min` : ''}` : 'Actívalo y ordeno tu día sin que me lo pidas'}</p></div>
        <input type="checkbox" class="cx-switch" id="cxAutoOn" ${on ? 'checked' : ''} aria-label="Piloto automático"></div>
      <div class="cx-wrap mt-3"><button type="button" class="btn btn-sm btn-accent" id="cxAutoNow">${ic('wand')}Organizar ahora</button><button type="button" class="btn btn-sm" data-panel-go="plan/reglas">${ic('sliders')}Qué hace solo</button></div>
      <details class="cxs-more mt-2" data-k="log" ${openLog ? 'open' : ''}><summary>Lo que hice solo (${log.length})</summary>${log.length ? `<div class="cx-list">${log.slice(0, 8).map(l => `<div class="cx-li"><span class="cx-small cx-muted" style="flex:none;width:4.5rem">${esc(new Date(l.at).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' }))}${dayKey(l.at) !== todayKey() ? `<br>${esc(shortDate(dayKey(l.at)))}` : ''}</span><p class="grow cx-small">${esc(l.text)}</p></div>`).join('')}</div>` : '<p class="hint cx-small">Todavía nada. Cuando ordene algo por mi cuenta, lo verás aquí.</p>'}</details>
      <details class="cxs-more" data-k="day" ${openDay ? 'open' : ''}><summary>Mi día completo, con rutinas</summary>
        <div class="cx-row" style="gap:.35rem;margin-bottom:.5rem"><button type="button" class="icon-btn" data-pday2="-1" aria-label="Día anterior">${ic('chevron').replace('<svg ', '<svg style="transform:rotate(90deg)" ')}</button><b class="text-[.95rem]">${esc(rel === 0 ? 'Hoy' : rel === 1 ? 'Mañana' : rel === -1 ? 'Ayer' : keyToDate(dk).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }))}</b><button type="button" class="icon-btn" data-pday2="1" aria-label="Día siguiente">${ic('chevron').replace('<svg ', '<svg style="transform:rotate(-90deg)" ')}</button></div>
        ${timelineHTML(dk)}</details>`;
    box.querySelector('#cxAutoOn').onchange = (e) => { P().autoSchedule = e.target.checked; saveCoach(); if (e.target.checked) autoOrganize(true); renderAutoBar(); };
    box.querySelector('#cxAutoNow').onclick = () => { autoOrganize(true); const t = coach.autoLog && coach.autoLog[0]; if (!t || Date.now() - Date.parse(t.at) > 5000) toast('Revisé tu día: ya estaba en orden.', 'ok'); };
    box.querySelectorAll('[data-pday2]').forEach(b => b.onclick = () => { planDay = addDaysFrom(planDay, +b.dataset.pday2); renderAutoBar(); });
  }
  function setSimpleMode(on) {
    P().simple = !!on; saveCoach();
    ui.cxPanels = {}; saveUI();
    toast(on ? 'Vista simple activada.' : 'Vista completa activada.', 'ok');
    setTimeout(() => location.reload(), 500);
  }

  function viewOfEl(el) { const v = el && el.closest && el.closest('.cx-view'); return v ? v.dataset.view : null; }
  function panelOfEl(el) { const p = el && el.closest && el.closest('.cx-panel'); return p ? p.dataset.panel : null; }
  function onPanelShown(v, p) {
    if (v === 'progreso') requestAnimationFrame(() => { if (p === 'graficas') { try { Object.values(charts).forEach(c => c.resize()); } catch { /* sin gráficas */ } } else renderWeek(); });
    if (v === 'plan') { if (p === 'miplan' || p === 'mesano' || p === 'reglas') renderCoachPlan(); if (p === 'agenda') { try { renderAgenda(); } catch { /* agenda */ } if (SIMPLE) renderAutoBar(); } }
    if (v === 'hoy' && p === 'midia') renderDayCard();
    if (v === 'hoy' && p === 'inicio') renderSimpleHoy();
    if (v === 'recordatorios') renderReminders();
    if (v === 'conexiones') renderPlugins();
    if (v === 'mas') { renderHub(); renderAccountBox(); }
  }
  function showPanel(v, p, opts = {}) {
    const list = panelsOf(v);
    if (!list.some(x => x[0] === p)) p = list[0][0];
    const vEl = viewEl(v); if (!vEl) return;
    const changed = curPanel[v] !== p;
    curPanel[v] = p;
    ui.cxPanels = Object.assign({}, ui.cxPanels, { [v]: p }); saveUI();
    vEl.querySelectorAll('.cx-panel').forEach(el => {
      const on = el.dataset.panel === p; el.hidden = !on;
      if (on && changed && !motionMin()) { el.classList.remove('enter', 'from-l', 'from-r'); void el.offsetWidth; el.classList.add('enter', opts.dir === 'l' ? 'from-l' : 'from-r'); }
    });
    vEl.querySelectorAll('[data-panel-go]').forEach(b => { const on = b.dataset.panelGo === `${v}/${p}`; b.setAttribute('aria-selected', String(on)); if (on && changed) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: motionMin() ? 'auto' : 'smooth' }); });
    if (!opts.keepScroll) { const body = vEl.querySelector('.cx-vbody'); if (body) body.scrollTop = 0; }
    if (v === curView && !opts.noHash) { try { history.replaceState(null, '', `#${v}${list.length > 1 ? '/' + p : ''}`); } catch { /* sin historial */ } }
    onPanelShown(v, p);
  }
  function showView(v, opts = {}) {
    if (SIMPLE) {
      if (v === 'plan' && opts.panel === 'miplan') opts = Object.assign({}, opts, { panel: { dia: 'agenda', mes: 'mesano', anio: 'mesano', diag: 'reglas', params: 'reglas' }[planTab] || 'mesano' });
      const k = SIMPLE_ALIAS[`${v}/${opts.panel || ''}`]; if (k) { const [a, b] = k.split('/'); v = a; opts = Object.assign({}, opts, { panel: b }); }
    }
    if (!VIEW_DEF[v]) v = 'hoy';
    const changed = v !== curView;
    curView = v;
    $$('.cx-view').forEach(el => { const on = el.dataset.view === v; el.hidden = !on; if (on && changed && !motionMin()) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); } });
    const navKey = VIEW_DEF[v].parent || v;
    $$('[data-view-go]').forEach(a => a.classList.toggle('on', a.dataset.viewGo === v || (!!a.closest('.cx-nav5') && a.dataset.viewGo === navKey)));
    showPanel(v, opts.panel || curPanel[v], { keepScroll: opts.keepScroll, noHash: true });
    if (!opts.noHash) { const list = panelsOf(v); try { history.replaceState(null, '', `#${v}${list.length > 1 ? '/' + curPanel[v] : ''}`); } catch { /* sin historial */ } }
  }
  function revealEl(el) {
    const v = viewOfEl(el), p = panelOfEl(el);
    if (!v) return false;
    if (v !== curView) showView(v, { panel: p, keepScroll: true });
    else if (p && p !== curPanel[v]) showPanel(v, p, { keepScroll: true });
    return true;
  }
  const _siv = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (o) {
    const v = viewOfEl(this), p = panelOfEl(this);
    if (v && (v !== curView || (p && p !== curPanel[v]))) { revealEl(this); const el = this; requestAnimationFrame(() => _siv.call(el, o)); return; }
    return _siv.call(this, o);
  };
  function goHash(h, smooth = true) {
    const id = String(h || '').replace(/^#/, '');
    if (!id) return false;
    const [v, p] = id.split('/');
    if (VIEW_DEF[v]) { showView(v, { panel: p }); return true; }
    const el = document.getElementById(id);
    if (!el) return false;
    const at = SECTION_AT[id];
    if (viewOfEl(el)) revealEl(el); else if (at) showView(at[0], { panel: at[1] });
    requestAnimationFrame(() => _siv.call(el, { behavior: smooth ? 'smooth' : 'auto', block: 'start' }));
    return true;
  }
  /** Ir a una sección por nombre (la usan los botones y la voz). */
  function goTo(v, p) { closeSheets(); showView(v, { panel: p }); }
  document.addEventListener('click', (e) => {
    const pg = e.target.closest('[data-panel-go]');
    if (pg) { e.preventDefault(); const [v, p] = pg.dataset.panelGo.split('/'); const list = panelsOf(v).map(x => x[0]); showPanel(v, p, { dir: list.indexOf(p) < list.indexOf(curPanel[v]) ? 'l' : 'r' }); return; }
    const g = e.target.closest('[data-view-go]');
    if (g) { e.preventDefault(); closeSheets(); showView(g.dataset.viewGo); return; }
    const a = e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1 && !a.hasAttribute('download')) {
      if (goHash(a.getAttribute('href'))) { e.preventDefault(); if (a.hasAttribute('data-close-sheet')) closeSheets(); }
    }
    const act = e.target.closest('[data-cx-act]');
    if (act) { e.preventDefault(); coachAction(act.dataset.cxAct, act); }
  }, true);
  window.addEventListener('hashchange', () => goHash(location.hash, false));

  /* Deslizar de lado para cambiar de pestaña, como en una app */
  function initSwipe() {
    let x0 = null, y0 = 0, t0 = 0, skip = false;
    const main = $('main');
    main.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      skip = !!e.target.closest('input, textarea, select, canvas, .tabs, .cx-ptabs, .cx-months, table, .overflow-x-auto, [contenteditable], .cx-noswipe');
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
    }, { passive: true });
    main.addEventListener('touchend', (e) => {
      if (x0 == null || skip) { x0 = null; return; }
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - t0 > 600) return;
      const list = panelsOf(curView).map(x => x[0]), i = list.indexOf(curPanel[curView]);
      const j = i + (dx < 0 ? 1 : -1);
      if (j >= 0 && j < list.length) showPanel(curView, list[j], { dir: dx < 0 ? 'r' : 'l' });
    }, { passive: true });
  }

  function coachAction(what, el) {
    closeSheets();
    if (what === 'params') openPlanTab('params');
    else if (what === 'wizard') runWizard({ again: true });
    else if (what === 'organize') organizeDayUI();
    else if (what === 'morning') runMorningQuiz(true);
    else if (what === 'evening') runEveningQuiz(true);
    else if (what === 'voiceAdd') voiceAdd();
    else if (what === 'capture') { if (SIMPLE && $('#cxsInput')) { showView('hoy'); setTimeout(() => $('#cxsInput').focus(), 80); } else openCapture(); }
    else if (what === 'fullMode') setSimpleMode(false);
    else if (what === 'simpleMode') setSimpleMode(true);
    else if (what === 'captureVoice') openCapture('', true);
    else if (what === 'voice') voiceCmd();
    else if (what === 'voiceHelp') voiceCmd({ help: true });
    else if (what === 'push') enablePush();
    else if (what === 'lock') window.DilexLock && DilexLock.lockNow();
  }

  /* =====================================================================
     CUESTIONARIOS: motor común (wizard, mañana, cierre del día)
     Cada paso: { id, kicker, q, sub, type: 'single'|'multi'|'text'|'time'|
     'info'|'emoji'|'pin', options, value, skip(), next(answer) }.
     Se responde tocando o por voz.
  ===================================================================== */
  const flow = { steps: [], i: 0, ans: {}, opts: {}, hist: [], recog: null, listening: false, alive: false };
  const CX_ORD = { primera: 0, primero: 0, uno: 0, una: 0, '1': 0, segunda: 1, segundo: 1, dos: 1, '2': 1, tercera: 2, tercero: 2, tres: 2, '3': 2, cuarta: 3, cuarto: 3, cuatro: 3, '4': 3, quinta: 4, quinto: 4, cinco: 4, '5': 4, sexta: 5, seis: 5, '6': 5, septima: 6, siete: 6, '7': 6 };
  const CX_STOP = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'a', 'en', 'un', 'una', 'me', 'mi', 'lo', 'es', 'por', 'con', 'se', 'no', 'si', 'al', 'o', 'mas', 'muy', 'pero', 'como', 'para', 'su', 'yo', 'te', 'le']);
  const cxToks = (s) => fold(s).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(w => w && !CX_STOP.has(w));

  function matchOption(text, options) {
    const f = fold(text).replace(/[.,!?¡¿]/g, ' ').trim();
    if (!f || !options.length) return null;
    const om = /\b(?:opcion|numero|la|el)?\s*(primera|primero|segunda|segundo|tercera|tercero|cuarta|cuarto|quinta|quinto|sexta|septima|uno|dos|tres|cuatro|cinco|seis|siete|[1-7])\b/.exec(f);
    if (om && (/^(opcion|numero|la |el )/.test(f) || f.split(/\s+/).length <= 2) && CX_ORD[om[1]] != null && options[CX_ORD[om[1]]]) return options[CX_ORD[om[1]]];
    let best = null, bestS = 0;
    const words = new Set(cxToks(f));
    for (const o of options) {
      const keys = [o.label, ...(o.syn || [])];
      let s = 0;
      for (const k of keys) {
        const kf = fold(k);
        if (kf && (f === kf || f.includes(kf) && kf.length > 3)) s = Math.max(s, 10 + kf.length / 10);
        const kt = cxToks(k);
        if (kt.length) {
          const hit = kt.filter(w => words.has(w) || [...words].some(x => x.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length;
          s = Math.max(s, (hit / kt.length) * 6 + hit);
        }
      }
      if (s > bestS) { bestS = s; best = o; }
    }
    if (bestS >= 3) return best;
    if (YES_RE.test(f) || /^(si|claro|ya|listo|hecho|lo hice|ya lo hice)\b/.test(f)) return options.find(o => o.yes) || null;
    if (NO_RE.test(f) || /^no\b/.test(f)) return options.find(o => o.no) || null;
    return null;
  }

  function flowShell() {
    let el = $('#cxFlow');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'cxFlow';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="cx-fhead"><button type="button" class="icon-btn" id="cxFBack" aria-label="Atrás">${ic('chevron').replace('<svg ', '<svg style="transform:rotate(90deg)" ')}</button>
      <div class="cx-fbar"><i id="cxFBar"></i></div>
      <button type="button" class="cx-vtoggle" id="cxFVoice" title="Responder por voz">${ic('mic')}<span>Voz</span></button>
      <button type="button" class="icon-btn" id="cxFClose" aria-label="Cerrar">${ic('x')}</button></div>
      <div class="cx-fbody" id="cxFBody"></div>
      <div class="cx-ffoot" id="cxFFoot"></div>`;
    document.body.appendChild(el);
    el.querySelector('#cxFClose').onclick = () => flowClose(true);
    el.querySelector('#cxFBack').onclick = () => flowBack();
    el.querySelector('#cxFVoice').onclick = () => { coach.voiceAnswers = !coach.voiceAnswers; saveCoach(); paintVoiceToggle(); if (coach.voiceAnswers) { flowSpeak(true); } else { flowStopListen(); stopSpeaking(); } };
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); flowClose(true); }
      const st = flow.steps[flow.i];
      if (st && (st.type === 'single') && /^[1-9]$/.test(e.key) && !isTyping(document.activeElement)) { const o = flowOptions(st)[+e.key - 1]; if (o) flowPick(o); }
    });
    return el;
  }
  const paintVoiceToggle = () => { const b = $('#cxFVoice'); if (b) { b.classList.toggle('on', !!coach.voiceAnswers); b.style.display = !SR && !canSpeak ? 'none' : ''; } };
  const flowOptions = (st) => (typeof st.options === 'function' ? st.options(flow.ans) : st.options || []);

  function runFlow(steps, opts = {}) {
    flowStopListen();
    Object.assign(flow, { steps, i: 0, ans: opts.ans || {}, opts, hist: [], alive: true });
    const el = flowShell();
    el.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    paintVoiceToggle();
    flowGo(0, true);
    return new Promise(res => { flow.resolve = res; });
  }
  function flowClose(cancel) {
    if (!flow.alive) return;
    if (cancel && flow.opts.confirmClose && !confirm(flow.opts.confirmClose)) return;
    flowStopListen(); stopSpeaking();
    flow.alive = false;
    $('#cxFlow')?.classList.remove('open');
    document.documentElement.style.overflow = '';
    if (cancel && flow.opts.onCancel) flow.opts.onCancel(flow.ans);
    if (flow.resolve) flow.resolve(cancel ? null : flow.ans);
  }
  function flowBack() {
    if (!flow.hist.length) { flowClose(true); return; }
    flowStopListen(); stopSpeaking();
    flowGo(flow.hist.pop(), false, true);
  }
  function flowGo(i, first, back) {
    while (i < flow.steps.length && flow.steps[i].skip && flow.steps[i].skip(flow.ans)) i++;
    if (i >= flow.steps.length) { flowClose(false); if (flow.opts.onDone) flow.opts.onDone(flow.ans); return; }
    if (!first && !back) flow.hist.push(flow.i);
    flow.i = i;
    renderStep();
  }
  function flowNext(stepId) {
    flowStopListen();
    const st = flow.steps[flow.i];
    let to = flow.i + 1;
    const n = st.next ? st.next(flow.ans[st.id], flow.ans) : null;
    if (typeof n === 'string') { const j = flow.steps.findIndex(s => s.id === n); if (j >= 0) to = j; }
    if (n === 'end') to = flow.steps.length;
    void stepId;
    flowGo(to);
  }
  function stepText(st, key) { const v = st[key]; return typeof v === 'function' ? v(flow.ans) : (v || ''); }

  function renderStep() {
    const st = flow.steps[flow.i];
    const body = $('#cxFBody'), foot = $('#cxFFoot');
    const total = flow.steps.filter(s => !(s.skip && s.skip(flow.ans))).length || 1;
    const pos = flow.steps.slice(0, flow.i).filter(s => !(s.skip && s.skip(flow.ans))).length;
    $('#cxFBar').style.width = `${Math.round(((pos + (st.type === 'done' ? 1 : 0)) / total) * 100)}%`;
    $('#cxFBack').style.visibility = flow.hist.length ? 'visible' : 'hidden';
    const val = flow.ans[st.id];
    const q = stepText(st, 'q'), sub = stepText(st, 'sub'), kicker = stepText(st, 'kicker') || flow.opts.kicker || '';
    let html = `${st.type === 'done' ? `<div class="cx-done-ico">${ic('check')}</div>` : ''}${kicker ? `<p class="cx-kicker">${esc(kicker)}</p>` : ''}<h2 class="cx-qt">${esc(q)}</h2>${sub ? `<p class="cx-qs">${esc(sub)}</p>` : ''}`;
    const opts = flowOptions(st);
    if (st.type === 'single' || st.type === 'multi') {
      const two = st.cols === 2;
      html += `<div class="cx-opts ${two ? 'two' : ''}">${opts.map((o, k) => {
        const sel = st.type === 'multi' ? arr(val).includes(o.id) : val === o.id;
        return `<button type="button" class="cx-opt ${two ? 'two' : ''} ${sel ? 'sel' : ''}" data-o="${esc(o.id)}">${o.em ? `<span class="em">${o.em}</span>` : ''}<span class="min-w-0">${esc(o.label)}${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span>${!two && k < 9 ? `<span class="k">${k + 1}</span>` : ''}</button>`;
      }).join('')}</div>`;
      if (st.custom) html += `<div class="mt-3" id="cxCustom">${st.custom(flow.ans)}</div>`;
    } else if (st.type === 'emoji') {
      html += `<div class="cx-emo">${opts.map(o => `<button type="button" data-o="${esc(o.id)}" class="${val === o.id ? 'sel' : ''}">${o.em}<small>${esc(o.label)}</small></button>`).join('')}</div>`;
    } else if (st.type === 'text') {
      html += `<textarea id="cxFText" class="input w-full mt-5 cx-big" rows="${st.rows || 2}" maxlength="${st.max || 160}" placeholder="${esc(st.placeholder || 'Escribe o dilo por voz')}">${esc(val || '')}</textarea>`;
      if (st.chips) html += `<div class="cx-wrap mt-3">${st.chips.map(c => `<button type="button" class="cx-chipsel" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    } else if (st.type === 'time') {
      html += `<input id="cxFTime" type="time" class="input mt-5 cx-big" value="${esc(val || st.def || '')}" />`;
      if (opts.length) html += `<div class="cx-wrap mt-3">${opts.map(o => `<button type="button" class="cx-chipsel ${val === o.id ? 'sel' : ''}" data-o="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>`;
    } else if (st.type === 'pin') {
      html += `<div class="cx-pin" id="cxPin">${[0, 1, 2, 3].map(i => `<input inputmode="numeric" maxlength="1" data-p="${i}" aria-label="Número ${i + 1}" autocomplete="off" />`).join('')}</div><p class="hint mt-3" id="cxPinMsg"></p>`;
    } else if (st.type === 'info' || st.type === 'done') {
      html += st.html ? `<div class="mt-5">${typeof st.html === 'function' ? st.html(flow.ans) : st.html}</div>` : '';
    }
    html += `<p class="cx-heard" id="cxHeard"></p>`;
    body.innerHTML = html;
    body.scrollTop = 0;

    const canVoice = !!SR && st.type !== 'info' && st.type !== 'done' && st.type !== 'pin';
    const primary = st.type === 'multi' ? (st.cta || 'Continuar') : st.type === 'text' || st.type === 'time' ? (st.cta || 'Continuar') : (st.type === 'info' || st.type === 'done') ? (st.cta || 'Continuar') : st.type === 'pin' ? 'Guardar PIN' : null;
    foot.innerHTML = `${canVoice ? `<button type="button" class="cx-mic" id="cxFMic" aria-label="Responder por voz">${ic('mic')}</button>` : ''}
      <div style="flex:1"></div>
      ${st.optional !== false && st.type !== 'done' && st.type !== 'info' ? `<button type="button" class="btn btn-ghost" id="cxFSkip">${esc(st.skipLabel || 'Saltar')}</button>` : ''}
      ${st.alt ? `<button type="button" class="btn" id="cxFAlt">${esc(st.alt.label)}</button>` : ''}
      ${primary ? `<button type="button" class="btn btn-accent cx-big" id="cxFNext">${esc(primary)}</button>` : ''}`;

    body.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { const o = opts.find(x => x.id === b.dataset.o); if (o) flowPick(o, b); });
    body.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { const t = $('#cxFText'); t.value = b.dataset.chip; t.focus(); });
    if (st.mount) st.mount(body, flow.ans);
    const nx = $('#cxFNext');
    if (nx) nx.onclick = () => flowSubmit();
    const sk = $('#cxFSkip');
    if (sk) sk.onclick = () => { delete flow.ans[st.id]; if (st.onSkip) st.onSkip(flow.ans); flowNext(); };
    const al = $('#cxFAlt');
    if (al) al.onclick = () => st.alt.fn(flow.ans);
    const mic = $('#cxFMic');
    if (mic) mic.onclick = () => (flow.listening ? flowStopListen() : flowListen());
    if (st.type === 'text') { const t = $('#cxFText'); t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); flowSubmit(); } }); if (!coach.voiceAnswers && matchMedia('(min-width: 768px)').matches) setTimeout(() => t.focus(), 80); }
    if (st.type === 'pin') mountPin(st);
    if (st.onShow) st.onShow(flow.ans);
    flowSpeak(false);
  }

  function flowPick(o, btn) {
    const st = flow.steps[flow.i];
    if (st.type === 'multi') {
      const cur = new Set(arr(flow.ans[st.id]));
      cur.has(o.id) ? cur.delete(o.id) : cur.add(o.id);
      flow.ans[st.id] = [...cur];
      (btn || $(`#cxFBody [data-o="${CSS.escape(o.id)}"]`))?.classList.toggle('sel', cur.has(o.id));
      return;
    }
    flow.ans[st.id] = o.id;
    $$('#cxFBody [data-o]').forEach(b => b.classList.toggle('sel', b.dataset.o === o.id));
    if (navigator.vibrate) navigator.vibrate(10);
    if (st.type === 'time') { const t = $('#cxFTime'); if (t && /^\d{2}:\d{2}$/.test(o.id)) t.value = o.id; if (o.go === false) return; }
    if (o.fn) o.fn(flow.ans);
    if (st.onAnswer) { const r = st.onAnswer(o.id, flow.ans, o); if (r === false) return; }
    setTimeout(() => flowNext(), 220);
  }
  function flowSubmit() {
    const st = flow.steps[flow.i];
    if (st.type === 'text') {
      const v = $('#cxFText').value.trim();
      if (!v && st.required) { $('#cxFText').focus(); return; }
      if (v) flow.ans[st.id] = v; else delete flow.ans[st.id];
      if (st.onAnswer && st.onAnswer(v, flow.ans) === false) return;
    } else if (st.type === 'time') {
      const v = $('#cxFTime').value;
      if (!/^\d{2}:\d{2}$/.test(v)) { $('#cxFTime').focus(); return; }
      flow.ans[st.id] = v;
      if (st.onAnswer) st.onAnswer(v, flow.ans);
    } else if (st.type === 'multi') {
      if (st.onAnswer) st.onAnswer(arr(flow.ans[st.id]), flow.ans);
    } else if (st.type === 'pin') { submitPin(st); return; }
    else if (st.onAnswer) st.onAnswer(true, flow.ans);
    if (st.type === 'done' || flow.i === flow.steps.length - 1) { flowNext(); return; }
    flowNext();
  }

  function mountPin(st) {
    const ins = $$('#cxPin input');
    ins.forEach((inp, k) => {
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && ins[k + 1]) ins[k + 1].focus(); if (ins.every(x => x.value)) submitPin(st); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && ins[k - 1]) ins[k - 1].focus(); });
    });
    setTimeout(() => ins[0]?.focus(), 120);
  }
  function submitPin(st) {
    const ins = $$('#cxPin input'), pin = ins.map(x => x.value).join('');
    if (!/^\d{4}$/.test(pin)) { $('#cxPinMsg').textContent = 'Escribe los 4 números.'; return; }
    if (!flow._pin1) { flow._pin1 = pin; ins.forEach(x => { x.value = ''; }); ins[0].focus(); $('#cxPinMsg').textContent = 'Repítelo para confirmar.'; return; }
    if (flow._pin1 !== pin) { flow._pin1 = null; ins.forEach(x => { x.value = ''; }); ins[0].focus(); $('#cxPinMsg').textContent = 'No coinciden. Empecemos otra vez.'; return; }
    flow._pin1 = null;
    window.DilexLock.setPin(pin).then(() => { toast('PIN guardado. Te lo pediré al abrir la app.', 'ok'); flow.ans[st.id] = true; flowNext(); }).catch(err => { $('#cxPinMsg').textContent = err.message; });
  }

  /* ---------- Voz dentro del cuestionario ---------- */
  function flowSpeak(force) {
    if (!coach.voiceAnswers && !force) return;
    const st = flow.steps[flow.i];
    if (!st) return;
    const say = st.say ? (typeof st.say === 'function' ? st.say(flow.ans) : st.say) : stepText(st, 'q');
    const opts = flowOptions(st);
    const listOpts = (st.type === 'single' || st.type === 'emoji') && opts.length && opts.length <= 5 && st.readOptions !== false
      ? ' ' + opts.map(o => o.label).join(', o ') + '.' : '';
    stopSpeaking();
    if (canSpeak) speak(say + listOpts, true);
    if (!SR || st.type === 'info' || st.type === 'pin') return;
    const gen = (flow.gen = (flow.gen || 0) + 1);
    const t0 = Date.now();
    const waitThen = () => {
      if (!flow.alive || gen !== flow.gen || !coach.voiceAnswers) return;
      if (isSpeaking() && Date.now() - t0 < 25000) { setTimeout(waitThen, 180); return; }
      if (st.type !== 'done') flowListen();
    };
    setTimeout(waitThen, 400);
  }
  function flowListen() {
    if (!SR) { toast('Este navegador no permite dictar. Prueba con Chrome.', 'warn'); return; }
    flowStopListen(); stopSpeaking();
    const st = flow.steps[flow.i];
    const r = new SR();
    r.lang = /^es/i.test(navigator.language || '') ? navigator.language : 'es-ES';
    r.interimResults = true; r.continuous = false; r.maxAlternatives = 3;
    let fin = '', mid = '', alts = [];
    const heard = $('#cxHeard');
    r.onstart = () => { flow.listening = true; $('#cxFMic')?.classList.add('on'); if (heard) heard.textContent = 'Te escucho…'; };
    r.onresult = (e) => {
      fin = ''; mid = ''; alts = [];
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) { fin += e.results[i][0].transcript; for (let k = 1; k < e.results[i].length; k++) alts.push(e.results[i][k].transcript); }
        else mid += e.results[i][0].transcript;
      }
      if (heard) heard.textContent = `"${(fin + ' ' + mid).trim()}"`;
    };
    r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('No tengo permiso para el micrófono.', 'warn'); coach.voiceAnswers = false; saveCoach(); paintVoiceToggle(); } else if (e.error === 'network') toast('Para entender tu voz necesito internet.', 'warn'); };
    r.onend = () => {
      flow.listening = false; $('#cxFMic')?.classList.remove('on');
      if (flow.recog !== r) return;
      flow.recog = null;
      const text = (fin || mid).trim();
      if (!text) { if (heard && heard.textContent === 'Te escucho…') heard.textContent = ''; return; }
      voiceAnswer(st, text, alts);
    };
    flow.recog = r;
    try { r.start(); } catch { /* ya activo */ }
  }
  function flowStopListen() { const r = flow.recog; flow.recog = null; flow.listening = false; $('#cxFMic')?.classList.remove('on'); if (r) { try { r.abort(); } catch { /* ya detenido */ } } }

  function voiceAnswer(st, text, alts = []) {
    if (!flow.alive || flow.steps[flow.i] !== st) return;
    const f = fold(text);
    if (/^(atras|volver|regresa|anterior)\b/.test(f)) { flowBack(); return; }
    if (/^(salta(r)?|siguiente|paso|omite|no se|ninguna?)\b/.test(f) && st.optional !== false && st.type !== 'text') { delete flow.ans[st.id]; flowNext(); return; }
    if (/^(cierra|salir|termina|cancelar?)\b/.test(f)) { flowClose(true); return; }
    if (st.type === 'text') {
      const t = $('#cxFText'); if (t) t.value = cap(text);
      if (st.voiceAppend && f !== 'nada' && !/^(nada|eso es todo|ya esta|ninguna)/.test(f)) { flowSubmit(); return; }
      if (/^(nada|eso es todo|ya esta|ninguna|no)$/.test(f)) { if (t) t.value = ''; }
      flowSubmit(); return;
    }
    if (st.type === 'time') {
      const g = pair('a las ' + text.replace(/^a las\s+/i, ''));
      const c = takeTime(g);
      if (c && typeof c === 'object') { const v = `${pad2(c.h)}:${pad2(c.min)}`; $('#cxFTime').value = v; flow.ans[st.id] = v; if (st.onAnswer) st.onAnswer(v, flow.ans); flowNext(); return; }
    }
    const opts = flowOptions(st);
    if (st.type === 'multi') {
      if (/^(listo|continua|continuar|eso es todo|ya esta|nada mas)$/.test(f)) { flowSubmit(); return; }
      const parts = text.split(/,|\by\b|\btambien\b|\badem[aá]s\b/i).map(s => s.trim()).filter(Boolean);
      let any = false;
      parts.forEach(p => { const o = matchOption(p, opts); if (o && !arr(flow.ans[st.id]).includes(o.id)) { flowPick(o); any = true; } });
      if (any) { const h = $('#cxHeard'); if (h) h.textContent = 'Anotado. Di "listo" para seguir o añade más.'; setTimeout(() => { if (coach.voiceAnswers && flow.alive && flow.steps[flow.i] === st) flowListen(); }, 900); return; }
    } else {
      let o = matchOption(text, opts);
      for (const a of alts) { if (o) break; o = matchOption(a, opts); }
      if (o) {
        const b = $(`#cxFBody [data-o="${CSS.escape(o.id)}"]`);
        if (b) { b.classList.add('heard'); }
        flowPick(o, b); return;
      }
      if (st.freeVoice) { st.freeVoice(text, flow.ans); return; }
    }
    const h = $('#cxHeard');
    if (h) h.textContent = `No entendí "${text}". Toca una opción o di su número.`;
    if (coach.voiceAnswers && canSpeak) { speak('No te entendí. Puedes decir el número de la opción.', true); setTimeout(() => { const t0 = Date.now(); const w = () => { if (!flow.alive || flow.steps[flow.i] !== st) return; if (isSpeaking() && Date.now() - t0 < 8000) return setTimeout(w, 200); flowListen(); }; w(); }, 300); }
  }

  /* =====================================================================
     DIAGNÓSTICO: qué te frena más
  ===================================================================== */
  const PROBLEMS = {
    procrastinacion: {
      name: 'Procrastinación', em: '⏳', hue: '--h-focus',
      short: 'Sabes lo que tienes que hacer, pero lo dejas para después.',
      why: 'Tu cerebro esquiva lo que se siente pesado o incierto y busca algo más cómodo. No es pereza: es evitar una molestia. La salida es hacer que empezar cueste muy poco.',
      plan: ['Regla de los 5 minutos: solo te pido arrancar; casi siempre sigues.', 'Cada tarea grande se parte en pasos de 25 minutos o menos.', 'Lo más pesado va en tu hora de más energía, antes que lo divertido.', 'Te pregunto cuando toca cada tarea, así no se escapa.'],
      habits: ['Lo difícil antes del mediodía', '5 minutos de arranque sin celular'],
      tips: ['Solo cinco minutos. Si después quieres parar, paras.', '¿Cuál es el paso más pequeño que puedes hacer ahora mismo?', 'Hecho es mejor que perfecto. Empieza feo y mejóralo luego.', 'Deja el celular en otra habitación los próximos 25 minutos.'],
    },
    disciplina: {
      name: 'Falta de disciplina', em: '🧱', hue: '--h-tasks',
      short: 'Empiezas con fuerza, pero te cuesta ser constante.',
      why: 'La constancia no depende de las ganas, depende de rutinas fijas y de que alguien te pida cuentas. Eso voy a hacer yo: horarios fijos, rachas y preguntas insistentes.',
      plan: ['Las mismas actividades a la misma hora, todos los días.', 'Rachas visibles: no rompas la cadena.', 'Te pido cuentas al final de cada tarea y en el cierre del día.', 'Si quieres, compartes tu avance con alguien de confianza.'],
      habits: ['Revisar mi plan al despertar', 'Hacer el cierre del día con Dilex'],
      tips: ['No tienes que tener ganas, solo tienes que empezar a la hora acordada.', 'Hoy cuenta. Un día más en tu racha.', 'La disciplina es elegir lo que quieres más sobre lo que quieres ahora.', 'Haz lo mínimo hoy, pero hazlo.'],
    },
    motivacion: {
      name: 'Falta de motivación', em: '🔋', hue: '--h-goals',
      short: 'Te cuesta encontrar ganas y sentido a lo que haces.',
      why: 'La motivación aparece después de avanzar, no antes. Necesitas ver progreso pequeño cada día y recordar para qué lo haces.',
      plan: ['Cada mañana te recuerdo tu meta grande y por qué importa.', 'Victorias pequeñas y visibles: celebramos cada tarea.', 'Empezamos el día con algo fácil para ganar impulso.', 'Revisamos tu energía y ajustamos el día a cómo te sientes.'],
      habits: ['Leer mi meta del año', 'Anotar un logro del día'],
      tips: ['Recuerda para qué lo haces. Cada tarea te acerca a tu meta.', 'Gana una pequeña ahora: termina algo fácil y el resto se hace más ligero.', 'No esperes las ganas: actúa y las ganas llegan.', 'Mira lo que ya lograste esta semana. Vas avanzando.'],
    },
    tiempo: {
      name: 'Mala gestión del tiempo', em: '🧭', hue: '--h-plan',
      short: 'El día se te va y no te alcanza para lo importante.',
      why: 'Sin un plan con horas, lo urgente se come lo importante. Hay que decidir antes qué entra en el día y darle a cada cosa su hueco.',
      plan: ['Máximo tres prioridades al día.', 'Cada tarea con su hora y su duración: yo te las ordeno.', 'Bloque de enfoque de 90 minutos en tu mejor hora.', 'Cierre del día para dejar listo el de mañana.'],
      habits: ['Planear mañana antes de dormir', 'Un bloque de enfoque de 90 minutos'],
      tips: ['Si todo es prioridad, nada lo es. Elige tres.', 'Ponle hora a lo importante o se lo comerá lo urgente.', 'Antes de decir que sí a algo nuevo, mira si cabe en tu día.', 'Agrupa las tareas pequeñas en un solo bloque.'],
    },
  };
  const DIM = { p: 'procrastinacion', d: 'disciplina', m: 'motivacion', t: 'tiempo' };

  const DIAG_Q = [
    { id: 'q1', q: 'Cuando tienes algo importante que hacer, ¿qué suele pasar?', options: [
      { id: 'a', em: '⏳', label: 'Lo dejo para después hasta última hora', sc: { p: 3 }, syn: ['ultima hora', 'despues'] },
      { id: 'b', em: '🌀', label: 'Empiezo, pero lo dejo a medias', sc: { d: 2, m: 1 }, syn: ['a medias'] },
      { id: 'c', em: '🤷', label: 'No sé por dónde empezar', sc: { t: 2, p: 1 }, syn: ['empezar'] },
      { id: 'd', em: '✅', label: 'Lo hago sin mucho problema', sc: {}, syn: ['sin problema'] }] },
    { id: 'q2', q: '¿Cómo terminas la mayoría de tus días?', options: [
      { id: 'a', em: '📚', label: 'Con muchas cosas pendientes', sc: { t: 2, p: 1 }, syn: ['pendientes'] },
      { id: 'b', em: '😮‍💨', label: 'Sintiendo que perdí el tiempo', sc: { p: 2, d: 1 }, syn: ['perdi el tiempo'] },
      { id: 'c', em: '🪫', label: 'Cansado y sin ganas de nada', sc: { m: 2 }, syn: ['cansado', 'sin ganas'] },
      { id: 'd', em: '😌', label: 'Satisfecho con lo que hice', sc: {}, syn: ['satisfecho', 'bien'] }] },
    { id: 'q3', q: '¿Qué te frena más a menudo?', options: [
      { id: 'a', em: '📱', label: 'Distracciones: celular, redes, videos', sc: { p: 2, d: 1 }, syn: ['celular', 'redes', 'distracciones'] },
      { id: 'b', em: '🔋', label: 'No me siento con ganas', sc: { m: 3 }, syn: ['ganas'] },
      { id: 'c', em: '⏰', label: 'No me alcanza el tiempo', sc: { t: 3 }, syn: ['tiempo', 'alcanza'] },
      { id: 'd', em: '🧱', label: 'Me cuesta ser constante', sc: { d: 3 }, syn: ['constante'] }] },
    { id: 'q4', q: 'Si nadie te revisa, ¿cumples lo que te propones?', options: [
      { id: 'a', em: '😬', label: 'Casi nunca', sc: { d: 3 }, syn: ['nunca'] },
      { id: 'b', em: '🙂', label: 'A veces', sc: { d: 2 } },
      { id: 'c', em: '💪', label: 'Casi siempre', sc: {}, syn: ['siempre'] },
      { id: 'd', em: '🎭', label: 'Solo si me gusta lo que hago', sc: { m: 2, d: 1 }, syn: ['me gusta'] }] },
    { id: 'q5', q: '¿Tienes claro para qué haces lo que haces?', options: [
      { id: 'a', em: '🤖', label: 'No, voy en automático', sc: { m: 3 }, syn: ['automatico', 'no'] },
      { id: 'b', em: '🌫️', label: 'Más o menos', sc: { m: 1 }, syn: ['mas o menos'] },
      { id: 'c', em: '🎯', label: 'Sí, tengo metas claras', sc: {}, syn: ['si', 'metas claras'] },
      { id: 'd', em: '🤹', label: 'Tengo demasiadas metas a la vez', sc: { t: 2, d: 1 }, syn: ['demasiadas'] }] },
    { id: 'q6', q: '¿Cómo planificas tu día?', options: [
      { id: 'a', em: '🎲', label: 'No lo planifico', sc: { t: 3 }, syn: ['no lo planifico', 'no'] },
      { id: 'b', em: '🧠', label: 'Lo tengo en la cabeza', sc: { t: 2 }, syn: ['cabeza'] },
      { id: 'c', em: '📝', label: 'Hago listas, pero no las sigo', sc: { d: 2, p: 1 }, syn: ['listas'] },
      { id: 'd', em: '🗓️', label: 'Uso un horario y lo sigo', sc: {}, syn: ['horario'] }] },
    { id: 'q7', q: 'Cuando aplazas algo, ¿por qué es casi siempre?', options: [
      { id: 'a', em: '😩', label: 'Me parece aburrido o difícil', sc: { p: 3 }, syn: ['aburrido', 'dificil'] },
      { id: 'b', em: '😰', label: 'Me da miedo que salga mal', sc: { p: 2, m: 1 }, syn: ['miedo'] },
      { id: 'c', em: '🫥', label: 'Se me olvida', sc: { t: 2 }, syn: ['olvida'] },
      { id: 'd', em: '🎮', label: 'Prefiero algo más divertido', sc: { p: 2, d: 1 }, syn: ['divertido'] }] },
    { id: 'q8', q: '¿Cuántas horas al día se te van sin darte cuenta?', options: [
      { id: 'a', em: '🟢', label: 'Menos de una hora', sc: {}, syn: ['menos de una', 'menos'] },
      { id: 'b', em: '🟡', label: 'Una o dos horas', sc: { p: 1, t: 1 }, syn: ['una o dos', 'dos'] },
      { id: 'c', em: '🟠', label: 'Tres o cuatro horas', sc: { p: 2, t: 1 }, syn: ['tres', 'cuatro'] },
      { id: 'd', em: '🔴', label: 'Más de cuatro horas', sc: { p: 3, t: 2 }, syn: ['mas de cuatro'] }] },
  ];

  function computeDiagnosis(ans) {
    const sum = { p: 0, d: 0, m: 0, t: 0 }, max = { p: 0, d: 0, m: 0, t: 0 };
    let answered = 0;
    for (const q of DIAG_Q) {
      for (const k of Object.keys(sum)) max[k] += Math.max(0, ...q.options.map(o => o.sc[k] || 0));
      const o = q.options.find(x => x.id === ans[q.id]);
      if (!o) continue;
      answered++;
      for (const [k, v] of Object.entries(o.sc)) sum[k] += v;
    }
    const scores = Object.fromEntries(Object.keys(sum).map(k => [DIM[k], max[k] ? Math.round((sum[k] / max[k]) * 100) : 0]));
    const order = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const main = order[0][1] > 0 ? order[0][0] : 'tiempo';
    const secondary = order[1][1] >= 30 && order[1][1] >= order[0][1] - 25 ? order[1][0] : null;
    const level = order[0][1] >= 60 ? 'alto' : order[0][1] >= 35 ? 'medio' : 'bajo';
    return { main, secondary, scores, level, answered, at: new Date().toISOString() };
  }
  const diag = () => coach.diagnosis;
  const prob = () => PROBLEMS[(diag() && diag().main) || 'tiempo'];
  const coachTip = () => shuffle1(prob().tips);

  function diagHTML(d) {
    if (!d) return '';
    const p = PROBLEMS[d.main], s = d.secondary ? PROBLEMS[d.secondary] : null;
    const lvl = { alto: 'Te frena bastante', medio: 'Te frena a ratos', bajo: 'Te frena poco' }[d.level];
    return `<div class="cx-hero" style="--k: var(${p.hue})"><p class="cx-small" style="font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.85">Tu problema principal · ${lvl}</p>
      <h3 class="mt-1">${p.em} ${esc(p.name)}</h3><p class="mt-1">${esc(p.short)}</p></div>
      <p class="mt-4 text-[.95rem] leading-relaxed">${esc(p.why)}</p>
      ${s ? `<p class="mt-2 cx-small cx-muted">También aparece: <b>${esc(s.name.toLowerCase())}</b>. Lo tendré en cuenta.</p>` : ''}
      <div class="mt-4 space-y-2.5">${Object.entries(d.scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div><div class="cx-row cx-small" style="justify-content:space-between"><span class="cx-b">${PROBLEMS[k].em} ${esc(PROBLEMS[k].name)}</span><span class="cx-muted">${v}%</span></div><div class="cx-meter mt-1" style="--k: var(${PROBLEMS[k].hue})"><i style="width:${v}%"></i></div></div>`).join('')}</div>
      <p class="field-label mt-5">Así te voy a ayudar</p>
      <div class="space-y-2.5">${p.plan.map((x, i) => `<div class="cx-step" style="--k: var(${p.hue})"><span class="cx-num">${i + 1}</span><p class="text-[.92rem] leading-snug pt-0.5">${esc(x)}</p></div>`).join('')}</div>`;
  }

  /* =====================================================================
     WIZARD inicial: diagnóstico + tus parámetros
  ===================================================================== */
  const TIME_OPTS = (list) => list.map(([id, label]) => ({ id, label, go: false }));
  const WORKDAY_SETS = { lv: [1, 2, 3, 4, 5], ls: [1, 2, 3, 4, 5, 6], todos: [0, 1, 2, 3, 4, 5, 6], turnos: [] };
  const AREAS = [
    { id: 'trabajo', em: '💼', label: 'Trabajo' }, { id: 'estudio', em: '📚', label: 'Estudio' }, { id: 'salud', em: '🏋️', label: 'Salud y ejercicio', syn: ['gimnasio', 'gym', 'ejercicio'] },
    { id: 'finanzas', em: '💰', label: 'Finanzas', syn: ['dinero', 'trading', 'inversiones'] }, { id: 'hogar', em: '🏠', label: 'Casa', syn: ['hogar'] },
    { id: 'proyectos', em: '🚀', label: 'Proyectos personales', syn: ['proyectos', 'emprendimiento'] }, { id: 'social', em: '🫶', label: 'Familia y amigos', syn: ['familia', 'amigos', 'relaciones'] },
    { id: 'idiomas', em: '🗣️', label: 'Idiomas', syn: ['ingles', 'idioma'] },
  ];
  const NOSY = {
    suave: { em: '🙂', label: 'Suave', desc: 'Te pregunto una vez y ya', re: [] },
    normal: { em: '👀', label: 'Normal', desc: 'Insisto un par de veces', re: [30, 75] },
    intenso: { em: '🔥', label: 'Muy metiche', desc: 'No te suelto hasta que respondas', re: [15, 30, 50, 80, 120] },
  };

  function wizardSteps(again) {
    const prm = P();
    const steps = [
      { id: 'intro', type: 'info', optional: false, kicker: 'Bienvenida', q: `${firstName() ? firstName() + ', vamos' : 'Vamos'} a conocerte en 3 minutos`,
        sub: 'Te haré preguntas rápidas. Tócalas o respóndelas por voz con el botón del micrófono. Con eso descubro qué te frena y armo tu plan del día, del mes y del año.',
        html: `<div class="cx-soft cx-small leading-relaxed">Consejo: activa <b>Voz</b> arriba y te leo cada pregunta; respondes hablando, sin tocar nada.</div>`, cta: 'Empezar' },
      ...DIAG_Q.map((q, i) => ({ id: q.id, type: 'single', kicker: `Diagnóstico · ${i + 1} de ${DIAG_Q.length}`, q: q.q, options: q.options, optional: true })),
      { id: 'result', type: 'info', optional: false, kicker: 'Tu diagnóstico', q: 'Esto es lo que más te frena', html: (a) => diagHTML(computeDiagnosis(a)), cta: 'Ahora, tus parámetros',
        say: (a) => { const d = computeDiagnosis(a); return `Tu problema principal es: ${PROBLEMS[d.main].name}. ${PROBLEMS[d.main].short}`; } },
      { id: 'wake', type: 'time', kicker: 'Tu horario · 1 de 4', q: '¿A qué hora te despiertas normalmente?', def: prm.wake, options: TIME_OPTS([['05:30', '5:30'], ['06:00', '6:00'], ['06:30', '6:30'], ['07:00', '7:00'], ['08:00', '8:00'], ['09:00', '9:00']]) },
      { id: 'sleep', type: 'time', kicker: 'Tu horario · 2 de 4', q: '¿Y a qué hora te acuestas?', def: prm.sleep, options: TIME_OPTS([['21:30', '9:30 pm'], ['22:00', '10 pm'], ['22:30', '10:30 pm'], ['23:00', '11 pm'], ['23:30', '11:30 pm'], ['00:30', '12:30 am']]) },
      { id: 'work', type: 'single', kicker: 'Tu horario · 3 de 4', q: '¿Cuál es tu horario de trabajo o estudio?', options: [
        { id: '08:00-14:00', em: '🌅', label: 'Mañana', desc: '8:00 a 14:00' }, { id: '09:00-18:00', em: '🏢', label: 'Jornada completa', desc: '9:00 a 18:00', syn: ['completa'] },
        { id: '14:00-22:00', em: '🌆', label: 'Tarde y noche', desc: '14:00 a 22:00', syn: ['tarde'] }, { id: 'custom', em: '✏️', label: 'Otro horario', desc: 'Lo escribo yo', syn: ['otro', 'variable'] }],
        onAnswer: (v) => (v === 'custom' ? true : true), next: (v) => (v === 'custom' ? 'workCustom' : 'days') },
      { id: 'workCustom', type: 'text', kicker: 'Tu horario', q: 'Escribe tu horario', sub: 'Por ejemplo: de 10 a 7, o de 8:30 a 17:00', placeholder: 'de 9 a 6', skip: (a) => a.work !== 'custom', freeVoice: null,
        onAnswer: (v, a) => { const r = parseRange(v); if (r) a.workRange = r; return true; } },
      { id: 'days', type: 'single', kicker: 'Tu horario · 4 de 4', q: '¿Qué días trabajas o estudias?', options: [
        { id: 'lv', em: '📅', label: 'Lunes a viernes', syn: ['lunes a viernes', 'entre semana'] }, { id: 'ls', em: '🗓️', label: 'Lunes a sábado', syn: ['sabado'] },
        { id: 'todos', em: '♾️', label: 'Todos los días', syn: ['todos'] }, { id: 'turnos', em: '🔄', label: 'Por turnos, cambia cada semana', syn: ['turnos', 'cambia'] }] },
      { id: 'peak', type: 'single', kicker: 'Tu energía', q: '¿Cuándo tienes más energía para concentrarte?', sub: 'Ahí pondré lo más difícil del día.', options: [
        { id: 'manana', em: '🌅', label: 'En la mañana', syn: ['manana', 'temprano'] }, { id: 'mediodia', em: '☀️', label: 'Al mediodía', syn: ['mediodia'] },
        { id: 'tarde', em: '🌇', label: 'En la tarde', syn: ['tarde'] }, { id: 'noche', em: '🌙', label: 'En la noche', syn: ['noche'] }] },
      { id: 'areas', type: 'multi', kicker: 'Tus áreas', q: '¿Qué quieres organizar con Dilex?', sub: 'Elige todas las que quieras.', options: AREAS, cols: 2 },
      { id: 'yearGoal', type: 'text', kicker: 'Tu gran meta', q: '¿Cuál es tu meta más importante para este año?', sub: 'La que, si la cumples, te haría sentir orgulloso. Dila como un resultado.', placeholder: 'Ej.: Ahorrar 2.000 dólares, hablar inglés con fluidez…',
        chips: ['Ser más productivo en mi trabajo', 'Ponerme en forma', 'Ahorrar e invertir', 'Hablar inglés con fluidez', 'Lanzar mi proyecto'] },
      { id: 'monthFocus', type: 'text', kicker: 'Este mes', q: '¿Y en qué te quieres enfocar este mes?', sub: 'Algo concreto que acerque tu meta del año.', placeholder: 'Ej.: Ir al gimnasio 4 días por semana',
        chips: ['Crear mi rutina diaria', 'Terminar lo que tengo pendiente', 'Ir al gimnasio 4 veces por semana', 'Estudiar 30 minutos diarios'] },
      { id: 'nosy', type: 'single', kicker: 'Tu asistente', q: '¿Qué tan metiche quieres que sea?', sub: 'Te preguntaré si hiciste cada tarea cuando le toque y haré el cierre del día contigo.',
        options: Object.entries(NOSY).map(([id, n]) => ({ id, em: n.em, label: n.label, desc: n.desc, syn: id === 'intenso' ? ['muy metiche', 'intenso', 'mucho'] : id === 'suave' ? ['poco', 'suave'] : ['normal'] })) },
      { id: 'closeTime', type: 'time', kicker: 'Cierre del día', q: '¿A qué hora hacemos el cierre del día?', sub: 'Te preguntaré qué hiciste y dejaremos listo mañana. Si no respondes, insistiré.', def: prm.closeTime,
        options: TIME_OPTS([['19:00', '7 pm'], ['20:00', '8 pm'], ['21:00', '9 pm'], ['22:00', '10 pm']]) },
      { id: 'habits', type: 'multi', kicker: 'Hábitos', q: 'Te recomiendo estos hábitos. ¿Los creo?', sub: 'Elige los que quieras; aparecerán en Hábitos.',
        options: (a) => { const d = computeDiagnosis(a); const list = [...PROBLEMS[d.main].habits, ...(d.secondary ? PROBLEMS[d.secondary].habits.slice(0, 1) : [])]; return list.filter(h => !habits.some(x => x.name.toLowerCase() === h.toLowerCase())).map(h => ({ id: h, label: h, em: '🔁' })); },
        skip: (a) => { const d = computeDiagnosis(a); return ![...PROBLEMS[d.main].habits].some(h => !habits.some(x => x.name.toLowerCase() === h.toLowerCase())); },
        onShow: (a) => { if (!a.habits) { a.habits = flowOptions(flow.steps[flow.i]).map(o => o.id); $$('#cxFBody [data-o]').forEach(b => b.classList.add('sel')); } }, cta: 'Crear y seguir' },
      { id: 'pin', type: 'pin', kicker: 'Tu espacio', q: 'Protege DLX con un PIN', sub: 'Cuatro números. Te los pediré al abrir la app. Puedes cambiarlo en Ajustes.', skip: () => !window.DilexLock || DilexLock.hasPin(), skipLabel: 'Ahora no', optional: true },
      { id: 'push', type: 'single', kicker: 'Avisos', q: '¿Te puedo avisar aunque la app esté cerrada?', sub: 'Así te pregunto por tus tareas a su hora y te insisto en el cierre del día. Tu teléfono te pedirá permiso.',
        skip: () => !pushSupported() || pushState().on, options: [{ id: 'si', em: '🔔', label: 'Sí, avísame', yes: true }, { id: 'no', em: '🔕', label: 'Ahora no', no: true }],
        onAnswer: (v) => { if (v === 'si') enablePush({ quiet: true }); return true; } },
      { id: 'done', type: 'done', optional: false, kicker: 'Todo listo', q: `Tu plan está listo${coma()}`, cta: 'Ver mi plan',
        sub: 'Armé tu día, tu mes y tu año según tus respuestas. Cada mañana te haré unas preguntas rápidas y te preguntaré por cada tarea cuando le toque.' },
    ];
    if (again) steps[0] = Object.assign({}, steps[0], { q: 'Repitamos el diagnóstico', sub: 'Tus respuestas anteriores están marcadas. Cambia lo que haya cambiado.' });
    return steps;
  }

  function parseRange(text) {
    const n = fold(text).replace(/\s+/g, ' ');
    const m = /(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?\s*(?:a|-|hasta|al?)\s*(?:las?\s*)?(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm)?/.exec(n);
    if (!m) return null;
    let h1 = +m[1], h2 = +m[4];
    if (m[3] === 'pm' && h1 < 12) h1 += 12;
    if (m[6] === 'pm' && h2 < 12) h2 += 12;
    if (!m[6] && h2 <= h1 && h2 < 12) h2 += 12;
    if (h1 > 23 || h2 > 24) return null;
    return [`${pad2(h1)}:${m[2] || '00'}`, `${pad2(h2 % 24)}:${m[5] || '00'}`];
  }

  async function runWizard(opts = {}) {
    if (flow.alive) return;
    const prev = { ...coach.answers };
    if (opts.again) { Object.assign(prev, { yearGoal: coach.yearGoal, monthFocus: coach.monthFocus, areas: coach.areas, nosy: P().nosy, wake: P().wake, sleep: P().sleep, closeTime: P().closeTime, peak: P().peak }); }
    const ans = await runFlow(wizardSteps(opts.again), { ans: prev, kicker: '', confirmClose: opts.again ? null : '¿Salir del diagnóstico? Podrás hacerlo después desde Más → Repetir diagnóstico.' });
    if (!ans) { if (!coach.wizardDone) { coach.wizardSkipped = todayKey(); saveCoach(); } return; }
    applyWizard(ans);
  }

  function applyWizard(a) {
    const prm = P();
    coach.answers = Object.fromEntries(Object.entries(a).filter(([k]) => /^q\d$/.test(k)));
    coach.diagnosis = computeDiagnosis(a);
    if (a.wake) prm.wake = a.wake;
    if (a.sleep) prm.sleep = a.sleep;
    if (a.work && a.work !== 'custom') [prm.workStart, prm.workEnd] = a.work.split('-');
    if (a.work === 'custom' && a.workRange) [prm.workStart, prm.workEnd] = a.workRange;
    if (a.days && WORKDAY_SETS[a.days]) prm.workDays = WORKDAY_SETS[a.days].slice();
    if (a.peak) prm.peak = a.peak;
    if (a.nosy) prm.nosy = a.nosy;
    if (a.closeTime) prm.closeTime = a.closeTime;
    prm.quietStart = tHM((tMin(prm.sleep) ?? 1380) - 15);
    prm.quietEnd = tHM((tMin(prm.wake) ?? 420) - 15);
    if (a.areas) coach.areas = arr(a.areas);
    if (a.yearGoal) coach.yearGoal = cap(String(a.yearGoal).trim()).slice(0, 120);
    if (a.monthFocus) { coach.monthFocus = cap(String(a.monthFocus).trim()).slice(0, 120); coach.monthKey = todayKey().slice(0, 7); }
    arr(a.habits).forEach(h => A.addHabit(h));
    coach.wizardDone = true; coach.wizardAt = new Date().toISOString();
    try { dayProfile.start = prm.wake; dayProfile.end = tMin(prm.sleep) > tMin(prm.wake) ? prm.sleep : '23:59'; saveProfile2(); } catch { /* agenda */ }
    coach.plan = { month: genMonth(), year: genYear(), at: new Date().toISOString() };
    logC('wizard', { main: coach.diagnosis.main });
    saveCoach();
    const r = organizeDay({ silent: true });
    void r;
    coachRender();
    openPlanTab('dia');
    confetti();
    const msg = `Listo${coma()}. Tu problema principal es ${PROBLEMS[coach.diagnosis.main].name.toLowerCase()}, y tu plan ya está armado. Te preguntaré por cada tarea cuando le toque.`;
    if (settings.voice) speak(msg);
    schedulePushSync(500);
  }

  /* =====================================================================
     PLAN: organizar el día, plan del mes y del año
  ===================================================================== */
  const PEAKS = { manana: [8 * 60, 12 * 60], mediodia: [11 * 60, 14 * 60], tarde: [14 * 60, 18 * 60], noche: [19 * 60, 22 * 60] };
  const isWorkTask = (t) => t.area === 'trabajo' || /trabaj|cliente|oficina|reuni|llamad|correo|venta|lead|turno/i.test(`${t.tag || ''} ${t.text}`);
  function taskScore(t) {
    let s = 0;
    if (t.priority === 'urgent') s += 50;
    s += { critico: 40, alto: 25, bajo: 5, ninguno: 0 }[t.costo] || 10;
    s += (+t.importancia || 2) * 8;
    if (t.due) { const d = daysBetween(todayKey(), t.due); s += d < 0 ? 30 : d === 0 ? 20 : Math.max(0, 10 - d); }
    if (todayPlan().some(p => p.text.trim() && fold(p.text) === fold(t.text))) s += 35;
    return s;
  }
  const estDur = (t) => (+t.durMin > 0 ? +t.durMin : t.priority === 'urgent' ? 30 : 30);
  const tasksOn = (dk) => tasks.filter(t => t.due === dk);
  const eventsOn = (dk) => { try { return events.filter(e => e.date === dk); } catch { return []; } };

  function dayBounds(dk) {
    const w = tMin(P().wake) ?? 420;
    let s = tMin(P().sleep) ?? 1380;
    if (s <= w) s = 1440 - 1;
    return [w, s];
  }
  function busyOn(dk, skipIds = new Set()) {
    const b = [];
    eventsOn(dk).forEach(e => { if (!e.taskId || !skipIds.has(e.taskId)) b.push([tMin(e.start), tMin(e.end), 'event']); });
    tasksOn(dk).forEach(t => { if (!t.done && t.time && !skipIds.has(t.id)) { const s = tMin(t.time); b.push([s, s + estDur(t), 'task']); } });
    return b.filter(x => x[0] != null && x[1] != null).sort((a, c) => a[0] - c[0]);
  }
  function freeSlots(range, busy, margin = 10) {
    let [s, e] = range;
    const out = [];
    for (const [a, b] of busy) {
      if (b <= s) continue;
      if (a >= e) break;
      if (a - margin > s) out.push([s, a - margin]);
      s = Math.max(s, b + margin);
    }
    if (e > s) out.push([s, e]);
    return out.filter(([a, b]) => b - a >= 10);
  }

  /** Organiza el día: atrasadas, 3 prioridades y horas para cada tarea. */
  function organizeDay(opts = {}) {
    const dk = opts.day || todayKey(), isToday = dk === todayKey();
    const res = { moved: 0, planned: 0, scheduled: [], unscheduled: [], day: dk };
    if (isToday && (opts.moveOverdue ?? P().autoMoveOverdue)) res.moved = moveOverdueToToday();
    const pend = tasksOn(dk).filter(t => !t.done);
    // Prioridades del día
    if (isToday && (opts.plan ?? P().autoPlan)) {
      const p = todayPlan();
      const have = new Set(p.map(x => fold(x.text.trim())).filter(Boolean));
      const cand = pend.slice().sort((a, b) => taskScore(b) - taskScore(a)).filter(t => !have.has(fold(t.text)));
      if (opts.focusText) { const i = p.findIndex(x => !x.text.trim()); if (!have.has(fold(opts.focusText))) { if (i >= 0) p[i] = { text: cap(opts.focusText).slice(0, 90), done: false }; else { p.unshift({ text: cap(opts.focusText).slice(0, 90), done: false }); p.length = 3; } res.planned++; } }
      for (const t of cand) { const i = p.findIndex(x => !x.text.trim()); if (i < 0) break; p[i] = { text: t.text.slice(0, 90), done: false }; res.planned++; }
      if (res.planned) { savePlan(); renderPlan(); }
    }
    if (opts.schedule ?? P().autoSchedule) {
      const now = isToday ? Math.ceil((nowM() + 5) / 5) * 5 : 0;
      // Las horas puestas por mí y aún no pasadas se recalculan.
      pend.forEach(t => { if (t.timeAuto && t.time && (!isToday || tMin(t.time) > now)) { delete t.time; delete t.timeAuto; } });
      const [w, sl] = dayBounds(dk);
      const start = Math.max(w + 30, now);
      const end = sl - 30;
      const work = isWorkDay(dk) ? [tMin(P().workStart), tMin(P().workEnd)] : null;
      const peak = PEAKS[P().peak] || PEAKS.manana;
      let capMin = opts.capacity || Infinity;
      const todo = pend.filter(t => !t.time).sort((a, b) => taskScore(b) - taskScore(a));
      if (opts.energy === 'baja') todo.sort((a, b) => estDur(a) - estDur(b) || taskScore(b) - taskScore(a));
      const busy = busyOn(dk);
      todo.forEach((t, idx) => {
        const dur = estDur(t);
        if (dur > capMin) { res.unscheduled.push(t); return; }
        const ranges = [];
        const workT = work && work[0] != null && isWorkTask(t);
        if (workT) ranges.push([Math.max(start, work[0]), work[1]]);
        if (idx === 0 && opts.energy !== 'baja') ranges.push([Math.max(start, peak[0]), Math.min(end, peak[1])]);
        if (work && work[0] != null && !workT) { ranges.push([start, Math.min(end, work[0])]); ranges.push([Math.max(start, work[1]), end]); }
        ranges.push([start, end]);
        let placed = null;
        for (const r of ranges) {
          if (r[1] - r[0] < dur) continue;
          const slot = freeSlots(r, busy).find(([a, b]) => b - a >= dur);
          if (slot) { placed = slot[0]; break; }
        }
        if (placed == null) { res.unscheduled.push(t); return; }
        placed = Math.ceil(placed / 5) * 5;
        t.time = tHM(placed); t.timeAuto = true;
        busy.push([placed, placed + dur, 'task']); busy.sort((a, b) => a[0] - b[0]);
        capMin -= dur;
        res.scheduled.push(t);
      });
    }
    saveTasks(); onTasksChanged();
    logC('organize', { day: dk, n: res.scheduled.length });
    saveCoach();
    schedulePushSync();
    return res;
  }
  function organizeSummary(r) {
    const bits = [];
    if (r.moved) bits.push(`pasé ${plural(r.moved, 'tarea atrasada', 'tareas atrasadas')} a hoy`);
    if (r.planned) bits.push(`elegí ${plural(r.planned, 'prioridad', 'prioridades')}`);
    if (r.scheduled.length) bits.push(`le puse hora a ${plural(r.scheduled.length, 'tarea', 'tareas')}`);
    let txt = bits.length ? `Listo: ${listJoin(bits)}.` : 'Tu día ya estaba ordenado.';
    if (r.unscheduled.length) txt += ` ${plural(r.unscheduled.length, 'tarea no cupo', 'tareas no cupieron')} hoy; te pregunto en el cierre qué hacemos.`;
    const first = r.scheduled.slice().sort((a, b) => tMin(a.time) - tMin(b.time))[0];
    if (first) txt += ` Empiezas con "${first.text}" a las ${hm12(first.time)}.`;
    return txt;
  }
  function organizeDayUI() {
    const r = organizeDay();
    const txt = organizeSummary(r);
    toast(txt, 'ok', undoAction());
    if (settings.voice) speak(txt);
    renderDayCard();
  }

  /* ---------- Línea de tiempo del día ---------- */
  const KIND_HUE = { rutina: '--h-habits', trabajo: '--h-tasks', tarea: '--accent', evento: '--h-plan', enfoque: '--h-focus', cierre: '--h-goals', descanso: '--h-stats', dilex: '--h-files' };
  function dayTimeline(dk) {
    const items = [];
    const [w, sl] = dayBounds(dk);
    const add = (s, e, label, kind, extra = {}) => { if (s == null) return; items.push(Object.assign({ s, e: e ?? s + 15, label, kind }, extra)); };
    add(w, w + 30, 'Despertar y rutina de inicio', 'rutina', { sub: 'Agua, cama hecha, sin celular' });
    if (P().morningQuiz) add(w + 30, w + 35, `Preguntas de la mañana con ${aiName()}`, 'dilex', { sub: '2 minutos para organizar tu día', act: 'morning' });
    if (isWorkDay(dk) && tMin(P().workStart) != null) add(tMin(P().workStart), tMin(P().workEnd), 'Trabajo / estudio', 'trabajo', { sub: `${hm12(P().workStart)} – ${hm12(P().workEnd)}`, block: true });
    eventsOn(dk).forEach(e => { if (!e.taskId) add(tMin(e.start), tMin(e.end), e.title, 'evento', { sub: `${hm12(e.start)} – ${hm12(e.end)}` }); });
    tasksOn(dk).forEach(t => { if (t.time) add(tMin(t.time), tMin(t.time) + estDur(t), t.text, 'tarea', { task: t, done: t.done, sub: `${estDur(t)} min${t.timeAuto ? ' · hora sugerida' : ''}${t.repeat ? ' · se repite' : ''}` }); });
    habits.slice(0, 6).forEach(h => { const m = /(\d{1,2})[:h](\d{2})/.exec(h.name); if (m) add(+m[1] * 60 + +m[2], null, h.name, 'rutina', { habit: h }); });
    add(tMin(P().closeTime), tMin(P().closeTime) + 10, 'Cierre del día', 'cierre', { sub: 'Revisamos qué hiciste y preparamos mañana', act: 'evening' });
    add(sl - 30, sl, 'Desconexión: pantallas fuera', 'descanso');
    return items.sort((a, b) => a.s - b.s || (a.block ? -1 : 1));
  }
  function timelineHTML(dk, opts = {}) {
    const items = dayTimeline(dk);
    const isToday = dk === todayKey(), nm = nowM();
    let nowShown = !isToday;
    const rows = [];
    items.forEach(it => {
      if (!nowShown && it.s > nm) { rows.push(`<div class="cx-nowline">Ahora · ${new Date().toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit' })}</div>`); nowShown = true; }
      const isNow = isToday && it.s <= nm && nm < it.e;
      const past = isToday && it.e <= nm;
      const done = it.done || (past && !it.task && !it.block);
      if (opts.compact && past && !it.task) return;
      rows.push(`<div class="cx-tli ${isNow ? 'now' : ''} ${done ? 'done' : ''}" style="--k: var(${KIND_HUE[it.kind] || '--n400'})">
        <div class="cx-tlh">${tHM(it.s)}</div>
        <div class="cx-tlb"><div class="cx-row" style="gap:.5rem">${it.task ? `<input type="checkbox" class="chk" data-task-chk="${it.task.id}" ${it.task.done ? 'checked' : ''} aria-label="Hecha" style="width:1.15rem;height:1.15rem">` : ''}<p class="cx-tlt" style="flex:1">${esc(it.label)}</p>${it.act ? `<button type="button" class="btn btn-sm btn-soft" data-cx-act="${it.act}" style="padding:.2rem .55rem;font-size:.72rem">Abrir</button>` : ''}</div>${it.sub ? `<p class="cx-tls">${esc(it.sub)}</p>` : ''}</div></div>`);
    });
    if (!nowShown) rows.push('<div class="cx-nowline">Ahora</div>');
    return `<div class="cx-tl">${rows.join('')}</div>`;
  }

  /* ---------- Plan del mes y del año ---------- */
  const MONTH_WEEKS = {
    procrastinacion: [['Arranque sin excusas', ['Regla de 5 minutos con tu tarea más pesada cada día', 'Parte cada tarea grande en pasos de 25 minutos', 'Celular lejos durante tu bloque de enfoque']],
      ['Lo difícil primero', ['La tarea más pesada antes del mediodía', 'Dos bloques de enfoque al día', 'Anota qué te hizo aplazar algo y por qué']],
      ['Cero pendientes viejos', ['Termina o borra todo lo que lleve más de 7 días', 'Responde a Dilex cada vez que te pregunte', 'Prueba una mañana completa sin redes']],
      ['Revisión y ajuste', ['Compara cuántas tareas aplazaste esta semana vs. la primera', 'Quédate con lo que funcionó', 'Define el reto del mes que viene']]],
    disciplina: [['Rutina base', ['Despierta a la misma hora 7 días seguidos', 'Revisa tu plan cada mañana', 'Cierre del día con Dilex todas las noches']],
      ['No rompas la cadena', ['Mantén tus hábitos aunque sea en versión mínima', 'Si fallas un día, nunca dos seguidos', 'Comparte tu avance semanal con alguien']],
      ['Subir el estándar', ['Añade 10 minutos a tu bloque de enfoque', 'Cumple 80% de tus tareas con hora', 'Prepara la ropa y lo de mañana la noche anterior']],
      ['Revisión y ajuste', ['Mira tus rachas: ¿qué se cayó y por qué?', 'Ajusta horarios que no son realistas', 'Elige el hábito clave del mes que viene']]],
    motivacion: [['Encuentra tu porqué', ['Escribe por qué importa tu meta del año', 'Una victoria pequeña cada mañana', 'Celebra cada tarea terminada']],
      ['Ver el progreso', ['Anota un logro al final de cada día', 'Mide tu avance en la meta cada domingo', 'Rodéate de una persona que te impulse']],
      ['Impulso', ['Empieza el día con la tarea más fácil para ganar inercia', 'Un reto nuevo y pequeño esta semana', 'Premia tu esfuerzo, no solo el resultado']],
      ['Revisión y ajuste', ['Relee todos tus logros del mes', '¿Qué te dio más energía?', 'Define la próxima meta pequeña']]],
    tiempo: [['Ordena tu tiempo', ['Máximo tres prioridades al día', 'Ponle hora y duración a cada tarea', 'Cierre del día: planea mañana']],
      ['Bloques de enfoque', ['Un bloque de 90 minutos en tu mejor hora', 'Agrupa correos y mensajes en dos momentos', 'Di que no a lo que no cabe']],
      ['Menos fugas', ['Detecta en qué se te va el tiempo (3 días)', 'Elimina una actividad que no aporta', 'Termina antes de empezar algo nuevo']],
      ['Revisión y ajuste', ['¿Cuánto tardas de verdad en tus tareas?', 'Ajusta las duraciones del plan', 'Prepara el mes siguiente con fechas']]],
  };
  function genMonth() {
    const main = (diag() && diag().main) || 'tiempo';
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mon = new Date(base); mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    const focus = coach.monthFocus;
    const pct = ['Define el primer paso y empieza', 'Llega a la mitad', 'Llega al 80%', 'Termina y revisa'];
    return {
      key: todayKey().slice(0, 7), main, focus,
      weeks: MONTH_WEEKS[main].map(([title, items], i) => {
        const s = new Date(mon); s.setDate(mon.getDate() + i * 7);
        const e = new Date(s); e.setDate(s.getDate() + 6);
        return { title, start: dayKey(s), end: dayKey(e), items: [...items, ...(focus ? [`${pct[i]}: ${focus}`] : [])] };
      }),
    };
  }
  function genYear() {
    const goal = coach.yearGoal || 'Tu meta del año';
    const main = (diag() && diag().main) || 'tiempo';
    const now = new Date();
    const Q = [
      ['Bases', '--h-plan', [`Define cómo vas a medir: "${goal}"`, 'Instala tu rutina diaria y el cierre del día', 'Primer resultado visible, aunque sea pequeño']],
      ['Constancia', '--h-tasks', ['Llega al 35% de tu meta', 'Hábitos sin fallar dos días seguidos', 'Elimina lo que te roba más tiempo']],
      ['Aceleración', '--h-focus', ['Llega al 70% de tu meta', 'Sube la exigencia de tus bloques de enfoque', 'Pide ayuda o feedback a alguien que sepa más']],
      ['Cosecha', '--h-habits', ['Termina tu meta al 100%', 'Revisa el año y celebra', 'Elige la meta del año que viene']],
    ];
    const extra = { procrastinacion: 'Cada trimestre: cero pendientes de más de una semana', disciplina: 'Cada trimestre: tu racha más larga, más larga que la anterior', motivacion: 'Cada trimestre: una celebración de lo logrado', tiempo: 'Cada trimestre: revisa tu horario ideal' }[main];
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return { key: dayKey(d).slice(0, 7), name: d.toLocaleDateString('es-ES', { month: 'short', year: i && d.getMonth() === 0 ? '2-digit' : undefined }), target: Math.round(((i + 1) / 12) * 100) };
    });
    return {
      goal, extra, months,
      quarters: Q.map(([title, hue, items], i) => {
        const s = new Date(now.getFullYear(), now.getMonth() + i * 3, 1);
        const e = new Date(now.getFullYear(), now.getMonth() + i * 3 + 3, 0);
        return { title, hue, items, from: s.toLocaleDateString('es-ES', { month: 'short' }), to: e.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }) };
      }),
    };
  }
  function ensurePlans() {
    if (!coach.wizardDone) return;
    const mk = todayKey().slice(0, 7);
    if (!coach.plan) coach.plan = {};
    if (!coach.plan.month || coach.plan.month.key !== mk || coach.plan.month.focus !== coach.monthFocus) coach.plan.month = genMonth();
    if (!coach.plan.year || coach.plan.year.goal !== (coach.yearGoal || 'Tu meta del año')) coach.plan.year = genYear();
  }

  /* ---------- Vista "Plan" ---------- */
  let planTab = 'dia', planDay = todayKey();
  function openPlanTab(tab) { planTab = tab; closeSheets(); showView('plan', { panel: 'miplan' }); renderCoachPlan(); }
  function renderCoachPlan() {
    ensurePlans();
    if (SIMPLE) return renderSimplePlan();
    const box = $('#coachPlan');
    if (!box) return;
    const tabs = [['dia', 'Día'], ['mes', 'Mes'], ['anio', 'Año'], ['diag', 'Test'], ['params', 'Reglas']];
    const body = planBody(planTab);
    box.innerHTML = `<div class="cx-row mb-4"><span class="tile" style="--h: var(--h-plan)">${ic('compass')}</span><div class="flex-1 min-w-0"><h2 class="sec-title">Tu plan</h2><p class="hint">${coach.wizardDone ? `Hecho para ti: ${esc(prob().name.toLowerCase())}` : 'Día, mes y año, a tu medida'}</p></div></div>
      <div class="tabs cx-tabs mb-4" role="tablist">${tabs.map(([id, t]) => `<button type="button" data-ptab="${id}" aria-selected="${planTab === id}">${t}</button>`).join('')}</div><div>${body}</div>`;
    box.querySelectorAll('[data-ptab]').forEach(b => b.onclick = () => { planTab = b.dataset.ptab; renderCoachPlan(); });
    bindPlanBox(box, renderCoachPlan);
  }
  /* Vista simple: "Mes y año" y "Reglas" son pestañas propias; el día vive en Calendario. */
  function renderSimplePlan() {
    const my = $('#cxPlanMY'), rl = $('#cxPlanRules'), ab = $('#cxAutoBar');
    if (my) {
      my.innerHTML = coach.wizardDone ? `<div class="cxp-sec"><p class="cxs-h">Este mes</p>${planBody('mes')}</div><div class="cxp-sec"><p class="cxs-h">Este año</p>${planBody('anio')}</div>` : planBody('mes');
      bindPlanBox(my, renderSimplePlan);
    }
    if (rl) {
      rl.innerHTML = `<div class="cxp-sec">${paramsHTML(true)}</div>${coach.wizardDone ? `<details class="cxp-sec cxs-more"><summary>Mi diagnóstico: ${esc(prob().name.toLowerCase())}</summary>${planBody('diag')}</details>` : `<div class="cxp-sec">${planBody('diag')}</div>`}`;
      bindPlanBox(rl, renderSimplePlan);
    }
    if (ab) renderAutoBar();
  }
  function planBody(planTab) {
    let body = '';
    if (!coach.wizardDone && planTab !== 'params') {
      body = `<div class="cx-soft"><p class="cx-b">Aún no hiciste tu diagnóstico</p><p class="hint mt-1">Son 3 minutos de preguntas (puedes responder por voz). Con eso descubro qué te frena y armo tu plan del día, del mes y del año.</p><button type="button" class="btn btn-accent mt-3" data-cx-act="wizard">${ic('wand')}Hacer mi diagnóstico</button></div>`;
    } else if (planTab === 'dia') {
      const dk = planDay, rel = daysBetween(todayKey(), dk);
      body = `<div class="cx-row" style="justify-content:space-between;flex-wrap:wrap;gap:.5rem">
        <div class="cx-row" style="gap:.35rem"><button type="button" class="icon-btn" data-pday="-1" aria-label="Día anterior">${ic('chevron').replace('<svg ', '<svg style="transform:rotate(90deg)" ')}</button><b class="text-[.95rem]">${esc(rel === 0 ? 'Hoy' : rel === 1 ? 'Mañana' : rel === -1 ? 'Ayer' : keyToDate(dk).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }))}</b><button type="button" class="icon-btn" data-pday="1" aria-label="Día siguiente">${ic('chevron').replace('<svg ', '<svg style="transform:rotate(-90deg)" ')}</button></div>
        <button type="button" class="btn btn-sm btn-accent" data-cx-act="organize">${ic('wand')}Organízame el día</button></div>
        <p class="hint mt-2">Tus tareas, compromisos y rutinas en orden. Las horas "sugeridas" las pongo yo y las recalculo si algo cambia.</p>
        <div class="mt-4">${timelineHTML(dk)}</div>`;
    } else if (planTab === 'mes') {
      const m = coach.plan.month, tk = todayKey();
      body = `<div class="cx-row" style="justify-content:space-between;gap:.5rem;flex-wrap:wrap"><div><p class="field-label !mb-0">Enfoque del mes</p><p class="cx-b text-[1.05rem]">${esc(coach.monthFocus || 'Sin definir')}</p></div><button type="button" class="btn btn-sm" data-cx-edit="monthFocus">${ic('pencil')}Cambiar</button></div>
        <div class="mt-4 space-y-3">${m.weeks.map((w, i) => `<div class="cx-week ${tk >= w.start && tk <= w.end ? 'cur' : ''}"><div class="cx-row" style="justify-content:space-between"><b>Semana ${i + 1} · ${esc(w.title)}</b><span class="chip">${shortDate(w.start)} – ${shortDate(w.end)}</span></div>
          <ul class="mt-2 space-y-1.5">${w.items.map(x => `<li class="cx-perm">${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
        <p class="hint mt-3">Cada domingo en el cierre del día revisamos la semana.</p>`;
    } else if (planTab === 'anio') {
      const y = coach.plan.year, mk = todayKey().slice(0, 7);
      const g = goals.find(x => fold(x.name) === fold(y.goal));
      body = `<div class="cx-row" style="justify-content:space-between;gap:.5rem;flex-wrap:wrap"><div class="min-w-0"><p class="field-label !mb-0">Meta del año</p><p class="cx-b text-[1.1rem]" style="overflow-wrap:anywhere">${esc(y.goal)}</p></div><button type="button" class="btn btn-sm" data-cx-edit="yearGoal">${ic('pencil')}Cambiar</button></div>
        ${g ? `<div class="mt-3"><div class="cx-row cx-small" style="justify-content:space-between"><span>Avance</span><b>${Math.round(goalPct(g))}%</b></div><div class="cx-meter mt-1"><i style="width:${goalPct(g)}%"></i></div></div>` : coach.yearGoal ? `<button type="button" class="btn btn-sm btn-soft mt-3" data-cx-yeargoal>${ic('flag')}Medir mi avance como meta</button>` : ''}
        <div class="cx-grid2 mt-4">${y.quarters.map((q, i) => `<div class="cx-q" style="--k: var(${q.hue})"><p class="cx-small cx-b" style="color: rgb(var(${q.hue}))">Trimestre ${i + 1} · ${esc(q.from)}–${esc(q.to)}</p><p class="cx-b mt-0.5">${esc(q.title)}</p><ul class="mt-2 space-y-1 cx-small">${q.items.map(x => `<li>• ${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
        <p class="field-label mt-5">Mes a mes</p><div class="cx-months">${y.months.map(m => `<div class="cx-month ${m.key === mk ? 'cur' : ''}"><b>${esc(m.name)}</b>Meta: ${m.target}%</div>`).join('')}</div>
        <p class="hint mt-3">${esc(y.extra)}.</p>`;
    } else if (planTab === 'diag') {
      body = `${diagHTML(diag())}<div class="cx-wrap mt-5"><button type="button" class="btn" data-cx-act="wizard">${ic('reset')}Repetir diagnóstico</button></div>${evolutionHTML()}`;
    } else body = paramsHTML();
    return body;
  }
  function bindPlanBox(box, rerender) {
    box.querySelectorAll('[data-pday]').forEach(b => b.onclick = () => { planDay = addDaysFrom(planDay, +b.dataset.pday); rerender(); });
    box.querySelectorAll('[data-cx-edit]').forEach(b => b.onclick = () => {
      const k = b.dataset.cxEdit;
      const v = prompt(k === 'yearGoal' ? 'Tu meta más importante del año' : 'Tu enfoque de este mes', coach[k] || '');
      if (v == null) return;
      coach[k] = cap(v.trim()).slice(0, 120); if (k === 'monthFocus') coach.monthKey = todayKey().slice(0, 7);
      ensurePlans(); saveCoach(); rerender();
    });
    const yg = box.querySelector('[data-cx-yeargoal]');
    if (yg) yg.onclick = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); A.addGoal({ name: coach.yearGoal, target: 100, unit: '%', deadline: dayKey(d), step: 5 }); toast('Meta creada. Súmale avance desde Metas.', 'ok'); rerender(); };
    if (box.querySelector('[data-prm], [data-prmt], [data-wd], [data-peak], [data-nosy]')) bindParams(box, rerender);
  }
  const addDaysFrom = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };

  function evolutionHTML() {
    const ev = Object.entries(coach.quizzes).filter(([, q]) => q && q.evening && q.evening.block).slice(-14);
    if (!ev.length) return '';
    const cnt = {};
    ev.forEach(([, q]) => { cnt[q.evening.block] = (cnt[q.evening.block] || 0) + 1; });
    const names = { distracciones: 'Distracciones', cansancio: 'Cansancio', imprevistos: 'Imprevistos', planificacion: 'Mala planificación', ganas: 'Falta de ganas', nada: 'Nada, fue un buen día' };
    return `<p class="field-label mt-6">Lo que te frenó en tus últimos cierres</p><div class="space-y-2">${Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="cx-row cx-small"><span class="flex-1">${esc(names[k] || k)}</span><b>${n}</b></div>`).join('')}</div>`;
  }

  /* ---------- Parámetros (bajo tus reglas) ---------- */
  function paramsHTML(autoFirst) {
    const p = P();
    const sw = (k, t, d) => `<label class="cx-set"><span><p>${t}</p>${d ? `<small>${d}</small>` : ''}</span><input type="checkbox" class="cx-switch" data-prm="${k}" ${p[k] ? 'checked' : ''}></label>`;
    const tm = (k, t) => `<label><span class="field-label">${t}</span><input type="time" class="input input-sm w-full" data-prmt="${k}" value="${esc(p[k])}"></label>`;
    const days = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const intro = `<p class="hint">Dilex organiza tu día por ti, pero siempre bajo estas reglas. Cámbialas cuando quieras.</p>`;
    const head = `<p class="field-label mt-4">Tu horario</p>
      <div class="cx-grid2">${tm('wake', 'Me despierto')}${tm('sleep', 'Me acuesto')}${tm('workStart', 'Trabajo / estudio desde')}${tm('workEnd', 'Hasta')}</div>
      <p class="field-label mt-3">Días de trabajo o estudio</p><div class="cx-wrap">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="cx-chipsel ${p.workDays.includes(d) ? 'sel' : ''}" data-wd="${d}">${days[d]}</button>`).join('')}</div>
      <p class="field-label mt-4">Mi mejor hora para concentrarme</p><div class="cx-wrap">${[['manana', 'Mañana'], ['mediodia', 'Mediodía'], ['tarde', 'Tarde'], ['noche', 'Noche']].map(([id, t]) => `<button type="button" class="cx-chipsel ${p.peak === id ? 'sel' : ''}" data-peak="${id}">${t}</button>`).join('')}</div>
      <p class="field-label mt-4">Qué tan metiche es ${esc(aiName())}</p><div class="tabs cx-tabs">${Object.entries(NOSY).map(([id, n]) => `<button type="button" data-nosy="${id}" aria-selected="${p.nosy === id}">${n.em} ${n.label}</button>`).join('')}</div>
      <p class="hint mt-1.5">${esc(NOSY[p.nosy].desc)}.</p>
      <div class="cx-grid2 mt-4">${tm('closeTime', 'Cierre del día a las')}<span></span>${tm('quietStart', 'Silencio desde')}${tm('quietEnd', 'Silencio hasta')}</div>
      <p class="hint mt-1.5">En horas de silencio no te pregunto nada (salvo recordatorios que pongas tú).</p>`;
    const auto = `<p class="field-label mt-5">Lo que hago solo</p>
      <div>${sw('autoSchedule', 'Piloto automático', 'Cada 20 min reviso tu día y le pongo hora a tus tareas')}${sw('autoMoveOverdue', 'Pasar lo atrasado a hoy', 'Cada mañana, lo que quedó pendiente pasa al día de hoy')}
      ${sw('autoPlan', 'Elegir mis 3 prioridades', 'Si no las eliges tú, las elijo yo con lo más importante')}
      ${sw('autoReslot', 'Reacomodar lo que se pasó', 'Si una tarea con hora sugerida se te pasó, le busco otro hueco hoy')}
      ${sw('autoTomorrow', 'Preparar mañana en la noche', 'Después del cierre del día, dejo listo el horario de mañana')}
      ${sw('autoRepeatSuggest', 'Detectar lo que repites', 'Si añades lo mismo varias veces, te propongo hacerlo automático')}
      ${sw('startAlert', 'Avisarme al empezar cada tarea', 'Además de preguntarte al terminar')}
      ${sw('morningQuiz', 'Preguntas de la mañana', 'Al abrir la app cada día: energía, pendientes y prioridad')}
      ${sw('eveningQuiz', 'Cierre del día', 'Qué hiciste, qué te frenó y qué harás mañana')}
      ${sw('discreet', 'Notificaciones discretas', 'No mostrar el nombre de la tarea en la pantalla de bloqueo')}
      ${sw('askBeforePlugins', 'Pedir permiso antes de usar una conexión', 'Te muestro lo que voy a enviar y tú confirmas')}</div>`;
    return autoFirst ? intro + auto.replace('field-label mt-5', 'field-label mt-3') + `<p class="cxs-h" style="margin-top:1.4rem">Tu horario y tu estilo</p>` + head.replace('field-label mt-4">Tu horario', 'field-label">Horario') : intro + head + auto;
  }
  function bindParams(box) {
    const p = P();
    const done = () => { saveCoach(); try { dayProfile.start = p.wake; dayProfile.end = tMin(p.sleep) > tMin(p.wake) ? p.sleep : '23:59'; saveProfile2(); } catch { /* agenda */ } schedulePushSync(); renderDayCard(); };
    box.querySelectorAll('[data-prm]').forEach(i => i.onchange = () => { p[i.dataset.prm] = i.checked; done(); });
    box.querySelectorAll('[data-prmt]').forEach(i => i.onchange = () => { if (/^\d{2}:\d{2}$/.test(i.value)) { p[i.dataset.prmt] = i.value; done(); } });
    box.querySelectorAll('[data-wd]').forEach(b => b.onclick = () => { const d = +b.dataset.wd; p.workDays = p.workDays.includes(d) ? p.workDays.filter(x => x !== d) : [...p.workDays, d]; done(); renderCoachPlan(); });
    box.querySelectorAll('[data-peak]').forEach(b => b.onclick = () => { p.peak = b.dataset.peak; done(); renderCoachPlan(); });
    box.querySelectorAll('[data-nosy]').forEach(b => b.onclick = () => { p.nosy = b.dataset.nosy; done(); renderCoachPlan(); toast(`${aiName()} ahora es ${NOSY[p.nosy].label.toLowerCase()}.`); });
  }

  /* =====================================================================
     ASISTENTE METICHE: "¿ya hiciste…?" cuando le toca a cada tarea
  ===================================================================== */
  const ckKey = (t, dk = todayKey()) => `t:${t.id}:${dk}`;
  const ckOf = (t, dk) => coach.checkins[ckKey(t, dk)] || (coach.checkins[ckKey(t, dk)] = { day: dk || todayKey(), asks: 0 });
  const taskEndAt = (t, dk = todayKey()) => atOf(dk, t.time) + estDur(t) * 60000;
  const ANSWERS = [
    { id: 'done', em: '✅', label: 'Sí, ya la hice', short: 'Ya la hice', yes: true, syn: ['si', 'ya', 'listo', 'hecho', 'la hice', 'termine', 'terminada', 'claro', 'lista'] },
    { id: 'snooze', em: '⏳', label: 'Voy en eso (15 min)', short: 'Voy en eso', no: true, syn: ['voy', 'en eso', 'todavia', 'aun no', 'dame', 'minutos', 'luego', 'despues', 'ahorita', 'estoy'] },
    { id: 'tomorrow', em: '📅', label: 'Pásala a mañana', short: 'Mañana', syn: ['manana', 'pasala', 'otro dia'] },
    { id: 'drop', em: '✖️', label: 'No la haré', short: 'No la haré', syn: ['no la hare', 'no voy a', 'cancela', 'borrala', 'olvidala', 'ya no'] },
  ];
  const NOSY_LINES = [
    (t) => `¿Ya hiciste "${t}"?`,
    (t) => `Sigo aquí 👀 ¿Terminaste "${t}"?`,
    (t) => `No me ignores 😅 ¿Qué pasó con "${t}"?`,
    (t) => `Te lo vuelvo a preguntar: ¿hiciste "${t}"?`,
    (t) => `Última vez por ahora: "${t}". ¿Sí o no?`,
  ];
  const nosyLine = (t, asks) => NOSY_LINES[Math.min(NOSY_LINES.length - 1, Math.max(0, asks - 1))](t.text);
  const spoken = (s) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();

  function pendingAsks() {
    const tk = todayKey();
    return tasksOn(tk).filter(t => !t.done && t.time && Date.now() >= taskEndAt(t)).map(t => ({ t, ck: ckOf(t, tk) }))
      .filter(x => x.ck.state !== 'answered' && !(x.ck.snoozeUntil && x.ck.snoozeUntil > Date.now()))
      .sort((a, b) => tMin(a.t.time) - tMin(b.t.time));
  }
  function nextAskAt(t, ck) {
    const end = taskEndAt(t);
    if (ck.snoozeUntil) return Math.max(ck.snoozeUntil, ck.lastAsk ? ck.lastAsk + 5 * 60000 : 0);
    if (!ck.asks) return end;
    const re = NOSY[P().nosy].re;
    if (ck.asks > re.length) return Infinity;
    return (ck.firstAsk || end) + re[ck.asks - 1] * 60000;
  }

  let nudgeOpen = null;
  function nudgeShell() {
    let el = $('#cxNudge');
    if (el) return el;
    el = document.createElement('aside');
    el.id = 'cxNudge'; el.className = 'sheet'; el.setAttribute('aria-label', 'Pregunta de tu asistente');
    document.body.appendChild(el);
    // Al cerrar la pregunta (con la X, el fondo o Escape) se puede volver a preguntar después.
    new MutationObserver(() => { if (!el.classList.contains('open')) nudgeOpen = null; }).observe(el, { attributes: true, attributeFilter: ['class'] });
    return el;
  }
  function openNudge(t, ck) {
    const el = nudgeShell();
    nudgeOpen = t.id;
    const q = nosyLine(t, ck.asks);
    el.innerHTML = `<div class="p-5 space-y-4"><div class="w-10 h-1.5 rounded-full bg-neutral-200 mx-auto md:hidden"></div>
      <div class="cx-row" style="align-items:flex-start"><span class="cx-face">👀</span><div class="flex-1 min-w-0"><p class="cx-kicker">${esc(aiName())} quiere saber</p><p class="cx-askq mt-1" style="font-size:1.15rem">${esc(q)}</p>
      <p class="hint mt-1">Tocaba ${t.time ? `a las ${esc(hm12(t.time))}` : 'hoy'}${ck.asks > 1 ? ` · te pregunto por ${ck.asks}ª vez` : ''}</p></div><button class="icon-btn" data-close-sheet aria-label="Cerrar">${ic('x')}</button></div>
      <div class="cx-opts" style="margin-top:.4rem">${ANSWERS.map(a => `<button type="button" class="cx-opt" data-ans="${a.id}"><span class="em">${a.em}</span><span>${esc(a.label)}</span></button>`).join('')}</div>
      ${SR ? `<div class="cx-row"><button type="button" class="cx-mic" id="cxNMic" aria-label="Responder por voz">${ic('mic')}</button><p class="hint" id="cxNHeard">O respóndeme por voz: "sí", "voy en eso", "mañana"…</p></div>` : ''}</div>`;
    el.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => { closeSheets(); answerCheck(t, b.dataset.ans); });
    const mic = el.querySelector('#cxNMic');
    if (mic) mic.onclick = () => quickListen((txt) => {
      const o = matchOption(txt, ANSWERS) || (/^no\b/.test(fold(txt)) ? ANSWERS[1] : null);
      if (o) { closeSheets(); answerCheck(t, o.id); } else { const h = el.querySelector('#cxNHeard'); if (h) h.textContent = `No entendí "${txt}". Toca una opción.`; }
    }, mic, el.querySelector('#cxNHeard'));
    openSheet('cxNudge');
    if (navigator.vibrate) navigator.vibrate(P().nosy === 'intenso' ? [200, 80, 200, 80, 200] : [120, 60, 120]);
    try { chime(); } catch { /* sin audio */ }
    if (settings.voice) speak(spoken(q));
  }

  function answerCheck(t, ans, opts = {}) {
    const tk = todayKey(), dk = t.due || tk;
    const ck = ckOf(t, dk);
    const name = t.text;
    let msg = '';
    if (ans === 'done') {
      if (!t.done) A.completeTask(t, true);
      ck.state = 'answered'; ck.answer = 'done';
      msg = shuffle1([`¡Bien hecho${coma()}! "${name}" tachada.`, `Eso es. Una menos: "${name}".`, `¡Listo! Sabía que lo harías.`, `Perfecto${coma()}, la taché por ti.`]);
      if (!opts.silent) orbsCelebrate();
    } else if (ans === 'snooze') {
      ck.snoozeUntil = Date.now() + (opts.minutes || 15) * 60000; ck.state = 'snoozed';
      msg = `Vale, te pregunto otra vez en ${opts.minutes || 15} minutos.`;
    } else if (ans === 'tomorrow') {
      const prev = { due: t.due, time: t.time };
      t.due = addDaysKey(1); if (t.timeAuto) { delete t.time; delete t.timeAuto; }
      saveTasks(); onTasksChanged();
      pushUndo(`pasar "${name}" a mañana`, () => { t.due = prev.due; if (prev.time) t.time = prev.time; saveTasks(); onTasksChanged(); });
      ck.state = 'answered'; ck.answer = 'tomorrow';
      msg = `Pasada a mañana. ${shuffle1(['Mañana no se escapa.', 'Mañana te pregunto otra vez.', 'Que no se vuelva costumbre 😉'])}`;
    } else if (ans === 'drop') {
      const prev = t.due;
      t.due = null; delete t.time; delete t.timeAuto;
      saveTasks(); onTasksChanged();
      pushUndo(`quitar la fecha de "${name}"`, () => { t.due = prev; saveTasks(); onTasksChanged(); });
      ck.state = 'answered'; ck.answer = 'drop';
      msg = `Entendido, "${name}" queda sin fecha. Si quieres la borro.`;
    }
    ck.answeredAt = Date.now();
    logC('checkin', { task: t.id, ans, asks: ck.asks });
    saveCoach();
    pushAck([`task:${t.id}:${dk}`]);
    schedulePushSync();
    renderAskCard(); renderDayCard();
    if (!opts.silent) {
      toast(msg, ans === 'done' ? 'ok' : 'info', ans === 'drop' ? { label: 'Borrarla', fn: () => A.deleteTask(t) && toast('Tarea borrada', 'info', undoAction()) } : undoAction());
      if (settings.voice && !opts.quietVoice) speak(spoken(msg));
    }
    return msg;
  }

  function checkTick() {
    if (window.DilexLock && DilexLock.isLocked()) return;
    const now = Date.now();
    if (inQuiet(now)) return;
    const tk = todayKey();
    // Avisos de inicio
    if (P().startAlert) tasksOn(tk).forEach(t => {
      if (t.done || !t.time) return;
      const at = atOf(tk, t.time), k = `s:${t.id}:${tk}`;
      if (now >= at && now - at < 20 * 60000 && !coach.checkins[k]) {
        coach.checkins[k] = { day: tk, state: 'answered' }; saveCoach();
        notifyLocal(`Es hora de: ${t.text}`, `Tienes ${estDur(t)} minutos. ¡Tú puedes!`, `start:${t.id}`);
        if (!document.hidden && !flow.alive) {
          toast(`Es hora de: ${t.text}`, 'warn', { label: 'Concentrarme', fn: () => A.startFocus(Math.min(60, estDur(t)), t) });
          if (settings.voice) speak(`${firstName() ? firstName() + ', es' : 'Es'} hora de: ${t.text}.`);
        }
      }
    });
    // Preguntas "¿ya hiciste…?"
    const due = tasksOn(tk).filter(t => !t.done && t.time && now >= taskEndAt(t)).map(t => ({ t, ck: ckOf(t, tk) }))
      .filter(x => x.ck.state !== 'answered' && now >= nextAskAt(x.t, x.ck));
    if (!due.length) return;
    const { t, ck } = due[0];
    if (document.hidden) {
      if (pushState().on) return;
      ck.asks++; ck.lastAsk = now; if (!ck.firstAsk) ck.firstAsk = now; ck.snoozeUntil = null; saveCoach();
      notifyLocal(nosyLine(t, ck.asks), 'Toca para responder', `task:${t.id}:${tk}`, true);
      return;
    }
    if (flow.alive || nudgeOpen || $$('.sheet.open').length) { renderAskCard(); return; }
    ck.asks++; ck.lastAsk = now; if (!ck.firstAsk) ck.firstAsk = now; ck.snoozeUntil = null; ck.state = 'asked'; saveCoach();
    openNudge(t, ck);
    renderAskCard();
  }
  function notifyLocal(title, body, tag, insist) {
    if (!document.hidden) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: P().discreet ? 'Tienes algo pendiente. Toca para verlo.' : body, icon: 'icon-192.png', badge: 'icon-192.png', tag, renotify: true, requireInteraction: !!insist, vibrate: [200, 100, 200], data: { url: './#hoy' } };
    if (P().discreet) title = `${aiName()} quiere saber algo`;
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(r => (r ? r.showNotification(title, opts) : new Notification(title, opts))).catch(() => {});
    else { try { new Notification(title, opts); } catch { /* sin permiso */ } }
  }

  /* ---------- Tarjetas de "Hoy" ---------- */
  function renderAskCard() {
    const box = $('#cxAskCard');
    if (!box) return;
    const list = pendingAsks().filter(x => x.ck.asks > 0 || Date.now() - taskEndAt(x.t) > 60000);
    box.classList.toggle('hidden', !list.length);
    if (!list.length) { box.innerHTML = ''; updateBadge(0); return; }
    box.innerHTML = `<div class="cx-row mb-3"><span class="tile cx-pulse" style="--h: var(--accent)">${ic('question')}</span><div class="flex-1 min-w-0"><h2 class="sec-title">${esc(aiName())} quiere saber</h2><p class="hint">${plural(list.length, 'tarea ya pasó su hora', 'tareas ya pasaron su hora')}. Respóndeme con un toque.</p></div></div>
      ${list.slice(0, 5).map(({ t, ck }) => `<div class="cx-askitem" data-ask="${t.id}"><p class="cx-askq">${esc(nosyLine(t, Math.max(1, ck.asks)))}</p><p class="hint cx-small mt-0.5">Era a las ${esc(hm12(t.time))}</p>
        <div class="cx-acts">${ANSWERS.map(a => `<button type="button" class="btn btn-sm ${a.id === 'done' ? 'cx-yes' : ''}" data-ans="${a.id}">${a.em} ${esc(a.short)}</button>`).join('')}</div></div>`).join('')}`;
    box.querySelectorAll('[data-ask]').forEach(row => row.querySelectorAll('[data-ans]').forEach(b => b.onclick = () => { const t = tasks.find(x => x.id === row.dataset.ask); if (t) answerCheck(t, b.dataset.ans); }));
    updateBadge(list.length);
  }
  function updateBadge(n) {
    const a = $('.cx-nav5 [data-view-go="hoy"]');
    if (!a) return;
    let d = a.querySelector('.cx-dot');
    if (n && !d) { d = document.createElement('span'); d.className = 'cx-dot'; a.prepend(d); }
    if (!n && d) d.remove();
    try { if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {}); } catch { /* sin insignia */ }
  }

  function renderDayCard() {
    const box = $('#cxDayCard');
    if (!box) return;
    document.documentElement.classList.toggle('cx-coached', !!coach.wizardDone);
    const tk = todayKey(), q = coach.quizzes[tk] || {};
    let cta = '';
    if (!coach.wizardDone) cta = `<div class="cx-soft mb-4"><p class="cx-b">Descubre qué te frena y deja que organice tu vida</p><p class="hint mt-1">3 minutos de preguntas. Puedes responder por voz.</p><button type="button" class="btn btn-accent mt-3" data-cx-act="wizard">${ic('wand')}Hacer mi diagnóstico</button></div>`;
    else if (morningDue()) cta = `<div class="cx-soft mb-4 cx-row" style="flex-wrap:wrap"><div class="flex-1 min-w-[12rem]"><p class="cx-b">☀️ Empecemos tu día</p><p class="hint mt-0.5">4 preguntas rápidas y yo organizo el resto.</p></div><button type="button" class="btn btn-accent" data-cx-act="morning">Empezar (2 min)</button></div>`;
    else if (eveningDue()) cta = `<div class="cx-soft mb-4 cx-row" style="flex-wrap:wrap"><div class="flex-1 min-w-[12rem]"><p class="cx-b">🌙 Hora del cierre del día</p><p class="hint mt-0.5">Cuéntame qué hiciste y dejamos listo mañana.</p></div><button type="button" class="btn btn-accent" data-cx-act="evening">Cerrar el día</button></div>`;
    const next = tasksOn(tk).filter(t => !t.done && t.time && tMin(t.time) + estDur(t) > nowM()).sort((a, b) => tMin(a.time) - tMin(b.time))[0];
    const noTime = tasksOn(tk).filter(t => !t.done && !t.time).length;
    const doneN = tasksOn(tk).filter(t => t.done).length, allN = tasksOn(tk).length;
    box.innerHTML = `<div class="cx-row mb-3" style="flex-wrap:wrap"><span class="tile" style="--h: var(--h-plan)">${ic('clock')}</span><div class="flex-1 min-w-0" style="flex-basis:60%"><h2 class="sec-title">Tu día con ${esc(aiName())}</h2>
      <p class="hint">${next ? `Ahora toca: <b>${esc(next.text)}</b> · ${esc(hm12(next.time))}` : allN ? `${doneN} de ${allN} tareas hechas hoy` : 'Sin tareas con hora todavía'}</p></div>
      <div class="cx-row" style="gap:.4rem"><button type="button" class="btn btn-sm" data-cx-act="capture" title="Agregar y organizar">${ic('plus')}Agregar</button><button type="button" class="btn btn-sm btn-accent" data-cx-act="organize">${ic('wand')}Organízame</button></div></div>
      ${cta}${coach.wizardDone ? `<p class="cx-small cx-muted mb-3">💡 ${esc(coachTipFor(tk))}</p>` : ''}
      ${timelineHTML(tk, { compact: true })}
      ${noTime ? `<p class="hint mt-2">${plural(noTime, 'tarea de hoy no tiene', 'tareas de hoy no tienen')} hora. Toca "Organízame" y se la pongo.</p>` : ''}
      <a href="#plan" data-view-go="plan" class="text-sm font-semibold text-accent mt-3 inline-block">Ver mi plan completo →</a>`;
    void q;
  }
  const coachTipFor = (tk) => { const t = prob().tips; let h = 0; for (const c of tk) h = (h * 31 + c.charCodeAt(0)) >>> 0; return t[h % t.length]; };

  /* ---------- Semana (Progreso) ---------- */
  function renderWeek() {
    const box = $('#cxWeek');
    if (!box) return;
    const days = lastDays(7);
    const doneBy = days.map(d => tasks.filter(t => t.done && t.completedAt && dayKey(t.completedAt) === d.key).length);
    const maxD = Math.max(1, ...doneBy);
    const cks = coach.log.filter(l => l.kind === 'checkin' && l.at >= days[0].key);
    const yes = cks.filter(l => l.ans === 'done').length;
    const closes = days.filter(d => coach.quizzes[d.key] && coach.quizzes[d.key].evening).length;
    const mornings = days.filter(d => coach.quizzes[d.key] && coach.quizzes[d.key].morning).length;
    const rates = days.map(d => coach.quizzes[d.key]?.evening?.rating).filter(Boolean).map(Number);
    const avg = rates.length ? (rates.reduce((a, b) => a + b, 0) / rates.length) : null;
    const EM = ['', '😞', '😕', '😐', '🙂', '🤩'];
    box.innerHTML = `<div class="cx-row mb-4"><span class="tile" style="--h: var(--h-stats)">${ic('flame')}</span><div class="flex-1 min-w-0"><h2 class="sec-title">Tu semana con ${esc(aiName())}</h2><p class="hint">Lo que hiciste y cómo respondiste a mis preguntas</p></div></div>
      <div class="cx-grid2" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="cx-box"><p class="hint cx-small">Respuestas "sí, la hice"</p><p class="text-2xl font-extrabold">${cks.length ? Math.round((yes / cks.length) * 100) : 0}%</p><p class="cx-small cx-muted">${yes} de ${cks.length} preguntas</p></div>
        <div class="cx-box"><p class="hint cx-small">Cierres del día</p><p class="text-2xl font-extrabold">${closes}/7</p><p class="cx-small cx-muted">${mornings} mañanas organizadas</p></div>
        <div class="cx-box"><p class="hint cx-small">Cómo calificas tus días</p><p class="text-2xl font-extrabold">${avg ? `${EM[Math.round(avg)]} ${fmt(avg, 1)}` : '—'}</p><p class="cx-small cx-muted">promedio de 1 a 5</p></div>
        <div class="cx-box"><p class="hint cx-small">Tareas hechas</p><p class="text-2xl font-extrabold">${doneBy.reduce((a, b) => a + b, 0)}</p><p class="cx-small cx-muted">en 7 días</p></div></div>
      <div class="mt-4 flex items-end gap-2" style="height:6.5rem" role="img" aria-label="Tareas hechas por día">${days.map((d, i) => `<div class="flex-1 flex flex-col items-center gap-1" style="height:100%;justify-content:flex-end"><span class="cx-small cx-b">${doneBy[i] || ''}</span><div style="width:100%;max-width:2.2rem;border-radius:8px 8px 3px 3px;background:rgb(var(--accent) / ${d.key === todayKey() ? 1 : .45});height:${Math.max(4, (doneBy[i] / maxD) * 70)}%"></div><span class="cx-small cx-muted">${esc(d.wd)}</span></div>`).join('')}</div>`;
  }

  /* =====================================================================
     PREGUNTAS DE LA MAÑANA Y CIERRE DEL DÍA
  ===================================================================== */
  const quizOf = (dk = todayKey()) => (coach.quizzes[dk] || (coach.quizzes[dk] = {}));
  function morningDue() {
    if (!coach.wizardDone || !P().morningQuiz) return false;
    const q = coach.quizzes[todayKey()] || {};
    if (q.morning || q.morningSkip) return false;
    const n = nowM();
    return n >= (tMin(P().wake) ?? 0) - 60 && n < (tMin(P().closeTime) ?? 1260) - 60;
  }
  function eveningDue() {
    if (!coach.wizardDone || !P().eveningQuiz) return false;
    const q = coach.quizzes[todayKey()] || {};
    if (q.evening || q.eveningSkip) return false;
    return nowM() >= (tMin(P().closeTime) ?? 1260);
  }

  const DAY_ACTS = [
    { id: 'done', em: '✅', label: 'Ya la hice', yes: true, syn: ['si', 'ya', 'hecha', 'la hice', 'listo'] },
    { id: 'today', em: '📌', label: 'La hago hoy', syn: ['hoy', 'para hoy', 'la hago'] },
    { id: 'later', em: '📅', label: 'Otro día', syn: ['otro dia', 'manana', 'despues', 'luego'] },
    { id: 'drop', em: '🗑️', label: 'Ya no la haré', no: true, syn: ['borrala', 'ya no', 'no la hare', 'olvidala'] },
  ];
  function applyDayAct(t, act, base) {
    if (!t) return;
    if (act === 'done') A.completeTask(t, true);
    else if (act === 'today') A.updateTask(t, { due: base });
    else if (act === 'later') { A.updateTask(t, { due: addDaysFrom(base, 1) }); if (t.timeAuto) { delete t.time; delete t.timeAuto; saveTasks(); } }
    else if (act === 'drop') A.deleteTask(t);
  }

  async function runMorningQuiz(force) {
    if (flow.alive) return;
    const tk = todayKey();
    const left = tasks.filter(t => !t.done && t.due && t.due < tk).sort((a, b) => taskScore(b) - taskScore(a)).slice(0, 5);
    const steps = [
      { id: 'energy', type: 'single', kicker: 'Buenos días', q: `${greetWord()}${coma()}. ¿Con cuánta energía empiezas hoy?`, cols: 1, optional: false, options: [
        { id: 'baja', em: '🪫', label: 'Baja', desc: 'Hoy toca ir suave', syn: ['poca', 'cansado', 'mal'] },
        { id: 'media', em: '🙂', label: 'Normal', desc: 'Un día normal', syn: ['normal', 'bien', 'regular'] },
        { id: 'alta', em: '⚡', label: 'Alta', desc: 'Con todas las ganas', syn: ['mucha', 'excelente', 'genial', 'full'] }] },
      ...left.map((t, i) => ({ id: `left${i}`, type: 'single', kicker: `Pendiente de antes · ${i + 1} de ${left.length}`, q: `Quedó pendiente "${t.text}". ¿Qué hacemos?`,
        sub: t.due ? `Era para ${daysBetween(t.due, tk) === 1 ? 'ayer' : `hace ${daysBetween(t.due, tk)} días`}.` : '', options: DAY_ACTS, onAnswer: (v) => { applyDayAct(t, v, tk); return true; } })),
      { id: 'focus', type: 'single', kicker: 'Tu prioridad', q: '¿Qué es lo más importante que tienes que lograr hoy?', sub: 'Lo pondré primero en tu plan y en tu mejor hora.',
        options: () => { const c = tasks.filter(t => !t.done && (!t.due || t.due <= tk)).sort((a, b) => taskScore(b) - taskScore(a)).slice(0, 4); return c.map(t => ({ id: t.id, label: t.text, em: '🎯' })); },
        alt: { label: 'Otra cosa', fn: () => { flowGo(flow.steps.findIndex(s => s.id === 'focusText')); } },
        freeVoice: (txt, a) => { a.focusText = cap(txt); flowGo(flow.steps.findIndex(s => s.id === 'capacity')); }, next: () => 'capacity' },
      { id: 'focusText', type: 'text', kicker: 'Tu prioridad', q: 'Dímelo con tus palabras', placeholder: 'Ej.: Terminar la propuesta para el cliente', required: true, skip: (a) => !!a.focus && !a._wantText,
        onAnswer: (v, a) => { a.focusText = v; return true; } },
      { id: 'capacity', type: 'single', skip: () => !!P().simple, kicker: 'Tu tiempo', q: '¿Cuánto tiempo libre real tienes hoy para tus tareas?', sub: 'Así no te lleno el día de más.', options: [
        { id: '60', em: '⏱️', label: 'Una hora o menos', syn: ['una hora', 'poco', 'nada'] }, { id: '180', em: '🕒', label: 'De dos a tres horas', syn: ['dos', 'tres'] },
        { id: '300', em: '🕔', label: 'De cuatro a cinco horas', syn: ['cuatro', 'cinco'] }, { id: '600', em: '🌞', label: 'Casi todo el día', syn: ['todo el dia', 'mucho'] }] },
      { id: 'more', type: 'text', skip: () => !!P().simple, kicker: 'Algo más', q: '¿Hay algo más que tengas que hacer hoy?', sub: 'Dímelo como quieras, con hora si la tiene: "llamar a Juan a las 4 y luego ir al banco". Si no hay nada, toca Continuar.', placeholder: 'Escribe o dicta tus tareas', rows: 3, max: 400,
        voiceAppend: true, onAnswer: (v, a) => { if (v && !/^(nada|no|ninguna|eso es todo)$/i.test(fold(v))) a.added = addTasksFromText(v, { defaultDue: tk }).length; return true; }, cta: 'Continuar' },
      { id: 'done', type: 'done', optional: false, kicker: 'Día organizado', q: (a) => { finishMorning(a); return 'Tu día está listo'; }, sub: (a) => a._sum || '', html: (a) => a._html || '', cta: 'Ver mi día',
        onShow: () => {}, say: (a) => spoken(`Tu día está listo. ${a._sum || ''}`) },
    ];
    // "Otra cosa" activa el paso de texto
    steps[steps.findIndex(s => s.id === 'focus')].alt.fn = (a) => { a._wantText = true; delete a.focus; flowGo(steps.findIndex(s => s.id === 'focusText')); };
    // Calcula el resumen antes de mostrar el último paso
    const doneStep = steps[steps.length - 1];
    const moreStep = steps[steps.length - 2];
    const origMore = moreStep.onAnswer;
    moreStep.onAnswer = (v, a) => { origMore(v, a); finishMorning(a); return true; };
    moreStep.onSkip = (a) => finishMorning(a);
    void doneStep;
    const ans = await runFlow(steps, { onCancel: () => { if (!force) { quizOf().morningSkip = true; saveCoach(); renderDayCard(); } } });
    if (ans) { showView('hoy'); renderDayCard(); }
  }
  function finishMorning(a) {
    if (a._fin) return;
    a._fin = true;
    const tk = todayKey();
    const focusTask = a.focus ? tasks.find(t => t.id === a.focus) : null;
    if (focusTask && focusTask.due !== tk) A.updateTask(focusTask, { due: tk });
    if (focusTask) { focusTask.priority = 'urgent'; }
    let focusText = focusTask ? focusTask.text : a.focusText;
    if (a.focusText && !tasks.some(t => !t.done && fold(t.text) === fold(a.focusText))) { A.addTask({ text: a.focusText, due: tk, priority: 'urgent' }); focusText = a.focusText; }
    if (focusText) { const p = todayPlan(); const i = p.findIndex(x => fold(x.text) === fold(focusText)); if (i > 0) p.splice(i, 1); if (i !== 0) { p.unshift({ text: cap(focusText).slice(0, 90), done: false }); p.length = 3; savePlan(); renderPlan(); } }
    const r = organizeDay({ moveOverdue: false, energy: a.energy, capacity: a.capacity ? +a.capacity : null, focusText: null });
    quizOf(tk).morning = { at: new Date().toISOString(), energy: a.energy, capacity: a.capacity ? +a.capacity : null, focus: focusText || null, added: a.added || 0 };
    logC('morning', { energy: a.energy });
    saveCoach();
    const p = prob();
    a._sum = organizeSummary(r);
    a._html = `<div class="cx-soft"><p class="cx-b">${esc(p.em)} Consejo para hoy</p><p class="mt-1 text-[.95rem]">${esc(a.energy === 'baja' ? 'Hoy vamos suave: empieza por lo más corto para ganar impulso y no te exijas de más.' : coachTipFor(tk))}</p></div>
      ${coach.yearGoal && (diag() && diag().main === 'motivacion' || a.energy === 'baja') ? `<div class="cx-box mt-3"><p class="hint cx-small">Recuerda para qué lo haces</p><p class="cx-b mt-0.5">${esc(coach.yearGoal)}</p></div>` : ''}
      <div class="mt-4">${timelineHTML(tk, { compact: true })}</div>`;
  }

  async function runEveningQuiz(force) {
    if (flow.alive) return;
    const tk = todayKey(), tm = addDaysKey(1);
    const pend = tasksOn(tk).filter(t => !t.done).sort((a, b) => (tMin(a.time) ?? 9999) - (tMin(b.time) ?? 9999)).slice(0, 6);
    const pendH = habits.filter(h => !h.days[tk]).slice(0, 3);
    const steps = [
      ...pend.map((t, i) => ({ id: `p${i}`, type: 'single', kicker: `Cierre del día · ${i + 1} de ${pend.length}`, q: `¿Hiciste "${t.text}"?`, sub: t.time ? `Estaba a las ${hm12(t.time)}.` : '',
        options: [{ id: 'done', em: '✅', label: 'Sí, la hice', yes: true, syn: ['si', 'ya', 'la hice', 'claro'] }, { id: 'later', em: '📅', label: 'No, pásala a mañana', syn: ['manana', 'no', 'pasala'] },
          { id: 'noday', em: '🗂️', label: 'No, déjala sin fecha', syn: ['sin fecha', 'algun dia'] }, { id: 'drop', em: '🗑️', label: 'Ya no hace falta', no: true, syn: ['borrala', 'ya no', 'no hace falta'] }],
        onAnswer: (v, a) => { if (v === 'done') A.completeTask(t, true); else if (v === 'later') { A.updateTask(t, { due: tm }); if (t.timeAuto) { delete t.time; delete t.timeAuto; saveTasks(); } } else if (v === 'noday') { A.updateTask(t, { due: null }); delete t.time; saveTasks(); } else if (v === 'drop') A.deleteTask(t); a._no = (a._no || 0) + (v === 'done' ? 0 : 1); a._yes = (a._yes || 0) + (v === 'done' ? 1 : 0); return true; } })),
      ...pendH.map((h, i) => ({ id: `h${i}`, type: 'single', kicker: 'Tus hábitos', q: `¿Hiciste "${h.name}" hoy?`, cols: 2,
        options: [{ id: 'si', em: '🔥', label: 'Sí', yes: true }, { id: 'no', em: '➖', label: 'Hoy no', no: true }], onAnswer: (v) => { if (v === 'si') A.markHabit(h, tk, true); return true; } })),
      { id: 'rating', type: 'emoji', kicker: 'Tu día', q: '¿Cómo calificas tu día?', optional: false, options: [
        { id: '1', em: '😞', label: 'Malo', syn: ['malo', 'fatal', 'uno'] }, { id: '2', em: '😕', label: 'Flojo', syn: ['flojo', 'dos'] }, { id: '3', em: '😐', label: 'Normal', syn: ['normal', 'regular', 'tres'] },
        { id: '4', em: '🙂', label: 'Bueno', syn: ['bueno', 'bien', 'cuatro'] }, { id: '5', em: '🤩', label: 'Genial', syn: ['genial', 'excelente', 'cinco'] }] },
      { id: 'block', type: 'single', kicker: 'Sin juzgar', q: '¿Qué fue lo que más te frenó hoy?', sub: 'Con esto ajusto tu plan.', skip: (a) => !(a._no > 0 || +a.rating <= 3), options: [
        { id: 'distracciones', em: '📱', label: 'Distracciones', syn: ['celular', 'redes'] }, { id: 'cansancio', em: '🥱', label: 'Cansancio', syn: ['cansado', 'sueno'] },
        { id: 'imprevistos', em: '🚧', label: 'Imprevistos', syn: ['imprevisto', 'surgio'] }, { id: 'planificacion', em: '🗺️', label: 'Planeé de más', syn: ['planifique', 'mucho', 'demasiado'] },
        { id: 'ganas', em: '🔋', label: 'No tenía ganas', syn: ['ganas', 'flojera'] }] },
      { id: 'tomorrow', type: 'single', kicker: 'Mañana', q: '¿Qué es lo primero que harás mañana?', sub: 'Lo dejo como tu prioridad número uno.',
        options: () => tasks.filter(t => !t.done && (t.due === tm || !t.due || t.due < tm)).sort((a, b) => taskScore(b) - taskScore(a)).slice(0, 4).map(t => ({ id: t.id, label: t.text, em: '🎯' })),
        alt: { label: 'Otra cosa', fn: (a) => { a._wantText = true; delete a.tomorrow; flowGo(flow.steps.findIndex(s => s.id === 'tomorrowText')); } },
        freeVoice: (txt, a) => { a.tomorrowText = cap(txt); flowNext(); }, next: () => 'tomorrowText' },
      { id: 'tomorrowText', type: 'text', kicker: 'Mañana', q: '¿Qué es lo primero que harás mañana?', placeholder: 'Ej.: Ir al gimnasio a las 7', skip: (a) => !a._wantText || !!a.tomorrowText,
        onAnswer: (v, a) => { a.tomorrowText = v; return true; } },
      { id: 'done', type: 'done', optional: false, kicker: 'Día cerrado', q: (a) => a._title || 'Día cerrado', sub: (a) => a._sum || '', html: (a) => a._html || '', cta: 'Buenas noches',
        say: (a) => spoken(`${a._title || ''}. ${a._sum || ''}`) },
    ];
    const finish = (a) => {
      const all = tasks.filter(t => t.completedAt && dayKey(t.completedAt) === tk).length;
      const t1 = a.tomorrow ? tasks.find(t => t.id === a.tomorrow) : null;
      let first = t1 ? t1.text : a.tomorrowText;
      if (t1 && t1.due !== tm) A.updateTask(t1, { due: tm });
      if (a.tomorrowText && !tasks.some(t => !t.done && fold(t.text) === fold(a.tomorrowText))) addTasksFromText(a.tomorrowText, { defaultDue: tm });
      if (first) { if (!Array.isArray(plan[tm])) plan[tm] = [{ text: '', done: false }, { text: '', done: false }, { text: '', done: false }]; plan[tm][0] = { text: cap(first).slice(0, 90), done: false }; savePlan(); }
      quizOf(tk).evening = { at: new Date().toISOString(), rating: a.rating ? +a.rating : null, block: a.block || (a._no ? null : 'nada'), first: first || null, done: a._yes || 0, moved: a._no || 0 };
      logC('evening', { rating: a.rating });
      saveCoach();
      pushAck([`close:${tk}`]);
      schedulePushSync();
      const streakN = (() => { let n = 0; for (let i = 0; i < 60; i++) { const k = addDaysKey(-i); if (coach.quizzes[k] && coach.quizzes[k].evening) n++; else if (i) break; } return n; })();
      a._title = +a.rating >= 4 ? `¡Buen día${coma()}!` : +a.rating <= 2 ? 'Mañana será mejor' : 'Día cerrado';
      a._sum = `Hoy completaste ${plural(all, 'tarea', 'tareas')}${a._no ? ` y moviste ${a._no}` : ''}. ${first ? `Mañana empiezas con "${first}".` : ''}`;
      const advice = { distracciones: 'Mañana pon el celular lejos durante tu bloque de enfoque.', cansancio: 'Duerme a tu hora: mañana te pondré lo difícil en tu mejor momento.', imprevistos: 'Mañana dejaré huecos libres entre tareas por si surge algo.', planificacion: 'Mañana te pongo menos tareas; mejor pocas y hechas.', ganas: 'Mañana empezamos con algo fácil para ganar impulso.' }[a.block];
      a._html = `${advice ? `<div class="cx-soft"><p class="cx-b">Para mañana</p><p class="mt-1">${esc(advice)}</p></div>` : ''}
        <div class="cx-grid2 mt-3"><div class="cx-box"><p class="hint cx-small">Cierres seguidos</p><p class="text-2xl font-extrabold">🔥 ${streakN}</p></div><div class="cx-box"><p class="hint cx-small">Hechas hoy</p><p class="text-2xl font-extrabold">✅ ${all}</p></div></div>`;
      if (a.block === 'planificacion') { P().autoSchedule = true; }
    };
    const ratingStep = steps.find(s => s.id === 'rating');
    ratingStep.onAnswer = () => true;
    const lastAsk = steps[steps.length - 2];
    lastAsk.onAnswer = (v, a) => { a.tomorrowText = v; finish(a); return true; };
    lastAsk.onSkip = (a) => finish(a);
    const tStep = steps.find(s => s.id === 'tomorrow');
    tStep.onAnswer = (v, a) => { a.tomorrow = v; delete a._wantText; return true; };
    tStep.next = (v, a) => { if (a.tomorrow) { finish(a); return 'done'; } return 'tomorrowText'; };
    tStep.onSkip = (a) => { if (!a._wantText) finish(a); };
    const ans = await runFlow(steps, { onCancel: () => { if (!force) { quizOf().eveningSkip = true; saveCoach(); renderDayCard(); } } });
    if (ans) { showView('hoy'); renderDayCard(); if (settings.voice) speak(shuffle1(['Descansa. Mañana seguimos.', 'Buen trabajo hoy. A descansar.', 'Desconecta, te lo ganaste.'])); }
  }
  function maybeRunQuizzes() {
    if (flow.alive || (window.DilexLock && DilexLock.isLocked())) return;
    if (!coach.wizardDone) {
      if (!coach.wizardSkipped || daysBetween(coach.wizardSkipped, todayKey()) >= 2) setTimeout(() => runWizard(), 400);
      return;
    }
    if (morningDue()) runMorningQuiz();
    else if (eveningDue()) runEveningQuiz();
  }

  /* =====================================================================
     VOZ: dictar tareas (una o varias a la vez)
  ===================================================================== */
  const REPEAT = { daily: 'Todos los días', weekdays: 'De lunes a viernes', weekly: 'Cada semana', monthly: 'Cada mes' };
  const REPEAT_RE = [
    [/\b(todos los dias|cada dia|diariamente|a diario|todas las (?:mananas|tardes|noches))\b/, 'daily'],
    [/\b(de lunes a viernes|entre semana|dias laborables|cada dia laborable)\b/, 'weekdays'],
    [/\b(cada semana|semanalmente|todas las semanas|cada (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|todos los (?:lunes|martes|miercoles|jueves|viernes|sabados|domingos))\b/, 'weekly'],
    [/\b(cada mes|mensualmente|todos los meses)\b/, 'monthly'],
  ];
  const ITEM_START = /^(?:y\s+)?(?:[a-zñ]+(?:ar|er|ir)(?:me|le|lo|la|les|los|las|se)?|reunion|reuniones|junta|cita|clase|clases|examen|entrevista|consulta|turno|vuelo|viaje|cumpleanos|cena|almuerzo|desayuno|fiesta|partido|meta|objetivo|idea|nota|apunte|recuerdame|recordatorio|avisame|gimnasio|gym|tengo|hay que|debo|necesito|quiero|me toca|no olvidar|habito|llamada|dentista|doctor|medico|tarea|compromiso|evento)\b/;
  const startsItem = (seg) => ITEM_START.test(fold(seg.trim()));
  function splitTasks(text) {
    const first = String(text).split(/\s*(?:;|\n|\.\s+|,\s*(?:y\s+)?(?:luego|despues|después|tambien|también|ademas|además)\s+|\s+y\s+(?:luego|despues|después|tambien|también|ademas|además)\s+|\s+(?:luego|después|despues|además|ademas|también|tambien)\s+|,\s*otra\s+(?:tarea\s+)?(?:es\s+)?|\s+y\s+otra\s+(?:cosa|tarea)\s*(?:es\s+)?)\s*/i);
    const out = [];
    for (const chunk of first) {
      // Comas e "y": solo separan si lo que sigue empieza como algo nuevo ("pagar…", "reunión…", "meta:…")
      const parts = chunk.split(/\s*,\s*|\s+y\s+(?=\S)/);
      const seps = chunk.match(/\s*,\s*|\s+y\s+(?=\S)/g) || [];
      let cur = parts[0] || '';
      for (let i = 1; i < parts.length; i++) {
        if (startsItem(parts[i])) { out.push(cur); cur = parts[i]; } else cur += seps[i - 1] + parts[i];
      }
      out.push(cur);
    }
    return out.map(s => s.trim().replace(/^(y|e|tambien|también|ademas|además|luego|despues|después)\s+/i, '').replace(/^(tengo que|hay que|debo|necesito|anota(?:r)?|apunta(?:r)?|agrega(?:r)?|añade|anade|pon(?:er)?)\s+/i, '').trim())
      .filter(s => s.length > 1);
  }
  /* =====================================================================
     ORGANIZADOR AUTOMÁTICO: escribes o dices lo que sea y DLX decide
     dónde va (tarea, agenda, recordatorio, hábito, meta o nota) y le da
     forma: fecha, hora, duración, área e importancia.
  ===================================================================== */
  const KINDS = {
    task: { name: 'Tarea', icon: 'tasks', hue: '--h-tasks', where: 'Tareas' },
    event: { name: 'Agenda', icon: 'calendar', hue: '--h-plan', where: 'tu agenda' },
    reminder: { name: 'Recordatorio', icon: 'bell', hue: '--h-goals', where: 'Recordatorios' },
    habit: { name: 'Hábito', icon: 'repeat', hue: '--h-habits', where: 'Hábitos' },
    goal: { name: 'Meta', icon: 'flag', hue: '--h-goals', where: 'Metas' },
    note: { name: 'Nota', icon: 'note', hue: '--h-notes', where: 'Notas' },
  };
  const EVENT_RE = /\b(reunion|reuniones|junta|meeting|cita|consulta|turno|clase|clases|examen|entrevista|cumpleanos|cumple|cena|almuerzo|desayuno con|fiesta|partido|vuelo|viaje|dentista|doctor|medico|webinar|evento|boda|misa|concierto|presentacion con|llamada con|videollamada|zoom|conferencia|curso de|taller)\b/;
  const EVENT_DUR = [[/\b(vuelo|viaje)\b/, 180], [/\b(examen|boda|concierto|fiesta|cena)\b/, 120], [/\b(clase|clases|curso de|taller|partido)\b/, 90], [/\b(llamada|videollamada|zoom)\b/, 30], [/.*/, 60]];
  const HABIT_RE = /\b(leer|meditar|ejercicio|entrenar|gimnasio|gym|correr|caminar|estudiar|tomar agua|beber agua|dormir temprano|levantarme|despertarme|journaling|escribir en mi diario|orar|rezar|estirar|yoga|practicar|repasar|ahorrar|no fumar|sin azucar|cama hecha|vitaminas)\b/;
  const AREA_RULES = [
    ['trabajo', /\b(cliente|clientes|correo|correos|email|reporte|informe|venta|ventas|lead|leads|crm|jefe|oficina|propuesta|cotizacion|factura|proveedor|reunion|junta|turno|trabajo|empresa|presentacion|llamar a (?:un |al )?cliente|onboat|yacht|pedido|inventario)\b/],
    ['estudio', /\b(estudiar|examen|curso|clase|tarea de|leer el capitulo|repasar|ingles|universidad|tesis|investigar|aprender|practicar)\b/],
    ['ejercicio', /\b(gimnasio|gym|correr|entrenar|caminar|yoga|pesas|bici|nadar|cardio|futbol|partido|estirar)\b/],
    ['hogar', /\b(limpiar|lavar|cocinar|comprar|mercado|supermercado|pagar|luz|agua|internet|alquiler|renta|ropa|arreglar|planchar|basura|carro|banco|cuentas|casa)\b/],
    ['social', /\b(mama|papa|amigo|amiga|amigos|familia|novia|novio|esposa|esposo|hermano|hermana|cumpleanos|regalo|visitar|cena|fiesta|boda)\b/],
  ];
  const DUR_RULES = [[/\b(pagar|enviar|mandar|responder|contestar|agendar|confirmar|reservar)\b/, 15], [/\b(llamar|revisar|buscar|imprimir|firmar)\b/, 20], [/\b(comprar|lavar|cocinar|ordenar)\b/, 40], [/\b(limpiar|gimnasio|gym|entrenar|correr|estudiar|leer)\b/, 60], [/\b(preparar|escribir|redactar|disenar|reporte|informe|propuesta|presentacion|proyecto)\b/, 75]];
  const routeKey = (title) => cxToks(title).slice(0, 2).join(' ');

  /** Analiza una frase sin crear nada: devuelve qué es y con qué datos. */
  function analyzeItem(raw, opts = {}) {
    let p = String(raw).trim(), repeat = null, forced = null;
    let f0 = fold(p);
    const lead = /^(nota|idea|apunte)\s*[:,-]?\s+/.exec(f0); if (lead) { forced = 'note'; p = p.slice(lead[0].length); }
    const lg = /^(meta|objetivo|mi meta es|mi objetivo es)\s*[:,-]?\s+/.exec(f0); if (lg) { forced = 'goal'; p = p.slice(lg[0].length); }
    const lr = /^(recuerdame|recordarme|avisame|recordatorio(?: de| para)?|no olvidar|no olvides)\s+(que\s+|de\s+|a\s+)?/.exec(f0); if (lr) { forced = 'reminder'; p = p.slice(lr[0].length); }
    const lh = /^(habito|nuevo habito|crear el habito)\s*[:,-]?\s+/.exec(f0); if (lh) { forced = 'habit'; p = p.slice(lh[0].length); }
    const le = /^(agenda(?:me)?|compromiso|evento|en mi agenda|en el calendario)\s*[:,-]?\s+/.exec(f0); if (le) { forced = 'event'; p = p.slice(le[0].length); }
    f0 = fold(p);
    for (const [re, kind] of REPEAT_RE) { const m = re.exec(f0); if (m) { repeat = kind; p = p.slice(0, m.index) + ' ' + p.slice(m.index + m[0].length); const wd = /(lunes|martes|miercoles|jueves|viernes|sabado|domingo)/.exec(m[0]); if (wd) p += ` el ${wd[1]}`; break; } }
    const g = pair(p);
    // Rango "de 3 a 5"
    let range = null;
    const rm = /\b(?:de|desde)\s+(?:las?\s+)?(\d{1,2}(?:[:.]\d{2})?)\s*(am|pm|de la manana|de la tarde|de la noche)?\s+(?:a|hasta)\s+(?:las?\s+)?(\d{1,2}(?:[:.]\d{2})?)\s*(am|pm|de la manana|de la tarde|de la noche)?\b/.exec(g.n);
    if (rm) {
      const toM = (h, suf, other) => { let [hh, mm] = h.split(/[:.]/).map(Number); mm = mm || 0; const s = suf || other || ''; if (/pm|tarde|noche/.test(s) && hh < 12) hh += 12; else if (!s && hh >= 1 && hh <= 7) hh += 12; return hh * 60 + mm; };
      const a = toM(rm[1], rm[2], rm[4]); let b = toM(rm[3], rm[4], rm[2]); if (b <= a) b += 12 * 60;
      range = [tHM(a), tHM(Math.min(b, 1439))];
      cut(g, /\b(?:de|desde)\s+(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?\s*(am|pm|de la manana|de la tarde|de la noche)?\s+(?:a|hasta)\s+(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?\s*(am|pm|de la manana|de la tarde|de la noche)?\b/);
    }
    const clk = range ? null : takeTime(g);
    const due0 = takeDate(g);
    let priority = 'normal', imp = null;
    if (cut(g, /\b(es\s+)?(muy\s+)?(urgente|importante|prioritari[ao]|con\s+prioridad|sin\s+falta|si o si)\b/)) { priority = 'urgent'; imp = 3; }
    const dm = /\b(?:durante|por)\s+(\d{1,3})\s*(minutos?|min|horas?|h)\b|\b(media hora|una hora|dos horas)\b/.exec(g.n);
    let durMin = null;
    if (dm) { durMin = dm[3] ? { 'media hora': 30, 'una hora': 60, 'dos horas': 120 }[dm[3]] : +dm[1] * (/^h/.test(dm[2]) ? 60 : 1); cut(g, /\b(?:durante|por)\s+\d{1,3}\s*(minutos?|min|horas?|h)\b|\b(?:durante\s+)?(media hora|una hora|dos horas)\b/); }
    const someday = !!cut(g, /\b(algun dia|cuando pueda|sin fecha|mas adelante)\b/);
    const goalWhen = /\b(este mes|este ano|para fin de ano|para fin de mes|antes de fin de ano)\b/.exec(g.n);
    if (goalWhen && (forced === 'goal' || /^(quiero|voy a|me propongo|ahorrar|bajar|perder|leer|correr|ganar|lograr|vender)\b/.test(g.n.trim()))) cut(g, /\b(este mes|este ano|para fin de ano|para fin de mes|antes de fin de ano)\b/);
    tidy(g);
    const title = cap(g.s.trim().replace(/[.,;:]+$/, '').replace(/^(un|una|unos|unas)\s+/i, ''));
    if (!title) return null;
    const f = fold(`${raw}`), ft = fold(title);
    // Fecha y hora
    let due = due0 === undefined ? null : due0, time = null;
    if (clk != null) {
      if (clk && typeof clk === 'object' && !clk.explicit && clk.h >= 1 && clk.h <= 7) clk.h += 12;
      const at = typeof clk === 'number' ? clk : atFrom(due, clk);
      if (!due) due = dayKey(at);
      const d = new Date(at); time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    if (range) { time = range[0]; if (!due) due = tMin(range[0]) > nowM() ? todayKey() : addDaysKey(1); }
    // ¿Qué es?
    let kind = forced;
    const learned = coach.routeMemory && coach.routeMemory[routeKey(title)];
    if (!kind && learned && KINDS[learned]) kind = learned;
    if (!kind) {
      const goalNum = /\b(\d+[.,]?\d*)\s*(km|kilometros|kilos|kg|libros|dolares|usd|\$|euros|horas|paginas|clientes|ventas|veces|cursos|lbs|libras)\b/.exec(ft);
      if (/^(quiero|voy a|me propongo|mi meta)\s+(ahorrar|bajar|perder|leer|correr|ganar|lograr|llegar|vender|conseguir|aprender)\b/.test(ft) || (goalNum && /\b(este (mes|ano)|para (fin de|diciembre|el ano)|en (\d+ )?(meses|semanas))\b/.test(f))) kind = 'goal';
      else if (repeat && !time && HABIT_RE.test(ft)) kind = 'habit';
      else if ((range || time) && (EVENT_RE.test(ft) || /\bcon\s+(el|la|los|mi|mis|[a-zñ]+)\b/.test(ft) && /^(reunion|cita|cena|almuerzo|llamada|salida|junta|clase|cafe)\b/.test(ft))) kind = 'event';
      else if (!time && !range && EVENT_RE.test(ft) && due && /^(reunion|cita|consulta|examen|entrevista|cumpleanos|boda|vuelo|viaje|clase|fiesta)\b/.test(ft)) kind = 'event';
      else if (/\b(tomar (la |las |el )?(pastilla|medicina|medicamento|pastillas))\b/.test(ft) && time) kind = 'reminder';
      else if (title.length > 140 && !due && !time) kind = 'note';
      else kind = 'task';
    }
    if (kind === 'reminder' && !time) kind = 'task';
    if (kind === 'event' && !time) { time = '09:00'; }
    // Forma: área, duración, importancia
    let area = null;
    for (const [a, re] of AREA_RULES) if (re.test(ft)) { area = a; break; }
    if (!durMin) { if (kind === 'event') durMin = range ? tMin(range[1]) - tMin(range[0]) : (EVENT_DUR.find(([re]) => re.test(ft)) || [0, 60])[1]; else { const r = DUR_RULES.find(([re]) => re.test(ft)); durMin = r ? r[1] : 30; } }
    if (!imp) imp = /\b(cliente|jefe|pagar|vence|vencimiento|antes de|fecha limite|entrega|examen|medico|doctor)\b/.test(ft) ? 3 : 2;
    const costo = /\b(vence|vencimiento|antes de|fecha limite|entrega|multa|corte)\b/.test(ft) ? 'alto' : imp === 3 ? 'alto' : undefined;
    if (kind === 'task' && !due && !someday && !repeat) due = opts.defaultDue || todayKey();
    if ((kind === 'task' || kind === 'habit') && repeat && !due) due = todayKey();
    // Meta: número y unidad
    let target = null, unit = '', deadline = null;
    if (kind === 'goal') {
      const gm = /\b(\d+[.,]?\d*)\s*(km|kilometros|kilos|kg|libros|dolares|usd|\$|euros|horas|paginas|clientes|ventas|veces|cursos|lbs|libras)\b/.exec(ft) || /\$\s*(\d+[.,]?\d*)/.exec(title);
      if (gm) { target = parseFloat(String(gm[1]).replace(',', '.')); unit = gm[2] ? gm[2].replace('dolares', 'USD').replace('usd', 'USD').replace('kilometros', 'km') : 'USD'; } else { target = 100; unit = '%'; }
      const now = new Date();
      if (/\beste mes\b/.test(f)) deadline = dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      else if (/\b(este ano|fin de ano|diciembre)\b/.test(f)) deadline = `${now.getFullYear()}-12-31`;
      else deadline = due;
    }
    return { kind, title, due, time, end: range ? range[1] : (time ? tHM(tMin(time) + durMin) : null), repeat, priority, imp, costo, durMin, area, target, unit, deadline, someday, learned: !!learned && !forced };
  }

  function describeItem(it) {
    const bits = [];
    if (it.kind === 'goal') bits.push(`${fmt(it.target)} ${it.unit}`, it.deadline ? `hasta ${shortDate(it.deadline)}` : 'sin fecha límite');
    else if (it.kind === 'habit') bits.push('cada día');
    else if (it.kind === 'note') bits.push('guardada en tus notas');
    else {
      if (it.due) bits.push(dueText(it.due).replace(/^para /, ''));
      if (it.time) bits.push(it.kind === 'event' ? `${hm12(it.time)}–${hm12(it.end)}` : `a las ${hm12(it.time)}`);
      if (it.repeat) bits.push(REPEAT[it.repeat].toLowerCase());
      if (it.kind === 'task') bits.push(`${it.durMin} min`);
      if (it.area && AG_AREAS[it.area]) bits.push(AG_AREAS[it.area][0]);
      if (it.priority === 'urgent') bits.push('importante');
    }
    return bits.filter(Boolean).join(' · ');
  }

  /** Crea el elemento donde va. Devuelve { kind, ref, it, warn }. */
  function commitItem(it) {
    let ref = null, warn = '';
    if (it.kind === 'event') {
      const busy = eventsOn(it.due).filter(e => tMin(e.start) < tMin(it.end) && tMin(e.end) > tMin(it.time));
      const e = cleanEvent({ title: it.title, area: it.area || 'personal', date: it.due, start: it.time, end: it.end, fixed: true });
      events.push(e); saveEvents();
      try { logChange('compromiso', e.id, e.title, null, { date: e.date, start: e.start, end: e.end }, 'Añadido por el organizador automático', 'sistema'); } catch { /* registro */ }
      pushUndo(`añadir "${e.title}" a la agenda`, () => { events = events.filter(x => x !== e); saveEvents(); renderAgenda(); renderDayCard(); });
      ref = e;
      const at = atOf(it.due, it.time) - 15 * 60000;
      if (at > Date.now()) { const r = addReminder(at, `En 15 minutos: ${it.title}`); r.eventId = e.id; saveReminders(); }
      if (busy.length) warn = `Choca con "${busy[0].title}" (${busy[0].start}–${busy[0].end}).`;
      // Si choca con tareas que yo ubiqué, las recoloco
      tasksOn(it.due).filter(t => !t.done && t.timeAuto && t.time && tMin(t.time) < tMin(it.end) && tMin(t.time) + estDur(t) > tMin(it.time)).forEach(t => { delete t.time; delete t.timeAuto; });
      renderAgenda();
    } else if (it.kind === 'reminder') {
      const r = addReminder(atOf(it.due, it.time), it.title);
      if (it.repeat) { r.repeat = it.repeat; saveReminders(); }
      ref = r;
    } else if (it.kind === 'habit') {
      ref = A.addHabit(it.title).habit;
    } else if (it.kind === 'goal') {
      ref = A.addGoal({ name: it.title, target: it.target || 100, unit: it.unit || '', deadline: it.deadline || null });
    } else if (it.kind === 'note') {
      ref = A.addNote(it.title);
    } else {
      const t = A.addTask({ text: it.title, due: it.due, priority: it.priority, durMin: it.durMin, durSrc: 'estimada', area: it.area || undefined, importancia: it.imp, costo: it.costo });
      if (it.time) t.time = it.time;
      if (it.repeat) t.repeat = it.repeat;
      saveTasks();
      ref = t;
    }
    logC('route', { kind: it.kind, key: routeKey(it.title) });
    return { kind: it.kind, ref, it, warn };
  }

  /** Quita lo creado (para cambiarlo de sitio). */
  function uncommit(res) {
    const r = res.ref;
    if (!r) return;
    if (res.kind === 'event') { events = events.filter(x => x !== r); reminders = reminders.filter(x => x.eventId !== r.id); saveEvents(); saveReminders(); renderAgenda(); }
    else if (res.kind === 'reminder') { reminders = reminders.filter(x => x !== r); saveReminders(); }
    else if (res.kind === 'habit') { habits = habits.filter(x => x !== r); saveHabits(); onHabitsChanged(); }
    else if (res.kind === 'goal') { goals = goals.filter(x => x !== r); saveGoals(); onGoalsChanged(); }
    else if (res.kind === 'note') { const i = notes.indexOf(r); if (i >= 0) { notes.splice(i, 1); saveNotes(); renderNotesList(); renderEditor(); } }
    else { const i = tasks.indexOf(r); if (i >= 0) { tasks.splice(i, 1); saveTasks(); } }
  }
  /** Cambia un elemento a otro tipo y aprende para la próxima vez. */
  function moveItem(res, kind) {
    uncommit(res);
    const it = Object.assign({}, res.it, { kind });
    if (kind === 'event' && !it.time) { it.time = '09:00'; it.end = '10:00'; }
    if (kind === 'event' && !it.due) it.due = todayKey();
    if (kind === 'reminder' && !it.time) { it.kind = 'task'; }
    if ((kind === 'task' || kind === 'event' || kind === 'reminder') && !it.due) it.due = todayKey();
    if (kind === 'goal' && !it.target) { it.target = 100; it.unit = '%'; }
    coach.routeMemory = Object.assign({}, coach.routeMemory, { [routeKey(it.title)]: kind });
    saveCoach();
    const nr = commitItem(it);
    onTasksChanged(); schedulePushSync();
    return nr;
  }

  /** Punto único: añade lo que sea y lo organiza. */
  function smartAdd(text, opts = {}) {
    const results = [];
    for (const part of splitTasks(text)) {
      const it = analyzeItem(part, opts);
      if (it) results.push(commitItem(it));
    }
    if (!results.length) return { results, text: 'No encontré nada que añadir.' };
    // Lo que va hoy y no tiene hora, se ordena solo
    const today = results.some(r => r.kind === 'task' && r.ref.due === todayKey() && !r.ref.time) || results.some(r => r.kind === 'event' && r.it.due === todayKey());
    if (today && P().autoSchedule && opts.organize !== false) { try { organizeDay({ moveOverdue: false, plan: false }); } catch (e) { console.warn(e); } }
    onTasksChanged(true); renderReminders(); schedulePushSync();
    const lines = results.map(r => `${KINDS[r.kind].name}: "${r.it.title}"${r.kind === 'task' && r.ref.time ? ` a las ${hm12(r.ref.time)}` : r.kind === 'event' ? ` ${dueText(r.it.due).replace(/^para /, '')} ${hm12(r.it.time)}` : ''}${r.warn ? ` (${r.warn})` : ''}`);
    const say = results.length === 1 ? `Listo. Lo puse en ${KINDS[results[0].kind].where}.` : `Listo. Organicé ${results.length} cosas.`;
    return { results, text: results.length === 1 ? `Lo puse en ${KINDS[results[0].kind].where}: ${lines[0].replace(/^[^:]+: /, '')}${results[0].kind === 'event' ? '. Te aviso 15 minutos antes.' : '.'}` : `Organicé ${results.length} cosas:\n${lines.map(l => `• ${l}`).join('\n')}`, say };
  }
  // Compatibilidad: lo que antes solo creaba tareas ahora se organiza solo
  function addTasksFromText(text, opts = {}) {
    const r = smartAdd(text, opts);
    if (r.results.length) showRouted(r.results, { silent: true });
    return r.results.filter(x => x.kind === 'task').map(x => x.ref);
  }
  const itemLine = (res) => `${res.it.title}${describeItem(res.kind === 'task' ? Object.assign({}, res.it, { time: res.ref.time || res.it.time, due: res.ref.due }) : res.it) ? ` · ${describeItem(res.kind === 'task' ? Object.assign({}, res.it, { time: res.ref.time || res.it.time, due: res.ref.due }) : res.it)}` : ''}`;
  const taskLine = (t) => `${t.text}${t.due ? ` · ${dueText(t.due).replace(/^para /, '')}` : ''}${t.time ? ` a las ${hm12(t.time)}` : ''}${t.repeat ? ` · ${REPEAT[t.repeat].toLowerCase()}` : ''}${t.priority === 'urgent' ? ' · urgente' : ''}`;

  /* ---------- Tarjeta "Lo ubiqué así" (con opción de cambiarlo) ---------- */
  function routedHTML(results) {
    return `<div class="cx-list">${results.map((r, i) => `<div class="cx-li" data-ri="${i}"><span class="tile tile-sm" style="--h: var(${KINDS[r.kind].hue})">${ic(KINDS[r.kind].icon)}</span>
      <div class="grow"><p class="text-sm cx-b">${esc(r.it.title)}</p><p class="cx-small cx-muted">${esc(KINDS[r.kind].name)}${(() => { const d = describeItem(r.kind === 'task' ? Object.assign({}, r.it, { time: r.ref && r.ref.time || r.it.time, due: r.ref && r.ref.due }) : r.it); return d ? ' · ' + esc(d) : ''; })()}</p>${r.warn ? `<p class="cx-small" style="color:#d97706">⚠ ${esc(r.warn)}</p>` : ''}</div>
      <select class="input input-sm cx-move" aria-label="Cambiar a" data-move="${i}"><option value="">Cambiar…</option>${Object.entries(KINDS).filter(([k]) => k !== r.kind).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}</select></div>`).join('')}</div>`;
  }
  function bindRouted(box, results, onChange) {
    box.querySelectorAll('[data-move]').forEach(sel => sel.onchange = () => {
      const i = +sel.dataset.move, k = sel.value; if (!k) return;
      results[i] = moveItem(results[i], k);
      toast(`Movido a ${KINDS[k].where}. Lo recordaré para la próxima.`, 'ok');
      onChange && onChange();
    });
  }
  function showRouted(results, opts = {}) {
    if (opts.silent) return;
    const el = $('#cxRouted') || (() => { const e = document.createElement('aside'); e.id = 'cxRouted'; e.className = 'sheet'; e.setAttribute('aria-label', 'Lo que organicé'); document.body.appendChild(e); return e; })();
    const draw = () => {
      el.innerHTML = `<div class="p-5 space-y-4"><div class="w-10 h-1.5 rounded-full bg-neutral-200 mx-auto md:hidden"></div>
        <div class="cx-row"><span class="tile" style="--h: var(--accent)">${ic('wand')}</span><div class="flex-1 min-w-0"><h2 class="sec-title">Lo ubiqué así</h2><p class="hint">Si algo no va ahí, cámbialo y aprenderé.</p></div><button class="icon-btn" data-close-sheet aria-label="Cerrar">${ic('x')}</button></div>
        ${routedHTML(results)}<div class="flex gap-2"><button type="button" class="btn flex-1" id="cxRoutedUndo">${ic('reset')}Deshacer todo</button><button type="button" class="btn btn-accent flex-1" data-close-sheet>Perfecto</button></div></div>`;
      bindRouted(el, results, draw);
      el.querySelector('#cxRoutedUndo').onclick = () => { results.forEach(uncommit); onTasksChanged(); renderReminders(); schedulePushSync(); closeSheets(); toast('Deshecho.'); };
    };
    draw();
    openSheet('cxRouted');
  }

  /* ---------- Captura rápida: "Agrega lo que sea" ---------- */
  function captureSheet() {
    let el = $('#cxCapture');
    if (el) return el;
    el = document.createElement('aside');
    el.id = 'cxCapture'; el.className = 'sheet'; el.setAttribute('aria-label', 'Agregar');
    el.innerHTML = `<div class="p-5 space-y-4"><div class="w-10 h-1.5 rounded-full bg-neutral-200 mx-auto md:hidden"></div>
      <div class="cx-row"><div class="flex-1 min-w-0"><p class="cx-kicker">Agrega lo que sea</p><h2 class="sec-title mt-0.5">Escríbelo o dilo, yo lo organizo</h2></div><button class="icon-btn" data-close-sheet aria-label="Cerrar">${ic('x')}</button></div>
      <form id="cxCapForm" class="space-y-3"><div class="flex gap-2"><textarea id="cxCapText" class="input flex-1 cx-big" rows="2" maxlength="600" placeholder="Ej.: reunión con el cliente mañana de 3 a 4, pagar la luz el viernes y leer 20 minutos todos los días"></textarea>${SR ? `<button type="button" class="cx-mic" id="cxCapMic" aria-label="Dictar">${ic('mic')}</button>` : ''}</div>
      <div id="cxCapPrev"></div>
      <button class="btn btn-accent w-full cx-big" id="cxCapGo" disabled>${ic('wand')}Organizar</button></form>
      <p class="hint cx-small">Decido si va a <b>Tareas</b>, <b>Agenda</b>, <b>Recordatorios</b>, <b>Hábitos</b>, <b>Metas</b> o <b>Notas</b>, y le pongo fecha, hora, duración y área. Puedes empezar con "nota:", "meta:" o "recuérdame" para elegirlo tú.</p></div>`;
    document.body.appendChild(el);
    const ta = el.querySelector('#cxCapText'), prev = el.querySelector('#cxCapPrev'), go = el.querySelector('#cxCapGo');
    const preview = () => {
      const v = ta.value.trim();
      go.disabled = !v;
      if (!v) { prev.innerHTML = ''; return; }
      const items = splitTasks(v).map(x => analyzeItem(x)).filter(Boolean);
      prev.innerHTML = items.length ? `<p class="field-label">Así lo voy a organizar</p><div class="cx-list">${items.map(it => `<div class="cx-li"><span class="tile tile-sm" style="--h: var(${KINDS[it.kind].hue})">${ic(KINDS[it.kind].icon)}</span><div class="grow"><p class="text-sm cx-b">${esc(it.title)}</p><p class="cx-small cx-muted">${esc(KINDS[it.kind].name)}${describeItem(it) ? ' · ' + esc(describeItem(it)) : ''}${it.learned ? ' · aprendido' : ''}</p></div></div>`).join('')}</div>` : '';
    };
    let t = null;
    ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 180); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.querySelector('#cxCapForm').requestSubmit(); } });
    el.querySelector('#cxCapForm').onsubmit = (e) => {
      e.preventDefault();
      const v = ta.value.trim(); if (!v) return;
      const r = smartAdd(v);
      ta.value = ''; preview();
      if (settings.voice) speak(r.say || r.text);
      showRouted(r.results);
    };
    const mic = el.querySelector('#cxCapMic');
    if (mic) mic.onclick = () => quickListen((txt) => { ta.value = (ta.value ? ta.value + ', ' : '') + txt; preview(); }, mic, null);
    el._preview = preview;
    return el;
  }
  function openCapture(prefill = '', listen = false) {
    const el = captureSheet();
    const ta = el.querySelector('#cxCapText');
    ta.value = prefill; el._preview();
    openSheet('cxCapture');
    if (listen && SR) setTimeout(() => el.querySelector('#cxCapMic')?.click(), 300);
    else setTimeout(() => ta.focus(), 320);
  }

  function quickListen(onText, btn, label) {
    if (!SR) { toast('Este navegador no permite dictar. Prueba con Chrome.', 'warn'); return; }
    stopSpeaking();
    const r = new SR();
    r.lang = /^es/i.test(navigator.language || '') ? navigator.language : 'es-ES';
    r.interimResults = true; r.continuous = false;
    let fin = '', mid = '';
    r.onstart = () => { btn && btn.classList.add('on'); if (label) label.textContent = 'Te escucho…'; };
    r.onresult = (e) => { fin = ''; mid = ''; for (let i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript; else mid += e.results[i][0].transcript; } if (label) label.textContent = `"${(fin + ' ' + mid).trim()}"`; };
    r.onerror = (e) => { if (e.error === 'not-allowed') toast('No tengo permiso para el micrófono.', 'warn'); else if (e.error === 'network') toast('Para entender tu voz necesito internet.', 'warn'); };
    r.onend = () => { btn && btn.classList.remove('on'); const t = (fin || mid).trim(); if (t) onText(t); else if (label && label.textContent === 'Te escucho…') label.textContent = 'No te oí. Toca el micrófono otra vez.'; };
    try { r.start(); } catch { /* ya activo */ }
    return r;
  }

  let voiceRec = null;
  function voiceAdd() {
    let el = $('#cxVoice');
    if (!el) {
      el = document.createElement('aside');
      el.id = 'cxVoice'; el.className = 'sheet'; el.setAttribute('aria-label', 'Dictar tareas');
      document.body.appendChild(el);
    }
    const draw = (state, said, made) => {
      el.innerHTML = `<div class="p-5 space-y-3"><div class="w-10 h-1.5 rounded-full bg-neutral-200 mx-auto md:hidden"></div>
        <div class="cx-row" style="justify-content:space-between"><div><p class="cx-kicker">Dictar</p><h2 class="sec-title mt-0.5">${state === 'listen' ? 'Te escucho…' : state === 'done' ? (made.length ? 'Lo ubiqué así' : 'No encontré nada que añadir') : 'Dime qué tienes que hacer'}</h2></div><button class="icon-btn" data-close-sheet aria-label="Cerrar">${ic('x')}</button></div>
        <div class="cx-wave ${state === 'listen' ? '' : 'idle'}"><i></i><i></i><i></i><i></i><i></i></div>
        <p class="cx-said" id="cxSaid">${esc(said || '')}</p>
        ${state === 'done' && made.length ? `<div id="cxVRouted">${routedHTML(made)}</div>` : ''}
        ${state !== 'listen' ? `<p class="hint">Ejemplos: "mañana a las 3 llamar al cliente urgente", "pagar la luz el viernes y luego comprar café", "gimnasio todos los días a las 6".</p>` : ''}
        <div class="cx-row" style="justify-content:center;gap:.6rem">${state === 'done' && made.length ? `<button type="button" class="btn" id="cxVUndo">${ic('reset')}Deshacer</button>` : ''}<button type="button" class="btn btn-accent cx-big" id="cxVGo">${ic('mic')}${state === 'listen' ? 'Terminar' : state === 'done' ? 'Dictar más' : 'Hablar'}</button></div>
        <form id="cxVForm" class="flex gap-2"><input class="input flex-1" id="cxVText" placeholder="…o escríbelas aquí" autocomplete="off"/><button class="btn">Añadir</button></form></div>`;
      el.querySelector('#cxVGo').onclick = () => (voiceRec ? (voiceRec.stop(), null) : start());
      el.querySelector('#cxVForm').onsubmit = (e) => { e.preventDefault(); const v = el.querySelector('#cxVText').value.trim(); if (v) handle(v); };
      const u = el.querySelector('#cxVUndo');
      if (u) u.onclick = () => { made.forEach(uncommit); onTasksChanged(); renderReminders(); toast('Deshecho'); draw('idle', '', []); };
      const rb = el.querySelector('#cxVRouted'); if (rb) bindRouted(rb, made, () => draw('done', said, made));
    };
    const handle = (txt) => {
      const r = smartAdd(txt);
      const made = r.results;
      draw('done', `"${txt}"`, made);
      const s = made.length ? r.say : 'No entendí nada que añadir. Inténtalo otra vez.';
      if (settings.voice) speak(s);
      if (made.length) toast(r.text.split('\n')[0], 'ok');
    };
    const start = () => {
      draw('listen', '', []);
      voiceRec = quickListen((txt) => { voiceRec = null; handle(txt); }, null, el.querySelector('#cxSaid'));
      if (voiceRec) { const prevEnd = voiceRec.onend; voiceRec.onend = (e) => { const r = voiceRec; voiceRec = null; prevEnd && prevEnd.call(r, e); if (el.querySelector('.cx-wave:not(.idle)') && !el.querySelector('#cxSaid').textContent.startsWith('"')) draw('idle', 'No te oí bien. Toca "Hablar" otra vez.', []); }; }
    };
    draw('idle', '', []);
    openSheet('cxVoice');
    if (SR) setTimeout(start, 250);
  }

  /* ---------- Tareas que se repiten ---------- */
  function nextRepeatDate(t) {
    const base = t.due && t.due >= todayKey() ? t.due : todayKey();
    const d = keyToDate(base);
    if (t.repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (t.repeat === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
    else if (t.repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (t.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else return null;
    return dayKey(d);
  }
  function coachOnTaskDone(t) {
    if (!t || !t.repeat || !REPEAT[t.repeat]) return;
    const nd = nextRepeatDate(t);
    if (!nd || tasks.some(x => !x.done && x.repeatOf === (t.repeatOf || t.id) && x.due === nd)) return;
    const n = addTask({ text: t.text, due: nd, priority: t.priority, tag: t.tag, durMin: t.durMin, durSrc: t.durSrc, area: t.area, costo: t.costo, importancia: t.importancia });
    if (t.time && !t.timeAuto) n.time = t.time;
    n.repeat = t.repeat; n.repeatOf = t.repeatOf || t.id;
    saveTasks();
    setTimeout(() => toast(`Se repite: la próxima es ${dueText(nd).replace(/^para /, '')}.`), 900);
  }
  function addRepeatControl() {
    const form = $('#taskPlanForm');
    if (form && !$('#tpRepeat')) {
      const lab = document.createElement('label');
      lab.innerHTML = `<span class="field-label">Hora (opcional)</span><input id="tpTime" type="time" class="input input-sm w-full" />`;
      const lab2 = document.createElement('label');
      lab2.innerHTML = `<span class="field-label">Se repite</span><select id="tpRepeat" class="input input-sm w-full"><option value="">No</option>${Object.entries(REPEAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`;
      const grid = form.querySelector('.grid');
      grid.appendChild(lab); grid.appendChild(lab2);
      // Vista simple: lo básico arriba, lo avanzado en "Más detalles", y las acciones de la fila aquí
      const acts = document.createElement('div');
      acts.className = 'cx-wrap cxp-tacts';
      acts.innerHTML = `<button type="button" class="btn btn-sm" data-ta="focus">${ic('target')}Concentrarme</button><button type="button" class="btn btn-sm" data-ta="urgent">${ic('alert')}<span>Urgente</span></button><button type="button" class="btn btn-sm text-red-600" data-ta="del">${ic('trash')}Borrar</button>`;
      form.insertBefore(acts, form.querySelector('button[type="submit"]'));
      acts.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ta]'); if (!b) return;
        const t = tasks.find(x => x.id === form.dataset.cxTask); if (!t) return;
        const k = b.dataset.ta;
        if (k === 'del') { closeSheets(); removeTask(t); return; }
        if (k === 'urgent') { t.priority = t.priority === 'urgent' ? 'normal' : 'urgent'; saveTasks(); onTasksChanged(); fillRepeatControl(t.id); toast(t.priority === 'urgent' ? 'Marcada como urgente' : 'Ya no es urgente'); return; }
        if (k === 'focus') { closeSheets(); const m = A.startFocus(Math.min(60, estDur(t)), t); toast(`Concentración: ${m} min en "${t.text}".`, 'ok', { label: 'Ver', fn: () => showView('enfoque') }); }
      });
      if (SIMPLE) {
        const more = document.createElement('details');
        more.className = 'cxs-more cxp-tmore';
        more.innerHTML = '<summary>Más detalles</summary><div class="grid grid-cols-2 gap-2"></div>';
        ['#tpSrc', '#tpCost', '#tpImp', '#tpArea'].forEach(sel => { const l = form.querySelector(sel)?.closest('label'); if (l) more.lastElementChild.appendChild(l); });
        grid.after(more);
      }
      form.addEventListener('submit', () => {
        const id = form.dataset.cxTask; const t = tasks.find(x => x.id === id);
        if (!t) return;
        const tv = $('#tpTime').value, rv = $('#tpRepeat').value;
        if (tv) { t.time = tv; delete t.timeAuto; } else if (!t.timeAuto) delete t.time;
        if (rv) t.repeat = rv; else delete t.repeat;
        saveTasks(); setTimeout(() => { onTasksChanged(); schedulePushSync(); }, 0);
      }, true);
    }
  }
  function fillRepeatControl(id) {
    const t = tasks.find(x => x.id === id), form = $('#taskPlanForm');
    if (!t || !form) return;
    form.dataset.cxTask = id;
    const ub = form.querySelector('[data-ta="urgent"] span'); if (ub) ub.textContent = t.priority === 'urgent' ? 'Quitar urgencia' : 'Urgente';
    const ab = form.querySelector('.cxp-tacts'); if (ab) ab.hidden = !!t.done;
    if ($('#tpTime')) $('#tpTime').value = t.time || '';
    if ($('#tpRepeat')) $('#tpRepeat').value = t.repeat || '';
  }

  /* =====================================================================
     RECORDATORIOS
  ===================================================================== */
  function nextReminderAt(r) {
    const d = new Date(r.at);
    const step = () => {
      if (r.repeat === 'daily') d.setDate(d.getDate() + 1);
      else if (r.repeat === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); }
      else if (r.repeat === 'weekly') d.setDate(d.getDate() + 7);
      else if (r.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    };
    do step(); while (d.getTime() <= Date.now());
    return d.getTime();
  }
  function repeatReminders() {
    let changed = false;
    reminders.forEach(r => {
      if (r.done && r.repeat && !r.rolled) {
        r.rolled = true; changed = true;
        reminders.push({ id: uid(), at: nextReminderAt(r), text: r.text, done: false, repeat: r.repeat });
      }
    });
    if (changed) { reminders = reminders.filter(r => !r.done || r.at > Date.now() - 2 * 86400000); saveReminders(); renderReminders(); schedulePushSync(); }
  }
  function upcomingAuto() {
    const out = [], tk = todayKey(), now = Date.now();
    tasks.filter(t => !t.done && t.time && t.due && t.due >= tk && t.due <= addDaysKey(1)).forEach(t => {
      const end = taskEndAt(t, t.due);
      if (end > now) out.push({ at: end, text: `¿Ya hiciste "${t.text}"?`, kind: 'Pregunta', task: t });
      if (P().startAlert && atOf(t.due, t.time) > now) out.push({ at: atOf(t.due, t.time), text: `Es hora de: ${t.text}`, kind: 'Aviso' });
    });
    if (coach.wizardDone && P().eveningQuiz) {
      const at = atOf(tk, P().closeTime);
      if (at > now && !(coach.quizzes[tk] && coach.quizzes[tk].evening)) out.push({ at, text: 'Cierre del día', kind: 'Cierre' });
    }
    return out.sort((a, b) => a.at - b.at).slice(0, 12);
  }
  function renderReminders() {
    const box = $('#recordatorios');
    if (!box) return;
    const list = reminders.filter(r => !r.done).sort((a, b) => a.at - b.at);
    const auto = upcomingAuto();
    const ps = pushState();
    box.innerHTML = `<div class="cx-row mb-4"><span class="tile" style="--h: var(--h-goals)">${ic('bell')}</span><div class="flex-1 min-w-0"><h2 class="sec-title">Recordatorios</h2><p class="hint">Te aviso a la hora exacta${ps.on ? ', aunque la app esté cerrada' : ''}.</p></div></div>
      ${!ps.on && pushSupported() ? `<div class="cx-warn mb-4"><b>Avisos con la app cerrada desactivados.</b> Ahora solo te aviso si la app está abierta. <button type="button" class="font-semibold underline" data-cx-act="push">Activarlos</button></div>` : ''}
      <form id="cxRemForm" class="cx-box space-y-2.5">
        <div class="flex gap-2"><input id="cxRemText" class="input flex-1" maxlength="120" placeholder="¿Qué te recuerdo?" autocomplete="off" required />${SR ? `<button type="button" class="btn btn-icon" id="cxRemMic" aria-label="Dictar">${ic('mic')}</button>` : ''}</div>
        <div class="cx-grid3"><label><span class="field-label">Día</span><input id="cxRemDate" type="date" class="input input-sm w-full" value="${todayKey()}" /></label>
        <label><span class="field-label">Hora</span><input id="cxRemTime" type="time" class="input input-sm w-full" required /></label>
        <label><span class="field-label">Repetir</span><select id="cxRemRep" class="input input-sm w-full"><option value="">No</option>${Object.entries(REPEAT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label></div>
        <button class="btn btn-accent w-full">${ic('plus')}Crear recordatorio</button>
        <p class="hint cx-small" id="cxRemHint">También puedes dictarlo: "recuérdame tomar agua todos los días a las 10".</p></form>
      <p class="field-label mt-5">Tus recordatorios</p>
      ${list.length ? `<div class="cx-list">${list.map(r => `<div class="cx-li"><span class="tile tile-sm" style="--h: var(--h-goals)">${ic(r.repeat ? 'repeat' : 'bell')}</span><div class="grow"><p class="text-sm cx-b">${esc(r.text)}</p><p class="cx-small cx-muted">${esc(whenText(r.at))}${r.repeat ? ` · ${REPEAT[r.repeat].toLowerCase()}` : ''}</p></div><button type="button" class="icon-btn danger" data-rdel="${r.id}" aria-label="Borrar">${ic('trash')}</button></div>`).join('')}</div>` : '<p class="hint">No tienes recordatorios pendientes.</p>'}
      <p class="field-label mt-5">Lo que ${esc(aiName())} te va a preguntar</p>
      ${auto.length ? `<div class="cx-list">${auto.map(x => `<div class="cx-li"><span class="chip">${esc(x.kind)}</span><div class="grow"><p class="text-sm">${esc(x.text)}</p><p class="cx-small cx-muted">${esc(whenText(x.at))}</p></div></div>`).join('')}</div>
        <p class="hint mt-2">Nivel: ${esc(NOSY[P().nosy].label.toLowerCase())}. ${NOSY[P().nosy].re.length ? `Si no respondes, insisto ${plural(NOSY[P().nosy].re.length, 'vez', 'veces')} más.` : 'Pregunto una sola vez.'} <a href="#plan" data-cx-act="params" class="font-semibold text-accent">Cambiar</a></p>`
        : '<p class="hint">Cuando tus tareas tengan hora, aquí verás cuándo te voy a preguntar por ellas.</p>'}`;
    const f = box.querySelector('#cxRemForm');
    f.onsubmit = (e) => {
      e.preventDefault();
      const text = $('#cxRemText').value.trim(), d = $('#cxRemDate').value || todayKey(), tm = $('#cxRemTime').value;
      if (!text || !tm) return;
      const at = atOf(d, tm);
      if (at <= Date.now() && !$('#cxRemRep').value) { toast('Esa hora ya pasó. Elige una hora futura.', 'warn'); return; }
      const r = addReminder(at > Date.now() ? at : nextReminderAt({ at, repeat: $('#cxRemRep').value }), text);
      if ($('#cxRemRep').value) { r.repeat = $('#cxRemRep').value; saveReminders(); }
      toast(`Te aviso ${whenText(r.at)}.`, 'ok', undoAction());
      renderReminders(); schedulePushSync();
    };
    box.querySelectorAll('[data-rdel]').forEach(b => b.onclick = () => { const r = reminders.find(x => x.id === b.dataset.rdel); if (!r) return; reminders = reminders.filter(x => x !== r); saveReminders(); renderReminders(); schedulePushSync(); toast('Recordatorio borrado', 'info', { label: 'Deshacer', fn: () => { reminders.push(r); saveReminders(); renderReminders(); schedulePushSync(); } }); });
    const mic = box.querySelector('#cxRemMic');
    if (mic) mic.onclick = () => quickListen((txt) => {
      let rep = '';
      const ft = fold(txt);
      for (const [re, kind] of REPEAT_RE) if (re.test(ft)) { rep = kind; break; }
      const g = pair(txt.replace(/^(recu[eé]rdame|av[ií]same|recordatorio( de)?)\s+(que\s+|de\s+)?/i, ''));
      for (const [re] of REPEAT_RE) cut(g, re);
      const due = takeDate(g), clk = takeTime(g);
      tidy(g);
      $('#cxRemText').value = cap(g.s.trim());
      if (due) $('#cxRemDate').value = due;
      if (clk && typeof clk === 'object') $('#cxRemTime').value = `${pad2(clk.h)}:${pad2(clk.min)}`;
      else if (typeof clk === 'number') { const d2 = new Date(clk); $('#cxRemDate').value = dayKey(d2); $('#cxRemTime').value = `${pad2(d2.getHours())}:${pad2(d2.getMinutes())}`; }
      $('#cxRemRep').value = rep;
      $('#cxRemHint').textContent = $('#cxRemTime').value ? 'Revisa y toca "Crear recordatorio".' : 'Falta la hora: elígela y toca "Crear recordatorio".';
    }, mic, $('#cxRemHint'));
  }

  /* =====================================================================
     CONEXIONES (plugins): cada una pide permiso antes de activarse y,
     si así lo quieres, antes de cada uso.
  ===================================================================== */
  const PLUGINS = {
    push: { name: 'Avisos con la app cerrada', color: '#f59e0b', icon: 'bell', desc: 'Te pregunto por tus tareas y te insisto en el cierre del día aunque no tengas la app abierta.',
      perms: ['Mostrar notificaciones en este dispositivo', 'Guardar en tu servidor (Supabase) la hora y el texto de los próximos avisos'], deny: ['No sube tus notas, metas ni la lista completa de tareas', 'Puedes desactivarlo cuando quieras'] },
    gcal: { name: 'Google Calendar', color: '#1a73e8', letter: 'G', desc: 'Pasa tu día planificado a tu calendario o trae tus compromisos desde él.',
      perms: ['Abrir Google Calendar con una tarea lista para guardar', 'Crear un archivo de calendario (.ics) con tu día', 'Leer un archivo .ics que tú elijas para importar compromisos'], deny: ['No entra a tu cuenta de Google', 'No lee tu calendario por su cuenta'],
      actions: [['ics', 'Descargar mi día (.ics)'], ['next', 'Añadir mi próxima tarea'], ['import', 'Importar compromisos (.ics)']] },
    gmail: { name: 'Correo (Gmail)', color: '#ea4335', letter: 'M', desc: 'Envíate tu plan del día o tu resumen semanal por correo.',
      perms: ['Abrir tu app de correo con un borrador listo para enviar'], deny: ['No envía nada sin que tú toques Enviar', 'No lee tus correos'],
      config: [['email', 'Tu correo (opcional)', 'email', 'tucorreo@gmail.com']], actions: [['plan', 'Enviarme el plan de hoy'], ['week', 'Enviarme el resumen de la semana']] },
    whatsapp: { name: 'WhatsApp', color: '#25d366', letter: 'W', desc: 'Comparte tu plan o tu avance con alguien que te pida cuentas. La disciplina sube cuando alguien te mira.',
      perms: ['Abrir WhatsApp con un mensaje ya escrito', 'Dirigirlo a tu compañero de responsabilidad, si lo configuras'], deny: ['No envía nada sin que tú lo confirmes', 'No lee tus chats'],
      config: [['phone', 'Número de tu compañero (opcional, con código de país)', 'tel', '+58 412 1234567'], ['buddy', 'Nombre de tu compañero', 'text', 'Ej.: Carlos']], actions: [['plan', 'Compartir mi plan de hoy'], ['progress', 'Contar cómo me fue hoy'], ['accountable', 'Pedirle que me pida cuentas']] },
    claude: { name: 'IA avanzada (Claude)', color: '#d97757', letter: 'C', desc: 'Conversa de cualquier tema y pide cosas complejas con tu propia clave de Anthropic.',
      perms: ['Enviar tus mensajes y el estado de la app a api.anthropic.com cuando hables con el asistente'], deny: ['La clave se queda solo en este dispositivo'], external: true },
    share: { name: 'Compartir del teléfono', color: '#64748b', icon: 'share', desc: 'Usa el menú compartir de tu teléfono para mandar tu plan a cualquier app.',
      perms: ['Abrir el menú compartir con el texto de tu plan'], deny: ['Tú eliges a dónde se envía'], actions: [['plan', 'Compartir mi plan de hoy']] },
  };
  const plugOn = (id) => (id === 'push' ? pushState().on : id === 'claude' ? aiReady() : !!(coach.plugins[id] && coach.plugins[id].on));
  const plugCfg = (id) => (coach.plugins[id] && coach.plugins[id].cfg) || {};
  const plugLogo = (p) => `<span class="lg" style="background:${p.color}">${p.icon ? ic(p.icon) : esc(p.letter)}</span>`;

  function renderPlugins() {
    const box = $('#conexiones');
    if (!box) return;
    box.innerHTML = `<div class="cx-row mb-2"><span class="tile" style="--h: var(--h-files)">${ic('plug')}</span><div class="flex-1 min-w-0"><h2 class="sec-title">Conexiones</h2><p class="hint">Nada se conecta sin tu permiso. Puedes revocarlo cuando quieras.</p></div></div>
      <label class="cx-set"><span><p>Pedirme permiso antes de cada uso</p><small>Te muestro exactamente lo que voy a enviar y tú confirmas</small></span><input type="checkbox" class="cx-switch" id="cxAskPlug" ${P().askBeforePlugins ? 'checked' : ''}></label>
      <div class="space-y-3 mt-3">${Object.entries(PLUGINS).map(([id, p]) => {
        const on = plugOn(id), cfg = plugCfg(id);
        return `<div class="cx-box cx-plug" data-plug="${id}"><div class="cx-row" style="align-items:flex-start">${plugLogo(p)}<div class="flex-1 min-w-0"><div class="cx-row" style="gap:.5rem;flex-wrap:wrap"><b>${esc(p.name)}</b>${on ? '<span class="cx-on">Conectada</span>' : ''}</div><p class="hint cx-small mt-0.5">${esc(p.desc)}</p></div></div>
          ${on && p.config ? `<div class="cx-grid2">${p.config.map(([k, label, type, ph]) => `<label><span class="field-label">${esc(label)}</span><input class="input input-sm w-full" data-pcfg="${k}" type="${type}" placeholder="${esc(ph)}" value="${esc(cfg[k] || '')}"/></label>`).join('')}</div>` : ''}
          ${on && p.actions ? `<div class="cx-wrap">${p.actions.map(([a, l]) => `<button type="button" class="btn btn-sm btn-soft" data-pact="${a}">${esc(l)}</button>`).join('')}</div>` : ''}
          ${id === 'push' && on ? `<div class="cx-wrap"><button type="button" class="btn btn-sm btn-soft" data-ptest>Enviar una prueba</button></div>` : ''}
          <div class="cx-row" style="justify-content:flex-end;gap:.5rem">${on ? `<button type="button" class="btn btn-sm" data-poff>${id === 'claude' ? 'Ajustes' : 'Desconectar'}</button>` : `<button type="button" class="btn btn-sm btn-accent" data-pon>Conectar</button>`}</div></div>`;
      }).join('')}</div>
      <p class="hint mt-4">¿Quieres otra conexión? Pídesela a ${esc(aiName())}: "conecta…". Las que necesitan entrar a tus cuentas (por ejemplo, leer tu Google Calendar automáticamente) requieren configurar un acceso seguro aparte.</p>`;
    $('#cxAskPlug').onchange = (e) => { P().askBeforePlugins = e.target.checked; saveCoach(); };
    box.querySelectorAll('[data-plug]').forEach(card => {
      const id = card.dataset.plug;
      card.querySelector('[data-pon]')?.addEventListener('click', () => authorizePlugin(id));
      card.querySelector('[data-poff]')?.addEventListener('click', () => {
        if (id === 'claude') { openSheet('themeSheet'); setTimeout(() => $('#setAiOn')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); return; }
        if (id === 'push') { disablePush(); return; }
        coach.plugins[id] = Object.assign({}, coach.plugins[id], { on: false }); saveCoach(); renderPlugins(); renderHub(); toast(`${PLUGINS[id].name} desconectada.`);
      });
      card.querySelectorAll('[data-pcfg]').forEach(inp => inp.addEventListener('change', () => { const c = coach.plugins[id] || (coach.plugins[id] = { on: true }); c.cfg = Object.assign({}, c.cfg, { [inp.dataset.pcfg]: inp.value.trim() }); saveCoach(); }));
      card.querySelectorAll('[data-pact]').forEach(b => b.addEventListener('click', () => usePlugin(id, b.dataset.pact)));
      card.querySelector('[data-ptest]')?.addEventListener('click', () => pushTest());
    });
  }

  function permSheet() {
    let el = $('#cxPerm');
    if (!el) { el = document.createElement('aside'); el.id = 'cxPerm'; el.className = 'sheet'; el.setAttribute('aria-label', 'Permiso'); document.body.appendChild(el); }
    return el;
  }
  function askPermission({ title, logo, intro, perms = [], deny = [], preview, ok = 'Permitir', cancel = 'Cancelar' }) {
    return new Promise(res => {
      const el = permSheet();
      el.innerHTML = `<div class="p-5 space-y-4"><div class="w-10 h-1.5 rounded-full bg-neutral-200 mx-auto md:hidden"></div>
        <div class="cx-row">${logo || ''}<div class="flex-1 min-w-0"><p class="cx-kicker">Permiso</p><h2 class="sec-title">${esc(title)}</h2></div></div>
        ${intro ? `<p class="text-[.95rem]">${esc(intro)}</p>` : ''}
        ${perms.length ? `<div class="space-y-1.5">${perms.map(p => `<p class="cx-perm">${esc(p)}</p>`).join('')}${deny.map(p => `<p class="cx-perm no">${esc(p)}</p>`).join('')}</div>` : ''}
        ${preview ? `<div><p class="field-label">Esto es lo que se enviará</p><div class="cx-pre">${esc(preview)}</div></div>` : ''}
        <div class="flex gap-2"><button type="button" class="btn flex-1" data-r="0">${esc(cancel)}</button><button type="button" class="btn btn-accent flex-1" data-r="1">${esc(ok)}</button></div></div>`;
      let done = false;
      const fin = (v) => { if (done) return; done = true; obs.disconnect(); closeSheets(); res(v); };
      el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => fin(b.dataset.r === '1'));
      const obs = new MutationObserver(() => { if (!el.classList.contains('open')) fin(false); });
      openSheet('cxPerm');
      setTimeout(() => obs.observe(el, { attributes: true, attributeFilter: ['class'] }), 50);
    });
  }
  async function authorizePlugin(id) {
    const p = PLUGINS[id];
    if (id === 'claude') { openSheet('themeSheet'); setTimeout(() => { const c = $('#setAiOn'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 350); return false; }
    const ok = await askPermission({ title: `Conectar ${p.name}`, logo: `<span class="cx-plug">${plugLogo(p)}</span>`, intro: `${aiName()} podrá:`, perms: p.perms, deny: p.deny, ok: 'Autorizar' });
    if (!ok) return false;
    if (id === 'push') return enablePush();
    coach.plugins[id] = Object.assign({}, coach.plugins[id], { on: true, at: new Date().toISOString() });
    logC('plugin', { id, on: true });
    saveCoach(); renderPlugins(); renderHub();
    toast(`${p.name} conectada.`, 'ok');
    return true;
  }

  /* ---------- Textos que se comparten ---------- */
  function planText(dk = todayKey()) {
    const d = keyToDate(dk).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const pri = (Array.isArray(plan[dk]) ? plan[dk] : []).filter(x => x.text.trim());
    const timed = tasksOn(dk).filter(t => t.time).sort((a, b) => tMin(a.time) - tMin(b.time));
    const loose = tasksOn(dk).filter(t => !t.time);
    return [`Mi plan para el ${d}`, pri.length ? `\nPrioridades:\n${pri.map((x, i) => `${i + 1}. ${x.text}${x.done ? ' ✓' : ''}`).join('\n')}` : '',
      timed.length ? `\nHorario:\n${timed.map(t => `${hm12(t.time)} · ${t.text}${t.done ? ' ✓' : ''}`).join('\n')}` : '',
      loose.length ? `\nTambién:\n${loose.map(t => `• ${t.text}${t.done ? ' ✓' : ''}`).join('\n')}` : '', '\n— Organizado con DLX'].filter(Boolean).join('\n');
  }
  function progressText() {
    const tk = todayKey(), all = tasksOn(tk), done = all.filter(t => t.done);
    return `Hoy hice ${done.length} de ${all.length} tareas${done.length ? `:\n${done.map(t => `✓ ${t.text}`).join('\n')}` : '.'}${all.length - done.length ? `\nMe faltó:\n${all.filter(t => !t.done).map(t => `• ${t.text}`).join('\n')}` : ''}\n— DLX`;
  }
  function weekText() {
    const days = lastDays(7);
    const n = days.reduce((a, d) => a + tasks.filter(t => t.done && t.completedAt && dayKey(t.completedAt) === d.key).length, 0);
    const closes = days.filter(d => coach.quizzes[d.key] && coach.quizzes[d.key].evening).length;
    return `Resumen de mi semana\n\nTareas completadas: ${n}\nCierres del día: ${closes} de 7\nHábitos: ${habits.map(h => `${h.name} (racha ${streak(h)})`).join(', ') || 'ninguno'}\nMetas: ${goals.map(g => `${g.name} ${Math.round(goalPct(g))}%`).join(', ') || 'ninguna'}${coach.yearGoal ? `\nMeta del año: ${coach.yearGoal}` : ''}\n\n— DLX`;
  }
  const icsDate = (dk, hmS) => `${dk.replace(/-/g, '')}T${(hmS || '00:00').replace(':', '')}00`;
  const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  function dayICS(dk = todayKey()) {
    const ev = [];
    tasksOn(dk).filter(t => t.time && !t.done).forEach(t => ev.push({ uid: t.id, title: t.text, s: t.time, e: tHM(tMin(t.time) + estDur(t)) }));
    eventsOn(dk).forEach(e => ev.push({ uid: e.id, title: e.title, s: e.start, e: e.end }));
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DLX//ES', 'CALSCALE:GREGORIAN',
      ...ev.flatMap(x => ['BEGIN:VEVENT', `UID:${x.uid}@dilex`, `DTSTAMP:${now}`, `DTSTART:${icsDate(dk, x.s)}`, `DTEND:${icsDate(dk, x.e)}`, `SUMMARY:${icsEsc(x.title)}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(x.title)}`, 'END:VALARM', 'END:VEVENT']),
      'END:VCALENDAR'].join('\r\n');
  }
  function parseICS(text) {
    const un = text.replace(/\r?\n[ \t]/g, '');
    const out = [];
    un.split(/BEGIN:VEVENT/).slice(1).forEach(b => {
      const g = (k) => { const m = new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, 'm').exec(b); return m ? m[1].trim() : ''; };
      const ds = g('DTSTART'), de = g('DTEND'), sm = g('SUMMARY').replace(/\\([,;\\])/g, '$1').replace(/\\n/g, ' ');
      const m1 = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?(Z)?/.exec(ds); if (!m1 || !sm) return;
      const m2 = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?(Z)?/.exec(de || ds);
      const toLocal = (m) => { if (!m[4]) return null; if (m[6]) { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])); return { dk: dayKey(d), hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }; } return { dk: `${m[1]}-${m[2]}-${m[3]}`, hm: `${m[4]}:${m[5]}` }; };
      const a = toLocal(m1), z = m2 ? toLocal(m2) : null;
      if (!a) return;
      out.push({ title: sm.slice(0, 80), date: a.dk, start: a.hm, end: z && z.dk === a.dk ? z.hm : tHM(tMin(a.hm) + 60) });
    });
    return out;
  }
  function gcalLink(t, dk) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const s = icsDate(dk, t.time), e = icsDate(dk, tHM(tMin(t.time) + estDur(t)));
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(t.text)}&dates=${s}/${e}${tz ? `&ctz=${encodeURIComponent(tz)}` : ''}&details=${encodeURIComponent('Creado con DLX')}`;
  }
  const openExternal = (url) => { const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' }); document.body.appendChild(a); a.click(); a.remove(); };

  async function usePlugin(id, action) {
    const p = PLUGINS[id];
    if (!plugOn(id)) { const ok = await authorizePlugin(id); if (!ok) return false; }
    const cfg = plugCfg(id), tk = todayKey();
    let preview = '', run = null, label = 'Continuar';
    if (id === 'gcal') {
      if (action === 'ics') { const ics = dayICS(tk); const n = (ics.match(/BEGIN:VEVENT/g) || []).length; if (!n) { toast('Hoy no hay tareas con hora ni compromisos. Toca "Organízame" primero.', 'warn'); return false; } preview = `Un archivo con ${plural(n, 'evento', 'eventos')} de hoy, con aviso 10 minutos antes.`; label = 'Descargar'; run = () => downloadText(ics, `dilex-${tk}.ics`, 'text/calendar'); }
      else if (action === 'next') { const t = tasksOn(tk).filter(x => !x.done && x.time && tMin(x.time) >= nowM() - 30).sort((a, b) => tMin(a.time) - tMin(b.time))[0]; if (!t) { toast('No tienes tareas con hora por delante hoy.', 'warn'); return false; } preview = `${t.text} · hoy a las ${hm12(t.time)} (${estDur(t)} min)`; label = 'Abrir Google Calendar'; run = () => openExternal(gcalLink(t, tk)); }
      else if (action === 'import') { run = () => { const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.ics,text/calendar' }); inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const list = parseICS(await readFileText(f)).filter(e => e.date >= addDaysKey(-1)).slice(0, 200); list.forEach(e => events.push(cleanEvent({ ...e, area: 'personal', fixed: true }))); saveEvents(); renderAgenda(); renderDayCard(); toast(list.length ? `Importé ${plural(list.length, 'compromiso', 'compromisos')} a tu agenda.` : 'No encontré compromisos futuros en ese archivo.', list.length ? 'ok' : 'warn'); }; inp.click(); }; preview = 'Elegirás un archivo .ics (en Google Calendar: Configuración → Importar y exportar → Exportar). Solo se leerán los eventos de hoy en adelante.'; label = 'Elegir archivo'; }
    } else if (id === 'gmail') {
      const subj = action === 'week' ? 'Mi resumen de la semana' : `Mi plan de hoy · ${shortDate(tk)}`;
      const body = action === 'week' ? weekText() : planText(tk);
      preview = `Para: ${cfg.email || '(lo eliges tú)'}\nAsunto: ${subj}\n\n${body}`; label = 'Abrir correo';
      run = () => openExternal(`mailto:${encodeURIComponent(cfg.email || '')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`);
    } else if (id === 'whatsapp') {
      const buddy = cfg.buddy ? cfg.buddy.split(' ')[0] : '';
      const body = action === 'progress' ? progressText() : action === 'accountable' ? `${buddy ? `Hola ${buddy}` : 'Hola'}, te pido un favor: ¿me puedes preguntar cada noche si cumplí lo que me propuse? Esta es mi meta: ${coach.yearGoal || 'organizarme mejor'}.\n\nHoy mi plan es:\n${planText(tk)}` : planText(tk);
      const phone = String(cfg.phone || '').replace(/[^\d]/g, '');
      preview = `${phone ? `Para: ${cfg.buddy || '+' + phone}` : 'Para: eliges el chat en WhatsApp'}\n\n${body}`; label = 'Abrir WhatsApp';
      run = () => openExternal(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`);
    } else if (id === 'share') {
      const body = planText(tk);
      preview = body; label = 'Compartir';
      run = async () => { if (navigator.share) { try { await navigator.share({ title: 'Mi plan de hoy', text: body }); } catch { /* cancelado */ } } else { try { await navigator.clipboard.writeText(body); toast('Plan copiado. Pégalo donde quieras.', 'ok'); } catch { toast('Tu navegador no permite compartir.', 'warn'); } } };
    }
    if (!run) return false;
    if (P().askBeforePlugins) {
      const ok = await askPermission({ title: `Usar ${p.name}`, logo: `<span class="cx-plug">${plugLogo(p)}</span>`, preview, ok: label });
      if (!ok) { toast('Cancelado. No se envió nada.'); return false; }
    }
    logC('plugin', { id, action });
    saveCoach();
    run();
    return true;
  }

  /* =====================================================================
     NOTIFICACIONES CON LA APP CERRADA (Supabase + Web Push)
     El teléfono se suscribe; la app sube los avisos de los próximos días
     (hora y texto) y el servidor los envía a su hora con pg_cron.
  ===================================================================== */
  const PUSH = {
    fn: 'https://jgqmdqzptlbjuzufdtrr.supabase.co/functions/v1/dilex-push',
    key: 'sb_publishable_hHeU1Mtr1JVO5VDm-Y5d7w_Ja448go_',
    vapid: 'BFq12liFX3rStd-btegheg6sesJNmc8VgoQVEN8oQ-XH7YUmYSLOor18TQrnKSb-DBVvDNHdDJkQu99LxcYOZDM',
  };
  const PUSH_LS = 'dilexsys.push';
  const pushState = () => { try { return JSON.parse(localStorage.getItem(PUSH_LS) || '{}') || {}; } catch { return {}; } };
  const setPushState = (s) => { try { localStorage.setItem(PUSH_LS, JSON.stringify(s)); } catch { /* lleno */ } };
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && isWeb();
  const b64u = (s) => { const p = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
  const randHex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join(''); };

  function idb(store = 'kv') {
    return new Promise((res, rej) => {
      const r = indexedDB.open('dilex-sw', 1);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { autoIncrement: true }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }).then(db => ({ db, store }));
  }
  async function idbPut(key, val) { const { db } = await idb(); return new Promise((res) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); }
  async function idbDrainInbox() {
    try {
      const { db } = await idb();
      return await new Promise((res) => {
        const tx = db.transaction('inbox', 'readwrite'), st = tx.objectStore('inbox'), out = [];
        st.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.delete(); c.continue(); } };
        tx.oncomplete = () => res(out); tx.onerror = () => res(out);
      });
    } catch { return []; }
  }

  async function pushCall(op, body = {}, keepalive) {
    const s = pushState();
    const r = await fetch(PUSH.fn, { method: 'POST', keepalive: !!keepalive, headers: { 'Content-Type': 'application/json', apikey: PUSH.key }, body: JSON.stringify(Object.assign({ op, device: s.device, secret: s.secret }, body)) });
    let j = {};
    try { j = await r.json(); } catch { /* sin cuerpo */ }
    if (!r.ok) { const e = new Error(j.error || `HTTP ${r.status}`); e.status = r.status; e.body = j; throw e; }
    return j;
  }

  async function enablePush(opts = {}) {
    if (!pushSupported()) {
      toast(isIOS() && !isStandalone() ? 'En iPhone primero instala la app en tu pantalla de inicio (Compartir → Añadir a pantalla de inicio) y actívalo desde allí.' : 'Este navegador no permite avisos con la app cerrada. Usa Chrome en Android.', 'warn');
      return false;
    }
    try {
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') { toast('Sin permiso de notificaciones. Actívalo en los ajustes del navegador para este sitio.', 'warn'); return false; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(PUSH.vapid) });
      const s = pushState();
      if (!s.device) { s.device = (crypto.randomUUID ? crypto.randomUUID() : uid()); s.secret = randHex(32); }
      setPushState(s);
      await pushCall('register', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
      s.on = true; s.at = new Date().toISOString(); setPushState(s);
      await idbPut('push', { device: s.device, secret: s.secret, fn: PUSH.fn, key: PUSH.key });
      logC('plugin', { id: 'push', on: true }); saveCoach();
      await syncPush();
      if (!opts.quiet) toast('Avisos activados. Te escribiré aunque la app esté cerrada.', 'ok');
      renderPlugins(); renderReminders(); renderHub();
      return true;
    } catch (err) {
      console.warn(err);
      toast(err.status === 403 ? 'El servidor rechazó este dispositivo. Desconecta y vuelve a conectar.' : `No pude activar los avisos (${err.message || 'error'}). Inténtalo con internet.`, 'err');
      return false;
    }
  }
  async function disablePush() {
    const s = pushState();
    try { if (s.on) await pushCall('unregister'); } catch { /* sin conexión */ }
    try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch { /* sin suscripción */ }
    setPushState({}); await idbPut('push', null).catch(() => {});
    renderPlugins(); renderReminders(); renderHub();
    toast('Avisos con la app cerrada desactivados.');
  }
  async function pushTest() {
    try { await pushCall('test', { body: `¡Funciona${coma()}! Así te avisaré aunque la app esté cerrada.` }); toast('Enviada. Debería llegarte en unos segundos.', 'ok'); }
    catch (err) { toast(`No llegó a enviarse (${err.body && err.body.code ? err.body.code : err.message}).`, 'err'); }
  }

  function buildJobs() {
    const jobs = [], now = Date.now(), lim = now + 3 * 86400000, prm = P();
    const disc = prm.discreet;
    const push = (j) => { if (j.at > now + 15000 && j.at < lim && (j.kind === 'rem' || !inQuiet(j.at))) jobs.push(j); };
    const ACT = [{ action: 'done', title: '✅ Ya la hice' }, { action: 'snooze', title: '⏳ 15 min más' }];
    reminders.filter(r => !r.done).forEach(r => {
      let at = r.at;
      for (let i = 0; i < (r.repeat ? 3 : 1); i++) {
        push({ at, kind: 'rem', group: `rem:${r.id}:${i}`, title: '⏰ Recordatorio', body: disc ? 'Tienes un recordatorio' : r.text, insist: true });
        if (!r.repeat) break;
        at = nextReminderAt({ at, repeat: r.repeat });
      }
    });
    for (let d = 0; d < 3; d++) {
      const dk = addDaysKey(d);
      tasksOn(dk).filter(t => !t.done && t.time).forEach(t => {
        const g = `task:${t.id}:${dk}`, ck = coach.checkins[`t:${t.id}:${dk}`] || {};
        if (ck.state === 'answered') return;
        const name = disc ? 'tu tarea' : `"${t.text}"`;
        if (prm.startAlert && !coach.checkins[`s:${t.id}:${dk}`]) push({ at: atOf(dk, t.time), kind: 'start', group: g, ref: t.id, title: `Es hora de: ${disc ? 'tu tarea' : t.text}`, body: `Tienes ${estDur(t)} minutos. ¡Tú puedes!` });
        const first = ck.snoozeUntil && ck.snoozeUntil > now ? ck.snoozeUntil : (ck.firstAsk || taskEndAt(t, dk));
        const offs = [0, ...NOSY[prm.nosy].re].filter((o, i) => i >= (ck.snoozeUntil > now ? 0 : ck.asks || 0));
        offs.forEach((o, i) => push({ at: first + o * 60000, kind: 'ask', group: g, ref: t.id, title: i ? `${aiName()} insiste 👀` : `${aiName()} quiere saber`, body: NOSY_LINES[Math.min(4, (ck.asks || 0) + i)](disc ? 'tu tarea' : t.text).replace(`"${t.text}"`, name), actions: ACT, insist: true, url: `./?cx=task&g=${encodeURIComponent(g)}#hoy` }));
      });
      if (coach.wizardDone && prm.eveningQuiz && !(coach.quizzes[dk] && (coach.quizzes[dk].evening))) {
        const pend = tasksOn(dk).filter(t => !t.done).length;
        const reOffs = { suave: [0], normal: [0, 30, 75], intenso: [0, 20, 45, 75, 110] }[prm.nosy] || [0];
        reOffs.forEach((o, i) => push({ at: atOf(dk, prm.closeTime) + o * 60000, kind: 'close', group: `close:${dk}`, title: i ? `Sigo esperando el cierre del día 🌙` : `Cierre del día 🌙`,
          body: i ? `${firstName() ? firstName() + ', no' : 'No'} me dejes así. Son 2 minutos: qué hiciste y qué harás mañana.` : d === 0 && pend ? `Te quedan ${plural(pend, 'pendiente', 'pendientes')}. Cuéntame cómo te fue y dejamos listo mañana.` : 'Cuéntame cómo te fue y dejamos listo mañana.',
          actions: [{ action: 'open', title: 'Cerrar el día' }], insist: true, url: './?cx=close#hoy' }));
      }
      if (coach.wizardDone && prm.morningQuiz && !(coach.quizzes[dk] && coach.quizzes[dk].morning)) {
        push({ at: atOf(dk, prm.wake) + 20 * 60000, kind: 'morning', group: `morning:${dk}`, title: `${greetWordAt(atOf(dk, prm.wake))}${coma()} ☀️`, body: '2 minutos para organizar tu día. Yo hago el resto.', actions: [{ action: 'open', title: 'Empezar' }], url: './?cx=morning#hoy' });
      }
    }
    return jobs.sort((a, b) => a.at - b.at).slice(0, 240).map(j => Object.assign(j, { at: new Date(j.at).toISOString(), tag: j.group }));
  }
  const greetWordAt = (ts) => { const h = new Date(ts).getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };

  let pushT = null, pushBusy = false;
  function schedulePushSync(delay = 2500) {
    if (!pushState().on) return;
    clearTimeout(pushT);
    pushT = setTimeout(syncPush, delay);
  }
  async function syncPush() {
    if (!pushState().on || pushBusy || !navigator.onLine) return;
    pushBusy = true;
    try { await pushCall('sync', { jobs: buildJobs() }); coach.lastSync = new Date().toISOString(); }
    catch (err) { if (err.status === 403) { setPushState({}); renderPlugins(); } console.warn('sync', err); }
    finally { pushBusy = false; }
  }
  function pushAck(groups) { if (pushState().on && navigator.onLine) pushCall('ack', { groups }).catch(() => {}); }

  async function processInbox() {
    const items = await idbDrainInbox();
    let n = 0;
    for (const it of items) {
      const m = /^task:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(it.group || '');
      const t = m && tasks.find(x => x.id === m[1]);
      if (!t) continue;
      const ck = ckOf(t, m[2]);
      if (it.type === 'done' && !t.done) { answerCheck(t, 'done', { silent: true }); n++; }
      else if (it.type === 'snooze') { ck.snoozeUntil = it.until || Date.now() + 15 * 60000; ck.state = 'snoozed'; saveCoach(); }
    }
    if (n) toast(`Marqué ${plural(n, 'tarea', 'tareas')} como ${n === 1 ? 'hecha' : 'hechas'} desde la notificación.`, 'ok');
    if (items.length) { renderAskCard(); schedulePushSync(); }
  }
  function handleLaunchParams() {
    const q = new URLSearchParams(location.search);
    const cx = q.get('cx');
    if (!cx) return false;
    try { history.replaceState(null, '', location.pathname + (location.hash || '#hoy')); } catch { /* sin historial */ }
    setTimeout(() => {
      if (cx === 'close') runEveningQuiz(true);
      else if (cx === 'morning') runMorningQuiz(true);
      else if (cx === 'task') { const m = /^task:([^:]+):/.exec(q.get('g') || ''); const t = m && tasks.find(x => x.id === m[1]); if (t && !t.done) { const ck = ckOf(t, t.due || todayKey()); ck.asks = Math.max(1, ck.asks || 0); openNudge(t, ck); } }
    }, 500);
    return true;
  }
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'dilex-inbox') processInbox();
    if (d.type === 'dilex-open' && d.cx) { if (d.cx === 'close') runEveningQuiz(true); else if (d.cx === 'morning') runMorningQuiz(true); }
  });

  /* =====================================================================
     ASISTENTE: nuevas órdenes, herramientas de IA y contexto
  ===================================================================== */
  function coachRules() {
    const mine = [];
    const add = (name, re, fn) => { mine.push([name, re, fn]); LOCAL_FIRST.add(name); };
    add('coachOrganize', /^(organizame|organiza(me)? (mi|el) dia|ordena(me)? (mi|el) dia|arma(me)? (mi|el) dia|hazme el (dia|horario)|ponle hora a (mis|las) tareas|organiza todo)\b/, () => {
      const r = organizeDay();
      return { text: organizeSummary(r), actions: [{ label: 'Ver mi día', fn: () => { openPlanTab('dia'); } }, undoAction()] };
    });
    add('coachMorning', /\b(preguntas de la manana|empecemos (el|mi) dia|empezar (el|mi) dia|organicemos (el|mi) dia|cuestionario de la manana)\b/, () => ({ text: 'Vamos. Te hago unas preguntas rápidas.', after: () => { closeSheets(); runMorningQuiz(true); } }));
    add('coachEvening', /\b(cierre del dia|cerr(ar|emos) (el|mi) dia|cierra (el|mi) dia|terminar (el|mi) dia|cuestionario de la noche)\b/, () => ({ text: 'Hagamos el cierre del día.', after: () => { closeSheets(); runEveningQuiz(true); } }));
    add('coachDiag', /\b(mi diagnostico|cual es mi problema|que me frena|haz(me)? el (test|diagnostico)|repit(e|amos) el (test|diagnostico|wizard)|hacer el diagnostico)\b/, (m, o) => {
      if (!coach.wizardDone || /(haz|repit|hacer)/.test(o.n)) return { text: 'Hagamos el diagnóstico. Son unas preguntas rápidas.', after: () => { closeSheets(); runWizard({ again: coach.wizardDone }); } };
      const p = prob();
      return { text: `Lo que más te frena es ${p.name.toLowerCase()}: ${p.short} Mi estrategia: ${p.plan[0]} ${p.plan[1]}`, actions: [{ label: 'Ver diagnóstico', fn: () => { openPlanTab('diag'); } }] };
    });
    add('coachPlan', /\b(mi plan (del|de|de este|para el) (mes|ano|dia|semana)|plan (mensual|anual|del mes|del ano|de la semana)|que toca este (mes|ano))\b/, (m, o) => {
      const tab = /\bmes|semana|mensual\b/.test(o.n) ? 'mes' : /\bano|anual\b/.test(o.n) ? 'anio' : 'dia';
      if (!coach.wizardDone) return { text: 'Para armar tu plan primero necesito conocerte. ¿Hacemos el diagnóstico? Son 3 minutos.', actions: [{ label: 'Hacer diagnóstico', fn: () => { closeSheets(); runWizard(); } }] };
      ensurePlans();
      let text = '';
      if (tab === 'mes') { const w = coach.plan.month.weeks.find(x => todayKey() >= x.start && todayKey() <= x.end) || coach.plan.month.weeks[0]; text = `Este mes tu enfoque es ${coach.monthFocus || 'tu rutina'}. Esta semana toca "${w.title}": ${w.items.slice(0, 2).join('; ')}.`; }
      else if (tab === 'anio') text = `Tu meta del año: ${coach.plan.year.goal}. Este trimestre: ${coach.plan.year.quarters[0].title.toLowerCase()}, ${coach.plan.year.quarters[0].items[0].toLowerCase()}.`;
      else { const nx = tasksOn(todayKey()).filter(t => !t.done && t.time && tMin(t.time) >= nowM()).sort((a, b) => tMin(a.time) - tMin(b.time)); text = nx.length ? `Lo próximo: ${nx.slice(0, 3).map(t => `${t.text} a las ${hm12(t.time)}`).join(', ')}.` : 'No tienes tareas con hora por delante. ¿Te organizo el día?'; }
      return { text, actions: [{ label: 'Abrir mi plan', fn: () => { openPlanTab(tab); } }] };
    });
    add('coachNosy', /\b((se|ser|sea|seas) (mas|menos) (metiche|insistente|intenso)|no seas tan (metiche|insistente|intenso)|(deja de|no me) (insistir|insistas|molestar|molestes)|insiste mas|ponte (mas )?(metiche|intenso))\b/, (m, o) => {
      const up = /(mas|insiste|ponte)/.test(o.n) && !/(menos|no seas|deja|no me)/.test(o.n);
      const order = ['suave', 'normal', 'intenso'];
      const i = order.indexOf(P().nosy);
      P().nosy = order[Math.max(0, Math.min(2, i + (up ? 1 : -1)))]; saveCoach(); schedulePushSync();
      return { text: up ? (P().nosy === 'intenso' ? 'Modo muy metiche activado. No te voy a soltar 😏' : 'Vale, insistiré un poco más.') : (P().nosy === 'suave' ? 'De acuerdo, te pregunto una sola vez y ya.' : 'Vale, insistiré menos.') };
    });
    add('coachDictate', /^(dictar( tareas)?|quiero dictar( tareas)?|modo dictado|voy a dictar)\b/, () => ({ text: 'Te escucho. Dime todas tus tareas, con hora si la tienen.', after: () => { closeSheets(); setTimeout(voiceAdd, 300); } }));
    add('coachPush', /\b(activa|enciende|quiero) (las )?(notificaciones|avisos)( con la app cerrada)?\b/, () => ({ text: 'Vamos a activar los avisos. Tu teléfono te pedirá permiso.', after: () => enablePush() }));
    add('coachLock', /^(bloquea(te| la app)?|bloquear( la app)?|cierra (la )?sesion|cerrar sesion)$/, () => {
      if (!window.DilexLock || !DilexLock.hasPin()) return { text: 'Primero crea un PIN en Más → Tu perfil. Así podré bloquear la app.' };
      return { text: 'Bloqueando.', after: () => { closeSheets(); setTimeout(() => DilexLock.lockNow(), 400); } };
    });
    add('coachShare', /\b(manda|envia|comparte|pasa|mandale|enviale)(me|le|selo)?\b.*\b(whatsapp|wasap|guasap|correo|email|mail|gmail|calendar|calendario)\b/, (m, o) => {
      const ch = /whats|wasap|guasap/.test(o.n) ? 'whatsapp' : /correo|email|mail|gmail/.test(o.n) ? 'gmail' : 'gcal';
      const act = ch === 'gcal' ? 'ics' : /semana|resumen/.test(o.n) ? (ch === 'gmail' ? 'week' : 'progress') : /avance|como me fue|progreso/.test(o.n) ? 'progress' : 'plan';
      return { text: plugOn(ch) ? 'Te muestro lo que voy a enviar para que lo confirmes.' : `Primero necesito tu permiso para usar ${PLUGINS[ch].name}.`, after: () => { closeSheets(); setTimeout(() => usePlugin(ch, act), 350); } };
    });
    add('coachGcal', /\b(anade|agrega|pasa|exporta|pon|sincroniza)\b.*\b(google calendar|calendario de google|mi calendario)\b/, () => ({ text: plugOn('gcal') ? 'Te preparo el archivo con tu día.' : 'Primero necesito tu permiso para usar Google Calendar.', after: () => { closeSheets(); setTimeout(() => usePlugin('gcal', 'ics'), 350); } }));
    add('coachTip', /^(dame un consejo|un consejo|motivame|necesito motivacion|no tengo ganas|no quiero hacer nada)\b/, () => (coach.wizardDone ? { text: `${coachTip()}${coach.yearGoal ? ` Recuerda tu meta: ${coach.yearGoal}.` : ''}`, actions: [{ label: 'Empezar 5 minutos', fn: () => A.startFocus(5) }] } : null));
    R.unshift(...mine);
  }

  function coachAiContext() {
    if (!coach.wizardDone) return 'La persona aún no hizo el diagnóstico inicial; si habla de organizarse, ofrécele hacerlo con open_coach (wizard).\n';
    const p = prob(), prm = P();
    return `Coach personal (Dilex es "metiche": pregunta si las tareas se hicieron cuando les toca):
- Diagnóstico: problema principal ${p.name}${diag().secondary ? `, secundario ${PROBLEMS[diag().secondary].name}` : ''}. Estrategia: ${p.plan.join(' ')}
- Meta del año: ${coach.yearGoal || 'sin definir'}. Enfoque del mes: ${coach.monthFocus || 'sin definir'}.
- Parámetros: se despierta ${prm.wake}, se acuesta ${prm.sleep}, trabaja/estudia ${prm.workStart}-${prm.workEnd}, mejor hora ${prm.peak}, nivel de insistencia ${prm.nosy}, cierre del día ${prm.closeTime}.
- Adapta tus consejos a su problema principal. Si pide organizar el día usa organize_day. Para el cuestionario de la mañana, el cierre del día o repetir el diagnóstico usa open_coach. Para compartir por WhatsApp, correo o Google Calendar usa share_plan (la app pide permiso antes). Cuando la persona te cuente algo que tiene que hacer o recordar, prefiere smart_add: la app decide si va a tareas, agenda, recordatorios, hábitos, metas o notas.
`;
  }
  function coachAiTools() {
    AI_TOOLS.push(
      { name: 'organize_day', description: 'Organiza el día: pasa lo atrasado a hoy, elige las 3 prioridades y pone hora a las tareas según el horario de la persona.', input_schema: S({ day: tStr('AAAA-MM-DD, por defecto hoy') }) },
      { name: 'open_coach', description: 'Abre un cuestionario del coach: "morning" (preguntas de la mañana), "evening" (cierre del día), "wizard" (diagnóstico inicial) o "dictate" (dictar tareas por voz).', input_schema: S({ which: { type: 'string', enum: ['morning', 'evening', 'wizard', 'dictate'] } }, ['which']) },
      { name: 'share_plan', description: 'Comparte el plan o el avance por una conexión. La app pide permiso y muestra lo que se enviará.', input_schema: S({ channel: { type: 'string', enum: ['whatsapp', 'gmail', 'gcal', 'share'] }, what: { type: 'string', enum: ['plan', 'progress', 'week', 'ics', 'next'] } }, ['channel']) },
      { name: 'smart_add', description: 'Añade cualquier cosa que la persona tenga que hacer o recordar y la app decide sola dónde va (tarea, compromiso de agenda, recordatorio, hábito, meta o nota) y le pone fecha, hora, duración y área. Úsala cuando no esté claro el tipo; puedes pasar varias separadas por punto y coma.', input_schema: S({ text: tStr('Lo que dijo la persona, con fechas y horas tal cual') }, ['text']) },
      { name: 'set_task_time', description: 'Pone o quita la hora (HH:MM) de una tarea para que Dilex pregunte por ella cuando toque, y opcionalmente si se repite.', input_schema: S({ id: tStr('id de la tarea'), time: tStr('HH:MM o "none"'), repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly'] } }, ['id']) },
    );
    Object.assign(AI_RUN, {
      smart_add(i) { const r = smartAdd(String(i.text || '')); return { ok: r.results.length > 0, resumen: r.text }; },
      organize_day(i) { const r = organizeDay({ day: okDate(i.day) || todayKey() }); return { ok: true, resumen: organizeSummary(r) }; },
      open_coach(i) { setTimeout(() => { closeSheets(); ({ morning: () => runMorningQuiz(true), evening: () => runEveningQuiz(true), wizard: () => runWizard({ again: coach.wizardDone }), dictate: voiceAdd }[i.which] || (() => {}))(); }, 1200); return { ok: true }; },
      share_plan(i) { const ch = i.channel; const act = i.what || (ch === 'gcal' ? 'ics' : 'plan'); setTimeout(() => { closeSheets(); usePlugin(ch, act); }, 1000); return { ok: true, nota: 'La persona confirma en pantalla antes de enviar.' }; },
      set_task_time(i) {
        const t = tasks.find(x => sid(x) === i.id || x.id === i.id);
        if (!t) return { ok: false, error: 'No existe esa tarea' };
        if (i.time === 'none') { delete t.time; delete t.timeAuto; } else if (/^\d{1,2}:\d{2}$/.test(i.time || '')) { t.time = i.time.padStart(5, '0'); delete t.timeAuto; if (!t.due) t.due = todayKey(); }
        if (i.repeat) { if (i.repeat === 'none') delete t.repeat; else t.repeat = i.repeat; }
        saveTasks(); onTasksChanged(); schedulePushSync();
        return { ok: true };
      },
    });
    Object.assign(TOOL_LABEL, { smart_add: 'Organizando', organize_day: 'Organizando tu día', open_coach: 'Abriendo', share_plan: 'Preparando para compartir', set_task_time: 'Poniendo hora' });
  }

  /* =====================================================================
     COMANDO DE VOZ: una barra que escucha y hace casi todo
     (navegar, tareas, hábitos, metas, enfoque, recordatorios, ajustes,
     responder al asistente metiche…). Usa el mismo cerebro del asistente.
  ===================================================================== */
  const VOICE_HELP = [
    ['Moverte por la app', ['abre mis tareas', 've a recordatorios', 'muéstrame el plan del mes', 'abre las metas', 'siguiente pestaña', 'abre los ajustes']],
    ['Tareas', ['añade llamar al banco mañana a las 3', 'qué tengo para hoy', 'marca pagar la luz como hecha', 'cuál es mi próxima tarea', 'borra la última tarea']],
    ['Responderle a Dilex', ['sí, ya la hice', 'voy en eso', 'dame 30 minutos', 'pásala a mañana', 'no la haré']],
    ['Organizar tu día', ['organízame el día', 'empecemos el día', 'cierre del día', 'mi plan del año', 'cuál es mi problema']],
    ['Hábitos, metas y enfoque', ['crea el hábito leer 20 minutos', 'ya hice el hábito leer', 'suma 2 a la meta correr', 'concéntrame 25 minutos', 'pausa']],
    ['Recordatorios', ['recuérdame tomar agua en 30 minutos', 'recuérdame la reunión el viernes a las 9']],
    ['Ajustes y conexiones', ['sé más metiche', 'modo oscuro', 'activa los avisos', 'manda mi plan por WhatsApp', 'bloquea la app']],
  ];
  const STOP_RE = /^(eso es todo|nada mas|ya esta|gracias eso es todo|para|detente|cierra|cerrar|adios|chao|hasta luego|termina(r)?)$/;
  const vc = { el: null, rec: null, listening: false, loop: false, busy: false, obs: null, lastWrap: null };

  function voiceShell() {
    if (vc.el) return vc.el;
    const el = document.createElement('div');
    el.id = 'cxCmd'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Comando de voz');
    el.innerHTML = `<div class="cx-cmdbox">
      <div class="cx-row" style="gap:.5rem"><span class="cx-cmddot" id="cxCmdDot"></span><p class="cx-b flex-1 min-w-0" id="cxCmdStatus">Te escucho…</p>
        <button type="button" class="icon-btn" id="cxCmdHelp" title="¿Qué puedo decir?" aria-label="Qué puedo decir">${ic('question')}</button>
        <button type="button" class="icon-btn" id="cxCmdChat" title="Abrir el chat" aria-label="Abrir el chat">${ic('chat')}</button>
        <button type="button" class="icon-btn" id="cxCmdX" aria-label="Cerrar">${ic('x')}</button></div>
      <p class="cx-cmdsaid" id="cxCmdSaid"></p>
      <div class="cx-cmdreply hidden" id="cxCmdReply"></div>
      <div class="cx-cmdhelp hidden" id="cxCmdHelpBox"></div>
      <div class="cx-row" style="gap:.6rem;margin-top:.7rem">
        <button type="button" class="cx-mic" id="cxCmdMic" aria-label="Hablar">${ic('mic')}</button>
        <form id="cxCmdForm" class="flex gap-2 flex-1 min-w-0"><input id="cxCmdInput" class="input flex-1 min-w-0" placeholder="…o escríbelo" autocomplete="off" aria-label="Escribe un comando" /></form>
        <label class="cx-loop" title="Seguir escuchando después de cada respuesta"><input type="checkbox" id="cxCmdLoop" /><span>Seguir</span></label>
      </div></div>`;
    document.body.appendChild(el);
    vc.el = el;
    el.querySelector('#cxCmdX').onclick = () => voiceClose();
    el.querySelector('#cxCmdMic').onclick = () => (vc.listening ? voiceStop() : voiceListen());
    el.querySelector('#cxCmdChat').onclick = () => { voiceClose(); openSheet('aiSheet'); };
    el.querySelector('#cxCmdHelp').onclick = () => toggleVoiceHelp();
    el.querySelector('#cxCmdForm').onsubmit = (e) => { e.preventDefault(); const v = $('#cxCmdInput').value.trim(); if (v) { $('#cxCmdInput').value = ''; voiceRun(v); } };
    const loop = el.querySelector('#cxCmdLoop');
    loop.checked = !!coach.voiceLoop;
    loop.onchange = () => { coach.voiceLoop = loop.checked; saveCoach(); };
    if (!SR) { el.querySelector('#cxCmdMic').style.display = 'none'; el.querySelector('.cx-loop').style.display = 'none'; }
    return el;
  }
  function voiceStatus(t, mode) {
    const s = $('#cxCmdStatus'); if (s) s.textContent = t;
    const d = $('#cxCmdDot'); if (d) d.dataset.mode = mode || '';
  }
  function toggleVoiceHelp(force) {
    const box = $('#cxCmdHelpBox');
    const show = force ?? box.classList.contains('hidden');
    box.classList.toggle('hidden', !show);
    if (show) {
      box.innerHTML = VOICE_HELP.map(([t, ex]) => `<p class="field-label mt-2">${esc(t)}</p><div class="cx-wrap">${ex.map(x => `<button type="button" class="cx-chipsel cx-small" data-say="${esc(x)}">“${esc(x)}”</button>`).join('')}</div>`).join('');
      box.querySelectorAll('[data-say]').forEach(b => b.onclick = () => voiceRun(b.dataset.say));
    }
  }
  function voiceCmd(opts = {}) {
    const el = voiceShell();
    el.classList.add('open');
    document.documentElement.classList.add('cx-cmd-open');
    $('#cxCmdSaid').textContent = '';
    $('#cxCmdReply').classList.add('hidden');
    toggleVoiceHelp(!!opts.help || !SR);
    if (opts.help || !SR) { voiceStatus(SR ? 'Toca el micrófono o un ejemplo' : 'Escribe una orden o toca un ejemplo'); if (!SR) setTimeout(() => $('#cxCmdInput').focus(), 100); return; }
    voiceListen();
  }
  function voiceClose() {
    voiceStop(); vc.loop = false;
    vc.el && vc.el.classList.remove('open');
    document.documentElement.classList.remove('cx-cmd-open');
    if (vc.obs) { vc.obs.disconnect(); vc.obs = null; }
  }
  const voiceOpen = () => !!(vc.el && vc.el.classList.contains('open'));
  function voiceStop() { const r = vc.rec; vc.rec = null; vc.listening = false; $('#cxCmdMic')?.classList.remove('on'); if (r) { try { r.abort(); } catch { /* ya detenido */ } } }
  function voiceListen() {
    if (!SR) return;
    voiceStop(); stopSpeaking();
    const r = new SR();
    r.lang = /^es/i.test(navigator.language || '') ? navigator.language : 'es-ES';
    r.interimResults = true; r.continuous = false;
    let fin = '', mid = '', failed = false;
    r.onstart = () => { vc.listening = true; $('#cxCmdMic')?.classList.add('on'); voiceStatus('Te escucho…', 'listen'); if (navigator.vibrate) navigator.vibrate(12); };
    r.onresult = (e) => { fin = ''; mid = ''; for (let i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript; else mid += e.results[i][0].transcript; } $('#cxCmdSaid').textContent = `“${(fin + ' ' + mid).trim()}”`; };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      failed = true;
      voiceStatus(e.error === 'network' ? 'Para entender tu voz necesito internet. Puedes escribir abajo.' : e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Sin permiso para el micrófono. Actívalo en el navegador.' : 'No pude escucharte. Toca el micrófono otra vez.', 'err');
    };
    r.onend = () => {
      vc.listening = false; $('#cxCmdMic')?.classList.remove('on');
      if (vc.rec !== r) return;
      vc.rec = null;
      const t = (fin || mid).trim();
      if (t) { voiceRun(t); return; }
      if (!failed) voiceStatus(vc.loop ? 'No te oí. Toca el micrófono cuando quieras.' : 'Toca el micrófono para hablar', '');
      vc.loop = false;
    };
    vc.rec = r;
    try { r.start(); } catch { /* ya activo */ }
  }

  function mirrorReply() {
    const log = $('#aiLog'), box = $('#cxCmdReply');
    if (!log || !box) return;
    const wraps = [...log.children].filter(w => w.querySelector('.ai-msg.bot'));
    const w = wraps[wraps.length - 1];
    if (!w || w === vc.before) return;
    const txt = w.querySelector('.ai-msg.bot').textContent.trim();
    const btns = [...w.querySelectorAll('button')];
    box.classList.remove('hidden');
    box.innerHTML = `<p class="cx-cmdtxt"></p>${btns.length ? `<div class="cx-wrap mt-2">${btns.map((b, i) => `<button type="button" class="btn btn-sm btn-soft" data-i="${i}">${esc(b.textContent)}</button>`).join('')}</div>` : ''}`;
    box.querySelector('.cx-cmdtxt').textContent = txt || '…';
    box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const o = btns[+b.dataset.i]; if (o && o.isConnected) o.click(); setTimeout(mirrorReply, 400); });
  }
  async function voiceRun(text) {
    text = String(text || '').trim();
    if (!text || vc.busy) return;
    const f = fold(text).replace(/[.!?¡¿,]/g, '').trim();
    $('#cxCmdSaid').textContent = `“${text}”`;
    toggleVoiceHelp(false);
    if (STOP_RE.test(f)) { voiceStatus('Hasta luego 👋'); speak('Hasta luego.'); setTimeout(voiceClose, 700); return; }
    if (/^(que puedo decir|que (le )?puedo pedir|ayuda con la voz|comandos de voz|que comandos hay)$/.test(f)) { voiceStatus('Esto es lo que puedes decirme'); $('#cxCmdReply').classList.add('hidden'); toggleVoiceHelp(true); return; }
    vc.busy = true; vc.loop = !!coach.voiceLoop;
    voiceStatus('Pensando…', 'think');
    const log = $('#aiLog');
    vc.before = log ? [...log.children].filter(w => w.querySelector('.ai-msg.bot')).pop() : null;
    if (!vc.obs && log) { vc.obs = new MutationObserver(() => mirrorReply()); vc.obs.observe(log, { childList: true, subtree: true, characterData: true }); }
    try { await handleCommand(text, { voice: true }); } catch (e) { console.error(e); }
    vc.busy = false;
    mirrorReply();
    voiceStatus(SR ? 'Toca el micrófono para otra orden' : 'Escribe otra orden', '');
    if (!vc.loop || !SR) return;
    // Conversación continua: espera a que termine de hablar y vuelve a escuchar.
    const t0 = Date.now();
    const again = () => {
      if (!voiceOpen() || !vc.loop || flow.alive) return;
      if ((isSpeaking() || busy) && Date.now() - t0 < 30000) { setTimeout(again, 220); return; }
      voiceListen();
    };
    setTimeout(again, 500);
  }
  // Si se abre un cuestionario, la barra de voz se aparta (el cuestionario tiene su propia voz).
  const _runFlow = runFlow;
  runFlow = function (...args) { if (voiceOpen()) voiceClose(); return _runFlow(...args); };

  /* ---------- Órdenes de voz para moverse por la app ---------- */
  const NAV_WORDS = [
    [/\b(mi dia|el dia de hoy|linea de tiempo|mi horario|horario de hoy)\b/, 'hoy', 'midia'],
    [/\b(prioridades|plan del dia|para hoy)\b/, 'hoy', 'prioridades'],
    [/\b(tareas|pendientes|lista de tareas)\b/, 'hoy', 'tareas'],
    [/\b(enfoque|pomodoro|temporizador|concentracion)\b/, 'hoy', 'enfoque'],
    [/\b(hoy|inicio|resumen|principal|pantalla principal)\b/, 'hoy', 'resumen'],
    [/\b(plan del mes|plan mensual|mi mes|el mes)\b/, 'plan', 'miplan', 'mes'],
    [/\b(plan del ano|plan anual|mi ano|el ano|meta del ano)\b/, 'plan', 'miplan', 'anio'],
    [/\b(diagnostico|mi test|el test)\b/, 'plan', 'miplan', 'diag'],
    [/\b(reglas|parametros|mis reglas|mis parametros|automatizacion)\b/, 'plan', 'miplan', 'params'],
    [/\b(agenda|calendario|compromisos)\b/, 'plan', 'agenda'],
    [/\b(habitos|rachas)\b/, 'plan', 'habitos'],
    [/\b(metas|objetivos)\b/, 'plan', 'metas'],
    [/\b(mi plan|el plan|plan)\b/, 'plan', 'miplan', 'dia'],
    [/\b(graficas|graficos)\b/, 'progreso', 'graficas'],
    [/\b(progreso|mi semana|semana|estadisticas)\b/, 'progreso', 'semana'],
    [/\b(perfil|mi cuenta|cuenta|pin)\b/, 'mas', 'perfil'],
    [/\b(notas|apuntes)\b/, 'notas'],
    [/\b(recordatorios|alarmas|avisos programados)\b/, 'recordatorios'],
    [/\b(conexiones|plugins|integraciones|aplicaciones conectadas)\b/, 'conexiones'],
    [/\b(analizador|archivos)\b/, 'analizador'],
    [/\b(descargas|exportar)\b/, 'descargas'],
    [/\b(mas|menu|todas las secciones)\b/, 'mas', 'hub'],
  ];
  const NAV_SHEETS = [[/\b(ajustes|configuracion|colores|tema)\b/, 'themeSheet', 'los ajustes'], [/\b(respaldo|copia de seguridad)\b/, 'backupSheet', 'el respaldo'], [/\b(chat|conversacion)\b/, 'aiSheet', 'el chat'], [/\b(instalar|instalacion)\b/, 'installSheet', 'cómo instalarme']];
  function navFrom(target) {
    for (const [re, sheet, label] of NAV_SHEETS) if (re.test(target)) return { sheet, label };
    for (const [re, v, p, tab] of NAV_WORDS) if (re.test(target)) return { v, p, tab };
    return null;
  }
  function navLabel(d) {
    if (d.sheet) return d.label;
    if (d.tab) return { dia: 'tu plan del día', mes: 'tu plan del mes', anio: 'tu plan del año', diag: 'tu diagnóstico', params: 'tus reglas' }[d.tab];
    const pl = d.p && panelsOf(d.v).find(x => x[0] === d.p);
    return pl && panelsOf(d.v).length > 1 ? `${VIEW_DEF[d.v].title} → ${pl[1]}` : VIEW_DEF[d.v].title;
  }
  function navGo(d) {
    if (d.sheet) { setTimeout(() => { if (voiceOpen() && !vc.loop) voiceClose(); openSheet(d.sheet); }, 600); return; }
    if (d.tab) { planTab = d.tab; }
    closeSheets(); showView(d.v, { panel: d.p });
    if (d.tab) renderCoachPlan();
  }
  function voiceRules() {
    const mine = [];
    const add = (name, re, fn) => { mine.push([name, re, fn]); LOCAL_FIRST.add(name); };
    add('coachNav', /^(?:(?:oye|por favor)\s+)?(abre|abrir|abreme|ve a|vete a|vamos a|muestrame|mostrar|ensename|ir a|llevame a|quiero ver|pasa a|cambia a|entra a|entra en)\s+(?:(?:a|la seccion de|la pestana de|la pantalla de|el|la|las|los|mis|mi|tu)\s+)*(.+)$/, (m) => {
      const d = navFrom(m[2]);
      if (!d) return null;
      navGo(d);
      return { text: `Listo: ${navLabel(d)}.`, say: `Abriendo ${navLabel(d).replace('→', ',')}.` };
    });
    add('coachNavBare', /^(tareas|mis tareas|habitos|mis habitos|metas|mis metas|notas|mis notas|agenda|recordatorios|conexiones|progreso|mi plan|mi dia|enfoque|prioridades|ajustes|graficas|perfil)$/, (m) => {
      const d = navFrom(m[1]); if (!d) return null; navGo(d); return { text: `Listo: ${navLabel(d)}.`, say: `Abriendo ${navLabel(d).replace('→', ',')}.` };
    });
    add('coachPanelStep', /^(siguiente|anterior|la siguiente|la anterior)(\s+(pestana|panel|seccion|pantalla))?$/, (m) => {
      const list = panelsOf(curView).map(x => x[0]), i = list.indexOf(curPanel[curView]);
      const j = /anterior/.test(m[1]) ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return { text: 'No hay más pestañas por ese lado.' };
      showPanel(curView, list[j], { dir: j < i ? 'l' : 'r' });
      return { text: `${panelsOf(curView)[j][1]}.` };
    });
    add('coachVolver', /^(atras|volver|regresa|regresar|vuelve)$/, () => {
      if (VIEW_DEF[curView].parent) { showView(VIEW_DEF[curView].parent); return { text: 'Volvimos a Más.' }; }
      showView('hoy', { panel: 'resumen' }); return { text: 'Volvimos a Hoy.' };
    });
    // Responder al asistente metiche con la voz
    const askTarget = () => { const n = nudgeOpen && tasks.find(t => t.id === nudgeOpen); return n || (pendingAsks()[0] || {}).t || null; };
    add('coachAnsDone', /^(si[, ]*)?((ya )?(la|lo) (hice|termine|acabe)|ya (termine|acabe|esta hecha|quedo)|ya la complete|listo ya( la hice)?|hecho)$/, () => {
      const t = askTarget(); if (!t) return null; closeSheets(); return { text: answerCheck(t, 'done', { quietVoice: true }), celebrate: true };
    });
    add('coachAnsSnooze', /^(voy en eso|estoy en eso|todavia no|aun no|ahorita|dame (un rato|(\d+|cinco|diez|quince|veinte|treinta|media hora)( minutos)?))$/, (m, o) => {
      const t = askTarget(); if (!t) return null;
      const w = { cinco: 5, diez: 10, quince: 15, veinte: 20, treinta: 30 };
      const mm = /(\d+)/.exec(o.n); const word = /(cinco|diez|quince|veinte|treinta)/.exec(o.n);
      const mins = /media hora/.test(o.n) ? 30 : mm ? +mm[1] : word ? w[word[1]] : 15;
      closeSheets(); return { text: answerCheck(t, 'snooze', { minutes: mins, quietVoice: true }) };
    });
    add('coachAnsTomorrow', /^(pasala|pasalo|dejala|dejalo|muevela|muevelo) (a|para) manana$/, () => { const t = askTarget(); if (!t || !nudgeOpen && !pendingAsks().length) return null; closeSheets(); return { text: answerCheck(t, 'tomorrow', { quietVoice: true }) }; });
    add('coachAnsDrop', /^(no la (hare|voy a hacer)|ya no la (hare|voy a hacer)|olvidala|cancelala)$/, () => { const t = askTarget(); if (!t) return null; closeSheets(); return { text: answerCheck(t, 'drop', { quietVoice: true }) }; });
    add('coachAskWhat', /^(que me (quieres )?preguntar|que tengo pendiente de responder|que me falta responder)$/, () => {
      const l = pendingAsks(); if (!l.length) return { text: 'Nada por ahora. Vas al día.' };
      const t = l[0].t; setTimeout(() => openNudge(t, ckOf(t, t.due || todayKey())), 600);
      return { text: `Quiero saber si hiciste "${t.text}".` };
    });
    add('coachDictate2', /^(dictar|dicta|quiero dictar|voy a dictar)( tareas| varias tareas)?$/, () => ({ text: 'Te escucho. Dime todas tus tareas.', after: () => { if (voiceOpen()) voiceClose(); setTimeout(voiceAdd, 300); } }));
    add('coachConnect', /^(conecta|conectar|activa|autoriza)\s+(el |la )?(whatsapp|wasap|google calendar|calendario de google|correo|gmail|compartir)$/, (m) => {
      const id = /whats|wasap/.test(m[3]) ? 'whatsapp' : /correo|gmail/.test(m[3]) ? 'gmail' : /compartir/.test(m[3]) ? 'share' : 'gcal';
      return { text: `Necesito tu permiso para conectar ${PLUGINS[id].name}. Revisa la pantalla.`, after: () => { if (voiceOpen()) voiceClose(); setTimeout(() => authorizePlugin(id), 300); } };
    });
    // Organizador automático: "añade/anota/tengo que…" y DLX decide dónde va
    const smartReply = (txt) => {
      const r = smartAdd(txt);
      if (!r.results.length) return null;
      const res = r.results;
      return { text: r.text, say: r.say, intent: 'smartAdd', actions: [{ label: 'Ver dónde lo puse', fn: () => showRouted(res) }, { label: 'Deshacer', fn: () => { res.forEach(uncommit); onTasksChanged(); renderReminders(); schedulePushSync(); toast('Deshecho.'); } }] };
    };
    const SKIP_OBJ = /^(una |la |un |el |mi )?(nota|notas|habito|meta|recordatorio|temporizador|alarma|cronometro|copia|respaldo|musica|tema|modo|color|voz)\b|\b(a la meta|al habito|a mi meta)\b|^\d+([.,]\d+)?\s*(km|kilos|kg|libros|paginas|minutos)?\s+(a|al|en)\b/;
    add('smartCapture', /^(anota(me)?|apunta(me)?|agrega(me)?|anade(me)?|mete(me)?|agenda(me)?|programa(me)?|ponme|organiza(me)?|tengo que|tengo|debo|necesito|hay que|me toca|no olvidar|guarda(me)? que)\s+(.+)$/, (m, o) => {
      const verb = m[1], rest = tailOf(o, m[m.length - 1]).trim();
      const rf = fold(rest);
      if (SKIP_OBJ.test(rf)) return null;
      if (/^organiza/.test(verb) && /^(el |mi )?(dia|semana|agenda|tareas)$/.test(rf)) return null;
      if (verb === 'tengo' && !EVENT_RE.test(rf) && !/^(que|una tarea|pendiente)/.test(rf)) return null;
      if (/^programa/.test(verb) && /(temporizador|alarma|timer)/.test(rf)) return null;
      return smartReply(/^(no olvidar)/.test(verb) ? 'recuérdame ' + rest : rest);
    });
    add('coachPin', /^(crea|crear|pon|ponle|cambia|cambiar) (un |el |mi )?pin$/, () => ({ text: 'Vamos a crear tu PIN.', after: () => setTimeout(() => accountAction('pin'), 300) }));
    add('coachVoiceHelp', /^(que puedo decir|que (le )?puedo pedir|comandos de voz|ayuda con la voz)$/, () => ({ text: 'Te muestro lo que puedes decirme.', after: () => voiceCmd({ help: true }) }));
    R.unshift(...mine);
    // Si dices algo que suena a pendiente ("pagar la luz el viernes") y ninguna otra orden lo entiende, lo organizo.
    const CHORE = /^(pagar|llamar|comprar|enviar|mandar|revisar|terminar|preparar|limpiar|lavar|estudiar|entregar|responder|contestar|escribir|redactar|hacer|recoger|buscar|reservar|agendar|cocinar|arreglar|renovar|cancelar|confirmar|imprimir|firmar|sacar|llevar|devolver|depositar|transferir|cotizar|visitar|ir a|ir al|ir por|reunion|cita|clase|examen|entrevista)\b/;
    const WHEN_CUE = /\b(hoy|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|esta semana|a las|de \d{1,2} a \d{1,2}|el \d{1,2}|todos los dias|cada (dia|semana|mes))\b/;
    R.push(['smartGuess', /^[a-zñ]/, (m, o) => {
      const n = o.n.trim();
      if (n.split(/\s+/).length < 2 || n.length > 200 || /\?$/.test(o.s.trim()) || /^(que|como|cuando|donde|por que|quien|cual|cuanto)\b/.test(n)) return null;
      return CHORE.test(n) || (WHEN_CUE.test(n) && /^[a-zñ]+(ar|er|ir)\b/.test(n)) ? smartReply(o.s) : null;
    }]);
  }

  /* =====================================================================
     TU PERFIL Y PIN
  ===================================================================== */
  function renderAccountBox() {
    const boxes = [$('#cxAccount'), $('#cxAccount2')].filter(Boolean);
    if (!boxes.length || !window.DilexLock) return;
    const L = DilexLock, me = L.active(), all = L.profiles();
    const html = `<div class="card cx-pad"><div class="cx-row mb-3"><span class="lk-av" style="--c:${esc(me.color)}">${esc((me.name || '?').charAt(0).toUpperCase())}</span><div class="flex-1 min-w-0"><h2 class="sec-title">Tu perfil: ${esc(me.name)}</h2><p class="hint">${me.hasPin ? 'Protegido con PIN' : 'Sin PIN: cualquiera con tu teléfono puede abrirla'}</p></div></div>
      <div class="cx-wrap">${me.hasPin ? `<button type="button" class="btn btn-sm" data-acc="pin">${ic('key')}Cambiar PIN</button><button type="button" class="btn btn-sm" data-acc="nopin">Quitar PIN</button><button type="button" class="btn btn-sm" data-acc="lock">${ic('lock')}Bloquear ahora</button>` : `<button type="button" class="btn btn-sm btn-accent" data-acc="pin">${ic('lock')}Crear PIN</button>`}
        <button type="button" class="btn btn-sm" data-acc="rename">${ic('pencil')}Cambiar nombre</button></div>
      ${me.hasPin ? `<label class="block mt-3"><span class="field-label">Pedir el PIN otra vez si la app estuvo en segundo plano</span><select class="input input-sm w-full" data-acc-lock>${Object.entries(L.LOCK_OPTS).map(([k, v]) => `<option value="${k}" ${String(L.lockAfter()) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      <p class="field-label mt-4">Perfiles en este dispositivo</p><div class="cx-list">${all.map(p => `<div class="cx-li"><span class="lk-av" style="--c:${esc(p.color)};width:2rem;height:2rem;font-size:.85rem">${esc(p.name.charAt(0).toUpperCase())}</span><p class="grow text-sm cx-b">${esc(p.name)}${p.active ? ' <span class="chip">Activo</span>' : ''}</p>${p.active ? '' : `<button type="button" class="btn btn-sm" data-acc-sw="${esc(p.id)}">Entrar</button>`}</div>`).join('')}</div>
      <button type="button" class="btn btn-sm mt-3" data-acc="new">${ic('plus')}Nuevo perfil</button>
      <p class="hint cx-small mt-3">Cada perfil tiene sus propias tareas, plan y ajustes. El PIN bloquea la pantalla; para pasar tus datos a otro teléfono usa Respaldo.</p></div>`;
    boxes.forEach(box => {
      box.innerHTML = html;
      box.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => accountAction(b.dataset.acc));
      box.querySelectorAll('[data-acc-sw]').forEach(b => b.onclick = () => { closeSheets(); L.switchTo(b.dataset.accSw); });
      const sel = box.querySelector('[data-acc-lock]'); if (sel) sel.onchange = () => { L.lockAfter(+sel.value); toast('Guardado.'); };
    });
  }
  async function accountAction(a) {
    const L = window.DilexLock;
    if (a === 'lock') { closeSheets(); L.lockNow(); return; }
    if (a === 'new') { closeSheets(); L.newProfile(); return; }
    if (a === 'rename') { const v = prompt('Nombre del perfil', L.active().name); if (v && v.trim()) { L.rename(v); renderAccountBox(); } return; }
    closeSheets();
    if (a === 'nopin' || a === 'pin') {
      const steps = [];
      if (L.hasPin()) steps.push({ id: 'cur', type: 'pin', verify: true, optional: false, kicker: 'Seguridad', q: 'Escribe tu PIN actual' });
      if (a === 'pin') steps.push({ id: 'new', type: 'pin', optional: false, kicker: 'Nuevo PIN', q: L.hasPin() ? 'Ahora el PIN nuevo' : 'Crea tu PIN', sub: 'Cuatro números. Te los pediré al abrir la app.' });
      const ans = await runFlow(steps, {});
      if (!ans) return;
      if (a === 'nopin') { L.removePin(); toast('PIN quitado.'); }
      renderAccountBox();
    }
  }
  // El paso "pin" con verify:true comprueba el PIN actual en vez de crear uno.
  const _submitPin = submitPin;
  submitPin = function (st) {
    if (!st.verify) return _submitPin(st);
    const ins = $$('#cxPin input'), pin = ins.map(x => x.value).join('');
    if (!/^\d{4}$/.test(pin)) return;
    window.DilexLock.verify(pin).then(ok => {
      if (ok) { flow.ans[st.id] = true; flowNext(); return; }
      ins.forEach(x => { x.value = ''; }); ins[0].focus(); $('#cxPinMsg').textContent = 'PIN incorrecto.';
      const box = $('#cxPin'); box.classList.remove('lk-dots'); if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    });
  };

  /* =====================================================================
     ARRANQUE DEL COACH
  ===================================================================== */
  function coachTaskToggled(t, done) {
    if (!done || !t) return;
    const dk = t.due || todayKey(), k = `t:${t.id}:${dk}`;
    if (!coach.checkins[k] || coach.checkins[k].state !== 'answered') { const ck = ckOf(t, dk); ck.state = 'answered'; ck.answer = 'done'; saveCoach(); pushAck([`task:${t.id}:${dk}`]); }
    coachOnTaskDone(t);
    schedulePushSync();
  }
  function coachRender() {
    if (SIMPLE) renderSimpleHoy();
    renderAskCard();
    renderDayCard();
    if (curView === 'plan') renderCoachPlan();
    if (curView === 'progreso') renderWeek();
    if (curView === 'recordatorios') renderReminders();
  }
  let lastMin = -1;
  function coachTick() {
    try { checkTick(); repeatReminders(); } catch (e) { console.error(e); }
    const m = nowM();
    if (m !== lastMin) { lastMin = m; if (!document.hidden) { autoOrganize(); renderDayCard(); renderAskCard(); if (SIMPLE) renderSimpleHoy(); } }
  }
  function injectSettings() {
    const th = $('#themeSheet .space-y-6');
    if (th && !$('#cxAccount2')) {
      const d = document.createElement('div'); d.id = 'cxAccount2';
      th.insertBefore(d, th.children[2] || null);
    }
    const prof = $('#profileBox');
    if (prof && !$('#cxParamsLink')) {
      const b = document.createElement('div'); b.id = 'cxParamsLink'; b.className = 'cx-soft';
      b.innerHTML = `<p class="cx-b">Tu coach</p><p class="hint mt-0.5">Horario, nivel de metiche, cierre del día y automatización.</p><div class="cx-wrap mt-2"><button type="button" class="btn btn-sm btn-accent" data-cx-act="params">${ic('wand')}Mis parámetros</button><button type="button" class="btn btn-sm" data-cx-act="wizard">Repetir diagnóstico</button><button type="button" class="btn btn-sm" data-cx-act="${SIMPLE ? 'fullMode' : 'simpleMode'}">${SIMPLE ? 'Vista completa' : 'Vista simple'}</button></div>`;
      prof.parentElement.insertBefore(b, prof);
    }
  }
  function simplifyTasks() {
    if (!SIMPLE) return;
    const list = $('#taskList');
    if (list) list.addEventListener('click', (e) => {
      if (e.target.closest('input, button, a')) return;
      const li = e.target.closest('li[data-id]'); if (li) openTaskPlan(li.dataset.id);
    });
    const search = $('#taskSearch'), row = search && search.parentElement;
    if (row && !$('#cxFindBtn')) {
      const b = document.createElement('button');
      b.id = 'cxFindBtn'; b.type = 'button'; b.className = 'btn btn-sm btn-ghost'; b.setAttribute('aria-label', 'Buscar y ordenar'); b.innerHTML = ic('search');
      b.onclick = () => { const on = $('#tareas').classList.toggle('cx-find'); if (on) setTimeout(() => search.focus(), 50); };
      row.prepend(b);
    }
    const ti = $('#taskInput'); if (ti) ti.placeholder = 'Nueva tarea (yo le pongo hora y detalles)';
  }
  function hookCapture() {
    // Botones "Añadir" → captura inteligente
    $$('[data-open-sheet="addSheet"]').forEach(b => { b.removeAttribute('data-open-sheet'); b.dataset.cxAct = 'capture'; });
    const hb = $('#resumen [data-goto="task"]');
    if (hb) { hb.removeAttribute('data-goto'); hb.dataset.cxAct = 'capture'; hb.innerHTML = `${ic('plus')}Agregar`; }
    const hdr = $('header .flex.items-center.gap-1\\.5') || $('#installBtn')?.parentElement;
    if (hdr && !$('#cxAddTop')) {
      const b = document.createElement('button');
      b.id = 'cxAddTop'; b.type = 'button'; b.className = 'btn btn-accent btn-icon sm:!px-3'; b.dataset.cxAct = 'capture'; b.title = 'Agregar lo que sea'; b.setAttribute('aria-label', 'Agregar lo que sea');
      b.innerHTML = `${ic('plus')}<span class="hidden sm:inline">Agregar</span>`;
      hdr.prepend(b);
    }
    // "Para hoy": lo que escribas se organiza solo
    const qf = $('#quickForm');
    if (qf) qf.addEventListener('submit', (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      const v = $('#quickInput').value.trim(); if (!v) return;
      const r = smartAdd(v, { defaultDue: todayKey() }); $('#quickInput').value = '';
      if (r.results.length) { toast(r.text.split('\n')[0], 'ok', { label: 'Ver', fn: () => showRouted(r.results) }); if (settings.voice) speak(r.say); }
    }, true);
    if ($('#quickInput')) $('#quickInput').placeholder = 'Escribe lo que sea: tarea, cita, hábito… yo lo ubico';
    // Formulario de Tareas: la tarea se queda en Tareas, pero le doy forma (área, duración, importancia y hora)
    const tf = $('#taskForm');
    if (tf) tf.addEventListener('submit', () => setTimeout(() => {
      const t = tasks[0];
      if (!t || Date.now() - Date.parse(t.createdAt) > 3000) return;
      const it = analyzeItem(t.text);
      if (!it) return;
      if (!t.area && it.area) t.area = it.area;
      if (!t.durMin) { t.durMin = it.durMin; t.durSrc = 'estimada'; }
      if (!t.importancia && it.imp) t.importancia = it.imp;
      if (!t.due && !it.someday) t.due = it.due || todayKey();
      saveTasks();
      if (t.due === todayKey() && P().autoSchedule && !t.time) organizeDay({ moveOverdue: false, plan: false }); else onTasksChanged();
      if (t.time) toast(`Le puse hora: ${hm12(t.time)}${t.area && AG_AREAS[t.area] ? ` · ${AG_AREAS[t.area][0]}` : ''}`, 'ok');
    }, 50));
  }
  function initCoach() {
    buildViews();
    hookCapture();
    simplifyTasks();
    addRepeatControl();
    const _otp = openTaskPlan;
    openTaskPlan = function (id) { _otp(id); fillRepeatControl(id); };
    injectSettings();
    coachRules();
    voiceRules();
    coachAiTools();
    renderAccountBox();
    const h = (location.hash || '').replace('#', '');
    if (h && (VIEW_DEF[h.split('/')[0]] || document.getElementById(h))) goHash(h, false); else showView('hoy', { noHash: true });
    coachRender();
    setInterval(coachTick, 20000);
    setInterval(() => schedulePushSync(10), 20 * 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (pushState().on) syncPush(); return; }
      processInbox(); coachTick(); schedulePushSync(1500);
      if (todayKey() !== (coach.lastSeenDay || '')) { coach.lastSeenDay = todayKey(); saveCoach(); setTimeout(maybeRunQuizzes, 800); }
      else if (eveningDue() && !flow.alive) setTimeout(maybeRunQuizzes, 800);
    });
    window.addEventListener('online', () => schedulePushSync(500));
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement) || flow.alive) return;
      if (e.key.toLowerCase() === 'v') { e.preventDefault(); voiceOpen() ? voiceClose() : voiceCmd(); }
      if (e.key === 'Escape' && voiceOpen()) voiceClose();
    });
  }
  function coachAfterBoot() {
    coach.lastSeenDay = todayKey(); saveCoach();
    try { if (window.DilexLock && uName() && DilexLock.active().name === 'Principal') { DilexLock.rename(uName()); renderAccountBox(); } } catch { /* sin perfiles */ }
    processInbox();
    if (!handleLaunchParams()) setTimeout(maybeRunQuizzes, 700);
    schedulePushSync(3000);
    setTimeout(coachTick, 4000);
    setTimeout(() => autoOrganize(true, true), 1500);
  }
/* COACH:END */
