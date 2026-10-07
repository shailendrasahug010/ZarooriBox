-- ZarooriBox database schema for Supabase (PostgreSQL).
-- Run in the Supabase SQL editor, then set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
-- Every table carries user_id and row-level security so a user can only ever
-- read or write their own rows, whatever the client sends.

create extension if not exists "pgcrypto";

-- ---------- Reference data ----------
create table if not exists public.categories (
  id text primary key,
  name text not null,
  emoji text not null,
  subcategories text[] not null default '{}'
);
insert into public.categories (id, name, emoji, subcategories) values
  ('personal',  'Personal',  '✨', '{Important dates,Documents,Renewals,Appointments,Meetings}'),
  ('home',      'Home',      '🏠', '{Repairs,Maintenance,Bills,Appliances,Services}'),
  ('finance',   'Finance',   '💳', '{Bills,Insurance,Loans,Subscriptions,Payments}'),
  ('shopping',  'Shopping',  '🛒', '{Shopping list,Grocery,Wishlist}'),
  ('people',    'People',    '👥', '{Money lent,Money borrowed,Things lent,Things borrowed}'),
  ('vehicle',   'Vehicle',   '🚗', '{Insurance,PUC,Service,Registration,Repairs}'),
  ('documents', 'Documents', '📄', '{Passport,Driving licence,PAN,Aadhaar,Certificates,Warranties}'),
  ('health',    'Health',    '💊', '{Medicines,Doctor visits,Tests,Vaccines}'),
  ('bookings',  'Bookings',  '🎟️', '{Travel,Tickets,Hotel,Restaurant,Events,Appointments}')
on conflict (id) do nothing;

-- ---------- User-owned tables ----------
-- IDs are text so the client can generate them (optimistic writes, offline-friendly).

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'INR' check (char_length(currency) = 3),
  default_reminder_days int not null default 1 check (default_reminder_days between 0 and 365),
  notifications jsonb not null default '{"inApp":true,"browser":false,"email":false,"whatsapp":false,"sms":false,"dailyDigest":true,"digestTime":"08:00"}',
  plan text not null default 'free' check (plan in ('free','pro')),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  phone text check (char_length(phone) <= 30),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.memories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 2000),
  category_id text not null references public.categories(id),
  subcategory text check (char_length(subcategory) <= 60),
  due_date date,
  -- Times of day (HH:MM) to alert on the due date, e.g. medicine doses or a meeting.
  due_times text[] check (due_times is null or cardinality(due_times) = 0 or (cardinality(due_times) <= 8 and array_to_string(due_times, ',') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9])*$')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  amount numeric(14,2) check (amount >= 0),
  currency text not null default 'INR',
  person_id text references public.people(id) on delete set null,
  location text check (char_length(location) <= 2000),
  notes text check (char_length(notes) <= 2000),
  source text not null default 'manual' check (source in ('manual','quick_add','seed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  last_completed_at timestamptz
);
create index if not exists memories_user_due on public.memories (user_id, status, due_date);

create table if not exists public.reminders (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_id text not null references public.memories(id) on delete cascade,
  offset_days int check (offset_days between 0 and 3650),
  remind_on date not null,
  notified_for date
);
create index if not exists reminders_due on public.reminders (remind_on) where notified_for is null;

create table if not exists public.recurring_items (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_id text not null unique references public.memories(id) on delete cascade,
  frequency text not null check (frequency in ('daily','weekly','monthly','quarterly','half_yearly','yearly','custom')),
  interval int not null check (interval between 1 and 999),
  unit text not null check (unit in ('day','week','month','year')),
  created_at timestamptz not null default now()
);

create table if not exists public.lendings (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id text not null references public.people(id) on delete cascade,
  direction text not null check (direction in ('lent','borrowed')),
  kind text not null check (kind in ('money','thing')),
  amount numeric(14,2) check (amount > 0),
  currency text not null default 'INR',
  item_name text check (char_length(item_name) <= 120),
  date date not null,
  follow_up_date date,
  status text not null default 'open' check (status in ('open','returned')),
  returned_at timestamptz,
  notes text check (char_length(notes) <= 2000),
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'money' and amount is not null) or (kind = 'thing' and item_name is not null))
);

