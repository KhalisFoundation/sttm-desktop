// Performance tiers: how much model work Voice-Follow schedules per second of audio.
//
// A computer that decodes slower than real time falls behind the room; the audio queue is
// bounded (VoiceFollow AUDIO_BACKLOG_S) so it cannot run away, but the screen still sits
// up to that bound behind the reader. These tiers cut the work instead, so the engines
// keep up and the screen stays on the reader's line:
//
//   fast  follower every 0.25 s, recognizer every 0.5 s, each on its own clock (6 passes / s)
//   sync  the same, but the follower decodes on the recognizer's beat: both see the same
//         window, which the model runs once (Infer memo), on 2.5 s windows (0.6x the cost)
//         -> 2.5 pass-equivalents / s. Tiers apply only while a READ Bani is followed.
//   lean  follower every 0.5 s on the recognizer's beat (2 passes / s)
//   min   follower and recognizer every 1 s (1 pass / s), audio bound 0.5 s
//   crawl follower and recognizer every 2 s (0.5 pass / s), the 10 s search window every 4 s
//
// 'fast' is exactly today's schedule and code path (own clocks, 4 s windows, no memo): a
// computer that keeps up runs byte-identical to the build without tiers. The tier is
// picked by a short self-test when the model loads (median pass time on a 4 s window) and
// then stepped live: down when the audio backlog stays above BEHIND_S, up when the measured
// pass time leaves clear headroom for the faster tier. VF_TIER=fast|lean|min pins it.
//
// Engines ask hopS(kind, ownHopS) at every push, so a step takes effect at the next window;
// the paath follower scales its window-counted dwells so they keep their wall-clock meaning.
const os = require('os');

const TIERS = [
  {
    name: 'fast',
    followerHopS: 0.25,
    recognizerHopS: 0.5,
    aligned: false,
    passesPerS: 6,
    backlogBoundS: 1.0,
  },
  {
    name: 'sync',
    followerHopS: 0.25,
    recognizerHopS: 0.5,
    aligned: true,
    windowS: 2.5, // read-Bani paath follower windows (model cost is linear in the window: 0.6x)
    passesPerS: 2.5, // 4 passes / s on 2.5 s windows shared by recognizer and paath follower
    backlogBoundS: 1.0,
  },
  {
    name: 'lean',
    followerHopS: 0.5,
    recognizerHopS: 0.5,
    aligned: true,
    passesPerS: 2,
    backlogBoundS: 1.0,
  },
  {
    name: 'min',
    followerHopS: 1.0,
    recognizerHopS: 1.0,
    aligned: true,
    passesPerS: 1,
    backlogBoundS: 0.5,
  },
  {
    // A computer the model itself runs slower than real time on (a 2011 desktop, a 2015 Core i3:
    // 1.4-1.6 s per 4 s window): one pass per 2 s of audio, the 10 s search window every 4 s.
    name: 'crawl',
    followerHopS: 2.0,
    recognizerHopS: 2.0,
    searchHopS: 4.0,
    aligned: true,
    passesPerS: 0.5,
    backlogBoundS: 0.5,
  },
];
// Akhand Paath (Sri Guru Granth Sahib Ji read Ang after Ang; the component says so per audio
// chunk, see setAkhand). Every tier: the switch judge's recognizer listens once a second
// (less model work, so less audio backlog; leaving the reading is still caught). A computer
// in the fast tier with room for it (passesPerS at its live pass time): the reading follower
// listens every 0.125 s on its usual 4 s window (replays: median lag 0.40 -> 0.29 s, pangti
// accuracy no lower; a 2.5 s window cost accuracy). Otherwise the tier's own follower step.
const AKHAND = { followerHopS: 0.125, recognizerHopS: 1.0, passesPerS: 9 };
const LOAD_MAX = 0.8; // a tier fits when passes/s x pass seconds stays under this
const LOAD_UP = 0.7; // ...and stepping back up into it needs this much headroom
const RETRY_MS = 300000; // a tier left because the audio backed up is not re-entered for 5 min
const BEHIND_S = 0.5; // backlog above this...
const BEHIND_MS = 3000; // ...for this long = step down
const HEADROOM_MS = 30000; // headroom for the faster tier for this long = step up
const HOLD_MS = 10000; // no second step sooner than this
const RECENT = 8; // model passes the live pass-time estimate uses
// Kirtan (a Shabad followed while it is sung, or a sung Bani): a computer that cannot keep up
// keeps the engines' own 4 s windows (the switch judge is tuned on them; a 2.5 s window cost
// switches) and puts the follower on the recognizer's 0.5 s beat, so both read the same window
// and one model pass answers both (Infer memo). 'fast' stays exactly as before.
const KIRTAN = {
  sync: {
    name: 'kirtan-lean',
    followerHopS: 0.5,
    recognizerHopS: 0.5,
    aligned: true,
    passesPerS: 2,
    backlogBoundS: 1.0,
  },
  lean: {
    name: 'kirtan-lean',
    followerHopS: 0.5,
    recognizerHopS: 0.5,
    aligned: true,
    passesPerS: 2,
    backlogBoundS: 1.0,
  },
  min: {
    name: 'kirtan-min',
    followerHopS: 1.0,
    recognizerHopS: 1.0,
    aligned: true,
    passesPerS: 1,
    backlogBoundS: 0.5,
  },
  crawl: {
    name: 'kirtan-crawl',
    followerHopS: 2.0,
    recognizerHopS: 2.0,
    searchHopS: 4.0,
    aligned: true,
    passesPerS: 0.5,
    backlogBoundS: 0.5,
  },
};
// Kirtan starts at fast (see measure) unless the self-test picks a tier from here on: a computer
// that cannot run even two passes a second would only drop audio until the backlog stepped it.
const KIRTAN_SELF_TEST_FROM = TIERS.findIndex((t) => t.name === 'min');
// Kirtan step-down: a backlog that saw-tooths (merges reset it) never stays above BEHIND_S for
// BEHIND_MS in a row, so in kirtan a step also follows when it was above BEHIND_S in at least
// KIRTAN_BEHIND_SHARE of the samples of the last KIRTAN_BEHIND_MS.
const KIRTAN_BEHIND_MS = 10000;
const KIRTAN_BEHIND_SHARE = 0.4;

