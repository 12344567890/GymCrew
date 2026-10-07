/* Test-only mock of the Supabase client so the full UI can be exercised
   without a live backend. NOT part of the shipped app. */
(function () {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const D = 86400000;
  const H = 3600000;

  const profile = { id: 'u1', display_name: 'Joshwin', fitness_goal: 'Build Muscle', avatar: '🏋️' };

  const workouts = [
    { id: 'w1', user_id: 'u1', exercise_name: 'Heavy chest day — 4 flat bench sets, felt strong', tags: ['PR'], rpe: 9, fatigue: ['CHEST', 'SHOULDERS'], duration_min: 52, distance_km: null, elevation_m: null, moving_time_min: null, is_pr: true, gear_id: null, notes: '', performed_at: iso(3 * H), created_at: iso(3 * H) },
    { id: 'w2', user_id: 'u1', exercise_name: 'Sunrise 10km along the river, legs shot at the end', tags: [], rpe: 7, fatigue: [], duration_min: null, distance_km: 10.2, elevation_m: 120, moving_time_min: 48, is_pr: false, gear_id: 'g1', notes: '', performed_at: iso(26 * H), created_at: iso(26 * H) },
    { id: 'w3', user_id: 'u1', exercise_name: 'Late night graveyard session — pull superset circuit', tags: ['SUPERSET'], rpe: 8, fatigue: ['BACK', 'ARMS'], duration_min: 41, distance_km: null, elevation_m: null, moving_time_min: null, is_pr: false, gear_id: null, notes: '', performed_at: iso(3 * D), created_at: iso(3 * D) },
    { id: 'w4', user_id: 'u1', exercise_name: 'Easy spin, legs recovering', tags: [], rpe: 3, fatigue: [], duration_min: null, distance_km: 22.5, elevation_m: 210, moving_time_min: 55, is_pr: false, gear_id: 'g2', notes: '', performed_at: iso(9 * D), created_at: iso(9 * D) }
  ];

  const challenges = [
    { id: 'c1', title: 'The 5AM Discipline Streak', description: 'No excuses. 12 sessions in 30 days proves you show up before the world wakes up.', target_workouts: 12, starts_at: iso(2 * D), ends_at: new Date(now + 28 * D).toISOString(), is_active: true, created_at: iso(2 * D) },
    { id: 'c2', title: 'The 100KM Monthly Grind', description: 'Run, ride or row. Bank 15 logged sessions in 30 days and put the distance in the entry.', target_workouts: 15, starts_at: iso(2 * D), ends_at: new Date(now + 28 * D).toISOString(), is_active: true, created_at: iso(2 * D) }
  ];

  function query(result) {
    let out = Promise.resolve(result);
    const chain = {
      select(_cols, opts) {
        out = opts && opts.head
          ? Promise.resolve({ count: 9, data: null, error: null })
          : Promise.resolve(result);
        return chain;
      },
      eq() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      ilike() { return chain; },
      in() { return chain; },
      gte() { return chain; },
      lte() { return chain; },
      single() { return out; },
      maybeSingle() { return out; },
      upsert() { return chain; },
      then(res, rej) { return Promise.resolve(out).then(res, rej); }
    };
    return chain;
  }

  function selectChain(result, args) {
    const c = query(result);
    c.select(...args);
    return c;
  }

  const ok = { data: null, error: null };

  const tables = {
    profiles: { data: [profile], error: null },
    workouts: { data: workouts, error: null },
    challenges: { data: challenges, error: null },
    challenge_participants: { data: [{ challenge_id: 'c1', joined_at: iso(1 * D) }], error: null },
    fist_bumps: { data: [], error: null },
    comments: {
      data: [
        { id: 'cm1', body: 'Beast. That bar speed was moving.', created_at: iso(2 * H), user_id: 'u2', profiles: { display_name: 'Thabo M.', avatar: '🥊' } }
      ], error: null
    },
    wagers: {
      data: [
        {
          id: 'wg1', challenger_id: 'u1', opponent_id: 'u3', penalty: 'buys the crew smoothies',
          started_at: iso(2 * D), ends_at: new Date(now + 5 * D).toISOString(), status: 'active', winner_id: null,
          challenger: { display_name: 'Joshwin', avatar: '🏋️' },
          opponent: { display_name: 'Lerato K.', avatar: '🏃' }
        }
      ], error: null
    },
    notice_board: { data: [{ body: 'Saturday 06:00 — hill repeats at the stadium. Bring a headlamp and a bad attitude.', created_at: iso(1 * D) }], error: null },
    meals: {
      data: [
        { id: 'm1', user_id: 'u1', body: 'eggs + oats', day: dayISO(), done: true, created_at: iso(5 * H) },
        { id: 'm2', user_id: 'u1', body: 'chicken + rice', day: dayISO(), done: false, created_at: iso(4 * H) }
      ], error: null
    },
    hydration: { data: { taps: 3 }, error: null },
    sleep_logs: { data: { hours: 7 }, error: null },
    gear: {
      data: [
        { id: 'g1', user_id: 'u1', name: 'Pegasus 41', kind: 'shoes', start_km: 640, created_at: iso(30 * D) },
        { id: 'g2', user_id: 'u1', name: 'Road Rat', kind: 'bike', start_km: 2100, created_at: iso(60 * D) }
      ], error: null
    }
  };

  function dayISO(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  const mock = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'joshwin@gymcrew.app' } } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: {}, error: null }),
      signUp: async () => ({ data: {}, error: null }),
      signOut: async () => ({ error: null })
    },
    from(table) {
      const result = tables[table] || { data: [], error: null };
      return {
        select: (...a) => selectChain(result, a),
        insert: () => {
          if (table === 'workouts') {
            workouts.unshift({ id: 'w9', user_id: 'u1', exercise_name: 'Fresh drop', tags: [], rpe: 5, fatigue: [], distance_km: null, elevation_m: null, moving_time_min: null, is_pr: false, gear_id: null, notes: '', performed_at: new Date().toISOString(), created_at: new Date().toISOString() });
          }
          if (table === 'meals') {
            tables.meals.data.push({ id: 'm9', user_id: 'u1', body: 'new meal', day: dayISO(), done: false, created_at: new Date().toISOString() });
          }
          if (table === 'wagers') {
            tables.wagers.data.unshift({ id: 'wg9', challenger_id: 'u1', opponent_id: 'u3', penalty: 'smoothies', started_at: new Date().toISOString(), ends_at: new Date(now + 7 * D).toISOString(), status: 'active', winner_id: null, challenger: { display_name: 'Joshwin', avatar: '🏋️' }, opponent: { display_name: 'Sipho D.', avatar: '🐺' } });
          }
          return query(ok);
        },
        update: () => query(ok),
        upsert: () => query(ok),
        delete: () => {
          if (table === 'workouts') workouts.shift();
          if (table === 'meals') tables.meals.data.pop();
          return query(ok);
        }
      };
    },
    rpc(name) {
      if (name === 'get_weekly_leaderboard') {
        return Promise.resolve({
          data: [
            { user_id: 'u2', display_name: 'Thabo M.', avatar: '🥊', fitness_goal: 'Get Stronger', total_workouts: 9 },
            { user_id: 'u3', display_name: 'Lerato K.', avatar: '🏃', fitness_goal: 'Endurance', total_workouts: 7 },
            { user_id: 'u1', display_name: 'Joshwin', avatar: '🏋️', fitness_goal: 'Build Muscle', total_workouts: 3 },
            { user_id: 'u4', display_name: 'Sipho D.', avatar: '🐺', fitness_goal: 'Lose Fat', total_workouts: 2 },
            { user_id: 'u5', display_name: 'Naledi P.', avatar: '⚡', fitness_goal: 'General Fitness', total_workouts: 1 }
          ], error: null
        });
      }
      if (name === 'get_crew_stats') {
        return Promise.resolve({ data: [{ sessions_today: 7, sessions_week: 31, members_today: 4 }], error: null });
      }
      if (name === 'get_crew_feed') {
        return Promise.resolve({
          data: [
            { id: 'w1', user_id: 'u2', display_name: 'Thabo M.', avatar: '🥊', entry: 'Heavy deadlift singles — 180kg moved clean', tags: ['PR'], rpe: 10, fatigue: ['BACK'], distance_km: null, moving_time_min: null, is_pr: true, performed_at: iso(2 * H), bump_count: 5, did_i_bump: false, comment_count: 1 },
            { id: 'w2', user_id: 'u3', display_name: 'Lerato K.', avatar: '🏃', entry: 'Sunrise 15km — negative split, nobody out here', tags: [], rpe: 6, fatigue: [], distance_km: 15, moving_time_min: 74, is_pr: false, performed_at: iso(7 * H), bump_count: 3, did_i_bump: true, comment_count: 0 }
          ], error: null
        });
      }
      if (name === 'get_pr_board') {
        return Promise.resolve({
          data: [
            { id: 'w1', display_name: 'Thabo M.', avatar: '🥊', entry: 'Heavy deadlift singles — 180kg moved clean', performed_at: iso(2 * H) }
          ], error: null
        });
      }
      if (name === 'get_slacker_list') {
        return Promise.resolve({
          data: [
            { user_id: 'u5', display_name: 'Naledi P.', avatar: '⚡', last_session: iso(8 * D), days_idle: 8 },
            { user_id: 'u4', display_name: 'Sipho D.', avatar: '🐺', last_session: iso(6 * D), days_idle: 6 }
          ], error: null
        });
      }
      return Promise.resolve({ data: [], error: null });
    },
    channel() {
      return { on() { return this; }, subscribe() { return this; } };
    },
    removeChannel() {}
  };

  window.supabase = { createClient: () => mock };
})();