create table if not exists public.shopping_items (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity text check (char_length(quantity) <= 30),
  list_category text not null default 'Grocery',
  purchased boolean not null default false,
  created_at timestamptz not null default now(),
  purchased_at timestamptz
);

create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_id text references public.memories(id) on delete set null,
  lending_id text references public.lendings(id) on delete set null,
  title text not null,
  body text not null,
  channel text not null check (channel in ('in_app','browser','email','whatsapp','sms')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.attachments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  memory_id text not null references public.memories(id) on delete cascade,
  name text not null,
  mime_type text not null,
  size int not null check (size between 0 and 10485760),
  storage_path text,
  created_at timestamptz not null default now()
);

-- ---------- Columns added for email / WhatsApp / SMS delivery ----------
-- (add column if not exists, so re-running this file upgrades an existing project)
alter table public.user_settings add column if not exists phone text check (phone ~ '^\+[1-9][0-9]{6,14}$');
alter table public.user_settings add column if not exists timezone text not null default 'Asia/Kolkata' check (char_length(timezone) <= 64);
alter table public.user_settings add column if not exists last_digest_on date;
-- In-app (notified_for) and outside-the-app (delivered_for) deliveries are tracked separately.
alter table public.reminders add column if not exists delivered_for date;
alter table public.lendings add column if not exists delivered_for date;

-- People may edit their own settings, but not their plan or the delivery bookkeeping.
create or replace function public.protect_settings() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.last_digest_on := null;
    else
      new.plan := old.plan;
      new.last_digest_on := old.last_digest_on;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_settings on public.user_settings;
create trigger protect_settings before insert or update on public.user_settings for each row execute function public.protect_settings();

create or replace function public.protect_delivery() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.delivered_for := case when tg_op = 'INSERT' then null else old.delivered_for end;
  end if;
  return new;
end $$;
drop trigger if exists protect_delivery on public.reminders;
create trigger protect_delivery before insert or update on public.reminders for each row execute function public.protect_delivery();
drop trigger if exists protect_delivery on public.lendings;
create trigger protect_delivery before insert or update on public.lendings for each row execute function public.protect_delivery();