const state = {
  tiers: { read: 0, kirtan: 0 }, // tier index per scope: a kirtan step never moves read Banis
  pinned: null,
  passMs: null, // self-test median
  recent: [],
  behindSince: null,
  headroomSince: null,
  steppedAt: { read: 0, kirtan: 0 },
  steps: 0,
  scoped: false, // see current()
  scope: 'read', // 'read' (a read Bani) or 'kirtan' (a Shabad or Bani being sung), see setScoped
  samples: [], // kirtan: [ms, behind?] backlog samples of the last KIRTAN_BEHIND_MS
  akhand: false, // Akhand Paath being followed (see setAkhand)
  selfTest: null,
  blockedUntil: { read: {}, kirtan: {} }, // per scope, tier index -> ms: left because of backlog
  listeners: new Set(),
};
// Experiment only (benchmarks): a shorter following window in the aligned tiers, so a pass
// costs less. Unset = the engines' own windows.
const FOLLOW_WINDOW_S = Number(process.env.VF_FOLLOW_WINDOW_S || 0) || null;

{
  const pin = (process.env.VF_TIER || '').toLowerCase();
  const i = TIERS.findIndex((t) => t.name === pin);
  if (i >= 0) {
    state.pinned = i;
    state.tiers = { read: i, kirtan: i };
  }
}

