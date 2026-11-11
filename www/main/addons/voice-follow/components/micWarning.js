// Wrong-microphone hints for the sevadaar's Autopilot panel (never a sangat-facing screen).
// Fleet logs showed Gurdwara Sahibs listening through a phone-as-webcam virtual mic (level
// 0.000, nothing heard for 40 min) or a weak laptop mic (words heard 4% of the time), while
// the sevadaar did everything by hand. Three calm hints:
//   silent  : the input has given no sound for ~20 s while Autopilot runs
//   quiet   : ~3 min of a low (non-zero) level with words heard very rarely
// Pure logic only (no DOM, no audio), so it is unit-tested; VoiceFollow.jsx wires it up.

const DEFAULTS = {
  windowMs: 250, // one sample per volume window
  silentRms: 0.0005, // VOL_SILENT_RMS: below this nothing reaches the app
  goodRms: 0.004, // VOL_GOOD_RMS: below this the level reads "low"
  silentMs: 20000, // no sound for this long -> 'silent'
  quietMs: 180000, // this long of low level with few words -> 'quiet'
  quietHeardFrac: 0.05, // words heard in under 5% of the windows counts as "very little"
};

// The 80th percentile, as the panel's volume label reads loudness (pauses don't pull it down).
const p80 = (xs) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(0.8 * (sorted.length - 1))];
};

// A watcher fed one sample per volume window: { rms, heard } where heard says confident
// words arrived since the last sample. Returns the hint to show now: 'silent', 'quiet' or null.
// reset() when the input changes or a session starts.
function createMicWatch(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const silentN = Math.ceil(o.silentMs / o.windowMs);
  const quietN = Math.ceil(o.quietMs / o.windowMs);
  let rmsHist = []; // last silentN levels
  let quietHist = []; // last quietN { rms, heard }
  let heardCount = 0;
  let state = null;
  const api = {
    reset() {
      rmsHist = [];
      quietHist = [];
      heardCount = 0;
      state = null;
    },
    state: () => state,
    push({ rms, heard }) {
      const r = Number.isFinite(rms) ? rms : 0;
      rmsHist.push(r);
      if (rmsHist.length > silentN) rmsHist.shift();
      quietHist.push({ rms: r, heard: !!heard });
      if (heard) heardCount += 1;
      if (quietHist.length > quietN) {
        const old = quietHist.shift();
        if (old.heard) heardCount -= 1;
      }
      // Silent: the whole last ~20 s reads "no sound". It clears as soon as sound returns.
      const silentNow = rmsHist.length >= silentN && p80(rmsHist) < o.silentRms;
      // Quiet: ~3 min of a low but present level, and words heard very rarely.
      let quietNow = false;
      if (!silentNow && quietHist.length >= quietN) {
        const level = p80(quietHist.map((x) => x.rms));
        quietNow =
          level >= o.silentRms && level < o.goodRms && heardCount < o.quietHeardFrac * quietN;
      }
      if (silentNow) state = 'silent';
      else if (quietNow) state = 'quiet';
      else if (state === 'quiet' && quietHist.length >= quietN) {
        // Leave 'quiet' only once the level is good or words come through often again.
        const level = p80(quietHist.map((x) => x.rms));
        if (level >= o.goodRms || heardCount >= 2 * o.quietHeardFrac * quietN) state = null;
      } else state = null;
      return state;
    },
  };
  return api;
}

// From a short probe of the other inputs ([{ deviceId, label, rms }]), the one clearly picking
// up sound: level at least "good", the loudest. An input opts.isWrong(label) flags (virtual,
// phone, webcam, Bluetooth: common/mic-check) is never offered; a Stereo Mix with sound is the
// computer's own playback, not the hall.
function pickProbedMic(results, opts = {}) {
  const goodRms = opts.goodRms || DEFAULTS.goodRms;
  const isWrong = opts.isWrong || (() => false);
  const sounding = (results || []).filter(
    (r) => r && Number.isFinite(r.rms) && r.rms >= goodRms && !isWrong(r.label),
  );
  if (!sounding.length) return null;
  sounding.sort((a, b) => b.rms - a.rms);
  return sounding[0];
}

// One dismissal per hint kind and device for as long as the panel lives.
const dismissKey = (kind, deviceId, label) => `${kind}:${deviceId || label || ''}`;

// The order to prefer inputs in when the app chooses one itself: the mixer, then the
// computer's own mic, then anything else; a wrong kind (virtual, phone, webcam, Bluetooth) last.
const KIND_RANK = { mixer: 0, laptop: 1, other: 2 };
const rankOf = (kindOf, isWrong, d) => (isWrong(d.label) ? 9 : (KIND_RANK[kindOf(d.label)] ?? 2));

// The best input other than `exclude` (deviceId), by KIND_RANK; null when there is none that
// is not a wrong kind. kindOf(label) and isWrong(label) come from common/mic-check.
function bestOtherMic(list, exclude, { kindOf, isWrong }) {
  const others = (list || []).filter((d) => d.deviceId !== exclude && !isWrong(d.label));
  if (!others.length) return null;
  return others
    .map((d, i) => ({ d, i, r: rankOf(kindOf, isWrong, d) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)[0].d;
}

// The input to use when the sevadaar has not chosen one (first run, or the saved one is gone):
// the system default, unless its name looks wrong and another input exists; then the best other
// (field logs: every silent Gurdwara Sahib session ran on a default like "Iriun Webcam #4" while
// "Wireless Microphone" sat unused). Returns { device, avoided } where avoided is the default
// that was passed over (null when the default is kept).
function pickDefaultMic(list, defaultDevice, { kindOf, isWrong }) {
  const all = list || [];
  const def = defaultDevice || all[0] || null;
  if (!def || !isWrong(def.label)) return { device: def, avoided: null };
  const best = bestOtherMic(all, def.deviceId, { kindOf, isWrong });
  return best ? { device: best, avoided: def } : { device: def, avoided: null };
}

// Auto-pause: fed one level per volume window while Autopilot runs; says when there has been no
// sound for pauseMs (an empty hall after the programme: a Mac ran 57 h listening to nothing).
function createSilenceClock({ pauseMs, silentRms = DEFAULTS.silentRms }) {
  let quietSince = null;
  return {
    reset() {
      quietSince = null;
    },
    silentMs: (now) => (quietSince == null ? 0 : now - quietSince),
    push({ now, rms }) {
      if (Number.isFinite(rms) && rms >= silentRms) {
        quietSince = null;
        return false;
      }
      if (quietSince == null) quietSince = now;
      return now - quietSince >= pauseMs;
    },
  };
}

// Minutes of no sound before Autopilot pauses itself; VF_AUTOPAUSE_MIN overrides it for tests.
const AUTOPAUSE_MIN_DEFAULT = 30;
function autoPauseMinutes(env) {
  const v = Number(env && env.VF_AUTOPAUSE_MIN);
  return Number.isFinite(v) && v > 0 ? v : AUTOPAUSE_MIN_DEFAULT;
}

module.exports = {
  createMicWatch,
  pickProbedMic,
  dismissKey,
  bestOtherMic,
  pickDefaultMic,
  createSilenceClock,
  autoPauseMinutes,
  AUTOPAUSE_MIN_DEFAULT,
  MIC_WATCH: DEFAULTS,
};
