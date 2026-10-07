-- Runs the send-reminders function every 15 minutes.
-- Run this once in the Supabase SQL editor after deploying the function.
-- Replace <project-ref> with your project's ref (the xxxx in https://xxxx.supabase.co).
-- It creates a random secret in Supabase Vault that the scheduler sends and the
-- function checks, so there is nothing to copy by hand.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'zaroori_cron_secret')
where not exists (select 1 from vault.secrets where name = 'zaroori_cron_secret');

-- Only the service role (used by the function) may ask whether a secret is right.
-- The argument is referred to as $1 because "secret" is also a Vault column name.
create or replace function public.check_cron_secret(secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets d where d.name = 'zaroori_cron_secret' and d.decrypted_secret = $1);
$$;
revoke all on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

select cron.unschedule('zaroori-send-reminders')
where exists (select 1 from cron.job where jobname = 'zaroori-send-reminders');

select cron.schedule(
  'zaroori-send-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'zaroori_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
