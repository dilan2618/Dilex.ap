/* dilex.exe: guarda la app para que funcione sin internet */
const CACHE = 'dilex-v9-app-20261028';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Primero la red (para recibir actualizaciones), y si no hay conexión, la copia guardada.
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)])
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

/* ---------- Notificaciones con la app cerrada ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('dilex-sw', 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { autoIncrement: true }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kv(key) { const db = await idb(); return new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); }
async function inbox(item) { const db = await idb(); return new Promise((res) => { const tx = db.transaction('inbox', 'readwrite'); tx.objectStore('inbox').add(item); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
async function server(op, body) {
  const p = await kv('push');
  if (!p || !p.device) return;
  try { await fetch(p.fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: p.key }, body: JSON.stringify(Object.assign({ op, device: p.device, secret: p.secret }, body)) }); } catch (e) { /* sin conexión */ }
}
async function tellClients(msg) { const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); list.forEach((c) => c.postMessage(msg)); return list; }

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'dilex.exe', body: e.data ? e.data.text() : '' }; }
  const opts = {
    body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || d.group || 'dilex', renotify: true,
    requireInteraction: !!d.insist, vibrate: d.insist ? [300, 120, 300, 120, 300] : [200, 100, 200],
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [], data: d,
  };
  e.waitUntil(self.registration.showNotification(d.title || 'dilex.exe', opts));
});

self.addEventListener('notificationclick', (e) => {
  const n = e.notification, d = n.data || {};
  n.close();
  e.waitUntil((async () => {
    if (e.action === 'done') {
      await inbox({ type: 'done', group: d.group, at: Date.now() });
      await server('ack', { groups: [d.group] });
      await tellClients({ type: 'dilex-inbox' });
      await self.registration.showNotification('¡Bien hecho! ✅', { body: 'La taché por ti.', icon: 'icon-192.png', tag: 'dilex-ok', silent: true });
      setTimeout(() => self.registration.getNotifications({ tag: 'dilex-ok' }).then((l) => l.forEach((x) => x.close())), 4000);
      return;
    }
    if (e.action === 'snooze') {
      await inbox({ type: 'snooze', group: d.group, until: Date.now() + 15 * 60000 });
      await server('snooze', { minutes: 15, payload: Object.assign({}, d, { title: '¿Ya terminaste? 👀' }) });
      await tellClients({ type: 'dilex-inbox' });
      return;
    }
    const url = new URL(d.url || './', self.registration.scope).href;
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const cx = d.kind === 'close' ? 'close' : d.kind === 'morning' ? 'morning' : null;
    for (const c of list) {
      if ('focus' in c) {
        await c.focus();
        if (cx) c.postMessage({ type: 'dilex-open', cx }); else if (d.kind === 'ask') { c.navigate && c.navigate(url); }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
