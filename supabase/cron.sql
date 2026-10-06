-- Runs the send-reminders function every 15 minutes.
-- Run this once in the Supabase SQL editor AFTER deploying the function and setting
-- the CRON_SECRET secret. Replace the two placeholders first:
--   <project-ref>   your project's ref (the xxxx in https://xxxx.supabase.co)
--   <cron-secret>   the same value you set with `supabase secrets set CRON_SECRET=...`
-- The secret is kept in Supabase Vault, not in this file or the cron table.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<cron-secret>', 'lifebox_cron_secret')
where not exists (select 1 from vault.secrets where name = 'lifebox_cron_secret');

select cron.unschedule('lifebox-send-reminders')
where exists (select 1 from cron.job where jobname = 'lifebox-send-reminders');

select cron.schedule(
  'lifebox-send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lifebox_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
