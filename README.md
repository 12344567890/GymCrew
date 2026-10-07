# Gym Crew — MVP

A mobile-first, community workout tracker: email auth, workout logging, weekly crew leaderboard, and community challenges. Built with plain HTML + Tailwind (CDN) + vanilla JS + Supabase (free tier). Zero build step, zero NPM dependencies — deploy anywhere that serves static files.

## Files

| File | Purpose |
|---|---|
| `index.html` | Single-page app UI (auth, profile setup, log/leaderboard/challenges/profile tabs) |
| `script.js` | All application logic (Supabase auth, queries, realtime, rendering) |
| `schema.sql` | Complete database schema + RLS policies + leaderboard RPC + seed challenges |

## 1. Create the Supabase backend (~5 minutes)

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine for 200 users).
2. Open **SQL Editor** → paste the entire contents of `schema.sql` → **Run**.
   This creates the `profiles`, `workouts`, `challenges`, and `challenge_participants` tables, enables Row Level Security with the correct policies, creates the `get_weekly_leaderboard()` RPC, auto-creates a profile row on every signup, seeds two community challenges, and adds the tables to the realtime publication.
3. Go to **Authentication → Providers → Email** and confirm **Email** provider is enabled.
   - For instant signup during testing, toggle **"Confirm email"** off.
   - For launch, leave it on — users will get a confirmation email before logging in.
4. Go to **Project Settings → API** and copy the **Project URL** and the **anon public** key.

## 2. Connect the frontend

Open `script.js` and replace the two values at the top:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-PUBLIC-KEY';
```

The anon key is safe to ship in client code — all data access is gated by the RLS policies in `schema.sql`.

## 3. Deploy (R0 / free tier)

**GitHub Pages (recommended):**
1. Create a repo, commit these three files, push.
2. Repo **Settings → Pages** → deploy from `main` branch, root.
3. App is live at `https://<username>.github.io/<repo>/`.

**Render / Railway (static site):**
- Render: New → Static Site → connect repo → build command *(leave empty)* → publish directory `/`.
- Railway: New → deploy from repo → service type "Static" (no build command).

## Security model (already in `schema.sql`)

- **profiles** — readable by any authenticated user (the leaderboard needs names); updatable only by the row owner.
- **workouts** — insert/delete restricted to `auth.uid() = user_id`; select open to authenticated users so the weekly leaderboard can aggregate. No anonymous (anon) role can touch any table.
- **challenge_participants** — each user can only insert their own membership; duplicate joins blocked by a unique constraint.
- **challenges** — read-only for authenticated users; managed from the Supabase dashboard.

## Data flow notes

- **Leaderboard** uses the `get_weekly_leaderboard()` Postgres function (runs server-side, counted from Monday 00:00 UTC) — one RPC call, no heavy client aggregation.
- **Challenge progress** counts the signed-in user's workouts logged between the later of (challenge start, join date) and the challenge end, against `target_workouts`.
- **Realtime** — the app subscribes to `workouts` and `challenge_participants` changes, so the leaderboard and challenge counters update live without refresh. (Enabled by the last two lines of `schema.sql`.)

## Managing challenges

Add/edit challenges any time from **Supabase Dashboard → Table Editor → challenges** (e.g. set `is_active = false` to retire one, or insert a new row with a new `target_workouts` and `ends_at`).

## Local testing

Serve the folder over HTTP (Supabase requires `http://localhost`, not `file://`):

```
python -m http.server 8080
```

Then open `http://localhost:8080`.

**Preview without a backend:** `mock-supabase.js` + `test-mock.html` are a throwaway test harness that fakes the Supabase client with sample data. Open `http://localhost:8080/test-mock.html` to click through every screen before wiring up real credentials. Do not deploy `test-mock.html` or `mock-supabase.js` — they are not part of the app.