-- ---------- Row-level security ----------
alter table public.categories enable row level security;
drop policy if exists "categories are readable" on public.categories;
create policy "categories are readable" on public.categories for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['user_settings','people','memories','reminders','recurring_items','lendings','shopping_items','notifications','attachments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Child rows may only point at parents the same user owns.
create or replace function public.assert_same_owner() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Nested IFs on purpose: PL/pgSQL only resolves new.<column> when the statement
  -- runs, and each table has different columns.
  if tg_table_name in ('reminders','recurring_items','attachments') then
    if not exists (select 1 from public.memories m where m.id = new.memory_id and m.user_id = new.user_id) then
      raise exception 'memory not found';
    end if;
  elsif tg_table_name = 'lendings' then
    if not exists (select 1 from public.people p where p.id = new.person_id and p.user_id = new.user_id) then
      raise exception 'person not found';
    end if;
  elsif tg_table_name = 'memories' then
    if new.person_id is not null and not exists (select 1 from public.people p where p.id = new.person_id and p.user_id = new.user_id) then
      raise exception 'person not found';
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['reminders','recurring_items','attachments','lendings','memories']
  loop
    execute format('drop trigger if exists same_owner on public.%I', t);
    execute format('create trigger same_owner before insert or update on public.%I for each row execute function public.assert_same_owner()', t);
  end loop;
end $$;

-- ---------- Attachments storage ----------
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict (id) do nothing;
drop policy if exists "own attachment files" on storage.objects;
create policy "own attachment files" on storage.objects for all to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- Indexes on foreign keys (RLS filters and joins) ----------
create index if not exists reminders_memory on public.reminders (memory_id);
create index if not exists reminders_user on public.reminders (user_id);
create index if not exists lendings_user on public.lendings (user_id);
create index if not exists lendings_person on public.lendings (person_id);
create index if not exists people_user on public.people (user_id);
create index if not exists recurring_user on public.recurring_items (user_id);
create index if not exists shopping_user on public.shopping_items (user_id);
create index if not exists notifications_user on public.notifications (user_id);
create index if not exists notifications_memory on public.notifications (memory_id);
create index if not exists notifications_lending on public.notifications (lending_id);
create index if not exists attachments_user on public.attachments (user_id);
create index if not exists attachments_memory on public.attachments (memory_id);
create index if not exists memories_person on public.memories (person_id);
create index if not exists memories_category on public.memories (category_id);

-- ---------- Onboarding, language and snooze-friendly delivery ----------
alter table public.user_settings add column if not exists onboarded_at timestamptz;
alter table public.user_settings add column if not exists language text not null default 'en' check (language in ('en','hi'));
alter table public.user_settings add column if not exists voice_language text check (char_length(voice_language) <= 12);

-- ---------- Family sharing ----------
-- A family (household) shares the bills and the shopping list its members choose
-- to share. Everything else (people, lendings, notifications, settings) stays private.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{8}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  role text not null default 'member' check (role in ('owner','member')),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create unique index if not exists household_members_one_active on public.household_members (user_id) where active;
create index if not exists household_members_user on public.household_members (user_id);

alter table public.memories add column if not exists household_id uuid references public.households(id) on delete set null;
alter table public.shopping_items add column if not exists household_id uuid references public.households(id) on delete set null;
create index if not exists memories_household on public.memories (household_id) where household_id is not null;
create index if not exists shopping_household on public.shopping_items (household_id) where household_id is not null;
-- Outside-the-app deliveries to family members of a shared item: {"<user id>": "<remind_on>"}.
alter table public.reminders add column if not exists delivered_to jsonb not null default '{}';

-- The family the signed-in person belongs to (null if none). Security definer so
-- policies can call it without recursing into household_members' own policy.
create or replace function public.my_household() returns uuid language sql stable security definer set search_path = '' as $$
  select household_id from public.household_members where user_id = (select auth.uid()) and active limit 1
$$;
revoke all on function public.my_household() from public, anon;
grant execute on function public.my_household() to authenticated, service_role;

alter table public.households enable row level security;
alter table public.households force row level security;
alter table public.household_members enable row level security;
alter table public.household_members force row level security;
drop policy if exists "my family" on public.households;
create policy "my family" on public.households for select to authenticated using (id = (select public.my_household()));
drop policy if exists "my family members" on public.household_members;
create policy "my family members" on public.household_members for select to authenticated using (household_id = (select public.my_household()));

-- Shared rows: visible and editable by everyone in the family. Only the owner can
-- stop sharing (the check fails for anyone else once household_id is null).
alter policy "owner only" on public.memories
  using (user_id = (select auth.uid()) or (household_id is not null and household_id = (select public.my_household())))
  with check ((user_id = (select auth.uid()) or household_id = (select public.my_household()))
              and (household_id is null or household_id = (select public.my_household())));
alter policy "owner only" on public.shopping_items
  using (user_id = (select auth.uid()) or (household_id is not null and household_id = (select public.my_household())))
  with check ((user_id = (select auth.uid()) or household_id = (select public.my_household()))
              and (household_id is null or household_id = (select public.my_household())));

-- Reminders, repeats and attachments follow the memory they belong to.
create or replace function public.can_use_memory(p_memory_id text) returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.memories m where m.id = p_memory_id)
$$;
alter policy "owner only" on public.reminders
  using (user_id = (select auth.uid()) or public.can_use_memory(memory_id))
  with check (user_id = (select auth.uid()) or public.can_use_memory(memory_id));
