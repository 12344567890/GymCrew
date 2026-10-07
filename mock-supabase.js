/* Test-only mock of the Supabase client so the full UI can be exercised
   without a live backend. NOT part of the shipped app. */
(function () {
  const now = Date.now();
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const D = 86400000;

  const profile = { id: 'u1', display_name: 'Joshwin', fitness_goal: 'Build Muscle', avatar: '🏋️' };

  const workouts = [
    { id: 'w1', user_id: 'u1', exercise_name: 'Bench Press', weight_kg: 100, reps: 5, sets: 5, notes: 'Felt strong, last set grinder.', performed_at: iso(2 * 3600000), created_at: iso(2 * 3600000) },
    { id: 'w2', user_id: 'u1', exercise_name: '5km Cycle', weight_kg: null, reps: null, sets: null, notes: 'Avg 28km/h, headwind on the way back.', performed_at: iso(1 * D), created_at: iso(1 * D) },
    { id: 'w3', user_id: 'u1', exercise_name: 'Deadlift', weight_kg: 160, reps: 3, sets: 4, notes: '', performed_at: iso(3 * D), created_at: iso(3 * D) },
    { id: 'w4', user_id: 'u1', exercise_name: 'Pull-ups', weight_kg: 0, reps: 8, sets: 4, notes: 'Bodyweight.', performed_at: iso(9 * D), created_at: iso(9 * D) }
  ];

  const challenges = [
    { id: 'c1', title: 'The 5AM Discipline Streak', description: 'No excuses. Log 12 workouts within 30 days to prove you show up before the world wakes up.', target_workouts: 12, starts_at: iso(2 * D), ends_at: new Date(now + 28 * D).toISOString(), is_active: true },
    { id: 'c2', title: 'The 100KM Monthly Grind', description: 'Run, cycle, or row — track your distance in the notes field and bank 15 logged sessions in 30 days.', target_workouts: 15, starts_at: iso(2 * D), ends_at: new Date(now + 28 * D).toISOString(), is_active: true }
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
      single() { return out; },
      maybeSingle() { return out; },
      then(res, rej) { return Promise.resolve(out).then(res, rej); }
    };
    return chain;
  }

  function selectChain(result, args) {
    const c = query(result);
    c.select(...args);
    return c;
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
      if (table === 'profiles') {
        return {
          select: (...a) => selectChain({ data: profile, error: null }, a),
          update: () => query({ error: null }),
          insert: () => query({ data: profile, error: null })
        };
      }
      if (table === 'workouts') {
        return {
          select: (...a) => selectChain({ data: workouts, error: null }, a),
          insert: () => { workouts.unshift({ id: 'w9', user_id: 'u1', exercise_name: 'New Session', performed_at: new Date().toISOString() }); return query({ data: null, error: null }); },
          delete: () => query({ data: null, error: null })
        };
      }
      if (table === 'challenges') {
        return { select: (...a) => selectChain({ data: challenges, error: null }, a) };
      }
      if (table === 'challenge_participants') {
        return {
          select: (...a) => selectChain({ data: [{ challenge_id: 'c1', joined_at: iso(1 * D) }], error: null }, a),
          insert: () => query({ data: null, error: null })
        };
      }
      return { select: () => query({ data: [], error: null }) };
    },
    rpc: async () => ({
      data: [
        { user_id: 'u2', display_name: 'Thabo M.', avatar: '🥊', fitness_goal: 'Get Stronger', total_workouts: 9 },
        { user_id: 'u3', display_name: 'Lerato K.', avatar: '🏃', fitness_goal: 'Endurance', total_workouts: 7 },
        { user_id: 'u1', display_name: 'Joshwin', avatar: '🏋️', fitness_goal: 'Build Muscle', total_workouts: 4 },
        { user_id: 'u4', display_name: 'Sipho D.', avatar: '🐺', fitness_goal: 'Lose Fat', total_workouts: 2 },
        { user_id: 'u5', display_name: 'Naledi P.', avatar: '⚡', fitness_goal: 'General Fitness', total_workouts: 1 }
      ],
      error: null
    }),
    channel() {
      return { on() { return this; }, subscribe() { return this; } };
    },
    removeChannel() {}
  };

  window.supabase = { createClient: () => mock };
})();
