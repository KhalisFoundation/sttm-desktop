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

const state = {
  tier: 0,
  pinned: null,
  passMs: null, // self-test median
  kirtanExtraS: 0, // kirtan guard: extra seconds between recognizer passes
  kirtanSteppedAt: 0,
  kirtanBehindSince: null,
  kirtanClearSince: null,
  recent: [],
  long: [], // last LIVE.passes pass times (4 s-window cost), for the kirtan live trigger
  kirtanLive: false, // kirtan paced because live passes stayed slow (laptops: the self-test runs on turbo)
  kirtanLiveAt: 0,
  behindSince: null,
  headroomSince: null,
  steppedAt: 0,
  steps: 0,
  scoped: false, // see current()
  akhand: false, // Akhand Paath being followed (see setAkhand)
  selfTest: null,
  blockedUntil: {}, // tier index -> ms: left because of backlog, do not re-enter before
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
    state.tier = i;
  }
}

// Scope: the tiers apply only while the paath follower follows a READ Bani (the component
// says so per audio chunk). Searching, kirtan Shabads and sung Banis always run the fast tier =
// the code path without tiers (the bounded audio queue still protects a slow PC there).
const current = () => (state.scoped ? TIERS[state.tier] : TIERS[0]);
// Akhand Paath fast listening: only while scoped (a read text is followed), flagged by the
// component, and only in the fast tier (a slower tier keeps its schedule and its safety).
const akhandOn = () => !!(state.scoped && state.akhand);
const akhandFast = () => akhandOn() && current().name === 'fast' && fits(AKHAND, livePassMs()); // eslint-disable-line no-use-before-define
function setAkhand(on) {
  state.akhand = !!on;
}
function setScoped(on) {
  state.scoped = !!on;
  if (!state.scoped) {
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
    tier: TIERS[state.tier].name, // the tier this computer runs a read Bani at
    active: akhandFast() ? 'akhand' : current().name, // what runs now (fast outside a read Bani)
    passMs: livePassMs() == null ? null : Math.round(livePassMs()),
    selfTestMs: state.passMs == null ? null : Math.round(state.passMs),
    steps: state.steps,
    pinned: state.pinned != null,
    cpu: (os.cpus()[0] || {}).model || '',
    cores: os.cpus().length,
  };
}

function setTier(i, reason, extra = {}) {
  const from = current().name;
  state.tier = i;
  state.steps += 1;
  state.steppedAt = Date.now();
  state.behindSince = null;
  state.headroomSince = null;
  const ev = { from, to: current().name, reason, ...extra, ...describe() };
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
  state.long.push(ms4);
  if (state.long.length > KIRTAN_LIVE.passes) state.long.shift(); // eslint-disable-line no-use-before-define
}

// Hop for an engine: its own hop, or the tier's when that is longer.
// winS: the recognizer's current window in seconds (its search pass costs in proportion).
function hopS(kind, ownHopS, winS) {
  if (kind === 'akhand') return akhandFast() ? AKHAND.followerHopS : hopS('bani', ownHopS);
  if (kind === 'recognizer' && akhandOn()) {
    return Math.max(ownHopS, current().recognizerHopS, AKHAND.recognizerHopS);
  }
  const t = current();
  const tierHop = kind === 'recognizer' ? t.recognizerHopS : t.followerHopS;
  // The Bani follower ('bani': Paath and sung Banis) never takes the kirtan pace; it keeps its
  // own hop outside the read-Bani tiers, exactly as before.
  if (kind === 'bani') return Math.max(ownHopS, tierHop);
  return Math.max(ownHopS, tierHop, kirtanHopS(kind, winS)); // eslint-disable-line no-use-before-define
}

