/* ============================================================
   GYM CREW v2 — application logic (vanilla JS + Supabase v2)
   1. Paste your Supabase project URL and anon public key below.
   2. Run schema.sql in the Supabase SQL editor (idempotent).
   ============================================================ */

const SUPABASE_URL = 'https://mlhkqxxzlbrvjzwvcyhp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saGtxeHh6bGJydmp6d3ZjeWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNzE2MDcsImV4cCI6MjEwNjk0NzYwN30.TYi5dtpgSCVC9hT8L3Xp_x6wTEw4t_JKezB4vp374qs';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const AVATARS = ['💪', '🏋️', '🥊', '🏃', '🚴', '🧗', '🦍', '⚡', '🔥', '🐺', '🦅', '🐐'];
const WEEKLY_KM_TARGET = 100;
const REST_DEFAULT = 120;
const GEAR_RETIRE_KM = 800;
const LEVELS = [[0, 'ROOKIE'], [10, 'PRESSER'], [25, 'GRINDER'], [50, 'IRON WILL'], [100, 'MACHINE'], [200, 'MYTH']];
const QUEUE_KEY = 'gc_offline_queue';
const BONUS_KEY = 'gc_xp_bonuses';

/* ---------------- XP + rewards loop ---------------- */

function xpBonusTotal() {
  return Object.values(JSON.parse(localStorage.getItem(BONUS_KEY) || '{}'))
    .reduce((sum, arr) => sum + arr.reduce((a, b) => a + b, 0), 0);
}

function xpTotal() {
  const prs = state.workouts.filter((w) => w.is_pr).length;
  return state.workouts.length * 10 + prs * 25 + xpBonusTotal();
}

function rankFor(xp) {
  let level = LEVELS[0];
  LEVELS.forEach((l) => { if (xp >= l[0]) level = l; });
  return level;
}

function awardBonus(xp, reason) {
  const key = dayISO();
  const log = JSON.parse(localStorage.getItem(BONUS_KEY) || '{}');
  log[key] = log[key] || [];
  log[key].push(xp);
  localStorage.setItem(BONUS_KEY, JSON.stringify(log));
  toast(`+${xp} XP — ${reason}`);
  renderXp();
}

function xpFloat(text) {
  const span = document.createElement('p');
  span.className = 'rise font-display font-bold text-4xl text-volt px-6 py-3';
  span.textContent = text;
  $('xp-float-layer').appendChild(span);
  setTimeout(() => span.remove(), 1400);
}

function showRankUp(rankName) {
  $('rankup-title').textContent = rankName;
  show('rankup-overlay');
  try { navigator.vibrate && navigator.vibrate([200, 80, 200, 80, 400]); } catch { /* no vibration */ }
}

/* ---------------- daily quest (rotating, deterministic) ---------------- */

const QUESTS = [
  { text: 'EARLY CREW — LOG A SESSION BEFORE 08:00', progress: (today) => `${today.length} LOGGED TODAY — CLOCK STARTS AT MIDNIGHT`, done: (today) => today.some((w) => new Date(w.performed_at).getHours() < 8) },
  { text: 'HEAVY HANDS — LOG A SESSION AT RPE 9+', progress: (today) => `${today.filter((w) => (w.rpe ?? 0) >= 9).length} / 1 AT RPE 9+`, done: (today) => today.some((w) => (w.rpe ?? 0) >= 9) },
  { text: 'GO THE DISTANCE — LOG 5KM OR MORE', progress: (today) => `${today.reduce((s, w) => s + Number(w.distance_km || 0), 0).toFixed(1)} / 5 KM`, done: (today) => today.reduce((s, w) => s + Number(w.distance_km || 0), 0) >= 5 },
  { text: 'DARK WORK — TRAIN AFTER 21:00', progress: (today) => `${today.length} LOGGED TODAY — THE NIGHT SHIFT COUNTS DOUBLE IN YOUR HEAD`, done: (today) => today.some((w) => new Date(w.performed_at).getHours() >= 21) },
  { text: 'PAIN TOLERANCE — TAG A DROP SET OR SUPERSET', progress: (today) => `${today.filter((w) => (w.tags || []).some((t) => t === 'DROP SET' || t === 'SUPERSET')).length} / 1 TAGGED`, done: (today) => today.some((w) => (w.tags || []).some((t) => t === 'DROP SET' || t === 'SUPERSET')) },
  { text: 'DOUBLE DROP — LOG 2 SESSIONS TODAY', progress: (today) => `${today.length} / 2 SESSIONS`, done: (today) => today.length >= 2 }
];

function questForDate(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((d - start) / 86400000);
  return QUESTS[(dayOfYear + d.getFullYear()) % QUESTS.length];
}

let questWasDone = false;

function renderQuest() {
  const quest = questForDate();
  const today = state.workouts.filter((w) => new Date(w.performed_at).toDateString() === new Date().toDateString());
  const done = quest.done(today);

  show('quest-card');
  $('quest-text').textContent = quest.text;
  $('quest-progress').textContent = quest.progress(today);
  $('quest-state').textContent = done ? 'COMPLETE ✓ +25 XP BANKED' : 'OPEN';
  $('quest-state').className = `text-[10px] tracking-[0.2em] uppercase ${done ? 'text-volt font-bold' : 'text-zinc-400'}`;

  // First completion of the day pays the bonus.
  if (done && !questWasDone) {
    const paidKey = 'gc_quest_paid_' + dayISO();
    if (!localStorage.getItem(paidKey)) {
      localStorage.setItem(paidKey, '1');
      awardBonus(25, 'DAILY QUEST COMPLETE');
    }
  }
  questWasDone = done;
}

const state = {
  user: null,
  profile: null,
  workouts: [],
  feed: [],
  challenges: [],
  participations: [],
  wagers: [],
  gear: [],
  selectedAvatar: AVATARS[0],
  authMode: 'login',
  currentTab: 'status',
  tags: new Set(),
  fatigue: new Set(),
  sessionStart: null,
  amoled: localStorage.getItem('gc_amoled') === '1'
};

/* ---------------- tiny DOM + formatting helpers ---------------- */

const $ = (id) => document.getElementById(id);

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

function toast(msg) {
  $('toast-msg').textContent = msg;
  show('toast');
  setTimeout(() => hide('toast'), 2200);
}

function setError(id, message) {
  const el = $(id);
  if (!message) { hide(id); return; }
  el.textContent = message;
  show(id);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pad2(n) { return String(n).padStart(2, '0'); }

function startOfLocalWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7); // Monday
  return d;
}

function dayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtLogDate(iso) {
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

/* ---------------- service worker ---------------- */

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* ---------------- amoled mode ---------------- */

function applyAmoled() {
  document.documentElement.classList.toggle('amoled', state.amoled);
  $('amoled-state').textContent = state.amoled ? 'ON' : 'OFF';
}

function toggleAmoled() {
  state.amoled = !state.amoled;
  localStorage.setItem('gc_amoled', state.amoled ? '1' : '0');
  applyAmoled();
}

/* ---------------- offline queue ---------------- */

function enqueueOffline(payload) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  q.push(payload);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (q.length === 0) return;
  const remaining = [];
  for (const payload of q) {
    const { error } = await db.from('workouts').insert(payload);
    if (error) remaining.push(payload);
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  if (q.length > remaining.length) {
    toast('OFFLINE LOGS SYNCED.');
    loadStatus();
    loadCrew();
  }
}

window.addEventListener('online', () => flushOfflineQueue());

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
    .from('profiles').select('*').eq('id', state.user.id).maybeSingle();

  if (error) {
    setError('auth-error', 'COULD NOT LOAD PROFILE — ' + error.message.toUpperCase());
    showScreen('screen-auth');
    return;
  }

  if (!profile) {
    const insert = await db
      .from('profiles')
      .insert({ id: state.user.id, display_name: 'Athlete', fitness_goal: 'General Fitness', avatar: '💪' })
      .select().single();
    if (insert.error) {
      setError('auth-error', 'COULD NOT CREATE PROFILE — ' + insert.error.message.toUpperCase());
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
  applyAmoled();
  switchTab('status');
  refreshAll();
  flushOfflineQueue();
  subscribeRealtime();
}

function refreshAll() {
  loadStatus();
  loadCrew();
  loadMissions();
  loadFuel();
  loadProfileData();
}

/* ---------------- auth ---------------- */

function setAuthMode(mode) {
  state.authMode = mode;
  const isLogin = mode === 'login';
  if (isLogin) {
    hide('signup-only');
    $('tab-btn-login').className = 'auth-toggle py-3.5 font-display uppercase tracking-widest text-xs bg-volt text-ink font-bold active:translate-y-0.5 transition duration-75';
    $('tab-btn-signup').className = 'auth-toggle py-3.5 font-display uppercase tracking-widest text-xs border-l border-zinc-800 text-zinc-400 hover:text-zinc-300 active:translate-y-0.5 transition duration-75';
    $('auth-submit').textContent = 'ACCESS';
    $('auth-password').setAttribute('autocomplete', 'current-password');
  } else {
    show('signup-only');
    $('tab-btn-login').className = 'auth-toggle py-3.5 font-display uppercase tracking-widest text-xs text-zinc-400 hover:text-zinc-300 active:translate-y-0.5 transition duration-75';
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
  if (!email || !password) { setError('auth-error', 'EMAIL + PASSWORD REQUIRED.'); return; }
  if (password.length < 6) { setError('auth-error', 'PASSWORD TOO SHORT — MINIMUM 6.'); return; }

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
        data: { display_name: displayName, fitness_goal: $('signup-goal').value, avatar: state.selectedAvatar }
      }
    }));
    if (!error) {
      toast('ACCOUNT CREATED.');
      const { data } = await db.auth.getSession();
      if (!data.session) {
        setError('auth-error', 'CONFIRM YOUR EMAIL VIA THE INBOX LINK, THEN ACCESS.');
      }
    }
  }

  btn.disabled = false;
  btn.style.opacity = '1';
  if (error) setError('auth-error', error.message.toUpperCase());
}

