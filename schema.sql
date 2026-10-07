-- ============================================================
-- GYM CREW v2 — Supabase schema setup
-- Run the whole file in: Supabase Dashboard > SQL Editor
-- Fully idempotent: safe to re-run at any time (migrates v1 installs).
-- ============================================================

-- ---------- 1. CORE TABLES ----------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 30),
  fitness_goal  text not null default 'General Fitness'
                check (fitness_goal in ('Build Muscle','Lose Fat','Get Stronger','Endurance','General Fitness')),
  avatar        text not null default '💪',
  created_at    timestamptz not null default now()
);

create table if not exists public.gear (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  kind       text not null default 'shoes' check (kind in ('shoes','bike','other')),
  start_km   numeric(8,1) not null default 0 check (start_km >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  exercise_name  text not null check (char_length(exercise_name) between 1 and 80),
  weight_kg      numeric(6,2) check (weight_kg >= 0),
  reps           integer check (reps >= 0),
  sets           integer check (sets >= 0),
  notes          text not null default '' check (char_length(notes) <= 500),
  -- v2: frictionless entry + endurance + session metadata
  tags           text[] not null default '{}',
  rpe            smallint check (rpe between 1 and 10),
  fatigue        text[] not null default '{}',
  duration_min   integer check (duration_min >= 0),
  distance_km    numeric(7,2) check (distance_km >= 0),
  elevation_m    integer check (elevation_m >= 0),
  moving_time_min integer check (moving_time_min >= 0),
  is_pr          boolean not null default false,
  session_started_at timestamptz,
  gear_id        uuid references public.gear (id) on delete set null,
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

-- ---------- 2. COMMUNITY TABLES ----------

create table if not exists public.fist_bumps (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (workout_id, user_id)
);

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 240),
  created_at  timestamptz not null default now()
);

create table if not exists public.wagers (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id   uuid not null references public.profiles (id) on delete cascade,
  penalty       text not null default 'BUY THE CREW SMOOTHIES' check (char_length(penalty) <= 80),
  started_at    timestamptz not null default now(),
  ends_at       timestamptz not null default (now() + interval '7 days'),
  status        text not null default 'active' check (status in ('active','settled')),
  winner_id     uuid references public.profiles (id) on delete set null,
  check (challenger_id <> opponent_id)
);

create table if not exists public.notice_board (
  id         uuid primary key default gen_random_uuid(),
  body       text not null check (char_length(body) between 1 and 300),
  is_pinned  boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- 3. FUEL & RECOVERY TABLES ----------

create table if not exists public.meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 80),
  day        date not null default current_date,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.hydration (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null default current_date,
  taps    integer not null default 0 check (taps between 0 and 12),
  unique (user_id, day)
);

create table if not exists public.sleep_logs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.profiles (id) on delete cascade,
  day       date not null default current_date,
  hours     numeric(3,1) not null check (hours between 0 and 14),
  logged_at timestamptz not null default now(),
  unique (user_id, day)
);

-- v1 -> v2 migration for installs that already ran the old schema
alter table public.workouts add column if not exists tags            text[] not null default '{}';
alter table public.workouts add column if not exists rpe             smallint check (rpe between 1 and 10);
alter table public.workouts add column if not exists fatigue         text[] not null default '{}';
alter table public.workouts add column if not exists duration_min    integer check (duration_min >= 0);
alter table public.workouts add column if not exists distance_km     numeric(7,2) check (distance_km >= 0);
alter table public.workouts add column if not exists elevation_m     integer check (elevation_m >= 0);
alter table public.workouts add column if not exists moving_time_min integer check (moving_time_min >= 0);
alter table public.workouts add column if not exists is_pr           boolean not null default false;
alter table public.workouts add column if not exists session_started_at timestamptz;
alter table public.workouts add column if not exists gear_id         uuid references public.gear (id) on delete set null;

-- ---------- 4. INDEXES ----------

create index if not exists workouts_user_time_idx   on public.workouts (user_id, performed_at desc);
create index if not exists workouts_time_idx        on public.workouts (performed_at desc);
create index if not exists workouts_pr_idx          on public.workouts (is_pr, performed_at desc);
create index if not exists bumps_workout_idx        on public.fist_bumps (workout_id);
create index if not exists comments_workout_idx     on public.comments (workout_id);
create index if not exists participants_challenge_idx on public.challenge_participants (challenge_id);
create index if not exists participants_user_idx    on public.challenge_participants (user_id);
create index if not exists meals_user_day_idx       on public.meals (user_id, day);
create index if not exists gear_user_idx            on public.gear (user_id);

-- ---------- 5. AUTO-CREATE PROFILE ON SIGN UP ----------

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

-- ---------- 6. ROW LEVEL SECURITY ----------