// Kirtan pace. Outside a read Bani the tiers do not apply and every computer runs the fast
// schedule. The 10 s Shabad-search pass costs about 2.5x a 4 s pass; a computer whose search pass
// takes longer than the time between search passes falls behind and stops finding Shabads (Mac
// screens on the fixed simulator, kirtan dev clips: the 0.5 s schedule found 0 of 10 at 270 ms
// and 370 ms per 4 s pass). So the recognizer waits at least searchPass / 0.9 between passes
// (rounded up to 0.25 s, never less than today's 0.5 s): 256 ms -> 0.75 s, 347 ms -> 1 s,
// 505 ms -> 1.5 s, each the best schedule measured at that speed. The line followers then run
// every 0.375 s (same Shabads found as rec / 2, but line lag at i9 level: 3.5-4.3 s vs 5.8 s).
// Every window still overlaps its neighbours. Whether a computer is paced is decided once, from
// the startup self-test: at 250 ms per 4 s pass or faster (e.g. Renton's Ryzen 9, 132-200 ms)
// it keeps exactly today's schedule for the whole session, even while it falls behind or runs
// slower under load. Only computers the self-test classes slow get the paced schedule, and on
// those a live guard adds 0.25 s to the recognizer when the kirtan audio backlog stays above
// 0.5 s (other apps, a hot CPU) and gives it back once it has kept up for a minute.
// With fewer searches, the component keeps a paath Bani's lock evidence per second (searchScale;
// VoiceFollow perSearch), which is what lets Jaap and Japji lock in their first seconds.
// VF_KIRTAN_PACE=0 turns it all off.
const KIRTAN_PACE = process.env.VF_KIRTAN_PACE !== '0';
const SEARCH_COST = 2.5; // 10 s window vs 4 s window (the model is linear in the window)
const SEARCH_WINDOW_S = 10;
// Benchmarks only: VF_KIRTAN_BY_WINDOW=1 paces the search by its current window (off: the
// per-second lock evidence alone lets Jaap and Japji lock, and window pacing cost long kirtan
// clips 81.8 -> 74.2 right at sim 0.48); VF_KIRTAN_EVIDENCE=0 keeps the component's lock
// evidence per search (searchScale 1).
const PACE_BY_WINDOW = process.env.VF_KIRTAN_BY_WINDOW === '1';
const PACE_EVIDENCE = process.env.VF_KIRTAN_EVIDENCE !== '0';
// Benchmarks only: cap the evidence scale (unset = no cap).
const SCALE_MAX = Number(process.env.VF_KIRTAN_SCALE_MAX) || Infinity;
const SEARCH_LOAD = 0.9;
const KIRTAN_FOLLOW_HOP_S = 0.375;
const KIRTAN_GUARD = {
  behindS: 0.5,
  behindMs: 3000,
  clearS: 0.1,
  clearMs: 60000,
  holdMs: 10000,
  stepS: 0.25,
  maxS: 1.0,
};
// Recognizer hop the search pass needs at a given pass time (0.5 = today's schedule).
const searchHopS = (ms, winArg = SEARCH_WINDOW_S) => {
  if (ms == null) return 0.5;
  const winS = PACE_BY_WINDOW ? winArg : SEARCH_WINDOW_S;
  const cost = (SEARCH_COST * ms * Math.min(winS, SEARCH_WINDOW_S)) / SEARCH_WINDOW_S / 1000;
  return Math.max(0.5, Math.ceil((cost / SEARCH_LOAD) * 4 - 1e-9) / 4);
};
// Paced kirtan from the self-test: only above 250 ms per 4 s pass. Renton's Ryzen 9 3900XT
// self-tested 132-200 ms over 33 field sessions (Oct 25-Nov 7), so it must stay on today's schedule
// with a margin; at 180 ms it would have been paced in 3 sessions (and was, in the sim at 0.9x:
// 185 ms). PCs paced at 250: i3-5005U, i7-2600, i5-4200U, i7-4770K, i7-7500U, and some i7-1255U /
// i7-11370H sessions.
const KIRTAN_PACE_MIN_MS = 250;
// ...and only up to 450 ms: at ~505 ms (sim 0.33, i5-6400 class) Japji was lost (100 -> 32) and
// Paath must hold, so the slowest PCs keep today's schedule until that is solved.
// VF_KIRTAN_PACE_MAX_MS overrides it for benchmarks.
const KIRTAN_PACE_MAX_MS = Number(process.env.VF_KIRTAN_PACE_MAX_MS) || 450;
// Live trigger. A laptop's startup self-test runs on a cool CPU at turbo clocks and often reads
// fast (field, Oct 25-Nov 7: 12 of 149 sessions self-tested at <= 180 ms but passed at 200-330 ms
// live and fell behind 100-3000 times). So a computer the self-test called fast is also paced
// once the median of its last ~240 real passes (40 s of fast kirtan) rises above onMs, and then
// stays paced for the session (no flapping). onMs is above the worst 5-minute median Renton's
// Ryzen 9 ever logged (317 ms, 36 sessions), so Renton keeps today's schedule; laptops that slow
// down hard still cross it (worst 5-min medians: Ryzen 5 7520U 516, i5-1335U 443, i5-1235U 435,
// Ultra 7 265U 416, i9-12900H laptop 377, Ultra 7 155U 368 ms). Like the self-test rule it stops at
// KIRTAN_PACE_MAX_MS: a computer slower than that live keeps today's schedule (Japji, see above).
// VF_KIRTAN_LIVE=0 = off.
const KIRTAN_LIVE = {
  on: process.env.VF_KIRTAN_LIVE !== '0',
  passes: 240,
  minPasses: 120,
  onMs: Number(process.env.VF_KIRTAN_LIVE_MS || 0) || 330,
};
const longMedianMs = () => (state.long.length >= KIRTAN_LIVE.minPasses ? median(state.long) : null);
function observeKirtanLive(nowMs) {
  if (!KIRTAN_LIVE.on || !KIRTAN_PACE) return;
  if (state.kirtanLive) return;
  const m = longMedianMs();
  if (m != null && m > KIRTAN_LIVE.onMs && m <= KIRTAN_PACE_MAX_MS) {
    state.kirtanLive = true;
    state.kirtanLiveAt = nowMs;
    // Logged like a tier step (perf_tier, reason 'kirtan-live') so field sessions and benches
    // see when and at what live speed the trigger latched.
    const ev = { reason: 'kirtan-live', liveMedianMs: Math.round(m), ...describe() };
    state.listeners.forEach((fn) => {
      try {
        fn(ev);
      } catch (_) {
        /* a listener must never disturb the engines */
      }
    });
  }
}
// Paced kirtan: from the self-test, or from the live trigger above.
const selfTestPaced = () =>
  state.passMs != null && state.passMs > KIRTAN_PACE_MIN_MS && state.passMs <= KIRTAN_PACE_MAX_MS;
