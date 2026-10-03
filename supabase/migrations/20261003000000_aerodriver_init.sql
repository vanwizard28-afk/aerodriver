-- AeroDriver initial schema: user roles, flights, transfers, driver schedule
-- Apply via Supabase SQL Editor or `supabase db push`.

begin;

-- ── Roles & profiles ───────────────────────────────────────────────
create type public.app_role as enum ('driver', 'dispatcher', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'driver',
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- Reads the caller's role without triggering RLS recursion on profiles
-- (security definer runs as the table owner, which bypasses RLS).
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- Provision a profile automatically on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Flights (tracked flights + AeroDataBox response cache) ─────────
create table public.flights (
  id uuid primary key default gen_random_uuid(),
  flight_no text not null,
  flight_date date not null default current_date,
  status text,
  payload jsonb,
  fetched_at timestamptz not null default now(),
  unique (flight_no, flight_date)
);
create index flights_flight_no_idx on public.flights (flight_no);

-- ── Transfers (the jobs shown on the driver dashboard) ─────────────
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade
    default auth.uid(),
  flight_id uuid references public.flights (id) on delete set null,
  flight_no text,
  passenger text not null,
  phone text,
  airport text,
  terminal text,
  meeting_point text,
  dropoff text,
  pickup_at timestamptz,
  fare_amount numeric(10, 2) not null default 0,
  parking_fee numeric(10, 2) not null default 0,
  other_expenses numeric(10, 2) not null default 0,
  stage smallint not null default 0 check (stage between 0 and 3),
  share_token uuid not null default gen_random_uuid(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index transfers_driver_idx on public.transfers (driver_id);
create index transfers_pickup_idx on public.transfers (pickup_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger transfers_updated_at
  before update on public.transfers
  for each row execute function public.set_updated_at();

-- ── Driver schedule (shifts, breaks, blocked time) ─────────────────
create table public.driver_schedule (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade
    default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'shift' check (kind in ('shift', 'break', 'blocked')),
  note text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index driver_schedule_driver_idx
  on public.driver_schedule (driver_id, starts_at);

-- ── Row level security ─────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.flights enable row level security;
alter table public.transfers enable row level security;
alter table public.driver_schedule enable row level security;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.current_app_role() in ('dispatcher', 'admin')
  );

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid());

-- Flight data is shared reference data: any signed-in driver may read,
-- writes go through the service role (API route) only — no write policy.
create policy "flights_read_authenticated" on public.flights
  for select to authenticated using (true);

create policy "transfers_driver_all" on public.transfers
  for all to authenticated
  using (
    driver_id = auth.uid()
    or public.current_app_role() in ('dispatcher', 'admin')
  )
  with check (
    driver_id = auth.uid()
    or public.current_app_role() in ('dispatcher', 'admin')
  );

create policy "schedule_driver_all" on public.driver_schedule
  for all to authenticated
  using (driver_id = auth.uid() or public.current_app_role() = 'admin')
  with check (driver_id = auth.uid() or public.current_app_role() = 'admin');

-- ── Realtime (instant multi-device job updates) ────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transfers'
  ) then
    alter publication supabase_realtime add table public.transfers;
  end if;
end $$;

commit;