alter table public.profiles               enable row level security;
alter table public.workouts               enable row level security;
alter table public.gear                   enable row level security;
alter table public.challenges             enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.fist_bumps             enable row level security;
alter table public.comments               enable row level security;
alter table public.wagers                 enable row level security;
alter table public.notice_board           enable row level security;
alter table public.meals                  enable row level security;
alter table public.hydration              enable row level security;
alter table public.sleep_logs             enable row level security;

-- Profiles: crew-readable, owner-writable.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Workouts: crew-readable (feeds/leaderboard), write own only.
drop policy if exists "workouts_select_authenticated" on public.workouts;
create policy "workouts_select_authenticated"
  on public.workouts for select to authenticated using (true);

drop policy if exists "workouts_insert_own" on public.workouts;
create policy "workouts_insert_own"
  on public.workouts for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "workouts_delete_own" on public.workouts;
create policy "workouts_delete_own"
  on public.workouts for delete to authenticated
  using (auth.uid() = user_id);

-- Gear: private to the owner.
drop policy if exists "gear_select_own" on public.gear;
create policy "gear_select_own" on public.gear for select to authenticated using (auth.uid() = user_id);

drop policy if exists "gear_insert_own" on public.gear;
create policy "gear_insert_own" on public.gear for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "gear_delete_own" on public.gear;
create policy "gear_delete_own" on public.gear for delete to authenticated using (auth.uid() = user_id);

-- Challenges: read-only for the crew; managed from the dashboard.
drop policy if exists "challenges_select_authenticated" on public.challenges;
create policy "challenges_select_authenticated"
  on public.challenges for select to authenticated using (true);

drop policy if exists "participants_select_authenticated" on public.challenge_participants;
create policy "participants_select_authenticated"
  on public.challenge_participants for select to authenticated using (true);

drop policy if exists "participants_insert_own" on public.challenge_participants;
create policy "participants_insert_own"
  on public.challenge_participants for insert to authenticated
  with check (auth.uid() = user_id);

-- Fist bumps: crew-readable, one per user per entry.
drop policy if exists "bumps_select_authenticated" on public.fist_bumps;
create policy "bumps_select_authenticated"
  on public.fist_bumps for select to authenticated using (true);

drop policy if exists "bumps_insert_own" on public.fist_bumps;
create policy "bumps_insert_own"
  on public.fist_bumps for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "bumps_delete_own" on public.fist_bumps;
create policy "bumps_delete_own"
  on public.fist_bumps for delete to authenticated using (auth.uid() = user_id);

-- Comments: crew-readable, write/delete own.
drop policy if exists "comments_select_authenticated" on public.comments;
create policy "comments_select_authenticated"
  on public.comments for select to authenticated using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own"
  on public.comments for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own"
  on public.comments for delete to authenticated using (auth.uid() = user_id);

-- Wagers: crew-readable; create your own duels; both parties can settle.
drop policy if exists "wagers_select_authenticated" on public.wagers;
create policy "wagers_select_authenticated"
  on public.wagers for select to authenticated using (true);

drop policy if exists "wagers_insert_own" on public.wagers;
create policy "wagers_insert_own"
  on public.wagers for insert to authenticated with check (auth.uid() = challenger_id);

drop policy if exists "wagers_update_party" on public.wagers;
create policy "wagers_update_party"
  on public.wagers for update to authenticated
  using (auth.uid() in (challenger_id, opponent_id))
  with check (auth.uid() in (challenger_id, opponent_id));

-- Notice board: crew-readable; admins post via the Table Editor (bypasses RLS).
drop policy if exists "notice_select_authenticated" on public.notice_board;
create policy "notice_select_authenticated"
  on public.notice_board for select to authenticated using (true);

-- Fuel & recovery: strictly private to the owner.
drop policy if exists "meals_select_own" on public.meals;
create policy "meals_select_own" on public.meals for select to authenticated using (auth.uid() = user_id);

drop policy if exists "meals_insert_own" on public.meals;
create policy "meals_insert_own" on public.meals for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "meals_update_own" on public.meals;
create policy "meals_update_own" on public.meals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meals_delete_own" on public.meals;
create policy "meals_delete_own" on public.meals for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "hydration_select_own" on public.hydration;
create policy "hydration_select_own" on public.hydration for select to authenticated using (auth.uid() = user_id);

drop policy if exists "hydration_insert_own" on public.hydration;
create policy "hydration_insert_own" on public.hydration for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "hydration_update_own" on public.hydration;
create policy "hydration_update_own" on public.hydration for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sleep_select_own" on public.sleep_logs;
create policy "sleep_select_own" on public.sleep_logs for select to authenticated using (auth.uid() = user_id);

drop policy if exists "sleep_insert_own" on public.sleep_logs;
create policy "sleep_insert_own" on public.sleep_logs for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "sleep_update_own" on public.sleep_logs;
create policy "sleep_update_own" on public.sleep_logs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 7. RPC FUNCTIONS ----------

