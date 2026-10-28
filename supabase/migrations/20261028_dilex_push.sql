-- dilex.exe · notificaciones con la app cerrada
-- Solo la función "dilex-push" (con la clave de servicio) lee y escribe estas tablas:
-- RLS está activo y no hay políticas, así que la clave pública no puede tocarlas.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.dilex_config (
  key   text primary key,
  value text not null
);

create table if not exists public.dilex_devices (
  id          uuid primary key,
  secret_hash text not null,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  tz          text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.dilex_jobs (
  id         bigint generated always as identity primary key,
  device_id  uuid not null references public.dilex_devices(id) on delete cascade,
  send_at    timestamptz not null,
  grp        text not null default '',
  payload    jsonb not null,
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists dilex_jobs_due on public.dilex_jobs (send_at) where sent_at is null;
create index if not exists dilex_jobs_device on public.dilex_jobs (device_id, grp);

alter table public.dilex_config  enable row level security;
alter table public.dilex_devices enable row level security;
alter table public.dilex_jobs    enable row level security;
