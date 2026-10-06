-- LifeBox database schema for Supabase (PostgreSQL).
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
  ('personal',  'Personal',  '✨', '{Important dates,Documents,Renewals,Appointments}'),
  ('home',      'Home',      '🏠', '{Repairs,Maintenance,Bills,Appliances,Services}'),
  ('finance',   'Finance',   '💳', '{Bills,Insurance,Loans,Subscriptions,Payments}'),
  ('shopping',  'Shopping',  '🛒', '{Shopping list,Grocery,Wishlist}'),
  ('people',    'People',    '👥', '{Money lent,Money borrowed,Things lent,Things borrowed}'),
  ('vehicle',   'Vehicle',   '🚗', '{Insurance,PUC,Service,Registration,Repairs}'),
  ('documents', 'Documents', '📄', '{Passport,Driving licence,PAN,Aadhaar,Certificates,Warranties}')
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