// Scope: the tiers apply only while the paath follower follows a READ Bani (the component
// says so per audio chunk). Searching, kirtan Shabads and sung Banis always run the fast tier =
// the code path without tiers (the bounded audio queue still protects a slow PC there).
// The schedule tier index i runs in a scope (kirtan maps the slow tiers onto KIRTAN).
const tierFor = (i, scope) => (scope === 'kirtan' && KIRTAN[TIERS[i].name]) || TIERS[i];
const current = () => (state.scoped ? tierFor(state.tiers[state.scope], state.scope) : TIERS[0]);
// The next index from i in direction dir (+1 slower, -1 faster) that changes the schedule in
// this scope (kirtan's sync and lean are the same schedule: no empty step between them).
function nextTier(i, dir, scope) {
  let j = i + dir;
  while (j > 0 && j < TIERS.length - 1 && tierFor(j, scope).name === tierFor(i, scope).name)
    j += dir;
  return j;
}
// Akhand Paath fast listening: only while scoped (a read text is followed), flagged by the
// component, and only in the fast tier (a slower tier keeps its schedule and its safety).
const akhandOn = () => !!(state.scoped && state.akhand);
const akhandFast = () => akhandOn() && current().name === 'fast' && fits(AKHAND, livePassMs()); // eslint-disable-line no-use-before-define
function setAkhand(on) {
  state.akhand = !!on;
}
function setScoped(on, scope = 'read') {
  const next = scope === 'kirtan' ? 'kirtan' : 'read';
  if (next !== state.scope) {
    // each scope keeps its own tier; its timers and samples start over
    state.samples = [];
    state.behindSince = null;
    state.headroomSince = null;
  }
  state.scope = next;
  state.scoped = !!on;
  if (!state.scoped) {
    state.samples = [];
    state.behindSince = null;
    state.headroomSince = null;
  }
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const livePassMs = () => (state.recent.length >= 3 ? median(state.recent) : state.passMs);
const fits = (tier, passMs, max = LOAD_MAX) =>
  passMs != null && (tier.passesPerS * passMs) / 1000 <= max;

function describe() {
  return {
    tier: TIERS[state.tiers.read].name, // the tier this computer runs a read Bani at
    kirtanTier: tierFor(state.tiers.kirtan, 'kirtan').name, // ...and kirtan / a sung Bani at
    active: akhandFast() ? 'akhand' : current().name, // what runs now (fast outside a read Bani)
    passMs: livePassMs() == null ? null : Math.round(livePassMs()),
    selfTestMs: state.passMs == null ? null : Math.round(state.passMs),
    steps: state.steps,
    pinned: state.pinned != null,
    cpu: (os.cpus()[0] || {}).model || '',
    cores: os.cpus().length,
  };
}

function setTier(i, reason, extra = {}, scope = state.scope, nowMs = Date.now()) {
  const from = tierFor(state.tiers[scope], scope).name;
  state.tiers[scope] = i;
  state.steps += 1;
  state.steppedAt[scope] = nowMs;
  state.behindSince = null;
  state.headroomSince = null;
  const ev = { from, to: tierFor(i, scope).name, scope, reason, ...extra, ...describe() };
  state.listeners.forEach((fn) => {
    try {
      fn(ev);
    } catch (_) {
      /* a listener must never disturb the engines */
    }
  });
  return ev;
}

// Real model passes report here (Infer.emissions); memo hits do not. The cost is kept as
// the cost of a 4 s window (the model is linear in the window), so a tier's fit does not
// depend on which window the current tier happens to use.
function notePass(ms, samples) {
  const ms4 = samples > 0 ? (ms * 4 * 16000) / samples : ms;
  state.recent.push(ms4);
  if (state.recent.length > RECENT) state.recent.shift();
}

// Hop for an engine: its own hop, or the tier's when that is longer.
function hopS(kind, ownHopS) {
  if (kind === 'akhand') return akhandFast() ? AKHAND.followerHopS : hopS('follower', ownHopS);
  if (kind === 'recognizer' && akhandOn()) {
    return Math.max(ownHopS, current().recognizerHopS, AKHAND.recognizerHopS);
  }
  const t = current();
  let tierHop = kind === 'follower' ? t.followerHopS : t.recognizerHopS;
  if (kind === 'search') tierHop = t.searchHopS || t.recognizerHopS; // the 10 s searching window
  return Math.max(ownHopS, tierHop);
}

function backlogBoundS() {
  return current().backlogBoundS;
}

// Window for an engine (seconds): its own, unless the experiment above shortens the
// following windows (<= 4 s; the 10 s searching window is never touched) in an aligned tier.
// The tiers are in scope only while a READ Bani is followed (see current()); there the
// recognizer and the paath follower share the shorter window, so one pass answers both.
function windowS(kind, ownWindowS) {
  if (kind === 'akhand') return windowS('paath', ownWindowS);
  const t = current();
  if (state.scoped && state.scope === 'kirtan') return ownWindowS; // kirtan keeps its windows
  if (kind === 'follower' || !t.aligned || ownWindowS > 4) return ownWindowS;
  return FOLLOW_WINDOW_S || t.windowS || ownWindowS;
}

// The recognizer's beat: the chunk it last decoded on. The component pushes every chunk to
// the recognizer first and then to the follower, so in an aligned tier the follower decodes
// on that same chunk (the same 4 s window: one model pass answers both) and, between beats,
// on its own hop counted from the beat.
let beat = null;
function markBeat(pcm) {
  beat = pcm;
}
function onBeat(pcm) {
  return current().aligned && pcm === beat;
}

async function measure(infer, passes, warm) {
  const SR = 16000;
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  const ms = [];
  for (let k = 0; k < warm + passes; k += 1) {
    const buf = new Float32Array(4 * SR);
    for (let i = 0; i < buf.length; i += 1) buf[i] = rnd() * 0.1;
    const t = performance.now();
    // eslint-disable-next-line no-await-in-loop
    await infer.emissions(buf);
    if (k >= warm) ms.push(performance.now() - t);
  }
  state.passMs = median(ms);
  state.recent = [];
  let pick = TIERS.length - 1;
  for (let i = 0; i < TIERS.length; i += 1) {
    if (fits(TIERS[i], state.passMs)) {
      pick = i;
      break;
    }
  }
  if (state.pinned != null) pick = state.pinned;
  state.selfTest = { passMs: Math.round(state.passMs), tier: TIERS[pick].name };
  // Kirtan starts at fast whatever the self-test says and steps down only on an observed
  // backlog: the switch judge is tuned on the fast schedule, and a computer near the line keeps
  // up there (the bounded audio queue merges brief catch-ups).
  setTier(pick, 'self-test', {}, 'read');
  if (pick >= KIRTAN_SELF_TEST_FROM) setTier(pick, 'self-test', {}, 'kirtan');
  return state.selfTest;
}

// ~1-2 s when the model loads: median pass time on 4 s windows of noise (the model's cost
// does not depend on the audio), the first passes discarded as warm-up. Picks the fastest
// tier that fits. Goes through infer.emissions so a benchmark's slowed engine is seen too.
async function selfTest(infer, { passes = 5, warm = 2 } = {}) {
  if (state.selfTest) return state.selfTest;
  try {
    return await measure(infer, passes, warm);
  } catch (e) {
    // The self-test must never keep the engine from becoming ready: stay on the current tier.
    state.selfTest = { error: String((e && e.message) || e), tier: current().name };
    return state.selfTest;
  }
}

// Called by the audio loop with the seconds of audio waiting for the engines.
function observe(backlogSec, nowMs = Date.now()) {
  if (state.pinned != null || !state.scoped) return null;
  const { scope } = state;
  const i = state.tiers[scope];
  const blocked = state.blockedUntil[scope];
  const held = nowMs - state.steppedAt[scope] < HOLD_MS;
  const down = nextTier(i, +1, scope);
  if (scope === 'kirtan') {
    state.samples.push([nowMs, backlogSec > BEHIND_S]);
    while (state.samples.length && nowMs - state.samples[0][0] > KIRTAN_BEHIND_MS)
      state.samples.shift();
    // Share of the time (not of the samples: they come per audio push) spent behind.
    const n = state.samples.length;
    const span = n ? nowMs - state.samples[0][0] : 0;
    let behindMs = 0;
    for (let k = 0; k + 1 < n; k += 1) {
      if (state.samples[k][1]) behindMs += state.samples[k + 1][0] - state.samples[k][0];
    }
    const share = span > 0 ? behindMs / span : 0;
    if (
      !held &&
      span >= KIRTAN_BEHIND_MS * 0.8 &&
      share >= KIRTAN_BEHIND_SHARE &&
      i < TIERS.length - 1
    ) {
      blocked[i] = nowMs + RETRY_MS;
      state.samples = [];
      return setTier(
        down,
        'behind-share',
        {
          backlogSec: Math.round(backlogSec * 100) / 100,
          share: Math.round(share * 100) / 100,
        },
        scope,
        nowMs,
      );
    }
  }
  if (backlogSec > BEHIND_S) {
    state.headroomSince = null;
    if (state.behindSince == null) state.behindSince = nowMs;
    else if (!held && nowMs - state.behindSince >= BEHIND_MS && i < TIERS.length - 1) {
      blocked[i] = nowMs + RETRY_MS;
      return setTier(
        down,
        'behind',
        { backlogSec: Math.round(backlogSec * 100) / 100 },
        scope,
        nowMs,
      );
    }
    return null;
  }
  state.behindSince = null;
  const passMs = livePassMs();
  const up = i > 0 ? nextTier(i, -1, scope) : 0;
  const open = !(blocked[up] > nowMs);
  if (i > 0 && open && backlogSec < 0.2 && fits(tierFor(up, scope), passMs, LOAD_UP)) {
    if (state.headroomSince == null) state.headroomSince = nowMs;
    else if (!held && nowMs - state.headroomSince >= HEADROOM_MS) {
      return setTier(
        up,
        'headroom',
        { backlogSec: Math.round(backlogSec * 100) / 100 },
        scope,
        nowMs,
      );
    }
  } else state.headroomSince = null;
  return null;
}

function onStep(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

module.exports = {
  TIERS,
  KIRTAN,
  LOAD_MAX,
  current,
  describe,
  notePass,
  setScoped,
  setAkhand,
  AKHAND,
  hopS,
  backlogBoundS,
  windowS,
  markBeat,
  onBeat,
  selfTest,
  observe,
  onStep,
};
