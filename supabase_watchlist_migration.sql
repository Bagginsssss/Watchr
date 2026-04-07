-- Watchlist table for storing user's custom stock watchlists
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query)

create table if not exists public.watchlists (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  symbol text not null,
  name text not null,
  sector text default '',
  position integer not null default 0,
  created_at timestamptz default now()
);

-- Prevent duplicate symbols per user
create unique index if not exists watchlists_user_symbol_idx
  on public.watchlists (user_id, symbol);

-- Index for fast lookups by user
create index if not exists watchlists_user_id_idx
  on public.watchlists (user_id);

-- Row Level Security: users can only access their own watchlist
alter table public.watchlists enable row level security;

create policy "Users can view their own watchlist"
  on public.watchlists for select
  using (auth.uid() = user_id);

create policy "Users can insert into their own watchlist"
  on public.watchlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own watchlist"
  on public.watchlists for update
  using (auth.uid() = user_id);

create policy "Users can delete from their own watchlist"
  on public.watchlists for delete
  using (auth.uid() = user_id);
