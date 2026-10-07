/* ============================================================
   GYM CREW MVP — application logic (vanilla JS + Supabase v2)
   1. Paste your Supabase project URL and anon public key below.
   2. Run schema.sql in the Supabase SQL editor first.
   ============================================================ */

const SUPABASE_URL = 'https://mlhkqxxzlbrvjzwvcyhp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saGtxeHh6bGJydmp6d3ZjeWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNzE2MDcsImV4cCI6MjEwNjk0NzYwN30.TYi5dtpgSCVC9hT8L3Xp_x6wTEw4t_JKezB4vp374qs';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const AVATARS = ['💪', '🏋️', '🥊', '🏃', '🚴', '🧗', '🦍', '⚡', '🔥', '🐺', '🦅', '🐐'];

const state = {
  user: null,
  profile: null,
  workouts: [],
  challenges: [],
  participations: [],
  selectedAvatar: AVATARS[0],
  authMode: 'login',
  currentTab: 'dashboard'
};

/* ---------------- tiny DOM + formatting helpers ---------------- */

const $ = (id) => document.getElementById(id);

function show(id) {
  $(id).classList.remove('hidden');
}
function hide(id) {
  $(id).classList.add('hidden');
}

function toast(msg) {
  $('toast-msg').textContent = msg;
  show('toast');
  setTimeout(() => hide('toast'), 2200);
}