-- Weekly leaderboard (Monday 00:00 UTC reset).
create or replace function public.get_weekly_leaderboard()
returns table (user_id uuid, display_name text, avatar text, fitness_goal text, total_workouts bigint)
language sql security definer set search_path = public stable
as $$
  select p.id, p.display_name, p.avatar, p.fitness_goal, count(w.id) as total_workouts
  from public.profiles p
  left join public.workouts w
    on w.user_id = p.id
   and w.performed_at >= date_trunc('week', now())
  group by p.id, p.display_name, p.avatar, p.fitness_goal
  order by total_workouts desc, p.display_name asc;
$$;

-- Anonymized crew aggregates for the header.
create or replace function public.get_crew_stats()
returns table (sessions_today bigint, sessions_week bigint, members_today bigint)
language sql security definer set search_path = public stable
as $$
  select
    count(*) filter (where w.performed_at >= current_date)                  as sessions_today,
    count(*) filter (where w.performed_at >= date_trunc('week', now()))     as sessions_week,
    count(distinct w.user_id) filter (where w.performed_at >= current_date) as members_today
  from public.workouts w;
$$;

-- Community feed: latest entries with names, bump and comment counters.
create or replace function public.get_crew_feed(max_rows int default 15)
returns table (
  id uuid, user_id uuid, display_name text, avatar text,
  entry text, tags text[], rpe smallint, fatigue text[],
  distance_km numeric, moving_time_min integer, is_pr boolean,
  performed_at timestamptz,
  bump_count bigint, did_i_bump boolean, comment_count bigint
)
language sql security definer set search_path = public stable
as $$
  select
    w.id, w.user_id, p.display_name, p.avatar,
    w.exercise_name, w.tags, w.rpe, w.fatigue,
    w.distance_km, w.moving_time_min, w.is_pr, w.performed_at,
    (select count(*) from public.fist_bumps b where b.workout_id = w.id)          as bump_count,
    exists(select 1 from public.fist_bumps b where b.workout_id = w.id and b.user_id = auth.uid()) as did_i_bump,
    (select count(*) from public.comments c where c.workout_id = w.id)            as comment_count
  from public.workouts w
  join public.profiles p on p.id = w.user_id
  order by w.performed_at desc
  limit least(coalesce(max_rows, 15), 50);
$$;

-- PR board: latest personal-record declarations.
create or replace function public.get_pr_board(max_rows int default 5)
returns table (id uuid, display_name text, avatar text, entry text, performed_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select w.id, p.display_name, p.avatar, w.exercise_name, w.performed_at
  from public.workouts w
  join public.profiles p on p.id = w.user_id
  where w.is_pr = true
  order by w.performed_at desc
  limit least(coalesce(max_rows, 5), 20);
$$;

-- Slacker alert: crew members silent for 5+ days.
create or replace function public.get_slacker_list()
returns table (user_id uuid, display_name text, avatar text, last_session timestamptz, days_idle bigint)
language sql security definer set search_path = public stable
as $$
  select
    p.id, p.display_name, p.avatar,
    max(w.performed_at) as last_session,
    extract(day from (now() - max(w.performed_at)))::bigint as days_idle
  from public.profiles p
  join public.workouts w on w.user_id = p.id
  group by p.id, p.display_name, p.avatar
  having max(w.performed_at) < now() - interval '5 days'
  order by last_session asc;
$$;

-- Postgres grants EXECUTE to PUBLIC by default; lock every RPC to authenticated only.
revoke execute on function public.get_weekly_leaderboard() from public;
revoke execute on function public.get_weekly_leaderboard() from anon;
grant execute on function public.get_weekly_leaderboard() to authenticated;

revoke execute on function public.get_crew_stats() from public;
revoke execute on function public.get_crew_stats() from anon;
grant execute on function public.get_crew_stats() to authenticated;

revoke execute on function public.get_crew_feed(int) from public;
revoke execute on function public.get_crew_feed(int) from anon;
grant execute on function public.get_crew_feed(int) to authenticated;

revoke execute on function public.get_pr_board(int) from public;
revoke execute on function public.get_pr_board(int) from anon;
grant execute on function public.get_pr_board(int) to authenticated;

revoke execute on function public.get_slacker_list() from public;
revoke execute on function public.get_slacker_list() from anon;
grant execute on function public.get_slacker_list() to authenticated;

-- ---------- 8. SEED COMMUNITY CHALLENGES ----------

insert into public.challenges (title, description, target_workouts, starts_at, ends_at)
values
  (
    'THE 5AM DISCIPLINE STREAK',
    'No excuses. 12 sessions in 30 days proves you show up before the world wakes up.',
    12, now(), now() + interval '30 days'
  ),
  (
    'THE 100KM MONTHLY GRIND',
    'Run, ride or row. Bank 15 logged sessions in 30 days and put the distance in the entry.',
    15, now(), now() + interval '30 days'
  )
on conflict do nothing;

-- ---------- 9. ENABLE REALTIME ----------

do $$
begin
  alter publication supabase_realtime add table public.workouts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.challenge_participants;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.fist_bumps;
exception when duplicate_object then null;
end $$;
