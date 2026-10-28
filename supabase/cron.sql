-- Envía los avisos pendientes cada minuto (se ejecutó una vez en el proyecto "dilex").
-- El secreto se lee de dilex_config, que solo puede leer el servidor.
select cron.schedule('dilex-push-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://jgqmdqzptlbjuzufdtrr.supabase.co/functions/v1/dilex-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.dilex_config where key = 'cron_secret')),
    body := '{"op":"tick"}'::jsonb,
    timeout_milliseconds := 55000)
$$);
