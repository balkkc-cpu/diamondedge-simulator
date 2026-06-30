-- ===========================================================================
-- LoopMind — Supabase schema
--
-- Run this in the Supabase SQL editor (or `supabase db push`). It creates the
-- tables LoopMind expects and enables Row Level Security so each user can only
-- see their own data. Auth is handled by Supabase Auth (auth.users); the
-- `player_profiles.id` is a 1:1 FK to that table.
--
-- The app runs without any of this (offline mode); wire it up when you want
-- real cloud accounts, synced profiles, and saved rounds/stats.
-- ===========================================================================

-- Enable UUID helpers (available by default on Supabase).
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Player profile (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.player_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  skill_level text not null default 'mid'
    check (skill_level in ('beginner','high','mid','low','scratch')),
  dominant_hand text not null default 'right' check (dominant_hand in ('right','left')),
  shot_shape text not null default 'straight' check (shot_shape in ('straight','draw','fade')),
  uses_default_distances boolean not null default true,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Clubs (a player's bag)
-- ---------------------------------------------------------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id text not null,                 -- e.g. 'driver','7iron','pw'
  label text not null,
  distance_yards int not null default 0,
  in_bag boolean not null default true,
  unique (user_id, club_id)
);

-- ---------------------------------------------------------------------------
-- Courses / holes / tee boxes / hazards
-- These are shared reference data (readable by all authenticated users). For
-- the MVP the app ships built-in mock courses; populate these when you connect
-- a real course-data provider.
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  state text,
  par int,
  latitude double precision,
  longitude double precision,
  is_mock boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  number int not null,
  par int not null check (par between 3 and 5),
  handicap_index int,
  shape text,
  green_front_yards int,
  green_middle_yards int,
  green_back_yards int,
  unique (course_id, number)
);

create table if not exists public.tee_boxes (
  id uuid primary key default gen_random_uuid(),
  hole_id uuid not null references public.holes (id) on delete cascade,
  name text not null,
  color text,
  yards int not null
);

create table if not exists public.hazards (
  id uuid primary key default gen_random_uuid(),
  hole_id uuid not null references public.holes (id) on delete cascade,
  kind text not null check (kind in ('water','bunker','ob','trees')),
  label text,
  carry_yards int
);

-- ---------------------------------------------------------------------------
-- Rounds / hole scores / shots
-- ---------------------------------------------------------------------------
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  course_name text not null,
  tee_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.hole_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  hole_number int not null,
  par int not null,
  strokes int not null,
  putts int not null default 0,
  chips int not null default 0,
  penalties int not null default 0,
  fairway_hit boolean,
  green_in_regulation boolean not null default false,
  tee_result text
);

create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  hole_number int not null,
  lie text,
  club text,
  distance_yards int,
  result text
);

-- ---------------------------------------------------------------------------
-- Saved caddie recommendations + practice plans
-- ---------------------------------------------------------------------------
create table if not exists public.saved_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_name text,
  hole_number int,
  target_yards int,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.practice_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.player_profiles      enable row level security;
alter table public.clubs                 enable row level security;
alter table public.rounds                enable row level security;
alter table public.hole_scores           enable row level security;
alter table public.shots                 enable row level security;
alter table public.saved_recommendations enable row level security;
alter table public.practice_plans        enable row level security;
alter table public.courses               enable row level security;
alter table public.holes                 enable row level security;
alter table public.tee_boxes             enable row level security;
alter table public.hazards               enable row level security;

-- Owner-only access for personal data.
create policy "own profile" on public.player_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own clubs" on public.clubs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rounds" on public.rounds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own recommendations" on public.saved_recommendations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own practice plans" on public.practice_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Hole scores / shots are owned via their parent round.
create policy "own hole scores" on public.hole_scores
  for all using (
    exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
  );

create policy "own shots" on public.shots
  for all using (
    exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid())
  );

-- Course reference data: readable by any authenticated user.
create policy "read courses" on public.courses   for select using (auth.role() = 'authenticated');
create policy "read holes" on public.holes        for select using (auth.role() = 'authenticated');
create policy "read tees" on public.tee_boxes     for select using (auth.role() = 'authenticated');
create policy "read hazards" on public.hazards    for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Auto-create a player_profile row when a new auth user signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.player_profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