const kirtanPaced = () => KIRTAN_PACE && (selfTestPaced() || state.kirtanLive);
function kirtanRecHopS(winS) {
  if (state.scoped || !kirtanPaced()) return 0;
  const live = state.kirtanLive && !selfTestPaced();
  // latched: paced at least as for onMs
  const ms = live
    ? Math.min(Math.max(longMedianMs() || 0, KIRTAN_LIVE.onMs + 1), KIRTAN_PACE_MAX_MS)
    : livePassMs();
  const rec = searchHopS(ms, winS) + state.kirtanExtraS;
  return rec > 0.5 ? rec : 0;
}
// The recognizer's hop now / today's hop (1 unless the kirtan pace is slowing the search): the
// component keeps its lock evidence per second with it (VoiceFollow perSearch).
function searchScale(ownHopS, winS) {
  if (!PACE_EVIDENCE) return 1;
  const today = akhandOn()
    ? Math.max(ownHopS, current().recognizerHopS, AKHAND.recognizerHopS)
    : Math.max(ownHopS, current().recognizerHopS);
  const now = hopS('recognizer', ownHopS, winS);
  return now > today ? Math.min(now / today, SCALE_MAX) : 1;
}
// Benchmarks only: pace just one engine kind ('recognizer' or 'follower'). Unset = both.
const KIRTAN_PACE_ONLY = process.env.VF_KIRTAN_PACE_ONLY || null;
function kirtanHopS(kind, winS) {
  const rec = kirtanRecHopS(winS);
  if (!rec) return 0;
  if (KIRTAN_PACE_ONLY && kind !== KIRTAN_PACE_ONLY) return 0;
  return kind === 'recognizer' ? rec : KIRTAN_FOLLOW_HOP_S;
}
// Kirtan guard: called by observe() while no read Bani is followed.
function observeKirtan(backlogSec, nowMs) {
  const g = KIRTAN_GUARD;
  const held = nowMs - state.kirtanSteppedAt < g.holdMs;
  if (backlogSec > g.behindS) {
    state.kirtanClearSince = null;
    if (state.kirtanBehindSince == null) state.kirtanBehindSince = nowMs;
    else if (
      !held &&
      nowMs - state.kirtanBehindSince >= g.behindMs &&
      state.kirtanExtraS < g.maxS
    ) {
      state.kirtanExtraS += g.stepS;
      state.kirtanSteppedAt = nowMs;
      state.kirtanBehindSince = null;
    }
    return;
  }
  state.kirtanBehindSince = null;
  if (backlogSec < g.clearS && state.kirtanExtraS > 0) {
    if (state.kirtanClearSince == null) state.kirtanClearSince = nowMs;
    else if (!held && nowMs - state.kirtanClearSince >= g.clearMs) {
      state.kirtanExtraS -= g.stepS;
      state.kirtanSteppedAt = nowMs;
      state.kirtanClearSince = null;
    }
  } else state.kirtanClearSince = null;
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
  setTier(pick, 'self-test');
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
  if (!state.scoped && !selfTestPaced()) observeKirtanLive(nowMs);
  if (!state.scoped && kirtanPaced()) observeKirtan(backlogSec, nowMs);
  if (state.pinned != null || !state.scoped) return null;
  const i = state.tier;
  const held = nowMs - state.steppedAt < HOLD_MS;
  if (backlogSec > BEHIND_S) {
    state.headroomSince = null;
    if (state.behindSince == null) state.behindSince = nowMs;
    else if (!held && nowMs - state.behindSince >= BEHIND_MS && i < TIERS.length - 1) {
      state.blockedUntil[i] = nowMs + RETRY_MS;
      return setTier(i + 1, 'behind', { backlogSec: Math.round(backlogSec * 100) / 100 });
    }
    return null;
  }
  state.behindSince = null;
  const passMs = livePassMs();
  const open = !(state.blockedUntil[i - 1] > nowMs);
  if (i > 0 && open && backlogSec < 0.2 && fits(TIERS[i - 1], passMs, LOAD_UP)) {
    if (state.headroomSince == null) state.headroomSince = nowMs;
    else if (!held && nowMs - state.headroomSince >= HEADROOM_MS) {
      return setTier(i - 1, 'headroom', { backlogSec: Math.round(backlogSec * 100) / 100 });
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
  LOAD_MAX,
  current,
  describe,
  notePass,
  setScoped,
  setAkhand,
  AKHAND,
  hopS,
  searchScale,
  backlogBoundS,
  windowS,
  markBeat,
  onBeat,
  selfTest,
  observe,
  onStep,
};
