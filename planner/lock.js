/* LOCK:START */
/* =====================================================================
   PERFILES Y PIN
   Fuente: planner/lock.js (planner/build.py lo copia a index.html).
   Corre antes que la app. Cada perfil guarda sus datos aparte: los datos
   del perfil activo viven en las claves "dilex.*" de siempre y los de los
   demás se guardan juntos en "dilexsys.p.<id>". El PIN es un candado de
   pantalla (se guarda solo su huella SHA-256 con sal), no un cifrado.
===================================================================== */
(function () {
  'use strict';
  var REG = 'dilexsys.profiles', BLOB = 'dilexsys.p.', SESS = 'dilexsys.unlocked', LAST = 'dilexsys.lastSeen', FAILS = 'dilexsys.fails';
  var COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#e11d48', '#7c3aed', '#0284c7', '#c2410c'];
  var LOCK_OPTS = { 0: 'Al instante', 1: '1 minuto', 5: '5 minutos', 30: '30 minutos', '-1': 'Nunca (solo al abrir)' };
  var ls = window.localStorage;
  var get = function (k, fb) { try { var v = ls.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } };
  var set = function (k, v) { try { ls.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  var sget = function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  var sset = function (k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* sin sesión */ } };
  var uid = function () { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- Registro de perfiles ---------- */
  function load() {
    var r = get(REG, null);
    if (!r || !Array.isArray(r.list) || !r.list.length) {
      var s = get('dilex.settings', {}) || {};
      var id = uid();
      r = { list: [{ id: id, name: (s.userName || '').trim() || 'Principal', color: COLORS[0], pin: null, createdAt: new Date().toISOString() }], active: id, lockAfter: 5 };
      set(REG, r);
    }
    if (!r.list.some(function (p) { return p.id === r.active; })) r.active = r.list[0].id;
    if (r.lockAfter == null) r.lockAfter = 5;
    return r;
  }
  var reg = load();
  var save = function () { set(REG, reg); };
  var active = function () { return reg.list.find(function (p) { return p.id === reg.active; }); };
  var byId = function (id) { return reg.list.find(function (p) { return p.id === id; }); };

  /* ---------- Huella del PIN ---------- */
  function fallbackHash(str) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var r = 0; r < 2000; r++) for (var i = 0; i < str.length; i++) {
      h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 ^ (h1 & 255), 2246822519) >>> 0;
    }
    return 'f' + h1.toString(16) + h2.toString(16);
  }
  function hashPin(pin, salt) {
    var str = salt + ':' + pin + ':dilex';
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) {
        return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      }).catch(function () { return fallbackHash(str); });
    }
    return Promise.resolve(fallbackHash(str));
  }
  function makePin(pin) { var salt = uid(); return hashPin(pin, salt).then(function (h) { return { salt: salt, hash: h }; }); }
  function checkPin(p, pin) { if (!p || !p.pin) return Promise.resolve(true); return hashPin(pin, p.pin.salt).then(function (h) { return h === p.pin.hash; }); }

  /* ---------- Cambiar los datos de perfil ---------- */
  function dataKeys() { var out = []; for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (k && k.indexOf('dilex.') === 0) out.push(k); } return out; }
  function stash(id) {
    var blob = {};
    dataKeys().forEach(function (k) { blob[k] = ls.getItem(k); });
    try { ls.setItem(BLOB + id, JSON.stringify(blob)); return true; } catch (e) { return false; }
  }
  function unstash(id) {
    dataKeys().forEach(function (k) { ls.removeItem(k); });
    var blob = get(BLOB + id, null);
    if (blob) Object.keys(blob).forEach(function (k) { try { ls.setItem(k, blob[k]); } catch (e) { /* lleno */ } });
    ls.removeItem(BLOB + id);
  }
  function switchTo(id, opts) {
    opts = opts || {};
    if (id === reg.active) { unlock(); return true; }
    if (!stash(reg.active)) { alert('No hay espacio suficiente en este navegador para cambiar de perfil. Borra archivos del Analizador o guarda una copia y libera espacio.'); return false; }
    unstash(id);
    if (opts.fresh) set('dilex.settings', Object.assign({}, get('dilex.settings', {}), { userName: opts.name || '', onboarded: !!opts.name }));
    reg.active = id; save();
    sset(SESS, id); set(LAST, Date.now());
    location.reload();
    return true;
  }

  /* ---------- Estado de bloqueo ---------- */
  var locked = false, readyCbs = [], hiddenAt = null;
  function isUnlockedSession() {
    var p = active();
    if (!p.pin) return true;
    if (sget(SESS) !== p.id) return false;
    var last = get(LAST, 0);
    if (reg.lockAfter === -1) return true;
    return Date.now() - last < Math.max(0, reg.lockAfter) * 60000 + 1500;
  }
  function unlock() {
    locked = false;
    sset(SESS, reg.active); set(LAST, Date.now()); set(FAILS, null);
    var el = document.getElementById('lock');
    if (el) { el.classList.add('out'); setTimeout(function () { el.remove(); }, 380); }
    document.documentElement.classList.remove('locked');
    var cbs = readyCbs; readyCbs = [];
    cbs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); set(LAST, Date.now()); return; }
    var p = active();
    if (!p.pin || locked || reg.lockAfter === -1 || hiddenAt == null) return;
    if (Date.now() - hiddenAt >= reg.lockAfter * 60000) { sset(SESS, null); showLock(); }
  });
  setInterval(function () { if (!document.hidden && !locked) set(LAST, Date.now()); }, 30000);

  /* ---------- Pantalla de bloqueo ---------- */
  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12a1 1 0 001-1V6a1 1 0 00-1-1z"/><path d="M17 9l-5 5M12 9l5 5"/></svg>';
  var ICON_USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18.5 20a6.5 6.5 0 00-3-5.5"/></svg>';
  function avatar(p, big) { return '<span class="lk-av' + (big ? ' big' : '') + '" style="--c:' + escH(p.color || COLORS[0]) + '">' + escH((p.name || '?').trim().charAt(0).toUpperCase() || '?') + '</span>'; }

  function shell() {
    var el = document.getElementById('lock');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Desbloquear');
    document.body.appendChild(el);
    return el;
  }

  function showLock() {
    locked = true;
    document.documentElement.classList.add('locked');
    var el = shell();
    el.classList.remove('out');
    pinScreen(active(), function () { unlock(); });
  }

  function pinScreen(p, onOk, opts) {
    opts = opts || {};
    var el = shell();
    var entered = '';
    var others = reg.list.length > 1 || opts.allowNew !== false;
    el.innerHTML = '<div class="lk-bg"></div><div class="lk-box">' + avatar(p, true) +
      '<p class="lk-hello">' + escH(opts.title || ('Hola, ' + p.name)) + '</p>' +
      '<p class="lk-sub" id="lkSub">' + escH(opts.sub || 'Ingresa tu PIN') + '</p>' +
      '<div class="lk-dots" id="lkDots">' + '<i></i><i></i><i></i><i></i>' + '</div>' +
      '<div class="lk-pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-k="' + n + '">' + n + '</button>'; }).join('') +
      '<button type="button" data-k="who" class="lk-ghost" aria-label="Cambiar de perfil">' + (opts.back ? '<span class="lk-sm">Volver</span>' : ICON_USERS) + '</button>' +
      '<button type="button" data-k="0">0</button><button type="button" data-k="del" class="lk-ghost" aria-label="Borrar">' + ICON_BACK + '</button></div>' +
      '<button type="button" class="lk-link" id="lkForgot">¿Olvidaste tu PIN?</button></div>';
    var dots = el.querySelectorAll('#lkDots i');
    var paint = function () { for (var i = 0; i < 4; i++) dots[i].classList.toggle('on', i < entered.length); };
    var waitUntil = function () { var f = get(FAILS, null); return f && f.until > Date.now() ? f.until : 0; };
    var press = function (k) {
      if (k === 'who') { if (opts.back) opts.back(); else if (others) chooser(); return; }
      if (k === 'del') { entered = entered.slice(0, -1); paint(); return; }
      var w = waitUntil();
      if (w) { el.querySelector('#lkSub').textContent = 'Demasiados intentos. Espera ' + Math.ceil((w - Date.now()) / 1000) + ' s.'; return; }
      if (entered.length >= 4) return;
      entered += k; paint();
      if (navigator.vibrate) navigator.vibrate(8);
      if (entered.length === 4) {
        var tryPin = entered;
        checkPin(p, tryPin).then(function (ok) {
          if (ok) { set(FAILS, null); el.querySelector('#lkDots').classList.add('ok'); setTimeout(onOk, 160); return; }
          var f = get(FAILS, { n: 0 }) || { n: 0 }; f.n = (f.n || 0) + 1;
          if (f.n >= 5) { f.until = Date.now() + 30000; f.n = 0; }
          set(FAILS, f);
          var box = el.querySelector('#lkDots');
          box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
          if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
          el.querySelector('#lkSub').textContent = f.until ? 'Demasiados intentos. Espera 30 s.' : 'PIN incorrecto. Inténtalo otra vez.';
          entered = ''; setTimeout(paint, 250);
        });
      }
    };
    el.querySelector('.lk-pad').onclick = function (e) { var b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
    el.onkeydown = function (e) { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); };
    el.tabIndex = -1; setTimeout(function () { try { el.focus(); } catch (e) { /* sin foco */ } }, 50);
    el.querySelector('#lkForgot').onclick = function () { forgot(p); };
    if (!others) el.querySelector('[data-k="who"]').style.visibility = 'hidden';
  }

  function chooser() {
    var el = shell();
    el.innerHTML = '<div class="lk-bg"></div><div class="lk-box"><p class="lk-hello">¿Quién eres?</p><p class="lk-sub">Elige tu perfil</p><div class="lk-list">' +
      reg.list.map(function (p) { return '<button type="button" class="lk-prof" data-id="' + escH(p.id) + '">' + avatar(p) + '<span>' + escH(p.name) + (p.pin ? '' : ' <small>sin PIN</small>') + '</span></button>'; }).join('') +
      '<button type="button" class="lk-prof lk-new" data-id="new"><span class="lk-av" style="--c:#71717a">+</span><span>Nuevo perfil</span></button></div></div>';
    el.querySelector('.lk-list').onclick = function (e) {
      var b = e.target.closest('[data-id]'); if (!b) return;
      if (b.dataset.id === 'new') { newProfile(); return; }
      var p = byId(b.dataset.id);
      if (!p.pin) { if (p.id === reg.active) unlock(); else switchTo(p.id); return; }
      pinScreen(p, function () { if (p.id === reg.active) unlock(); else switchTo(p.id); }, { back: chooser });
    };
  }

  function newProfile(fromApp) {
    var el = shell();
    el.innerHTML = '<div class="lk-bg"></div><form class="lk-box" id="lkNew"><p class="lk-hello">Nuevo perfil</p><p class="lk-sub">Cada perfil tiene sus propias tareas, plan y ajustes.</p>' +
      '<input class="lk-input" id="lkName" maxlength="30" placeholder="Nombre" autocomplete="given-name" required />' +
      '<p class="lk-sub" style="margin-top:14px">PIN de 4 números (opcional)</p><input class="lk-input lk-pin" id="lkPin" inputmode="numeric" pattern="\\d{4}" maxlength="4" placeholder="••••" autocomplete="off" />' +
      '<div class="lk-row"><button type="button" class="lk-btn ghost" id="lkCancel">Cancelar</button><button class="lk-btn">Crear</button></div></form>';
    var f = el.querySelector('#lkNew');
    setTimeout(function () { f.querySelector('#lkName').focus(); }, 60);
    f.querySelector('#lkCancel').onclick = function () { if (fromApp) unlock(); else chooser(); };
    f.onsubmit = function (e) {
      e.preventDefault();
      var name = f.querySelector('#lkName').value.trim().slice(0, 30);
      var pin = f.querySelector('#lkPin').value.trim();
      if (!name) return;
      if (pin && !/^\d{4}$/.test(pin)) { f.querySelector('#lkPin').focus(); return; }
      api.create(name, pin || null).then(function (p) { switchTo(p.id, { fresh: true, name: name }); });
    };
  }

  function forgot(p) {
    var el = shell();
    el.innerHTML = '<div class="lk-bg"></div><div class="lk-box"><p class="lk-hello">¿Olvidaste tu PIN?</p>' +
      '<p class="lk-sub lk-left">Por seguridad, el PIN no se puede recuperar ni ver. Si no lo recuerdas, puedes borrar este perfil y empezar de cero. Si guardaste una copia de respaldo, después podrás restaurarla desde "Respaldo".</p>' +
      '<p class="lk-sub lk-left" style="margin-top:10px">Para confirmar escribe <b>BORRAR</b>:</p><input class="lk-input" id="lkConfirm" autocomplete="off" />' +
      '<div class="lk-row"><button type="button" class="lk-btn ghost" id="lkBack">Volver</button><button type="button" class="lk-btn danger" id="lkWipe">Borrar perfil</button></div></div>';
    el.querySelector('#lkBack').onclick = function () { pinScreen(p, p.id === reg.active ? unlock : function () { switchTo(p.id); }); };
    el.querySelector('#lkWipe').onclick = function () {
      if (el.querySelector('#lkConfirm').value.trim().toUpperCase() !== 'BORRAR') { el.querySelector('#lkConfirm').focus(); return; }
      wipe(p.id);
    };
  }

  function wipe(id) {
    ls.removeItem(BLOB + id);
    reg.list = reg.list.filter(function (x) { return x.id !== id; });
    if (id === reg.active) {
      dataKeys().forEach(function (k) { ls.removeItem(k); });
      if (!reg.list.length) { reg.list.push({ id: uid(), name: 'Principal', color: COLORS[0], pin: null, createdAt: new Date().toISOString() }); reg.active = reg.list[0].id; save(); sset(SESS, reg.active); location.reload(); return; }
      reg.active = reg.list[0].id; save();
      unstash(reg.active); sset(SESS, null); location.reload(); return;
    }
    save();
  }

  /* ---------- API para la app ---------- */
  var api = {
    LOCK_OPTS: LOCK_OPTS,
    ready: function () { return new Promise(function (res) { if (!locked) res(); else readyCbs.push(res); }); },
    isLocked: function () { return locked; },
    profiles: function () { return reg.list.map(function (p) { return { id: p.id, name: p.name, color: p.color, hasPin: !!p.pin, active: p.id === reg.active }; }); },
    active: function () { var p = active(); return { id: p.id, name: p.name, color: p.color, hasPin: !!p.pin }; },
    hasPin: function () { return !!active().pin; },
    lockAfter: function (v) { if (v !== undefined) { reg.lockAfter = +v; save(); } return reg.lockAfter; },
    setPin: function (pin) { if (!/^\d{4}$/.test(String(pin))) return Promise.reject(new Error('El PIN debe tener 4 números')); return makePin(String(pin)).then(function (h) { active().pin = h; save(); sset(SESS, reg.active); set(LAST, Date.now()); return true; }); },
    verify: function (pin) { return checkPin(active(), String(pin)); },
    removePin: function () { active().pin = null; save(); },
    rename: function (name) { name = String(name || '').trim().slice(0, 30); if (name) { active().name = name; save(); } },
    create: function (name, pin) {
      var p = { id: uid(), name: String(name).trim().slice(0, 30) || 'Perfil', color: COLORS[reg.list.length % COLORS.length], pin: null, createdAt: new Date().toISOString() };
      return (pin ? makePin(String(pin)) : Promise.resolve(null)).then(function (h) { p.pin = h; reg.list.push(p); save(); return p; });
    },
    switchTo: function (id) { var p = byId(id); if (!p) return; if (!p.pin) return switchTo(id); var el = shell(); el.classList.remove('out'); locked = true; document.documentElement.classList.add('locked'); pinScreen(p, function () { switchTo(id); }, { back: function () { unlock(); } }); },
    newProfile: function () { var el = shell(); el.classList.remove('out'); locked = true; document.documentElement.classList.add('locked'); newProfile(true); },
    remove: function (id) { if (id !== reg.active) wipe(id); },
    lockNow: function () { if (active().pin) { sset(SESS, null); showLock(); } },
  };
  window.DilexLock = api;

  if (!isUnlockedSession()) {
    locked = true;
    document.documentElement.classList.add('locked');
    if (document.body) showLock(); else document.addEventListener('DOMContentLoaded', showLock);
  } else { sset(SESS, reg.active); set(LAST, Date.now()); }
})();
/* LOCK:END */
