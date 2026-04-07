-- Price Alerts + Portfolio Snapshots
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

-- ═══════════════════════════════════════════════════════════════════
-- PRICE ALERTS
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.price_alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  name text not null default '',
  target_price numeric not null,
  direction text not null check (direction in ('above', 'below')),
  triggered boolean default false,
  triggered_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists price_alerts_user_id_idx
  on public.price_alerts (user_id);

create index if not exists price_alerts_active_idx
  on public.price_alerts (user_id, triggered) where triggered = false;

alter table public.price_alerts enable row level security;

create policy "Users can view their own alerts"
  on public.price_alerts for select
  using (auth.uid() = user_id);

create policy "Users can create their own alerts"
  on public.price_alerts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own alerts"
  on public.price_alerts for update
  using (auth.uid() = user_id);

create policy "Users can delete their own alerts"
  on public.price_alerts for delete
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- PORTFOLIO SNAPSHOTS
-- ═══════════════════════════════════════════════════════════════════
create table if not exists public.portfolio_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  snapshot_date date not null,
  total_value numeric not null,
  total_cost numeric not null default 0,
  created_at timestamptz default now()
);

-- One snapshot per user per day
create unique index if not exists portfolio_snapshots_user_date_idx
  on public.portfolio_snapshots (user_id, snapshot_date);

create index if not exists portfolio_snapshots_user_id_idx
  on public.portfolio_snapshots (user_id);

alter table public.portfolio_snapshots enable row level security;

create policy "Users can view their own snapshots"
  on public.portfolio_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can create their own snapshots"
  on public.portfolio_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own snapshots"
  on public.portfolio_snapshots for update
  using (auth.uid() = user_id);