async function signOut() {
  await db.auth.signOut();
  if (realtimeChannel) { db.removeChannel(realtimeChannel); realtimeChannel = null; }
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
  if (displayName.length < 2) { setError('setup-error', 'CALLSIGN TOO SHORT — MINIMUM 2.'); return; }

  const { error } = await db
    .from('profiles')
    .update({ display_name: displayName, fitness_goal: $('setup-goal').value, avatar: state.selectedAvatar })
    .eq('id', state.user.id);

  if (error) { setError('setup-error', error.message.toUpperCase()); return; }
  toast('PROFILE UPDATED. GET TO WORK.');
  enterApp();
}

/* ---------------- tabs ---------------- */

function switchTab(tab) {
  state.currentTab = tab;
  ['status', 'crew', 'missions', 'fuel', 'profile'].forEach((t) => hide(`tab-${t}`));
  show(`tab-${tab}`);
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('bg-volt', active);
    btn.classList.toggle('text-ink', active);
    btn.classList.toggle('text-zinc-400', !active);
  });
  window.scrollTo(0, 0);
}

/* ---------------- register work ---------------- */

function toggleChip(set, btn, onClass, offClass) {
  const value = btn.dataset.tag || btn.dataset.fatigue;
  if (set.has(value)) { set.delete(value); btn.className = offClass; }
  else { set.add(value); btn.className = onClass; }
}

function chipOff(btn) {
  return btn.dataset.tag
    ? 'tag-chip text-[11px] tracking-[0.2em] uppercase border border-zinc-700 text-zinc-400 px-2.5 py-1.5'
    : 'fatigue-chip text-[11px] tracking-[0.2em] uppercase border border-zinc-700 text-zinc-400 px-2.5 py-1.5';
}

function chipOn(btn) {
  const red = btn.dataset.fatigue === 'WRECKED';
  return btn.dataset.tag
    ? `tag-chip text-[11px] tracking-[0.2em] uppercase border border-volt bg-volt/10 text-volt px-2.5 py-1.5`
    : `fatigue-chip text-[11px] tracking-[0.2em] uppercase border ${red ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-volt bg-volt/10 text-volt'} px-2.5 py-1.5`;
}

let durInt = null;

