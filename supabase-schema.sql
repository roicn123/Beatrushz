-- ============================================================================
-- BeatRush — Supabase Database Schema (Run once in Supabase SQL Editor)
-- ============================================================================

-- 1. Unique Players Table
create table if not exists public.players (
  username text primary key,
  client_id text not null,
  created_at timestamptz default now()
);

-- 2. Community-Shared Artists & Songs Table
create table if not exists public.shared_songs (
  id text primary key,
  title text not null,
  full_title text,
  artist text not null,
  genre text not null,
  lang text default 'en',
  difficulty text not null,
  preview_url text not null,
  artwork text,
  album text,
  release_year text,
  added_by text,
  created_at timestamptz default now()
);

-- 3. Global Leaderboards & Fastest Song Identifications
create table if not exists public.global_records (
  id bigserial primary key,
  username text not null,
  record_type text not null, -- 'song_speed' | 'round_score'
  song_id text,
  song_title text,
  artist text,
  genre text,
  difficulty text,
  time_ms integer,
  score integer,
  accuracy text,
  created_at timestamptz default now()
);

-- Enable public read/insert access via Row Level Security (RLS)
alter table public.players enable row level security;
alter table public.shared_songs enable row level security;
alter table public.global_records enable row level security;

create policy "Allow public read players" on public.players for select using (true);
create policy "Allow public insert players" on public.players for insert with check (true);
create policy "Allow public update own player" on public.players for update using (true);

create policy "Allow public read shared_songs" on public.shared_songs for select using (true);
create policy "Allow public insert shared_songs" on public.shared_songs for insert with check (true);

create policy "Allow public read global_records" on public.global_records for select using (true);
create policy "Allow public insert global_records" on public.global_records for insert with check (true);
