# GYM CREW v2 — Performance Logbook

A mobile-first PWA for training crews: one-line workout registration, crew leaderboards and feeds, duels, missions, fuel tracking, and gamified streaks. Plain HTML + Tailwind (CDN) + vanilla JS + Supabase (free tier). Zero build step, zero NPM dependencies, R0 hosting.

## Files

| File | Purpose |
|---|---|
| `index.html` | Single-page app — 5 tabs (STATUS / THE CREW / MISSIONS / FUEL / PROFILE) |
| `download.html` | Public download/install landing page — QR code, native install prompt, per-platform Add-to-Home-Screen steps |
| `script.js` | All application logic (auth, logging, feeds, gamification, PWA, offline queue) |
| `schema.sql` | Full database schema, RLS policies, 5 RPC functions, seeds — **idempotent, safe to re-run for upgrades** |
| `manifest.json` + `sw.js` + `icons/` | PWA package for "Add to Home Screen" |
| `check-connection.js` | Dev utility — backend health check. Do not deploy. |
| `mock-supabase.js` + `test-mock.html` | Test harness (fake data, no backend). Do not deploy. |

## Feature map (30 items)

**STATUS** — one-line frictionless entry ("REGISTER WORK"), drop-set/superset/PR quick-tags, RPE 1–10 slider, fatigue mapping, endurance block (km / elevation / moving time / gear), automatic session duration clock, rest timer with vibration + audio on submit, plate-math calculator, "THE STREAK" history with weekly-streak counter, WhatsApp drop-score compiler, anonymized crew header stats.

**THE CREW** — weekly leaderboard ("THE BOARD"), global PR board, live crew feed with fist-bump reactions and comments, pinned admin notice board, slacker alert (5+ days silent).

**MISSIONS** — weekly distance volume bar, community challenges with circular progress gauges, 7-day user-vs-user duels with joke penalties, event simulator countdown.

**FUEL** — hydration quick-tap grid (8 × 500ml), sleep register with readiness score, daily bro-meal checklist.

**PROFILE** — XP + rank system (Rookie → Iron Will → Machine → Myth), badges (4AM Sunrise Club, Graveyard Shift, streaks, PRs), gear & shoe mileage counter with retirement warning at 800km, canvas-generated share card (PNG download), CSV export, AMOLED black toggle, offline cache with auto-sync.

**Retention loop** — a rotating daily quest (+25 XP), variable-reward "crew favor" bonus drops (~1 in 7 sessions), XP float + full-screen rank-up moments, "chain snaps" streak warnings, board-reset countdown, "TRAINING NOW" presence badges, and haptic feedback on every tap. All client-side — no schema changes.

## 1. Supabase setup (~5 minutes)

1. [supabase.com](https://supabase.com) → **New project** (free tier handles 200 users).
2. **SQL Editor** → paste all of `schema.sql` → **Run**. It creates every table, enables RLS with correct policies, creates all 5 RPCs (locked to authenticated callers), auto-creates profiles on signup, seeds two challenges, and enables realtime. Re-running is safe — it migrates older installs in place.
3. **Authentication → Providers → Email**: turn **"Confirm email" OFF** for instant access (free tier only sends a few emails/hour; add custom SMTP later if you want confirmation).
4. **Project Settings → API** → copy the **Project URL** and **anon public** key into the constants at the top of `script.js`.
5. Optional: **Authentication → URL Configuration → Site URL** — set it to your live URL so any auth emails link correctly.

## 2. Deploy (R0)

**GitHub Pages:** create a public repo → upload `index.html`, `script.js`, `schema.sql`, `README.md`, `manifest.json`, `sw.js`, and the `icons/` folder → Settings → Pages → deploy from `main` root.

**Netlify:** drag the folder onto [app.netlify.com/drop](https://app.netlify.com/drop) — instant URL, free tier.

**Render:** New → Static Site → connect repo → build command *(empty)* → publish directory `/`.

HTTPS is required for the service worker — all three hosts provide it automatically. After first visit on a phone, use the browser menu → **Add to Home Screen** to install the PWA.

## Security model (in `schema.sql`)

- All tables locked by RLS; the `anon` role can read nothing and write nothing.
- `workouts`, `profiles`, `challenges`, `challenge_participants`, `comments`, `fist_bumps`, `wagers`, `notice_board` are crew-readable to authenticated users (feeds/leaderboards) — writes are restricted to `auth.uid()` ownership.
- `gear`, `meals`, `hydration`, `sleep_logs` are strictly private to their owner.
- All 5 RPC functions run as security-definer aggregates with `EXECUTE` revoked from `public`/`anon` and granted only to `authenticated`.
- `notice_board` has no insert policy — admins post via the Supabase Table Editor, which bypasses RLS.

## Admin: notice board + challenges

Post announcements: **Table Editor → notice_board → Insert row** (body text, leave `is_pinned` on). Retire a challenge by setting `is_active = false`; add new ones any time.

## Local testing

```
python -m http.server 8080
```

Open `http://localhost:8080` for the real app (Supabase requires HTTP, not `file://`). Open `http://localhost:8080/test-mock.html` to click through every screen with fake data and no backend. The service worker only registers over HTTP(S) — it stays off on `file://`.