function startSessionClock() {
  if (state.sessionStart) return;
  state.sessionStart = Date.now();
  durInt = setInterval(() => {
    const s = Math.floor((Date.now() - state.sessionStart) / 1000);
    $('dur-chip').textContent = `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  }, 1000);
}

function stopSessionClock() {
  if (durInt) clearInterval(durInt);
  durInt = null;
  state.sessionStart = null;
  $('dur-chip').textContent = '00:00';
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  setError('reg-error', null);

  const entry = $('reg-entry').value.trim();
  if (!entry) { setError('reg-error', 'WRITE WHAT YOU DID — ONE LINE IS ENOUGH.'); return; }

  const numOrNull = (id) => {
    const v = $(id).value.trim();
    return v === '' ? null : Number(v);
  };
  const distance = numOrNull('reg-distance');
  const elev = numOrNull('reg-elev');
  const moving = numOrNull('reg-moving');
  const rpe = Number($('rpe-slider').value);
  const gearId = $('reg-gear').value || null;

  const payload = {
    user_id: state.user.id,
    exercise_name: entry,
    tags: [...state.tags],
    fatigue: [...state.fatigue],
    rpe,
    is_pr: state.tags.has('PR'),
    distance_km: distance,
    elevation_m: elev,
    moving_time_min: moving,
    duration_min: state.sessionStart ? Math.max(1, Math.round((Date.now() - state.sessionStart) / 60000)) : null,
    session_started_at: state.sessionStart ? new Date(state.sessionStart).toISOString() : null,
    gear_id: gearId,
    notes: ''
  };

  const btn = $('reg-submit');
  btn.disabled = true;
  btn.style.opacity = '0.6';

  let error = null;
  if (!navigator.onLine) {
    enqueueOffline(payload);
    stopSessionClock();
    $('reg-form').reset();
    resetRegisterChips();
    btn.disabled = false;
    btn.style.opacity = '1';
    toast('OFFLINE — CACHED ON DEVICE. WILL SYNC.');
    startRest(REST_DEFAULT);
    return;
  }

  ({ error } = await db.from('workouts').insert(payload));
  btn.disabled = false;
  btn.style.opacity = '1';

  if (error) {
    if (!navigator.onLine) {
      enqueueOffline(payload);
      toast('OFFLINE — CACHED ON DEVICE. WILL SYNC.');
    } else {
      setError('reg-error', error.message.toUpperCase());
      return;
    }
  } else {
    toast('SESSION REGISTERED.');
    rewardMoment(payload);
  }

  stopSessionClock();
  $('reg-form').reset();
  resetRegisterChips();
  $('rpe-slider').value = 5;
  $('rpe-val').textContent = '—';
  loadStatus();
  loadProfileData();
  if (state.currentTab === 'crew') loadCrew();
  startRest(REST_DEFAULT);
}

/* XP payout, variable rewards, milestone callouts, rank-up detection. */
function rewardMoment(payload) {
  const gained = payload.is_pr ? 35 : 10;
  const prevRank = rankFor(xpTotal())[1];

  xpFloat(`+${gained} XP`);
  try { navigator.vibrate && navigator.vibrate(20); } catch { /* no vibration */ }

  // Variable reward: roughly 1 in 7 drops pays a bonus.
  if (Math.random() < 1 / 7) {
    setTimeout(() => awardBonus(15, 'CREW FAVOR — LUCKY DROP'), 900);
  }

  // Milestone callouts.
  const after = state.workouts.length + 1;
  if ([10, 25, 50, 100, 200].includes(after)) {
    setTimeout(() => toast(`${after} SESSIONS ON RECORD. BUILT DIFFERENT.`), 1400);
  }

  // Rank-up moment: +1 session (and maybe a PR) crosses a threshold.
  const newXp = xpTotal() + gained;
  const newRank = rankFor(newXp)[1];
  if (newRank !== prevRank) {
    setTimeout(() => showRankUp(newRank), 1200);
  }
}

function resetRegisterChips() {
  state.tags.clear();
  state.fatigue.clear();
  document.querySelectorAll('.tag-chip, .fatigue-chip').forEach((btn) => { btn.className = chipOff(btn); });
  hide('endurance-fields');
  $('endurance-caret').textContent = '＋';
}

/* ---------------- rest timer ---------------- */

let restInt = null;
let restLeft = 0;
let restTotal = REST_DEFAULT;

function startRest(seconds) {
  restTotal = seconds;
  restLeft = seconds;
  show('rest-overlay');
  renderRest();
  if (restInt) clearInterval(restInt);
  restInt = setInterval(() => {
    restLeft -= 1;
    if (restLeft <= 0) {
      endRest();
      restAlarm();
      return;
    }
    renderRest();
  }, 1000);
}

function renderRest() {
  $('rest-count').textContent = restLeft;
  $('rest-bar').style.width = `${Math.round((restLeft / restTotal) * 100)}%`;
}

function endRest() {
  if (restInt) clearInterval(restInt);
  restInt = null;
  hide('rest-overlay');
}

function restAlarm() {
  try { navigator.vibrate && navigator.vibrate([300, 120, 300, 120, 500]); } catch { /* no vibration */ }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 400].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.start(ctx.currentTime + delay / 1000);
      osc.stop(ctx.currentTime + delay / 1000 + 0.3);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* no audio */ }
}

/* ---------------- plate math ---------------- */

function plateMath(target) {
  const bar = 20;
  let perSide = (target - bar) / 2;
  if (target < bar) return 'LIGHTER THAN THE BAR — GRAB DUMBBELLS.';
  if (perSide === 0) return 'EMPTY BAR — 20KG TOTAL.';
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
  const used = [];
  for (const p of plates) {
    const count = Math.floor(perSide / p + 1e-9);
    if (count > 0) { used.push(`${count}×${p}`); perSide -= count * p; }
  }
  if (perSide > 0.01) return `NO CLEAN SETUP — ${used.length ? used.join(' + ') + ' PER SIDE' : ''} AND ${perSide.toFixed(2)}KG LEFT OVER.`;
  return `PER SIDE: ${used.join(' + ')}  ·  ${bar}KG BAR + ${used.join(' + ')}`;
}

/* ---------------- status tab ---------------- */

async function loadStatus() {
  const [statsRes, histRes] = await Promise.all([
    db.rpc('get_crew_stats'),
    db.from('workouts').select('*').order('performed_at', { ascending: false }).limit(100)
  ]);

  if (!statsRes.error && statsRes.data?.[0]) {
    const s = statsRes.data[0];
    $('crew-stat-line').textContent = `THE CREW LOGGED ${s.sessions_today} SESSIONS TODAY — ${s.sessions_week} THIS WEEK.`;
  }

  if (histRes.error) {
    $('streak-list').innerHTML = `<p class="text-[11px] text-red-400 text-center py-6 uppercase tracking-wider">${escapeHtml(histRes.error.message)}</p>`;
    return;
  }
  state.workouts = histRes.data ?? [];
  updateStatLabels();
  renderStreak();
  renderQuest();
  loadVolume();
}

function updateStatLabels() {
  const weekStart = startOfLocalWeek();
  const weekCount = state.workouts.filter((w) => new Date(w.performed_at) >= weekStart).length;
  const prCount = state.workouts.filter((w) => w.is_pr).length;
  $('stat-week').textContent = weekCount;
  $('stat-streak').textContent = weeklyStreak(state.workouts);
  $('stat-prs').textContent = prCount;
  $('week-counter').textContent = `WK ${weekCount}`;
  if (state.workouts.length > 0) $('stat-total').textContent = state.workouts.length;
  renderXp();
  renderBadges();
}

function weeklyStreak(workouts) {
  const weekKey = (d) => {
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return monday.getTime();
  };
  const counts = {};
  workouts.forEach((w) => { counts[weekKey(new Date(w.performed_at))] = (counts[weekKey(new Date(w.performed_at))] || 0) + 1; });

  // Completed weeks (3+ sessions each), walking backwards from last week.
  let streak = 0;
  let cursor = weekKey(new Date()) - 7 * 86400000;
  while ((counts[cursor] || 0) >= 3 && streak < 520) {
    streak += 1;
    cursor -= 7 * 86400000;
  }
  // The running week only counts once it already has 3+ sessions.
  if ((counts[weekKey(new Date())] || 0) >= 3) streak += 1;
  return streak;
}

function entryBadges(w) {
  const t = new Date(w.performed_at);
  const hour = t.getHours() + t.getMinutes() / 60;
  const badges = [];
  if (hour < 5.5) badges.push(['SUNRISE CLUB', 'text-volt border-volt']);
  if (hour >= 21) badges.push(['GRAVEYARD SHIFT', 'text-zinc-300 border-zinc-500']);
  (w.tags || []).forEach((tag) => badges.push([tag, tag === 'PR' ? 'text-ink bg-volt border-volt font-bold' : 'text-volt border-volt']));
  return badges;
}

function renderStreak() {
  const list = $('streak-list');
  const weekStart = startOfLocalWeek();
  const weekCount = state.workouts.filter((w) => new Date(w.performed_at) >= weekStart).length;

  const chain = weekCount >= 3
    ? 'CHAIN SECURED — DO NOT GET COMFORTABLE.'
    : `${3 - weekCount} MORE THIS WEEK OR THE CHAIN SNAPS.`;
  let journey = '';
  if (state.profile?.created_at) {
    const days = Math.max(1, Math.ceil((Date.now() - new Date(state.profile.created_at)) / 86400000));
    journey = ` DAY ${days} OF THE JOURNEY.`;
  }
  $('streak-summary').textContent = `STREAK: ${weeklyStreak(state.workouts)} WEEK(S) AT 3+ — ${weekCount} THIS WEEK. ${chain}${journey}`;

  if (state.workouts.length === 0) {
    list.innerHTML = `
      <div class="border border-zinc-800 bg-panel px-5 py-10 text-center">
        <p class="font-display uppercase font-semibold tracking-widest text-lg leading-relaxed text-zinc-300">
          0 SESSIONS LOGGED THIS WEEK.<br/>
          <span class="text-volt">RESET THE CLOCK.</span>
        </p>
        <p class="text-[11px] tracking-[0.3em] uppercase text-zinc-400 mt-4">The board is watching</p>
      </div>`;
    return;
  }

  list.innerHTML = state.workouts
    .map((w) => {
      const badges = entryBadges(w)
        .map(([label, cls]) => `<span class="text-[10px] tracking-[0.15em] uppercase border ${cls} px-1.5 py-0.5">${escapeHtml(label)}</span>`)
        .join(' ');
      const dur = w.duration_min ? `<span class="text-zinc-400">${w.duration_min} MIN</span>` : '';
      const dist = w.distance_km ? `<span class="text-zinc-400">${w.distance_km} KM${w.elevation_m ? ` / +${w.elevation_m}M` : ''}${w.moving_time_min ? ` / ${w.moving_time_min}MIN` : ''}</span>` : '';
      return `
      <article class="bg-panel border border-zinc-800 p-4 rise">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-sm leading-relaxed break-words normal-case tracking-wide">${escapeHtml(w.exercise_name)}</h3>
            <div class="flex flex-wrap items-center gap-1.5 mt-2">
              ${badges}
              <span class="text-[10px] tracking-[0.15em] uppercase border border-zinc-700 text-zinc-400 px-1.5 py-0.5">RPE ${w.rpe ?? '—'}</span>
              ${dist}
              ${dur}
            </div>
          </div>
          <button data-del="${w.id}" aria-label="Delete entry"
            class="shrink-0 text-[11px] tracking-[0.2em] text-zinc-400 hover:text-red-500 border border-zinc-800 hover:border-red-500 px-2 py-1.5 transition duration-75">DEL</button>
        </div>
        <p class="text-[11px] text-zinc-400 mt-3 tracking-[0.25em] uppercase">${escapeHtml(fmtLogDate(w.performed_at))}</p>
      </article>`;
    })
    .join('');

  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => deleteWorkout(btn.dataset.del));
  });
}

async function deleteWorkout(id) {
  const { error } = await db.from('workouts').delete().eq('id', id);
  if (error) { toast('DELETE FAILED — ' + error.message.toUpperCase()); return; }
  toast('ENTRY STRUCK FROM THE LOG.');
  loadStatus();
  loadProfileData();
  if (state.currentTab === 'crew') loadCrew();
}

/* ---------------- drop score (WhatsApp compiler) ---------------- */

function buildDropScore() {
  const today = state.workouts.filter((w) => new Date(w.performed_at).toDateString() === new Date().toDateString());
  const dateLine = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase();
  const lines = today.map((w) => `• ${w.exercise_name}`);
  return [
    '🔥 GYM/CREW — DROP SCORE 🔥',
    dateLine,
    `${(state.profile?.display_name || 'ME').toUpperCase()}: ${today.length} SESSION${today.length === 1 ? '' : 'S'} TODAY`,
    ...lines,
    today.length === 0 ? '• NOTHING YET. CLOCK IS RUNNING.' : '',
    '— logged on GYM/CREW'
  ].filter(Boolean).join('\n');
}

async function copyDropScore() {
  const text = buildDropScore();
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('DROP SCORE COPIED — PASTE IT IN THE GROUP.');
  } catch {
    toast('COPY BLOCKED — SCREENSHOT IT.');
  }
}

/* ---------------- crew tab ---------------- */

async function loadCrew() {
  const statsRes = await db.rpc('get_crew_stats');
  if (!statsRes.error && statsRes.data?.[0]) {
    const s = statsRes.data[0];
    $('crew-stat-line').textContent = `THE CREW LOGGED ${s.sessions_today} SESSIONS TODAY — ${s.sessions_week} THIS WEEK.`;
    $('crew-today').textContent = s.sessions_today;
    $('crew-week').textContent = s.sessions_week;
    $('crew-active').textContent = s.members_today;
  }
  const nextMonday = new Date(startOfLocalWeek().getTime() + 7 * 86400000);
  const ms = nextMonday - new Date();
  $('board-countdown').textContent = `RESETS IN ${Math.floor(ms / 86400000)}D ${new Date(ms).getUTCHours()}H`;
  loadLeaderboard();
  loadSlackers();
  loadPrBoard();
  loadNotice();
  loadCrewFeed();
}

async function loadLeaderboard() {
  const list = $('leaderboard-list');
  list.innerHTML = `<p class="text-[12px] tracking-[0.3em] uppercase text-zinc-400 text-center py-8">LOADING BOARD…</p>`;

  const { data, error } = await db.rpc('get_weekly_leaderboard');
  if (error) {
    list.innerHTML = `<p class="text-[11px] text-red-400 text-center py-8 uppercase tracking-wider">${escapeHtml(error.message)}</p>`;
    return;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    list.innerHTML = `
      <div class="border border-zinc-800 bg-panel px-5 py-8 text-center">
        <p class="font-display uppercase font-semibold tracking-widest text-lg text-zinc-300">THE BOARD IS EMPTY.</p>
        <p class="text-volt font-display uppercase font-semibold tracking-widest text-lg mt-1">BE THE FIRST NAME ON IT.</p>
      </div>`;
    return;
  }

  list.innerHTML = rows
    .map((row, i) => {
      const isMe = row.user_id === state.user.id;
      const rank = pad2(i + 1);
      return `
      <div class="flex items-center gap-3 border ${isMe ? 'border-volt bg-volt/5' : 'border-zinc-800 bg-panel'} px-4 py-3 rise">
        <span class="w-9 font-display font-bold text-lg ${i < 3 ? 'text-volt' : 'text-zinc-400'}">${rank}</span>
        <span class="text-xl">${escapeHtml(row.avatar)}</span>
        <div class="min-w-0 flex-1">
          <p class="font-display uppercase font-semibold text-sm truncate">${escapeHtml(row.display_name)}${isMe ? ' <span class="text-volt text-[11px] font-mono tracking-widest">/ YOU</span>' : ''}</p>
          <p class="text-[11px] text-zinc-400 uppercase tracking-[0.25em] mt-0.5">${escapeHtml(row.fitness_goal)}</p>
        </div>
        <div class="text-right">
          <p class="font-display font-bold text-2xl text-volt leading-none">${row.total_workouts}</p>
          <p class="text-[10px] text-zinc-400 uppercase tracking-[0.25em] mt-1">sessions</p>
        </div>
      </div>`;
    })
    .join('');
}

async function loadSlackers() {
  const list = $('slacker-list');
  const { data, error } = await db.rpc('get_slacker_list');
  if (error) {
    list.innerHTML = `<p class="text-[12px] text-red-400 text-center py-6 uppercase tracking-wider">${escapeHtml(error.message)}</p>`;
    return;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    list.innerHTML = `<p class="text-[12px] tracking-[0.25em] uppercase text-zinc-400 text-center py-6 border border-zinc-800 bg-panel py-5">NO SLACKERS. THE CREW SHOWS UP.</p>`;
    return;
  }
  list.innerHTML = rows
    .map((r) => `
      <div class="flex items-center gap-3 border border-zinc-800 bg-panel px-4 py-3 rise">
        <span class="text-xl">${escapeHtml(r.avatar)}</span>
        <p class="flex-1 font-display uppercase font-semibold text-sm truncate">${escapeHtml(r.display_name)}</p>
        <span class="text-[11px] tracking-[0.2em] uppercase text-red-400 border border-red-900 px-2 py-1">${r.days_idle ?? '?'} DAYS SILENT</span>
      </div>`)
    .join('');
}

async function loadPrBoard() {
  const list = $('pr-board-list');
  const { data, error } = await db.rpc('get_pr_board');
  if (error) {
    list.innerHTML = `<p class="text-[12px] text-red-400 text-center py-6 uppercase tracking-wider">${escapeHtml(error.message)}</p>`;
    return;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    list.innerHTML = `<p class="text-[12px] tracking-[0.25em] uppercase text-zinc-400 text-center border border-zinc-800 bg-panel py-5">NO PRS YET. TAG YOUR NEXT ONE.</p>`;
    return;
  }
  list.innerHTML = rows
    .map((r) => `
      <div class="border border-volt/60 bg-volt/5 px-4 py-3 flex items-center gap-3 rise">
        <span class="text-[11px] font-bold tracking-[0.2em] uppercase text-ink bg-volt px-2 py-1">PR</span>
        <span class="text-lg">${escapeHtml(r.avatar)}</span>
        <div class="min-w-0 flex-1">
          <p class="text-xs break-words normal-case">${escapeHtml(r.entry)}</p>
          <p class="text-[11px] tracking-[0.2em] uppercase text-zinc-400 mt-1">${escapeHtml(r.display_name)} — ${escapeHtml(fmtLogDate(r.performed_at))}</p>
        </div>
      </div>`)
    .join('');
}

async function loadNotice() {
  const block = $('notice-block');
  const { data, error } = await db
    .from('notice_board').select('body, created_at').eq('is_pinned', true).order('created_at', { ascending: false }).limit(1);
  if (error || !data || data.length === 0) { block.innerHTML = ''; return; }
  block.innerHTML = `
    <div class="border border-volt bg-volt/5 px-4 py-3 rise">
      <p class="text-[10px] tracking-[0.3em] uppercase text-volt mb-1.5">📌 PINNED — NOTICE BOARD</p>
      <p class="text-xs leading-relaxed normal-case">${escapeHtml(data[0].body)}</p>
    </div>`;
}

async function loadCrewFeed() {
  const list = $('feed-list');
  list.innerHTML = `<p class="text-[12px] tracking-[0.3em] uppercase text-zinc-400 text-center py-8">LOADING FEED…</p>`;

  const { data, error } = await db.rpc('get_crew_feed', { max_rows: 15 });
  if (error) {
    list.innerHTML = `<p class="text-[11px] text-red-400 text-center py-8 uppercase tracking-wider">${escapeHtml(error.message)}</p>`;
    return;
  }
  state.feed = data ?? [];
  if (state.feed.length === 0) {
    list.innerHTML = `<p class="text-[12px] tracking-[0.25em] uppercase text-zinc-400 text-center border border-zinc-800 bg-panel py-8">FEED IS QUIET. BE THE FIRST DROP.</p>`;
    return;
  }

  list.innerHTML = state.feed
    .map((w) => {
      const badges = entryBadges(w)
        .map(([label, cls]) => `<span class="text-[10px] tracking-[0.15em] uppercase border ${cls} px-1.5 py-0.5">${escapeHtml(label)}</span>`)
        .join(' ');
      const dist = w.distance_km ? `<span class="text-[10px] tracking-[0.15em] uppercase border border-zinc-700 text-zinc-400 px-1.5 py-0.5">${w.distance_km} KM</span>` : '';
      const isNow = Date.now() - new Date(w.performed_at).getTime() < 15 * 60000;
      return `
      <article class="bg-panel border border-zinc-800 p-4 rise" data-feed="${w.id}">
        <div class="flex items-center gap-2.5 mb-2.5">
          <span class="text-lg">${escapeHtml(w.avatar)}</span>
          <div class="flex-1 min-w-0">
            <p class="font-display uppercase font-semibold text-sm truncate">${escapeHtml(w.display_name)}${isNow ? ' <span class="text-[10px] tracking-[0.2em] uppercase text-ink bg-volt px-1.5 py-0.5 font-bold">Training now</span>' : ''}</p>
            <p class="text-[11px] text-zinc-400 tracking-[0.2em] uppercase">${escapeHtml(fmtLogDate(w.performed_at))}</p>
          </div>
        </div>
        <p class="text-sm leading-relaxed break-words normal-case tracking-wide">${escapeHtml(w.entry)}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-2.5">
          ${badges}
          ${dist}
          ${w.rpe ? `<span class="text-[10px] tracking-[0.15em] uppercase border border-zinc-700 text-zinc-400 px-1.5 py-0.5">RPE ${w.rpe}</span>` : ''}
        </div>
        <div class="flex items-center gap-2 mt-4">
          <button data-bump="${w.id}" data-bumped="${w.did_i_bump ? '1' : ''}"
            class="text-[11px] tracking-[0.2em] uppercase border px-2.5 py-1.5 transition duration-75 ${w.did_i_bump ? 'border-volt text-volt bg-volt/10' : 'border-zinc-700 text-zinc-400'}">
            👊 FIST BUMP <span class="font-bold">${w.bump_count}</span>
          </button>
          <button data-chat="${w.id}"
            class="text-[11px] tracking-[0.2em] uppercase border border-zinc-700 text-zinc-400 px-2.5 py-1.5 transition duration-75">
            CHAT <span class="font-bold">${w.comment_count}</span>
          </button>
        </div>
        <div class="comment-zone hidden mt-3 border-t border-zinc-800 pt-3" data-zone="${w.id}"></div>
      </article>`;
    })
    .join('');

  list.querySelectorAll('[data-bump]').forEach((btn) => {
    btn.addEventListener('click', () => toggleBump(btn.dataset.bump, btn.dataset.bumped === '1'));
  });
  list.querySelectorAll('[data-chat]').forEach((btn) => {
    btn.addEventListener('click', () => toggleComments(btn.dataset.chat));
  });
}

async function toggleBump(workoutId, alreadyBumped) {
  if (alreadyBumped) {
    const { error } = await db.from('fist_bumps').delete().eq('workout_id', workoutId).eq('user_id', state.user.id);
    if (error) { toast('BUMP FAILED — ' + error.message.toUpperCase()); return; }
  } else {
    const { error } = await db.from('fist_bumps').insert({ workout_id: workoutId, user_id: state.user.id });
    if (error && error.code !== '23505') { toast('BUMP FAILED — ' + error.message.toUpperCase()); return; }
  }
  loadCrewFeed();
}

async function toggleComments(workoutId) {
  const zone = document.querySelector(`[data-zone="${workoutId}"]`);
  if (!zone.classList.contains('hidden')) { zone.classList.add('hidden'); return; }
  zone.classList.remove('hidden');
  zone.innerHTML = `<p class="text-[12px] tracking-[0.25em] uppercase text-zinc-400 py-2">LOADING…</p>`;

  const { data, error } = await db
    .from('comments')
    .select('id, body, created_at, user_id, profiles(display_name, avatar)')
    .eq('workout_id', workoutId)
    .order('created_at', { ascending: true });

  if (error) { zone.innerHTML = `<p class="text-[12px] text-red-400 uppercase py-2">${escapeHtml(error.message)}</p>`; return; }

  const rows = data ?? [];
  zone.innerHTML = `
    <div class="space-y-2 mb-3">
      ${rows.length === 0 ? '<p class="text-[12px] tracking-[0.2em] uppercase text-zinc-400">NO COMMENTS YET.</p>' : ''}
      ${rows.map((c) => `
        <div class="flex items-start gap-2">
          <span class="text-sm">${escapeHtml(c.profiles?.avatar ?? '💪')}</span>
          <p class="text-[11px] leading-relaxed break-words normal-case"><span class="text-volt font-bold uppercase">${escapeHtml(c.profiles?.display_name ?? 'CREW')}</span> ${escapeHtml(c.body)}</p>
        </div>`).join('')}
    </div>
    <div class="flex gap-2">
      <input type="text" maxlength="240" placeholder="LEAVE A LINE…" data-cinput="${workoutId}"
        class="flex-1 bg-transparent border-b border-zinc-700 focus:border-volt outline-none py-1.5 text-xs placeholder-zinc-500" />
      <button data-cpost="${workoutId}"
        class="bg-volt text-ink text-[11px] font-bold tracking-[0.2em] uppercase px-3 active:translate-y-0.5 active:bg-white transition duration-75">POST</button>
    </div>`;

  zone.querySelector(`[data-cpost="${workoutId}"]`).addEventListener('click', () => postComment(workoutId, zone));
  zone.querySelector(`[data-cinput="${workoutId}"]`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') postComment(workoutId, zone);
  });
}

async function postComment(workoutId, zone) {
  const input = zone.querySelector(`[data-cinput="${workoutId}"]`);
  const body = input.value.trim();
  if (!body) return;
  const { error } = await db.from('comments').insert({ workout_id: workoutId, user_id: state.user.id, body });
  if (error) { toast('COMMENT FAILED — ' + error.message.toUpperCase()); return; }
  input.value = '';
  await toggleComments(workoutId); // collapse
  await toggleComments(workoutId); // reopen with fresh data
}

/* ---------------- missions tab ---------------- */

async function loadMissions() {
  loadVolume();
  loadChallenges();
  loadWagers();
  renderEvent();
}

async function loadVolume() {
  const weekStart = startOfLocalWeek();
  const km = state.workouts
    .filter((w) => new Date(w.performed_at) >= weekStart && w.distance_km)
    .reduce((sum, w) => sum + Number(w.distance_km), 0);
  const pct = Math.min(100, Math.round((km / WEEKLY_KM_TARGET) * 100));
  $('vol-now').textContent = km.toFixed(1);
  $('vol-pct').textContent = `${pct}%`;
  $('vol-bar').style.width = `${pct}%`;
}

function ringSvg(pct) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, pct) / 100) * c;
  return `
  <div class="relative w-16 h-16 shrink-0">
    <svg viewBox="0 0 64 64" class="w-16 h-16 -rotate-90">
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="#262626" stroke-width="6"/>
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="#CCFF00" stroke-width="6"
        stroke-dasharray="${filled.toFixed(1)} ${c.toFixed(1)}" class="transition-all duration-500"/>
    </svg>
    <p class="absolute inset-0 flex items-center justify-center font-display font-bold text-sm text-volt">${Math.min(100, pct)}%</p>
  </div>`;
}

async function loadChallenges() {
  const list = $('challenges-list');
  list.innerHTML = `<p class="text-[12px] tracking-[0.3em] uppercase text-zinc-400 text-center py-8">LOADING MISSIONS…</p>`;

  const [chRes, partRes] = await Promise.all([
    db.from('challenges').select('*').eq('is_active', true).order('created_at', { ascending: true }),
    db.from('challenge_participants').select('challenge_id, joined_at').eq('user_id', state.user.id)
  ]);

  if (chRes.error) {
    list.innerHTML = `<p class="text-[11px] text-red-400 text-center py-8 uppercase tracking-wider">${escapeHtml(chRes.error.message)}</p>`;
    return;
  }
  state.challenges = chRes.data ?? [];
  state.participations = partRes.data ?? [];

  const counts = await Promise.all(
    state.challenges.map((c) =>
      db.from('challenge_participants').select('*', { count: 'exact', head: true }).eq('challenge_id', c.id)
    )
  );

  list.innerHTML = '';
  state.challenges.forEach((c, i) => {
    const mine = state.participations.find((p) => p.challenge_id === c.id);
    const joinedCount = counts[i].count ?? 0;
    list.insertAdjacentHTML('beforeend', renderChallengeCard(c, mine, joinedCount));
  });

  list.querySelectorAll('[data-join]').forEach((btn) => {
    btn.addEventListener('click', () => joinChallenge(btn.dataset.join));
  });
}

function renderChallengeCard(c, mine, joinedCount) {
  const progress = mine ? countChallengeProgress(c, mine.joined_at) : 0;
  const pct = Math.round((progress / c.target_workouts) * 100);
  const done = progress >= c.target_workouts;
  const endLine = c.ends_at
    ? `CLOSES ${new Date(c.ends_at).toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()}`
    : 'NO EXPIRY';

  return `
  <article class="bg-panel border ${done ? 'border-volt' : 'border-zinc-800'} p-5 rise">
    <div class="flex items-start gap-4">
      ${mine ? ringSvg(pct) : ''}
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-3">
          <h3 class="font-display uppercase font-semibold text-base leading-tight">${escapeHtml(c.title)}</h3>
          <span class="shrink-0 text-[11px] tracking-[0.2em] text-zinc-400 bg-ink border border-zinc-800 px-2 py-1 uppercase whitespace-nowrap">${joinedCount} IN</span>
        </div>
        <p class="text-xs text-zinc-400 mt-2 leading-relaxed normal-case">${escapeHtml(c.description)}</p>
        ${
          mine
            ? `<p class="text-[12px] font-bold uppercase tracking-[0.2em] mt-3 ${done ? 'text-volt' : 'text-zinc-300'}">${done ? 'TARGET HIT' : `${progress} / ${c.target_workouts} SESSIONS`}</p>`
            : `<button data-join="${c.id}"
                class="w-full bg-volt text-ink font-display uppercase font-bold tracking-[0.25em] text-sm py-3.5 mt-4 active:translate-y-0.5 active:bg-white transition duration-75">
                ACCEPT MISSION
              </button>`
        }
      </div>
    </div>
    <p class="text-[11px] text-zinc-400 mt-3 tracking-[0.25em] uppercase">${endLine}</p>
  </article>`;
}

function countChallengeProgress(challenge, joinedAt) {
  const start = new Date(Math.max(new Date(challenge.starts_at).getTime(), new Date(joinedAt).getTime()));
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
    if (error.code === '23505') { toast('ALREADY ENROLLED.'); loadChallenges(); }
    else toast('ENROL FAILED — ' + error.message.toUpperCase());
    return;
  }
  toast('MISSION ACCEPTED.');
  loadChallenges();
}

/* ---------------- wagers (duels) ---------------- */

async function loadWagers() {
  const list = $('wager-list');
  const { data, error } = await db
    .from('wagers')
    .select(`*, challenger:profiles!wagers_challenger_id_fkey(display_name, avatar), opponent:profiles!wagers_opponent_id_fkey(display_name, avatar)`)
    .order('started_at', { ascending: false })
    .limit(10);

  if (error) {
    list.innerHTML = `<p class="text-[12px] text-red-400 uppercase tracking-wider py-3">${escapeHtml(error.message)}</p>`;
    return;
  }
  state.wagers = data ?? [];
  if (state.wagers.length === 0) {
    list.innerHTML = `<p class="text-[12px] tracking-[0.2em] uppercase text-zinc-400">NO ACTIVE DUELS. CALL SOMEONE OUT.</p>`;
    return;
  }

  list.innerHTML = '';
  for (const w of state.wagers) {
    const { data: rows } = await db
      .from('workouts')
      .select('user_id')
      .in('user_id', [w.challenger_id, w.opponent_id])
      .gte('performed_at', w.started_at)
      .lte('performed_at', w.ends_at);
    const cCount = (rows ?? []).filter((r) => r.user_id === w.challenger_id).length;
    const oCount = (rows ?? []).filter((r) => r.user_id === w.opponent_id).length;
    const ended = new Date(w.ends_at) <= new Date();
    const iAmIn = w.challenger_id === state.user.id || w.opponent_id === state.user.id;

    let verdict = '';
    if (w.status === 'settled' && w.winner_id) {
      const winnerName = w.winner_id === w.challenger_id ? w.challenger?.display_name : w.opponent?.display_name;
      const loserName = w.winner_id === w.challenger_id ? w.opponent?.display_name : w.challenger?.display_name;
      verdict = `<p class="text-[12px] tracking-[0.2em] uppercase mt-3"><span class="text-volt font-bold">${escapeHtml(String(winnerName).toUpperCase())} TAKES IT</span> <span class="text-zinc-400">— ${escapeHtml(String(loserName).toUpperCase())} OWES: ${escapeHtml(w.penalty.toUpperCase())}</span></p>`;
    } else if (ended && iAmIn) {
      verdict = `
        <button data-settle="${w.id}" data-winner="${cCount === oCount ? '' : (cCount > oCount ? w.challenger_id : w.opponent_id)}"
          class="w-full border border-volt text-volt text-[12px] font-bold tracking-[0.25em] uppercase py-3 mt-3 active:translate-y-0.5 active:bg-volt active:text-ink transition duration-75">
          ${cCount === oCount ? 'DRAW — CLOSE DUEL' : 'SETTLE — CALL THE WINNER'}
        </button>`;
    } else if (ended) {
      verdict = `<p class="text-[12px] tracking-[0.2em] uppercase text-zinc-400 mt-3">DUEL CLOSED — AWAITING SETTLEMENT.</p>`;
    }

    list.insertAdjacentHTML('beforeend', `
      <div class="border border-zinc-800 bg-ink p-4 rise">
        <div class="flex items-center justify-between text-sm font-display uppercase font-semibold">
          <span class="truncate">${escapeHtml(w.challenger?.display_name ?? '???')} <span class="text-volt">${cCount}</span></span>
          <span class="text-[11px] text-zinc-400 tracking-widest px-1">VS</span>
          <span class="truncate text-right">${escapeHtml(w.opponent?.display_name ?? '???')} <span class="text-volt">${oCount}</span></span>
        </div>
        <div class="flex justify-between h-1.5 mt-2.5">
          <div class="bg-volt" style="width:${cCount + oCount > 0 ? Math.round((cCount / (cCount + oCount)) * 100) : 50}%"></div>
          <div class="bg-zinc-700 flex-1"></div>
        </div>
        <p class="text-[11px] tracking-[0.2em] uppercase text-zinc-400 mt-2.5">PENALTY: ${escapeHtml(w.penalty.toUpperCase())} — ENDS ${new Date(w.ends_at).toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()}</p>
        ${verdict}
      </div>`);
  }

  list.querySelectorAll('[data-settle]').forEach((btn) => {
    btn.addEventListener('click', () => settleWager(btn.dataset.settle, btn.dataset.winner || null));
  });
}

async function settleWager(wagerId, winnerId) {
  const update = { status: 'settled' };
  if (winnerId) update.winner_id = winnerId;
  const { error } = await db.from('wagers').update(update).eq('id', wagerId);
  if (error) { toast('SETTLE FAILED — ' + error.message.toUpperCase()); return; }
  toast(winnerId ? 'DUEL SETTLED. PENALTY STANDS.' : 'DUEL CLOSED — DRAW.');
  loadWagers();
}

async function createWager() {
  const name = $('wager-name').value.trim();
  const penalty = $('wager-penalty').value.trim() || 'BUY THE CREW SMOOTHIES';
  if (!name) { toast('NAME YOUR OPPONENT FIRST.'); return; }

  const { data, error } = await db
    .from('profiles').select('id, display_name').ilike('display_name', name);
  if (error) { toast('LOOKUP FAILED — ' + error.message.toUpperCase()); return; }
  const match = (data ?? []).find((p) => p.display_name.toLowerCase() === name.toLowerCase());
  if (!match) { toast('NO OPERATOR WITH THAT CALLSIGN ON THE BOARD.'); return; }
  if (match.id === state.user.id) { toast('YOU CANNOT DUEL YOURSELF.'); return; }

  const { error: insertError } = await db
    .from('wagers')
    .insert({ challenger_id: state.user.id, opponent_id: match.id, penalty });
  if (insertError) { toast('DUEL FAILED — ' + insertError.message.toUpperCase()); return; }

  $('wager-name').value = '';
  $('wager-penalty').value = '';
  toast('DUEL LOCKED. 7 DAYS. GO.');
  loadWagers();
}

/* ---------------- event simulator ---------------- */

function renderEvent() {
  const raw = localStorage.getItem('gc_event');
  const out = $('event-out');
  if (!raw) { out.innerHTML = ''; return; }
  const ev = JSON.parse(raw);
  if (!ev.date) { out.innerHTML = ''; return; }
  const target = new Date(ev.date + 'T07:00:00');
  const days = Math.ceil((target - new Date()) / 86400000);
  if (days < 0) {
    out.innerHTML = `<p class="text-[12px] tracking-[0.25em] uppercase text-zinc-400">${escapeHtml(ev.name.toUpperCase())} — RACE DAY PASSED. SET A NEW ONE.</p>`;
    return;
  }
  out.innerHTML = `
    <div class="border border-volt bg-volt/5 p-4 text-center">
      <p class="text-[11px] tracking-[0.3em] uppercase text-zinc-400">${escapeHtml(ev.name.toUpperCase())}</p>
      <p class="font-display font-bold text-5xl text-volt leading-none mt-2">T-${days}</p>
      <p class="text-[11px] tracking-[0.25em] uppercase text-zinc-400 mt-2">${Math.max(1, Math.ceil(days / 7))} WEEK(S) OUT — BANK THE SESSIONS NOW</p>
    </div>`;
}

function saveEvent() {
  const name = $('event-name').value.trim();
  const date = $('event-date').value;
  if (!name || !date) { toast('EVENT NAME + DATE REQUIRED.'); return; }
  localStorage.setItem('gc_event', JSON.stringify({ name, date }));
  toast('COUNTDOWN SET.');
  renderEvent();
}

/* ---------------- fuel tab ---------------- */

async function loadFuel() {
  loadHydration();
  loadSleep();
  loadMeals();
}

async function loadHydration() {
  const grid = $('hydration-grid');
  const { data, error } = await db.from('hydration').select('taps').eq('day', dayISO()).maybeSingle();
  const taps = error ? 0 : (data?.taps ?? 0);
  $('hydration-count').textContent = taps;
  grid.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.dataset.slot = i;
    cell.textContent = '500ml';
    cell.className = `h-14 border text-[11px] tracking-[0.15em] uppercase transition duration-75 ${
      i < taps ? 'border-volt bg-volt/15 text-volt' : 'border-zinc-800 bg-ink text-zinc-400'
    }`;
    cell.addEventListener('click', () => setHydration(i + 1 === taps ? i : i + 1));
    grid.appendChild(cell);
  }
}

async function setHydration(count) {
  const { error } = await db
    .from('hydration')
    .upsert({ user_id: state.user.id, day: dayISO(), taps: count });
  if (error) { toast('HYDRATION LOG FAILED — ' + error.message.toUpperCase()); return; }
  loadHydration();
}

async function loadSleep() {
  const { data, error } = await db.from('sleep_logs').select('hours').eq('day', dayISO()).maybeSingle();
  if (!error && data?.hours != null) {
    $('sleep-slider').value = data.hours;
    renderSleep(data.hours);
  } else {
    renderSleep(Number($('sleep-slider').value));
  }
}

function renderSleep(hours) {
  $('sleep-val').textContent = Number(hours).toFixed(1);
  const readiness = Math.max(0, Math.min(100, Math.round(100 - Math.abs(8 - Number(hours)) * 12)));
  const label = readiness >= 80 ? 'PRIMED' : readiness >= 55 ? 'OPERATIONAL' : readiness >= 30 ? 'COMPROMISED' : 'DEBT CRITICAL';
  $('sleep-out').innerHTML = `
    <div class="flex justify-between text-[12px] font-bold uppercase tracking-[0.2em] mb-2">
      <span class="${readiness >= 55 ? 'text-volt' : 'text-red-400'}">READINESS ${label}</span>
      <span class="text-zinc-400">${readiness}%</span>
    </div>
    <div class="h-2 bg-ink border border-zinc-800">
      <div class="h-full ${readiness >= 55 ? 'bg-volt' : 'bg-red-500'} transition-all duration-500" style="width:${readiness}%"></div>
    </div>`;
}

async function logSleep() {
  const hours = Number($('sleep-slider').value);
  const { error } = await db.from('sleep_logs').upsert({ user_id: state.user.id, day: dayISO(), hours });
  if (error) { toast('SLEEP LOG FAILED — ' + error.message.toUpperCase()); return; }
  toast('SLEEP LOGGED. RECOVERY COUNTS AS TRAINING.');
  renderSleep(hours);
}

async function loadMeals() {
  const list = $('meal-list');
  const { data, error } = await db
    .from('meals').select('*').eq('day', dayISO()).order('created_at', { ascending: true });
  if (error) {
    list.innerHTML = `<p class="text-[12px] text-red-400 uppercase tracking-wider py-3">${escapeHtml(error.message)}</p>`;
    return;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    list.innerHTML = `<p class="text-[12px] tracking-[0.2em] uppercase text-zinc-400">NOTHING PINNED. FUEL THE MACHINE.</p>`;
    return;
  }
  list.innerHTML = rows
    .map((m) => `
      <div class="flex items-center gap-2 border border-zinc-800 px-3 py-2.5">
        <button data-mealtoggle="${m.id}" data-done="${m.done ? '1' : ''}"
          class="w-5 h-5 shrink-0 border text-[12px] leading-none flex items-center justify-center transition duration-75 ${m.done ? 'border-volt bg-volt text-ink font-bold' : 'border-zinc-600 text-transparent'}">✓</button>
        <p class="flex-1 text-xs tracking-wide ${m.done ? 'text-zinc-400 line-through' : ''}">${escapeHtml(m.body)}</p>
        <button data-mealdel="${m.id}" class="text-[11px] tracking-[0.15em] text-zinc-400 hover:text-red-500 uppercase transition duration-75">DEL</button>
      </div>`)
    .join('');

  list.querySelectorAll('[data-mealtoggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.from('meals').update({ done: btn.dataset.done !== '1' }).eq('id', btn.dataset.mealtoggle);
      loadMeals();
    });
  });
  list.querySelectorAll('[data-mealdel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await db.from('meals').delete().eq('id', btn.dataset.mealdel);
      loadMeals();
    });
  });
}

async function addMeal() {
  const body = $('meal-input').value.trim();
  if (!body) { toast('NAME THE MEAL FIRST.'); return; }
  const { error } = await db.from('meals').insert({ user_id: state.user.id, body, day: dayISO() });
  if (error) { toast('MEAL LOG FAILED — ' + error.message.toUpperCase()); return; }
  $('meal-input').value = '';
  loadMeals();
}

/* ---------------- profile tab ---------------- */

async function loadProfileData() {
  $('header-avatar').textContent = state.profile?.avatar ?? '';
  $('profile-avatar').textContent = state.profile?.avatar ?? '';
  $('profile-name').textContent = state.profile?.display_name ?? '';
  $('profile-goal').textContent = state.profile?.fitness_goal ?? '';
  $('profile-email').textContent = state.user?.email ?? '';

  updateStatLabels();

  if (state.workouts.length === 0) {
    const { count, error } = await db
      .from('workouts').select('*', { count: 'exact', head: true }).eq('user_id', state.user.id);
    if (!error && state.workouts.length === 0) $('stat-total').textContent = count ?? 0;
  }

  renderXp();
  renderBadges();
  loadGear();
}

function renderXp() {
  const xp = xpTotal();
  const level = rankFor(xp);
  const next = LEVELS[LEVELS.indexOf(level) + 1] ?? null;
  const pct = next ? Math.round(((xp - level[0]) / (next[0] - level[0])) * 100) : 100;
  const sessionsToNext = next ? Math.ceil((next[0] - xp) / 10) : 0;
  $('xp-label').textContent = `RANK: ${level[1]}`;
  $('xp-count').textContent = `${xp} XP${next ? ` — ${sessionsToNext} SESSION${sessionsToNext === 1 ? '' : 'S'} TO ${next[1]}` : ' — MAXED'}`;
  $('xp-bar').style.width = `${pct}%`;
}

function renderBadges() {
  const sunrise = state.workouts.some((w) => {
    const t = new Date(w.performed_at);
    return t.getHours() + t.getMinutes() / 60 < 5.5;
  });
  const graveyard = state.workouts.some((w) => {
    const t = new Date(w.performed_at);
    return t.getHours() >= 21;
  });
  const streak = weeklyStreak(state.workouts);
  const prs = state.workouts.filter((w) => w.is_pr).length;

  const badges = [
    sunrise ? ['☀️ 4AM SUNRISE CLUB', 'text-volt border-volt'] : null,
    graveyard ? ['🌙 GRAVEYARD SHIFT', 'text-zinc-300 border-zinc-500'] : null,
    streak >= 2 ? [`🔥 ${streak}-WEEK STREAK`, 'text-volt border-volt'] : null,
    prs > 0 ? [`⚡ ${prs} PR${prs === 1 ? '' : 'S'}`, 'text-ink bg-volt border-volt font-bold'] : null
  ].filter(Boolean);

  $('badges-row').innerHTML = badges.length === 0
    ? `<p class="text-[12px] tracking-[0.25em] uppercase text-zinc-400 border border-dashed border-zinc-800 px-3 py-2">NO BADGES YET — LOG BEFORE 05:30 OR AFTER 21:00 TO START COLLECTING.</p>`
    : badges.map(([label, cls]) => `<span class="text-[11px] tracking-[0.2em] uppercase border ${cls} px-2.5 py-1.5">${label}</span>`).join('');
}

/* ---------------- gear mileage ---------------- */

async function loadGear() {
  const list = $('gear-list');
  const { data, error } = await db.from('gear').select('*').order('created_at', { ascending: true });
  if (error) {
    list.innerHTML = `<p class="text-[12px] text-red-400 uppercase tracking-wider py-3">${escapeHtml(error.message)}</p>`;
    return;
  }
  state.gear = data ?? [];

  // repopulate the register form's gear picker
  const sel = $('reg-gear');
  const current = sel.value;
  sel.innerHTML = '<option class="bg-panel" value="">NONE</option>' +
    state.gear.map((g) => `<option class="bg-panel" value="${g.id}">${escapeHtml(g.name.toUpperCase())}</option>`).join('');
  if (state.gear.some((g) => g.id === current)) sel.value = current;

  if (state.gear.length === 0) {
    list.innerHTML = `<p class="text-[12px] tracking-[0.2em] uppercase text-zinc-400">NO GEAR REGISTERED.</p>`;
    return;
  }

  list.innerHTML = state.gear
    .map((g) => {
      const logged = state.workouts
        .filter((w) => w.gear_id === g.id && w.distance_km)
        .reduce((sum, w) => sum + Number(w.distance_km), 0);
      const total = Number(g.start_km) + logged;
      const pct = Math.min(100, Math.round((total / GEAR_RETIRE_KM) * 100));
      return `
      <div class="border border-zinc-800 px-4 py-3 rise">
        <div class="flex items-center justify-between gap-2">
          <p class="font-display uppercase font-semibold text-sm truncate">${g.kind === 'bike' ? '🚴' : g.kind === 'other' ? '⚙️' : '👟'} ${escapeHtml(g.name)}</p>
          <span class="text-[11px] tracking-[0.2em] uppercase ${total >= GEAR_RETIRE_KM ? 'text-red-400' : 'text-zinc-400'}">${total.toFixed(0)} / ${GEAR_RETIRE_KM} KM</span>
        </div>
        <div class="h-1.5 bg-ink border border-zinc-800 mt-2">
          <div class="h-full ${total >= GEAR_RETIRE_KM ? 'bg-red-500' : 'bg-volt'}" style="width:${pct}%"></div>
        </div>
        ${total >= GEAR_RETIRE_KM ? '<p class="text-[11px] tracking-[0.2em] uppercase text-red-400 mt-1.5">RETIRED — BUY NEW TOYS.</p>' : ''}
      </div>`;
    })
    .join('');
}

async function addGear() {
  const name = $('gear-name').value.trim();
  const kind = $('gear-kind').value;
  const start = Number($('gear-start').value || 0);
  if (!name) { toast('NAME YOUR GEAR FIRST.'); return; }
  const { error } = await db.from('gear').insert({ user_id: state.user.id, name, kind, start_km: start });
  if (error) { toast('GEAR LOG FAILED — ' + error.message.toUpperCase()); return; }
  $('gear-name').value = '';
  $('gear-start').value = '';
  toast('GEAR REGISTERED. TRACK THE KILOMETRES.');
  loadGear();
}

/* ---------------- profile share card ---------------- */

function generateShareCard() {
  const canvas = $('share-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const weekStart = startOfLocalWeek();
  const weekCount = state.workouts.filter((w) => new Date(w.performed_at) >= weekStart).length;
  const prs = state.workouts.filter((w) => w.is_pr).length;
  const streak = weeklyStreak(state.workouts);
  const xp = xpTotal();
  const level = rankFor(xp);

  ctx.fillStyle = '#0D0D0D';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#CCFF00';
  ctx.fillRect(0, 0, W, 14);
  ctx.fillRect(0, H - 14, W, 14);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 58px Oswald, Impact, sans-serif';
  ctx.fillText('GYM/CREW', 48, 96);
  ctx.fillStyle = '#CCFF00';
  ctx.font = '500 20px "JetBrains Mono", monospace';
  ctx.fillText('/// PERFORMANCE LOGBOOK', 48, 134);

  ctx.fillStyle = '#ffffff';
  ctx.font = '400 130px serif';
  ctx.fillText(state.profile?.avatar ?? '💪', 48, 320);
  ctx.font = '700 64px Oswald, Impact, sans-serif';
  ctx.fillText((state.profile?.display_name ?? 'OPERATOR').toUpperCase(), 48, 420);
  ctx.fillStyle = '#CCFF00';
  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.fillText(`RANK: ${level[1]} — ${xp} XP`, 48, 462);

  const stats = [
    [String(state.workouts.length), 'CAREER'],
    [String(weekCount), 'THIS WEEK'],
    [String(streak), 'STREAK'],
    [String(prs), 'PRS']
  ];
  stats.forEach(([value, label], i) => {
    const x = 48 + i * 160;
    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 530, 140, 150);
    ctx.fillStyle = '#CCFF00';
    ctx.font = '700 56px Oswald, Impact, sans-serif';
    ctx.fillText(value, x + 20, 620);
    ctx.fillStyle = '#71717a';
    ctx.font = '500 16px "JetBrains Mono", monospace';
    ctx.fillText(label, x + 20, 660);
  });

  ctx.fillStyle = '#71717a';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.fillText('EVERY REP ON RECORD — ' + new Date().toLocaleDateString().toUpperCase(), 48, H - 48);

  canvas.classList.remove('hidden');
  $('share-btn').textContent = 'REGENERATE CARD';
}

function downloadShareCard() {
  const canvas = $('share-canvas');
  canvas.toBlob((blob) => {
    if (!blob) { toast('EXPORT FAILED — SCREENSHOT THE CARD.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gym-crew-card.png';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('CARD SAVED — GO POST IT.');
  }, 'image/png');
}

/* ---------------- CSV export ---------------- */

function exportCSV() {
  if (state.workouts.length === 0) { toast('NOTHING TO EXPORT YET.'); return; }
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'date,time,entry,tags,rpe,fatigue,duration_min,distance_km,elevation_m,moving_time_min,is_pr';
  const rows = state.workouts.map((w) => {
    const d = new Date(w.performed_at);
    return [
      esc(d.toLocaleDateString()),
      esc(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      esc(w.exercise_name),
      esc((w.tags || []).join('; ')),
      w.rpe ?? '',
      esc((w.fatigue || []).join('; ')),
      w.duration_min ?? '',
      w.distance_km ?? '',
      w.elevation_m ?? '',
      w.moving_time_min ?? '',
      w.is_pr ? 'yes' : 'no'
    ].join(',');
  });
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-crew-log-${dayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV EXPORTED.');
}

/* ---------------- realtime ---------------- */

let realtimeChannel = null;

function subscribeRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = db
    .channel('gym-crew-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, () => {
      loadStatus();
      loadCrew();
      if (state.currentTab === 'missions') loadMissions();
      if (state.currentTab === 'profile') loadProfileData();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'challenge_participants' }, () => {
      if (state.currentTab === 'missions') loadMissions();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => {
      if (state.currentTab === 'crew') loadCrewFeed();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fist_bumps' }, () => {
      if (state.currentTab === 'crew') loadCrewFeed();
    })
    .subscribe();
}

/* ---------------- wiring ---------------- */

document.addEventListener('DOMContentLoaded', () => {
  // auth + setup
  $('tab-btn-login').addEventListener('click', () => setAuthMode('login'));
  $('tab-btn-signup').addEventListener('click', () => setAuthMode('signup'));
  $('auth-form').addEventListener('submit', handleAuthSubmit);
  $('setup-form').addEventListener('submit', handleSetupSubmit);
  $('btn-signout').addEventListener('click', signOut);
  $('btn-refresh-profile').addEventListener('click', () => {
    $('setup-name').value = state.profile?.display_name ?? '';
    $('setup-goal').value = state.profile?.fitness_goal ?? 'General Fitness';
    setSelectedAvatar(state.profile?.avatar ?? '💪');
    setError('setup-error', null);
    showScreen('screen-setup');
  });

  // register work
  $('reg-form').addEventListener('submit', handleRegisterSubmit);
  $('reg-form').addEventListener('input', startSessionClock);
  document.querySelectorAll('.tag-chip').forEach((btn) => {
    btn.addEventListener('click', () => toggleChip(state.tags, btn, chipOn(btn), chipOff(btn)));
  });
  document.querySelectorAll('.fatigue-chip').forEach((btn) => {
    btn.addEventListener('click', () => toggleChip(state.fatigue, btn, chipOn(btn), chipOff(btn)));
  });
  $('endurance-toggle').addEventListener('click', () => {
    const zone = $('endurance-fields');
    const open = zone.classList.toggle('hidden') === false;
    $('endurance-caret').textContent = open ? '－' : '＋';
  });
  $('rpe-slider').addEventListener('input', () => { $('rpe-val').textContent = $('rpe-slider').value; });

  // plate math
  $('plate-target').addEventListener('input', () => {
    const v = Number($('plate-target').value);
    $('plate-out').textContent = $('plate-target').value === '' ? '' : plateMath(v);
  });
  $('plate-out').textContent = plateMath(100);

  // streak + drop score
  $('drop-score-btn').addEventListener('click', copyDropScore);

  // missions
  $('wager-create').addEventListener('click', createWager);
  $('event-save').addEventListener('click', saveEvent);

  // fuel
  $('sleep-slider').addEventListener('input', () => renderSleep(Number($('sleep-slider').value)));
  $('sleep-log').addEventListener('click', logSleep);
  $('meal-add').addEventListener('click', addMeal);
  $('meal-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMeal(); });

  // profile + system
  $('gear-add').addEventListener('click', addGear);
  $('share-btn').addEventListener('click', generateShareCard);
  $('share-canvas').addEventListener('dblclick', downloadShareCard);
  $('csv-btn').addEventListener('click', exportCSV);
  $('amoled-btn').addEventListener('click', toggleAmoled);

  // tabs
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // rest timer
  document.querySelectorAll('.rest-preset').forEach((btn) => {
    btn.addEventListener('click', () => startRest(Number(btn.dataset.sec)));
  });
  $('rest-skip').addEventListener('click', endRest);
  $('rankup-ok').addEventListener('click', () => hide('rankup-overlay'));

  // tactile haptic on every tap target
  document.addEventListener('click', (e) => {
    if (e.target.closest('button')) {
      try { navigator.vibrate && navigator.vibrate(8); } catch { /* no vibration */ }
    }
  });

  buildAvatarPicker();
  setAuthMode('login');
  applyAmoled();
  boot();
});
