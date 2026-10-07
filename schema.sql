-- ============================================================
-- GYM CREW MVP — Supabase schema setup
-- Run this whole file once in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ---------- 1. TABLES ----------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 30),
  fitness_goal  text not null default 'General Fitness'
                check (fitness_goal in ('Build Muscle','Lose Fat','Get Stronger','Endurance','General Fitness')),
  avatar        text not null default '💪',
  created_at    timestamptz not null default now()
);

create table if not exists public.workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  exercise_name  text not null check (char_length(exercise_name) between 1 and 80),
  weight_kg      numeric(6,2) check (weight_kg >= 0),
  reps           integer check (reps >= 0),
  sets           integer check (sets >= 0),
  notes          text not null default '' check (char_length(notes) <= 500),
  performed_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create table if not exists public.challenges (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text not null default '',
  target_workouts  integer not null check (target_workouts > 0),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.challenge_participants (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  joined_at     timestamptz not null default now(),
  unique (challenge_id, user_id)
);

-- ---------- 2. INDEXES ----------

create index if not exists workouts_user_time_idx
  on public.workouts (user_id, performed_at desc);

create index if not exists workouts_week_idx
  on public.workouts (performed_at desc);

create index if not exists participants_challenge_idx
  on public.challenge_participants (challenge_id);

create index if not exists participants_user_idx
  on public.challenge_participants (user_id);

-- ---------- 3. AUTO-CREATE PROFILE ON SIGN UP ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, fitness_goal, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'Athlete'),
    coalesce(new.raw_user_meta_data ->> 'fitness_goal', 'General Fitness'),
    coalesce(new.raw_user_meta_data ->> 'avatar', '💪')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 4. ROW LEVEL SECURITY ----------

alter table public.profiles               enable row level security;
alter table public.workouts               enable row level security;
alter table public.challenges             enable row level security;
alter table public.challenge_participants enable row level security;

-- Profiles: everyone logged in can read (leaderboard needs names),
-- each user can only change their own row.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Workouts: users read all logs (needed to aggregate the crew leaderboard),
-- but can only insert/delete their own.
drop policy if exists "workouts_select_authenticated" on public.workouts;
create policy "workouts_select_authenticated"
  on public.workouts for select
  to authenticated
  using (true);

drop policy if exists "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own"
  on public.workouts for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "workouts_delete_own" on public.workouts;
create policy "workouts_delete_own"
  on public.workouts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Challenges: readable by all logged-in users; only this app's SQL editor manages them.
drop policy if exists "challenges_select_authenticated" on public.challenges;
create policy "challenges_select_authenticated"
  on public.challenges for select
  to authenticated
  using (true);

-- Challenge participation: read all (to show join counts),
-- each user can only join/challenge on their own behalf.
drop policy if exists "participants_select_authenticated" on public.challenge_participants;
create policy "participants_select_authenticated"
  on public.challenge_participants for select
  to authenticated
  using (true);

drop policy if exists "participants_insert_own" on public.challenge_participants;
create policy "participants_insert_own"
  on public.challenge_participants for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ---------- 5. WEEKLY LEADERBOARD RPC ----------
-- Ranked by workouts logged in the current week (Monday 00:00 UTC onwards).

create or replace function public.get_weekly_leaderboard()
returns table (
  user_id         uuid,
  display_name    text,
  avatar          text,
  fitness_goal    text,
  total_workouts  bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.display_name,
    p.avatar,
    p.fitness_goal,
    count(w.id) as total_workouts
  from public.profiles p
  left join public.workouts w
    on w.user_id = p.id
   and w.performed_at >= date_trunc('week', now())
  group by p.id, p.display_name, p.avatar, p.fitness_goal
  order by total_workouts desc, p.display_name asc;
$$;

revoke all on function public.get_weekly_leaderboard() from anon;
grant execute on function public.get_weekly_leaderboard() to authenticated;

-- ---------- 6. SEED COMMUNITY CHALLENGES ----------

insert into public.challenges (title, description, target_workouts, starts_at, ends_at)
values
  (
    'The 5AM Discipline Streak',
    'No excuses. Log 12 workouts within 30 days to prove you show up before the world wakes up.',
    12,
    now(),
    now() + interval '30 days'
  ),
  (
    'The 100KM Monthly Grind',
    'Run, cycle, or row — track your distance in the notes field and bank 15 logged sessions in 30 days.',
    15,
    now(),
    now() + interval '30 days'
  )
on conflict do nothing;

-- ---------- 7. ENABLE REALTIME (optional but recommended) ----------
-- Wrapped so re-running this file never fails with "already member of publication".

do $$
begin
  alter publication supabase_realtime add table public.workouts;
exception
  when duplicate_object then null; -- already in the publication
end $$;

do $$
begin
  alter publication supabase_realtime add table public.challenge_participants;
exception
  when duplicate_object then null; -- already in the publication
end $$;