alter policy "owner only" on public.recurring_items
  using (user_id = (select auth.uid()) or public.can_use_memory(memory_id))
  with check (user_id = (select auth.uid()) or public.can_use_memory(memory_id));
alter policy "owner only" on public.attachments
  using (user_id = (select auth.uid()) or public.can_use_memory(memory_id))
  with check (user_id = (select auth.uid()) or public.can_use_memory(memory_id));

-- A row's owner never changes, whoever edits it.
create or replace function public.keep_owner() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.user_id := old.user_id;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['memories','shopping_items','reminders','recurring_items','attachments']
  loop
    execute format('create or replace trigger keep_owner before update on public.%I for each row execute function public.keep_owner()', t);
  end loop;
end $$;

-- Delivery bookkeeping (delivered_for, delivered_to) is written only by the server.
create or replace function public.protect_delivery() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.delivered_for := case when tg_op = 'INSERT' then null else old.delivered_for end;
    if tg_table_name = 'reminders' then
      new.delivered_to := case when tg_op = 'INSERT' then '{}'::jsonb else old.delivered_to end;
    end if;
  end if;
  return new;
end $$;

-- Family membership changes only through these functions.
create or replace function public.create_household(p_name text, p_display_name text) returns public.households
language plpgsql security definer set search_path = '' as $$
declare h public.households;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if public.my_household() is not null then raise exception 'You are already in a family. Leave it first.'; end if;
  insert into public.households (name, invite_code, created_by)
    values (left(coalesce(nullif(trim(p_name), ''), 'Our family'), 60), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), (select auth.uid()))
    returning * into h;
  insert into public.household_members (household_id, user_id, display_name, role)
    values (h.id, (select auth.uid()), left(coalesce(p_display_name, ''), 60), 'owner');
  update public.shopping_items set household_id = h.id where user_id = (select auth.uid()) and not purchased and household_id is null;
  return h;
end $$;

create or replace function public.join_household(p_code text, p_display_name text) returns public.households
language plpgsql security definer set search_path = '' as $$
declare h public.households;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'That invite code didn’t match a family. Check it and try again.'; end if;
  if public.my_household() is not null and public.my_household() <> h.id then raise exception 'You are already in a family. Leave it first.'; end if;
  insert into public.household_members (household_id, user_id, display_name, role)
    values (h.id, (select auth.uid()), left(coalesce(p_display_name, ''), 60), 'member')
    on conflict (household_id, user_id) do update set active = true, display_name = excluded.display_name, joined_at = now();
  update public.shopping_items set household_id = h.id where user_id = (select auth.uid()) and not purchased and household_id is null;
  return h;
end $$;

-- Leaving keeps your own items; anything you had shared becomes private again.
create or replace function public.leave_household() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := public.my_household();
begin
  if v is null then return; end if;
  update public.household_members set active = false where household_id = v and user_id = (select auth.uid());
  update public.memories set household_id = null where household_id = v and user_id = (select auth.uid());
  update public.shopping_items set household_id = null where household_id = v and user_id = (select auth.uid());
end $$;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.join_household(text, text) from public, anon;
revoke all on function public.leave_household() from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.leave_household() to authenticated;

-- Family members can open attachments of shared memories.
alter policy "own attachment files" on storage.objects
  using (bucket_id = 'attachments' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.attachments a where a.storage_path = objects.name)))
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Google Drive backup (supabase/functions/drive-backup). One row per person who
-- connected Drive. The refresh token is encrypted by the function. Row level security
-- is on with no policies, so only the function (service role) can read or write it.
create table if not exists public.drive_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  google_email text,
  folder_id text,
  file_id text,
  last_backup_at timestamptz,
  last_attempt_at timestamptz,
  last_count integer,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.drive_backups enable row level security;
revoke all on public.drive_backups from anon, authenticated;
