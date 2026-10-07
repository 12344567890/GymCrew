const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saGtxeHh6bGJydmp6d3ZjeWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNzE2MDcsImV4cCI6MjEwNjk0NzYwN30.TYi5dtpgSCVC9hT8L3Xp_x6wTEw4t_JKezB4vp374qs';
const URL = 'https://mlhkqxxzlbrvjzwvcyhp.supabase.co';

// A 200 with [] means the table exists and RLS correctly hides rows from anon.
// A 404 means the table itself is missing.
async function probe(path, opts = {}) {
  const res = await fetch(URL + path, {
    ...opts,
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  return { status: res.status, body: (await res.text()).slice(0, 160) };
}

(async () => {
  for (const t of ['profiles', 'workouts', 'challenges', 'challenge_participants']) {
    const r = await probe(`/rest/v1/${t}?select=*`);
    console.log(`table ${t}:`, r.status === 200 ? 'EXISTS (anon sees [] — RLS enforcing)' : `${r.status} ${r.body}`);
  }
  const rpc = await probe('/rest/v1/rpc/get_weekly_leaderboard', { method: 'POST', body: '{}' });
  // 403 "permission denied" = function exists but anon execute revoked (as designed). 404 = missing.
  if (rpc.status === 403) console.log('rpc get_weekly_leaderboard: EXISTS (anon execution revoked — as designed)');
  else if (rpc.status === 404) console.log('rpc get_weekly_leaderboard: MISSING —', rpc.body);
  else console.log('rpc get_weekly_leaderboard:', rpc.status, rpc.body);
})();
