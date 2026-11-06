-- ============================================================================
-- BeatRush — Supabase Database Schema
-- ============================================================================

-- 1. Unique Players Table (Locked from direct client scraping/overwrites)
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
  record_type text not null, -- 'song_speed' | 'round_score' | 'btr_rank' | 'artist_mastery' | 'daily_challenge' | 'card_unlock'
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

-- Enable Row Level Security (RLS) on all tables
alter table public.players enable row level security;
alter table public.shared_songs enable row level security;
alter table public.global_records enable row level security;

-- ============================================================================
-- Policies: players (Protected from direct read/write; accessed only via secure RPC)
-- ============================================================================
create policy "Block direct read players" on public.players for select using (false);
create policy "Block direct insert players" on public.players for insert with check (false);
create policy "Block direct update players" on public.players for update using (false) with check (false);

-- ============================================================================
-- Secure RPC: Player verification & registration (Runs in server context)
-- ============================================================================
create or replace function public.verify_or_register_player(p_username text, p_pin_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
  v_clean_name text;
  v_clean_pin text;
begin
  v_clean_name := trim(p_username);
  v_clean_pin := trim(p_pin_hash);

  -- Validation
  if v_clean_name is null or length(v_clean_name) < 2 or length(v_clean_name) > 25 then
    return jsonb_build_object('success', false, 'error', 'invalid_username');
  end if;

  if v_clean_pin is null or not (v_clean_pin like 'pin_v1_%') or length(v_clean_pin) < 15 then
    return jsonb_build_object('success', false, 'error', 'invalid_pin');
  end if;

  -- Look up existing user case-insensitively
  select username, client_id into v_user
  from public.players
  where lower(username) = lower(v_clean_name)
  limit 1;

  if not found then
    -- New user registration
    insert into public.players (username, client_id, created_at)
    values (v_clean_name, v_clean_pin, now());
    return jsonb_build_object('success', true, 'username', v_clean_name, 'is_new', true);
  end if;

  -- If user exists and already has a PIN
  if v_user.client_id like 'pin_v1_%' then
    if v_user.client_id = v_clean_pin then
      return jsonb_build_object('success', true, 'username', v_user.username, 'is_new', false);
    else
      return jsonb_build_object('success', false, 'error', 'wrong_pin');
    end if;
  else
    -- Legacy user account without PIN -> upgrade with the provided PIN
    update public.players
    set client_id = v_clean_pin
    where username = v_user.username;
    return jsonb_build_object('success', true, 'username', v_user.username, 'is_new', false, 'upgraded', true);
  end if;
end;
$$;

grant execute on function public.verify_or_register_player(text, text) to anon, authenticated;

-- ============================================================================
-- Policies: shared_songs
-- ============================================================================
create policy "Allow public read shared_songs" on public.shared_songs for select using (true);
create policy "Allow public insert valid shared_songs" on public.shared_songs
  for insert with check (length(trim(title)) >= 1 and length(trim(artist)) >= 1 and preview_url like 'http%');

-- ============================================================================
-- Policies: global_records
-- ============================================================================
create policy "Allow public read global_records" on public.global_records for select using (true);
create policy "Allow public insert global_records" on public.global_records
  for insert with check (length(trim(username)) >= 1 and length(trim(record_type)) >= 1);
create policy "Allow public update btr_rank" on public.global_records
  for update using (record_type = 'btr_rank') with check (record_type = 'btr_rank');