function setError(id, message) {
  const el = $(id);
  if (!message) {
    hide(id);
    return;
  }
  el.textContent = message;
  show(id);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function startOfLocalWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

function formatLogDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toUpperCase();
  if (sameDay(d, today)) return `TODAY — ${time}`;
  if (sameDay(d, yesterday)) return `YESTERDAY — ${time}`;
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()} — ${time}`;
}

function metricLine(w) {
  const parts = [];
  if (w.sets != null && w.sets > 0) parts.push(`${w.sets} set${w.sets === 1 ? '' : 's'}`);
  if (w.reps != null && w.reps > 0) parts.push(`${w.reps} rep${w.reps === 1 ? '' : 's'}`);
  if (w.weight_kg != null && w.weight_kg > 0) parts.push(`${w.weight_kg} kg`);
  return parts.join(' × ');
}

/* ---------------- screen routing ---------------- */

function showScreen(which) {
  ['screen-auth', 'screen-setup', 'screen-app'].forEach(hide);
  show(which);
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    const { data } = await db.auth.getSession();
    await handleSession(data.session);
  } catch {
    // Network/backend hiccup: always land on a usable screen.
    showScreen('screen-auth');
  }

  db.auth.onAuthStateChange(async (_event, session) => {
    try {
      await handleSession(session);
    } catch {
      showScreen('screen-auth');
    }
  });
}

async function handleSession(session) {
  state.user = session?.user ?? null;
  if (!state.user) {
    state.profile = null;
    showScreen('screen-auth');
    return;
  }

  const { data: profile, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', state.user.id)
    .maybeSingle();

  if (error) {
    setError('auth-error', 'Could not load profile: ' + error.message);
    showScreen('screen-auth');
    return;
  }

  // The DB trigger creates the profile row on signup; if it is missing
  // (e.g. legacy account), build it here so setup always works.
  if (!profile) {
    const insert = await db
      .from('profiles')
      .insert({ id: state.user.id, display_name: 'Athlete', fitness_goal: 'General Fitness', avatar: '💪' })
      .select()
      .single();
    if (insert.error) {
      setError('auth-error', 'Could not create profile: ' + insert.error.message);
      showScreen('screen-auth');
      return;
    }
    state.profile = insert.data;
  } else {
    state.profile = profile;
  }

  const needsSetup = !profile || profile.display_name === 'Athlete';
  if (needsSetup) {
    $('setup-name').value = profile?.display_name === 'Athlete' ? '' : (profile?.display_name ?? '');
    $('setup-goal').value = profile?.fitness_goal ?? 'General Fitness';
    setSelectedAvatar(profile?.avatar ?? '💪');
    showScreen('screen-setup');
  } else {
    enterApp();
  }
}

async function enterApp() {
  showScreen('screen-app');
  switchTab('dashboard');
  refreshAll();
  subscribeRealtime();
}

function refreshAll() {
  loadHistory();
  loadLeaderboard();
  loadChallenges();
  loadProfileStats();
}

/* ---------------- auth: login / signup / signout ---------------- */

function setAuthMode(mode) {
  state.authMode = mode;
  const isLogin = mode === 'login';
  if (isLogin) {
    hide('signup-only');
    $('tab-btn-login').className = 'auth-toggle py-3.5 font-display uppercase tracking-widest text-xs bg-volt text-ink font-bold active:translate-y-0.5 transition duration-75';
    $('tab-btn-signup').className = 'auth-toggle py-3.5 font-display uppercase tracking-widest text-xs border-l border-zinc-800 text-zinc-500 hover:text-zinc-300 active:translate-y-0.5 transition duration-75';
    $('auth-submit').textContent = 'ACCESS';
    $('auth-password').setAttribute('autocomplete', 'current-password');
  } else {
    show('signup-only');
    $('tab-btn-login').className = 'auth-toggle py-3.5 font-display uppercase tracking-widest text-xs text-zinc-500 hover:text-zinc-300 active:translate-y-0.5 transition duration-75';
    $('tab-btn-signup').className = 'auth-toggle py-3.5 font-display uppercase tracking-widest text-xs border-l border-zinc-800 bg-volt text-ink font-bold active:translate-y-0.5 transition duration-75';
    $('auth-submit').textContent = 'ENLIST';
    $('auth-password').setAttribute('autocomplete', 'new-password');
  }
  setError('auth-error', null);
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  setError('auth-error', null);

  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  if (!email || !password) {
    setError('auth-error', 'EMAIL + PASSWORD REQUIRED.');
    return;
  }
  if (password.length < 6) {
    setError('auth-error', 'PASSWORD TOO SHORT — MINIMUM 6.');
    return;
  }

  const btn = $('auth-submit');
  btn.disabled = true;
  btn.style.opacity = '0.6';

  let error;
  if (state.authMode === 'login') {
    ({ error } = await db.auth.signInWithPassword({ email, password }));
  } else {
    const displayName = $('signup-name').value.trim();
    if (displayName.length < 2) {
      setError('auth-error', 'CALLSIGN TOO SHORT — MINIMUM 2.');
      btn.disabled = false;
      btn.style.opacity = '1';
      return;
    }
    ({ error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          fitness_goal: $('signup-goal').value,
          avatar: state.selectedAvatar
        }
      }
    }));
    if (!error) {
      toast('ACCOUNT CREATED.');
      // Session may be immediate (email confirmation off) or pending (on).
      const { data } = await db.auth.getSession();
      if (!data.session) {
        setError('auth-error', 'CONFIRM YOUR EMAIL VIA THE INBOX LINK, THEN ACCESS.');
      }
    }
  }

  btn.disabled = false;
  btn.style.opacity = '1';
  if (error) setError('auth-error', error.message);
}

async function signOut() {
  await db.auth.signOut();
  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  toast('SESSION ENDED. BACK TOMORROW.');
}

/* ---------------- profile setup ---------------- */

function setSelectedAvatar(emoji) {
  state.selectedAvatar = AVATARS.includes(emoji) ? emoji : AVATARS[0];
  document.querySelectorAll('#avatar-picker button').forEach((btn) => {
    const on = btn.dataset.avatar === state.selectedAvatar;
    btn.className = `aspect-square text-2xl border transition ${
      on ? 'border-volt bg-volt/10' : 'border-zinc-800 bg-ink'
    }`;
  });
}

function buildAvatarPicker() {
  const picker = $('avatar-picker');
  AVATARS.forEach((emoji) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.avatar = emoji;
    btn.textContent = emoji;
    btn.addEventListener('click', () => setSelectedAvatar(emoji));
    picker.appendChild(btn);
  });
  setSelectedAvatar(AVATARS[0]);
}

async function handleSetupSubmit(e) {
  e.preventDefault();
  setError('setup-error', null);

  const displayName = $('setup-name').value.trim();
  if (displayName.length < 2) {
    setError('setup-error', 'CALLSIGN TOO SHORT — MINIMUM 2.');
    return;
  }

  const { error } = await db
    .from('profiles')
    .update({
      display_name: displayName,
      fitness_goal: $('setup-goal').value,
      avatar: state.selectedAvatar
    })
    .eq('id', state.user.id);

  if (error) {
    setError('setup-error', error.message);
    return;
  }
  toast('PROFILE UPDATED. GET TO WORK.');
  enterApp();
}

/* ---------------- tabs ---------------- */

function switchTab(tab) {
  state.currentTab = tab;
  ['dashboard', 'leaderboard', 'challenges', 'profile'].forEach((t) => {
    hide(`tab-${t}`);
  });
  show(`tab-${tab}`);
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('bg-volt', active);
    btn.classList.toggle('text-ink', active);
    btn.classList.toggle('text-zinc-500', !active);
  });
  window.scrollTo(0, 0);
}

/* ---------------- workout logging ---------------- */

async function handleLogSubmit(e) {
  e.preventDefault();
  setError('log-error', null);

  const exerciseName = $('log-exercise').value.trim();
  if (!exerciseName) {
    setError('log-error', 'NAME THE MOVEMENT FIRST.');
    return;
  }

  const readNum = (id) => {
    const v = $(id).value.trim();
    return v === '' ? null : Number(v);
  };
  const weight = readNum('log-weight');
  const reps = readNum('log-reps');
  const sets = readNum('log-sets');

  if ([weight, reps, sets].some((n) => n !== null && (isNaN(n) || n < 0))) {
    setError('log-error', 'NO NEGATIVE NUMBERS.');
    return;
  }

  const btn = $('log-submit');
  btn.disabled = true;
  btn.style.opacity = '0.6';

  const { error } = await db.from('workouts').insert({
    user_id: state.user.id,
    exercise_name: exerciseName,
    weight_kg: weight,
    reps,
    sets,
    notes: $('log-notes').value.trim()
  });

  btn.disabled = false;
  btn.style.opacity = '1';

  if (error) {
    setError('log-error', error.message);
    return;
  }

  $('log-form').reset();
  toast('SESSION REGISTERED.');
  loadHistory();
  loadProfileStats();
}

async function loadHistory() {
  const { data, error } = await db
    .from('workouts')
    .select('*')
    .order('performed_at', { ascending: false })
    .limit(100);

  if (error) {
    $('history-list').innerHTML = `<p class="text-sm text-red-400 text-center py-6">${escapeHtml(error.message)}</p>`;
    return;
  }
  state.workouts = data ?? [];
  renderHistory();
  updateStatLabels();
}

function updateStatLabels() {
  const weekStart = startOfLocalWeek();
  const weekCount = state.workouts.filter((w) => new Date(w.performed_at) >= weekStart).length;
  $('stat-week').textContent = weekCount;
  $('week-counter').textContent = `WK ${weekCount}`;
  if (state.workouts.length > 0) $('stat-total').textContent = state.workouts.length;
}

function renderHistory() {
  const list = $('history-list');
  if (state.workouts.length === 0) {
    list.innerHTML = `
      <div class="border border-zinc-800 bg-panel px-5 py-10 text-center">
        <p class="font-display uppercase font-semibold tracking-widest text-lg leading-relaxed text-zinc-300">
          0 SESSIONS LOGGED THIS WEEK.<br/>
          <span class="text-volt">RESET THE CLOCK.</span>
        </p>
        <p class="text-[9px] tracking-[0.3em] uppercase text-zinc-600 mt-4">The board is watching</p>
      </div>`;
    return;
  }

  list.innerHTML = state.workouts
    .map(
      (w) => `
      <article class="bg-panel border border-zinc-800 p-4 rise">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-display uppercase font-semibold text-lg leading-tight truncate">${escapeHtml(w.exercise_name)}</h3>
            <p class="text-volt text-[11px] font-bold tracking-[0.2em] uppercase mt-1">${escapeHtml(metricLine(w)) || '&nbsp;'}</p>
            ${w.notes ? `<p class="text-zinc-400 text-xs mt-2.5 leading-relaxed break-words normal-case">${escapeHtml(w.notes)}</p>` : ''}
          </div>
          <button data-del="${w.id}" aria-label="Delete entry"
            class="shrink-0 text-[9px] tracking-[0.2em] text-zinc-600 hover:text-red-500 border border-zinc-800 hover:border-red-500 px-2 py-1.5 transition duration-75">DEL</button>
        </div>
        <p class="text-[9px] text-zinc-600 mt-3 tracking-[0.25em] uppercase">${escapeHtml(formatLogDate(w.performed_at))}</p>
      </article>`
    )
    .join('');

  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => deleteWorkout(btn.dataset.del));
  });
}

async function deleteWorkout(id) {
  const { error } = await db.from('workouts').delete().eq('id', id);
  if (error) {
    toast('DELETE FAILED — ' + error.message);
    return;
  }
  toast('ENTRY STRUCK FROM THE LOG.');
  loadHistory();
  loadProfileStats();
  if (state.currentTab === 'leaderboard') loadLeaderboard();
}

/* ---------------- leaderboard ---------------- */

async function loadLeaderboard() {
  const list = $('leaderboard-list');
  list.innerHTML = `<p class="text-[10px] tracking-[0.3em] uppercase text-zinc-600 text-center py-10">LOADING BOARD…</p>`;

  const { data, error } = await db.rpc('get_weekly_leaderboard');

  if (error) {
    list.innerHTML = `<p class="text-[11px] text-red-400 text-center py-10 uppercase tracking-wider">${escapeHtml(error.message)}</p>`;
    return;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    list.innerHTML = `
      <div class="border border-zinc-800 bg-panel px-5 py-10 text-center">
        <p class="font-display uppercase font-semibold tracking-widest text-lg text-zinc-300">THE BOARD IS EMPTY.</p>
        <p class="text-volt font-display uppercase font-semibold tracking-widest text-lg mt-1">BE THE FIRST NAME ON IT.</p>
      </div>`;
    return;
  }

  list.innerHTML = rows
    .map((row, i) => {
      const isMe = row.user_id === state.user.id;
      const rank = String(i + 1).padStart(2, '0');
      return `
      <div class="flex items-center gap-3 border ${isMe ? 'border-volt bg-volt/5' : 'border-zinc-800 bg-panel'} px-4 py-3 rise">
        <span class="w-9 font-display font-bold text-lg ${i < 3 ? 'text-volt' : 'text-zinc-600'}">${rank}</span>
        <span class="text-xl">${escapeHtml(row.avatar)}</span>
        <div class="min-w-0 flex-1">
          <p class="font-display uppercase font-semibold text-sm truncate">${escapeHtml(row.display_name)}${isMe ? ' <span class="text-volt text-[9px] font-mono tracking-widest">/ YOU</span>' : ''}</p>
          <p class="text-[9px] text-zinc-500 uppercase tracking-[0.25em] mt-0.5">${escapeHtml(row.fitness_goal)}</p>
        </div>
        <div class="text-right">
          <p class="font-display font-bold text-2xl text-volt leading-none">${row.total_workouts}</p>
          <p class="text-[8px] text-zinc-500 uppercase tracking-[0.25em] mt-1">sessions</p>
        </div>
      </div>`;
    })
    .join('');
}

/* ---------------- challenges ---------------- */

async function loadChallenges() {
  const list = $('challenges-list');
  list.innerHTML = `<p class="text-[10px] tracking-[0.3em] uppercase text-zinc-600 text-center py-10">LOADING MISSIONS…</p>`;

  const [chRes, partRes] = await Promise.all([
    db.from('challenges').select('*').eq('is_active', true).order('created_at', { ascending: true }),
    db.from('challenge_participants').select('challenge_id, joined_at').eq('user_id', state.user.id)
  ]);

  if (chRes.error) {
    list.innerHTML = `<p class="text-[11px] text-red-400 text-center py-10 uppercase tracking-wider">${escapeHtml(chRes.error.message)}</p>`;
    return;
  }
  state.challenges = chRes.data ?? [];
  state.participations = partRes.data ?? [];

  const counts = await Promise.all(
    state.challenges.map((c) =>
      db
        .from('challenge_participants')
        .select('*', { count: 'exact', head: true })
        .eq('challenge_id', c.id)
    )
  );

  list.innerHTML = '';
  for (let i = 0; i < state.challenges.length; i++) {
    const c = state.challenges[i];
    const mine = state.participations.find((p) => p.challenge_id === c.id);
    const joinedCount = counts[i].count ?? 0;
    list.insertAdjacentHTML('beforeend', renderChallengeCard(c, mine, joinedCount));
  }

  list.querySelectorAll('[data-join]').forEach((btn) => {
    btn.addEventListener('click', () => joinChallenge(btn.dataset.join));
  });
}

function renderChallengeCard(c, mine, joinedCount) {
  const progress = mine ? countChallengeProgress(c, mine.joined_at) : 0;
  const pct = Math.min(100, Math.round((progress / c.target_workouts) * 100));
  const done = progress >= c.target_workouts;
  const endLine = c.ends_at
    ? `CLOSES ${new Date(c.ends_at).toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()}`
    : 'NO EXPIRY';

  return `
  <article class="bg-panel border ${done ? 'border-volt' : 'border-zinc-800'} p-5 rise">
    <div class="flex items-start justify-between gap-3 mb-2">
      <h3 class="font-display uppercase font-semibold text-lg leading-tight">${escapeHtml(c.title)}</h3>
      <span class="shrink-0 text-[9px] tracking-[0.2em] text-zinc-400 bg-ink border border-zinc-800 px-2 py-1 uppercase whitespace-nowrap">${joinedCount} IN</span>
    </div>
    <p class="text-xs text-zinc-400 mb-5 leading-relaxed normal-case">${escapeHtml(c.description)}</p>

    ${
      mine
        ? `
      <div class="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-[0.2em]">
        <span class="${done ? 'text-volt' : 'text-zinc-300'}">${done ? 'TARGET HIT' : `${progress} / ${c.target_workouts} SESSIONS`}</span>
        <span class="text-zinc-500">${pct}%</span>
      </div>
      <div class="h-2 bg-ink border border-zinc-800">
        <div class="h-full ${done ? 'bg-volt' : 'bg-volt/70'} transition-all duration-500" style="width:${pct}%"></div>
      </div>`
        : `
      <button data-join="${c.id}"
        class="w-full bg-volt text-ink font-display uppercase font-bold tracking-[0.25em] text-sm py-4 active:translate-y-0.5 active:bg-white transition duration-75">
        ACCEPT MISSION
      </button>`
    }
    <p class="text-[9px] text-zinc-600 mt-3 tracking-[0.25em] uppercase">${endLine}</p>
  </article>`;
}

function countChallengeProgress(challenge, joinedAt) {
  const start = new Date(Math.max(
    new Date(challenge.starts_at).getTime(),
    new Date(joinedAt).getTime()
  ));
  const end = challenge.ends_at ? new Date(challenge.ends_at) : null;
  return state.workouts.filter((w) => {
    const t = new Date(w.performed_at);
    return t >= start && (!end || t <= end);
  }).length;
}

async function joinChallenge(challengeId) {
  const { error } = await db
    .from('challenge_participants')
    .insert({ challenge_id: challengeId, user_id: state.user.id });

  if (error) {
    if (error.code === '23505') {
      toast('ALREADY ENROLLED.');
      loadChallenges();
    } else {
      toast('ENROL FAILED — ' + error.message);
    }
    return;
  }
  toast('MISSION ACCEPTED.');
  loadChallenges();
}

/* ---------------- profile tab + stats ---------------- */

async function loadProfileStats() {
  $('header-avatar').textContent = state.profile?.avatar ?? '';
  $('profile-avatar').textContent = state.profile?.avatar ?? '';
  $('profile-name').textContent = state.profile?.display_name ?? '';
  $('profile-goal').textContent = state.profile?.fitness_goal ?? '';
  $('profile-email').textContent = state.user?.email ?? '';

  updateStatLabels();

  if (state.workouts.length > 0) return;
  const { count, error } = await db
    .from('workouts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', state.user.id);
  if (!error && state.workouts.length === 0) $('stat-total').textContent = count ?? 0;
}

function openEditProfile() {
  $('setup-name').value = state.profile?.display_name ?? '';
  $('setup-goal').value = state.profile?.fitness_goal ?? 'General Fitness';
  setSelectedAvatar(state.profile?.avatar ?? '💪');
  setError('setup-error', null);
  showScreen('screen-setup');
}

/* ---------------- realtime ---------------- */

let realtimeChannel = null;

function subscribeRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = db
    .channel('gym-crew-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, () => {
      loadHistory();
      loadLeaderboard();
      loadProfileStats();
      if (state.currentTab === 'challenges') loadChallenges();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_participants' }, () => {
      if (state.currentTab === 'challenges') loadChallenges();
    })
    .subscribe();
}

/* ---------------- wiring ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  // auth
  $('tab-btn-login').addEventListener('click', () => setAuthMode('login'));
  $('tab-btn-signup').addEventListener('click', () => setAuthMode('signup'));
  $('auth-form').addEventListener('submit', handleAuthSubmit);
  $('setup-form').addEventListener('submit', handleSetupSubmit);
  $('btn-signout').addEventListener('click', signOut);
  $('btn-refresh-profile').addEventListener('click', openEditProfile);

  // logging
  $('log-form').addEventListener('submit', handleLogSubmit);

  // tabs
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  buildAvatarPicker();
  setAuthMode('login');
  boot();
});
