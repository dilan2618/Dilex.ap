// dilex.exe · servidor de notificaciones (Supabase Edge Function)
//
// Lo usan la app y el service worker para guardar los avisos programados de
// un dispositivo, y pg_cron lo llama cada minuto ("tick") para enviar los que
// ya tocan. Cada dispositivo se identifica con un id y un secreto que solo él
// conoce; en la base solo se guarda el hash del secreto.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const { data, error } = await db.from("dilex_config").select("key,value");
  if (error) throw error;
  cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  webpush.setVapidDetails(cfg.vapid_subject || "mailto:dilex@example.com", cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

async function device(id: unknown, secret: unknown) {
  if (!isUuid(id) || typeof secret !== "string" || secret.length < 20) return null;
  const { data } = await db.from("dilex_devices").select("*").eq("id", id).maybeSingle();
  if (!data || data.secret_hash !== (await sha(secret))) return null;
  return data;
}

function cleanPayload(j: Record<string, unknown>) {
  const actions = Array.isArray(j.actions)
    ? j.actions.slice(0, 2).map((a: Record<string, unknown>) => ({ action: clip(a.action, 20), title: clip(a.title, 30) }))
    : [];
  return {
    title: clip(j.title || "dilex.exe", 80),
    body: clip(j.body, 240),
    tag: clip(j.tag || j.group, 80),
    group: clip(j.group, 80),
    kind: clip(j.kind, 20),
    ref: clip(j.ref, 60),
    url: clip(j.url || "./", 200),
    insist: !!j.insist,
    actions,
  };
}

async function send(dev: { id: string; endpoint: string; p256dh: string; auth: string }, payload: unknown) {
  await config();
  try {
    await webpush.sendNotification(
      { endpoint: dev.endpoint, keys: { p256dh: dev.p256dh, auth: dev.auth } },
      JSON.stringify(payload),
      { TTL: 3600, urgency: "high" },
    );
    return { ok: true };
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) await db.from("dilex_devices").delete().eq("id", dev.id);
    return { ok: false, code, error: String((e as Error).message || e).slice(0, 300) };
  }
}

async function tick() {
  const now = new Date().toISOString();
  const { data: due, error } = await db
    .from("dilex_jobs").select("id")
    .is("sent_at", null).lte("send_at", now)
    .gte("send_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .order("send_at").limit(300);
  if (error) throw error;
  if (!due?.length) return { sent: 0, failed: 0 };
  // Se reservan antes de enviar, así dos ejecuciones seguidas nunca mandan el mismo aviso dos veces.
  const { data: claimed, error: e2 } = await db
    .from("dilex_jobs").update({ sent_at: now })
    .in("id", due.map((d) => d.id)).is("sent_at", null)
    .select("id, payload, device_id");
  if (e2) throw e2;
  const ids = [...new Set((claimed ?? []).map((j) => j.device_id))];
  const { data: devs } = ids.length ? await db.from("dilex_devices").select("id, endpoint, p256dh, auth").in("id", ids) : { data: [] };
  const byId = new Map((devs ?? []).map((d) => [d.id, d]));
  let sent = 0, failed = 0;
  for (const j of claimed ?? []) {
    const dev = byId.get(j.device_id);
    const r = dev ? await send(dev, j.payload) : { ok: false, error: "sin dispositivo" };
    if (r.ok) sent++;
    else { failed++; await db.from("dilex_jobs").update({ error: (r as { error?: string }).error ?? "error" }).eq("id", j.id); }
  }
  if (Math.random() < 0.02) {
    // Limpieza: avisos enviados hace más de 3 días y pendientes muy viejos.
    await db.from("dilex_jobs").delete().not("sent_at", "is", null).lt("sent_at", new Date(Date.now() - 3 * 86400_000).toISOString());
    await db.from("dilex_jobs").delete().is("sent_at", null).lt("send_at", new Date(Date.now() - 86400_000).toISOString());
  }
  return { sent, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* cuerpo vacío */ }
  const op = String(b.op || "");

  try {
    if (op === "tick") {
      const c = await config();
      if (req.headers.get("x-cron-secret") !== c.cron_secret) return json({ error: "forbidden" }, 403);
      return json(await tick());
    }

    if (op === "key") return json({ publicKey: (await config()).vapid_public });

    if (op === "register") {
      const sub = b.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!isUuid(b.device) || typeof b.secret !== "string" || (b.secret as string).length < 20) return json({ error: "device" }, 400);
      if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "subscription" }, 400);
      const hash = await sha(b.secret as string);
      const { data: prev } = await db.from("dilex_devices").select("secret_hash").eq("id", b.device).maybeSingle();
      if (prev && prev.secret_hash !== hash) return json({ error: "forbidden" }, 403);
      const { error } = await db.from("dilex_devices").upsert({
        id: b.device, secret_hash: hash, endpoint: clip(sub.endpoint, 1000), p256dh: clip(sub.keys.p256dh, 200),
        auth: clip(sub.keys.auth, 100), tz: clip(b.tz, 60), updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return json({ ok: true });
    }

    const dev = await device(b.device, b.secret);
    if (!dev) return json({ error: "forbidden" }, 403);

    if (op === "sync") {
      const jobs = Array.isArray(b.jobs) ? (b.jobs as Record<string, unknown>[]).slice(0, 250) : [];
      const now = Date.now();
      await db.from("dilex_jobs").delete().eq("device_id", dev.id).is("sent_at", null);
      const rows = jobs
        .map((j) => ({ at: Date.parse(String(j.at)), j }))
        .filter(({ at }) => Number.isFinite(at) && at > now - 60_000 && at < now + 8 * 86400_000)
        .map(({ at, j }) => ({ device_id: dev.id, send_at: new Date(at).toISOString(), grp: clip(j.group, 80), payload: cleanPayload(j) }));
      if (rows.length) { const { error } = await db.from("dilex_jobs").insert(rows); if (error) throw error; }
      return json({ ok: true, saved: rows.length });
    }

    if (op === "ack") {
      const groups = (Array.isArray(b.groups) ? b.groups : [b.group]).map((g) => clip(g, 80)).filter(Boolean).slice(0, 50);
      if (groups.length) await db.from("dilex_jobs").delete().eq("device_id", dev.id).is("sent_at", null).in("grp", groups);
      return json({ ok: true });
    }

    if (op === "snooze") {
      const mins = Math.min(240, Math.max(1, Number(b.minutes) || 15));
      const p = cleanPayload((b.payload as Record<string, unknown>) || {});
      await db.from("dilex_jobs").delete().eq("device_id", dev.id).is("sent_at", null).eq("grp", p.group);
      await db.from("dilex_jobs").insert({ device_id: dev.id, send_at: new Date(Date.now() + mins * 60_000).toISOString(), grp: p.group, payload: p });
      return json({ ok: true });
    }

    if (op === "test") {
      const r = await send(dev, cleanPayload({
        title: "dilex.exe", body: clip(b.body || "¡Funciona! Así te avisaré aunque la app esté cerrada.", 200), group: "test", kind: "test",
      }));
      return json(r, r.ok ? 200 : 502);
    }

    if (op === "unregister") {
      await db.from("dilex_devices").delete().eq("id", dev.id);
      return json({ ok: true });
    }

    return json({ error: "op" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server", detail: String((e as Error).message || e).slice(0, 200) }, 500);
  }
});
